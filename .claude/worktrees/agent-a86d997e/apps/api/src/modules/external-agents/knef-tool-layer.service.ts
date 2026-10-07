import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIExecutionPolicyService, type PolicyDecision } from '../ai-actions/ai-execution-policy.service';
import { AIToolExecutorService } from '../ai-actions/ai-tool-executor.service';
import {
  getToolPermissionDefinition,
  getExternallyExposedTools,
  type ToolPermissionDefinition,
  type ExternalExposure,
} from '../ai-actions/ai-tool-permission.registry';
import type { ExternalAgent } from '@prisma/client';

export interface ToolExecutionRequest {
  toolName: string;
  parameters: Record<string, unknown>;
  organizationId: string;
  /** For agent-sourced calls: the authenticated external agent */
  externalAgent?: ExternalAgent;
  /** For user-sourced calls: the authenticated user ID */
  userId?: string;
  /** Request correlation ID for tracing */
  requestId?: string;
  /** Client idempotency key for write operations */
  idempotencyKey?: string;
  /** Authorized location IDs for the caller. null = org-wide access. */
  locationIds?: string[] | null;
}

export interface ToolExecutionResult {
  requestId: string;
  toolName: string;
  outcome: PolicyDecision['outcome'];
  result?: unknown;
  actionId?: string;
  approvalId?: string;
  expiresAt?: Date;
  reason?: string;
  suggestion?: string;
}

/** Maps API scopes to the internal permission strings used by tool registry */
const SCOPE_TO_PERMISSION: Record<string, string> = {
  'inventory:read': 'inventory.view',
  'inventory:write': 'inventory.adjust',
  'sales:read': 'sales.view',
  'sales:write': 'sales.create',
  'reports:read': 'reports.view',
  'finance:read': 'finance.view',
  'tasks:read': 'tasks.view',
  'tasks:write': 'tasks.create',
  'goals:read': 'goals.view',
  'calendar:read': 'calendar.view',
  'calendar:write': 'calendar.create',
  'purchasing:read': 'purchasing.view',
  'purchasing:create': 'purchasing.create',
  'notifications:write': 'notifications.view',
};

@Injectable()
export class KnefToolLayerService {
  private readonly logger = new Logger(KnefToolLayerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: AIToolExecutorService,
    private readonly policyService: AIExecutionPolicyService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Execute a tool through the full KNEF authorization chain.
   * This is the single execution path for all callers: internal AI, Telegram, REST agents, MCP.
   */
  async execute(req: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const requestId = req.requestId ?? createId();

    this.logger.log(
      `Tool request: tool=${req.toolName} org=${req.organizationId} agent=${req.externalAgent?.id ?? 'internal'} rid=${requestId}`,
    );

    // 1. Validate tool exists and is registered
    const definition = getToolPermissionDefinition(req.toolName);
    if (!definition) {
      await this.auditDenial(req, requestId, 'TOOL_NOT_FOUND', 'Tool not registered');
      throw new BadRequestException({
        code: 'TOOL_NOT_FOUND',
        message: `Tool "${req.toolName}" does not exist`,
        requestId,
      });
    }

    // 2. For external agents: validate external exposure
    if (req.externalAgent) {
      this.validateExternalExposure(definition, req.toolName, requestId);
      this.validateAgentToolAccess(req.externalAgent, definition, requestId);
      this.validateAgentScopeForTool(req.externalAgent, definition, requestId);
    }

    // 3. Validate input arguments against tool schema
    this.validateArguments(definition, req.parameters, requestId);

    // 4. Enforce organization isolation — strip any caller-supplied org override
    const safeParameters = this.enforceOrgIsolation(req.parameters, req.organizationId);

    // 4b. Enforce location isolation for location-scoped callers
    // External agents always get org-wide access (null); user-sourced calls carry locationIds.
    const locationIds = req.externalAgent ? null : (req.locationIds ?? null);
    const locationSafeParameters = this.enforceLocationIsolation(safeParameters, locationIds, requestId);

    // 5. Check idempotency for write tools
    if (req.idempotencyKey && this.isWriteTool(definition)) {
      const duplicate = await this.checkIdempotency(req, requestId);
      if (duplicate) return duplicate;
    }

    // 6. Evaluate autonomy policy and execute
    const agentId = req.externalAgent?.id;
    const callerUserId = req.userId ?? req.externalAgent?.ownerId ?? 'agent';

    let decision: PolicyDecision;
    try {
      decision = await this.policyService.evaluate({
        organizationId: req.organizationId,
        userId: callerUserId,
        toolName: req.toolName,
        parameters: locationSafeParameters,
        agentId,
        locationIds,
      });
    } catch (err) {
      this.logger.error(`Policy evaluation failed for tool=${req.toolName}`, err);
      throw err;
    }

    // 7. Record external agent action ID for traceability
    if (decision.actionId && req.externalAgent) {
      await this.linkActionToAgent(decision.actionId, req.externalAgent.id, requestId);
    }

    // 8. Audit successful execution
    await this.auditExecution(req, requestId, decision);

    // 9. Filter result before returning to external callers
    const filteredResult = req.externalAgent && decision.result
      ? this.filterResult(req.toolName, decision.result)
      : decision.result;

    return {
      requestId,
      toolName: req.toolName,
      outcome: decision.outcome,
      result: filteredResult,
      actionId: decision.actionId,
      approvalId: decision.approvalId,
      expiresAt: decision.expiresAt,
      reason: decision.reason,
      suggestion: decision.suggestion,
    };
  }

  /** Execute a tool directly (bypassing policy engine) — for internal use only. */
  async executeDirectly(
    toolName: string,
    parameters: Record<string, unknown>,
    orgId: string,
  ): Promise<unknown> {
    const tool = await this.prisma.aITool.findFirst({
      where: { organizationId: orgId, name: toolName, isActive: true },
    });
    if (!tool) throw new BadRequestException(`Tool "${toolName}" not found or inactive`);
    return this.executor.execute(tool, parameters, orgId);
  }

  /** Return externally exposed tool definitions (optionally filtered by exposure level). */
  listExposedTools(exposure?: ExternalExposure) {
    return getExternallyExposedTools(exposure);
  }

  // ── Validation helpers ──────────────────────────────────────────

  private validateExternalExposure(
    def: ToolPermissionDefinition,
    toolName: string,
    requestId: string,
  ): void {
    if (def.externalExposure === 'NOT_EXPOSED') {
      throw new ForbiddenException({
        code: 'TOOL_NOT_EXPOSED',
        message: `Tool "${toolName}" is not available to external agents`,
        requestId,
      });
    }
  }

  private validateAgentToolAccess(
    agent: ExternalAgent,
    def: ToolPermissionDefinition,
    requestId: string,
  ): void {
    if (agent.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        code: 'AGENT_SUSPENDED',
        message: 'External agent is not active',
        requestId,
      });
    }

    if (agent.allowedTools.length > 0 && !agent.allowedTools.includes(def.toolName)) {
      throw new ForbiddenException({
        code: 'TOOL_NOT_ALLOWED',
        message: `Agent is not authorized to use tool "${def.toolName}"`,
        requestId,
      });
    }

    // EXTERNAL_READ_ONLY tools cannot be used for write operations
    if (
      def.externalExposure === 'EXTERNAL_READ_ONLY' &&
      def.approvalRequired !== 'NONE'
    ) {
      throw new ForbiddenException({
        code: 'TOOL_READ_ONLY',
        message: `Tool "${def.toolName}" is read-only for external agents`,
        requestId,
      });
    }
  }

  private validateAgentScopeForTool(
    agent: ExternalAgent,
    def: ToolPermissionDefinition,
    requestId: string,
  ): void {
    if (!def.requiredScope) return;

    if (!agent.scopes.includes(def.requiredScope)) {
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        message: `Scope "${def.requiredScope}" is required for tool "${def.toolName}"`,
        requestId,
      });
    }

    // Verify the mapped permission is accessible
    const mappedPermission = SCOPE_TO_PERMISSION[def.requiredScope];
    if (!mappedPermission) {
      throw new ForbiddenException({
        code: 'SCOPE_UNMAPPED',
        message: `Scope "${def.requiredScope}" has no internal permission mapping`,
        requestId,
      });
    }
  }

  private validateArguments(
    def: ToolPermissionDefinition,
    parameters: Record<string, unknown>,
    requestId: string,
  ): void {
    const schema = def.inputSchema;
    const required = schema.required ?? [];

    for (const field of required) {
      if (parameters[field] === undefined || parameters[field] === null) {
        throw new BadRequestException({
          code: 'INVALID_ARGUMENT',
          message: `Required argument "${field}" is missing for tool "${def.toolName}"`,
          requestId,
        });
      }
    }

    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      const value = parameters[field];
      if (value === undefined) continue;

      // Enum validation
      if (fieldSchema.enum && !fieldSchema.enum.includes(String(value))) {
        throw new BadRequestException({
          code: 'INVALID_ARGUMENT',
          message: `Invalid value for "${field}". Allowed: ${fieldSchema.enum.join(', ')}`,
          requestId,
        });
      }

      // Type coercion check for numbers
      if (fieldSchema.type === 'number' && isNaN(Number(value))) {
        throw new BadRequestException({
          code: 'INVALID_ARGUMENT',
          message: `"${field}" must be a number`,
          requestId,
        });
      }
    }

    // Strip unknown fields (only keep schema-defined properties)
    const allowed = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(parameters)) {
      if (!allowed.has(key)) {
        delete parameters[key];
      }
    }
  }

  /** Remove caller-supplied organizationId/locationId overrides to prevent cross-tenant access. */
  private enforceOrgIsolation(
    parameters: Record<string, unknown>,
    orgId: string,
  ): Record<string, unknown> {
    const safe = { ...parameters };
    // Do not allow caller to override these — they are always derived from the authenticated context
    delete safe['organizationId'];
    return safe;
  }

  /**
   * Validates that any caller-supplied locationId is within the caller's authorized set.
   * For org-wide callers (locationIds === null) no restriction is applied.
   */
  private enforceLocationIsolation(
    parameters: Record<string, unknown>,
    locationIds: string[] | null,
    requestId: string,
  ): Record<string, unknown> {
    if (locationIds === null) return parameters; // org-wide, no restriction

    const result = { ...parameters };

    // Validate any caller-supplied locationId
    if (result['locationId'] && typeof result['locationId'] === 'string') {
      if (!locationIds.includes(result['locationId'])) {
        throw new ForbiddenException({
          code: 'LOCATION_NOT_AUTHORIZED',
          message: 'Not authorized for this location',
          requestId,
        });
      }
    }

    return result;
  }

  private isWriteTool(def: ToolPermissionDefinition): boolean {
    return def.toolName.startsWith('create_') || def.toolName.startsWith('update_');
  }

  private async checkIdempotency(
    req: ToolExecutionRequest,
    requestId: string,
  ): Promise<ToolExecutionResult | null> {
    if (!req.idempotencyKey) return null;

    const existing = await this.prisma.aIAction.findFirst({
      where: {
        organizationId: req.organizationId,
        requestId: req.idempotencyKey,
        action: req.toolName,
        status: { in: ['COMPLETED', 'EXECUTING'] },
      },
    });

    if (existing) {
      this.logger.log(`Idempotent duplicate detected: key=${req.idempotencyKey} action=${existing.id}`);
      return {
        requestId,
        toolName: req.toolName,
        outcome: 'EXECUTED',
        result: existing.result as unknown,
        actionId: existing.id,
        reason: 'Idempotent: duplicate request, returning cached result',
      };
    }

    return null;
  }

  private async linkActionToAgent(
    actionId: string,
    agentId: string,
    requestId: string,
  ): Promise<void> {
    try {
      await this.prisma.aIAction.update({
        where: { id: actionId },
        data: {
          externalAgentId: agentId,
          requestId,
        } as Prisma.AIActionUpdateInput,
      });
    } catch (err) {
      this.logger.error('Failed to link action to external agent', err);
    }
  }

  /** Strip sensitive/internal fields from tool results before returning to external agents. */
  private filterResult(toolName: string, result: unknown): unknown {
    if (!result || typeof result !== 'object') return result;

    const sensitiveKeys = new Set([
      'password', 'passwordHash', 'keyHash', 'secret', 'token', 'apiKey',
      'privateKey', 'accessToken', 'refreshToken', 'encryptedValue',
    ]);

    return this.deepFilter(result, sensitiveKeys);
  }

  private deepFilter(obj: unknown, sensitiveKeys: Set<string>): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepFilter(item, sensitiveKeys));
    }
    if (obj && typeof obj === 'object') {
      const filtered: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (sensitiveKeys.has(k)) continue;
        filtered[k] = this.deepFilter(v, sensitiveKeys);
      }
      return filtered;
    }
    return obj;
  }

  // ── Audit helpers ───────────────────────────────────────────────

  private async auditDenial(
    req: ToolExecutionRequest,
    requestId: string,
    code: string,
    reason: string,
  ): Promise<void> {
    this.audit
      .log({
        organizationId: req.organizationId,
        userId: req.userId ?? req.externalAgent?.ownerId ?? undefined,
        action: 'EXTERNAL_TOOL_DENIED',
        entity: 'AITool',
        entityId: req.toolName,
        requestId,
        metadata: { code, reason, agentId: req.externalAgent?.id },
      })
      .catch(() => {});
  }

  private async auditExecution(
    req: ToolExecutionRequest,
    requestId: string,
    decision: PolicyDecision,
  ): Promise<void> {
    this.audit
      .log({
        organizationId: req.organizationId,
        userId: req.userId ?? req.externalAgent?.ownerId ?? undefined,
        action: 'EXTERNAL_TOOL_EXECUTED',
        entity: 'AITool',
        entityId: req.toolName,
        requestId,
        metadata: {
          outcome: decision.outcome,
          riskLevel: decision.riskLevel,
          agentId: req.externalAgent?.id,
          actionId: decision.actionId,
          approvalId: decision.approvalId,
        },
      })
      .catch(() => {});
  }
}
