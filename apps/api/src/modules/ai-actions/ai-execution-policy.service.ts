import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIToolExecutorService } from './ai-tool-executor.service';
import { getToolPermissionDefinition, type ToolRiskLevel } from './ai-tool-permission.registry';
import type { CreateAutonomyPolicyDto, UpdateAutonomyPolicyDto } from './dto/ai-actions.dto';

export type AutonomyLevel =
  | 'ADVISORY'
  | 'DRAFT'
  | 'APPROVAL_REQUIRED'
  | 'LIMITED_AUTONOMY'
  | 'SCHEDULED_AUTONOMY';

export type PolicyOutcome =
  | 'ADVISORY'
  | 'DRAFT'
  | 'QUEUED_FOR_APPROVAL'
  | 'EXECUTED'
  | 'BLOCKED';

export interface ScopeLimits {
  financialCapNgn?: number;
  recipientCap?: number;
  locationIds?: string[];
  timeWindowStart?: string;
  timeWindowEnd?: string;
  allowedTools?: string[];
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  level: AutonomyLevel;
  riskLevel: ToolRiskLevel;
  actionId?: string;
  approvalId?: string;
  result?: unknown;
  suggestion?: string;
  reason?: string;
  expiresAt?: Date;
}

export interface EvaluatePolicyParams {
  organizationId: string;
  userId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  agentId?: string;
  /** Authorized location IDs for the caller. null = org-wide access. */
  locationIds?: string[] | null;
}

const POLICY_MATRIX: Record<ToolRiskLevel, Record<AutonomyLevel, PolicyOutcome>> = {
  LOW: {
    ADVISORY:           'ADVISORY',
    DRAFT:              'DRAFT',
    APPROVAL_REQUIRED:  'QUEUED_FOR_APPROVAL',
    LIMITED_AUTONOMY:   'EXECUTED',
    SCHEDULED_AUTONOMY: 'EXECUTED',
  },
  MEDIUM: {
    ADVISORY:           'ADVISORY',
    DRAFT:              'ADVISORY',
    APPROVAL_REQUIRED:  'QUEUED_FOR_APPROVAL',
    LIMITED_AUTONOMY:   'QUEUED_FOR_APPROVAL',
    SCHEDULED_AUTONOMY: 'QUEUED_FOR_APPROVAL',
  },
  HIGH: {
    ADVISORY:           'ADVISORY',
    DRAFT:              'ADVISORY',
    APPROVAL_REQUIRED:  'QUEUED_FOR_APPROVAL',
    LIMITED_AUTONOMY:   'BLOCKED',
    SCHEDULED_AUTONOMY: 'BLOCKED',
  },
  CRITICAL: {
    ADVISORY:           'ADVISORY',
    DRAFT:              'ADVISORY',
    APPROVAL_REQUIRED:  'BLOCKED',
    LIMITED_AUTONOMY:   'BLOCKED',
    SCHEDULED_AUTONOMY: 'BLOCKED',
  },
};

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

@Injectable()
export class AIExecutionPolicyService {
  private readonly logger = new Logger(AIExecutionPolicyService.name);

  // Access the not-yet-generated Prisma model via dynamic property
  // (prisma generate must be run after the migration; until then we use `as any`)
  private get policyTable() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as any).aiAutonomyPolicy as {
      findMany: (args: AnyRecord) => Promise<AnyRecord[]>;
      findFirst: (args: AnyRecord) => Promise<AnyRecord | null>;
      create: (args: AnyRecord) => Promise<AnyRecord>;
      update: (args: AnyRecord) => Promise<AnyRecord>;
      delete: (args: AnyRecord) => Promise<AnyRecord>;
    };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: AIToolExecutorService,
    private readonly auditService: AuditService,
  ) {}

  // ── Policy CRUD ──────────────────────────────────────────────────

  async listPolicies(orgId: string) {
    return this.policyTable.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPolicy(orgId: string, id: string) {
    return this.policyTable.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  async getEffectivePolicy(orgId: string, scope: string, scopeId?: string | null) {
    if (scope === 'org' || !scopeId) {
      return this.policyTable.findFirst({
        where: { organizationId: orgId, scope: 'org', isActive: true },
      });
    }
    const specific = await this.policyTable.findFirst({
      where: { organizationId: orgId, scope, scopeId, isActive: true },
    });
    if (specific) return specific;
    return this.policyTable.findFirst({
      where: { organizationId: orgId, scope: 'org', isActive: true },
    });
  }

  async upsertPolicy(orgId: string, dto: CreateAutonomyPolicyDto, actorId: string) {
    const existing = await this.policyTable.findFirst({
      where: { organizationId: orgId, scope: dto.scope, scopeId: dto.scopeId ?? null },
    });

    if (existing) {
      return this.policyTable.update({
        where: { id: existing.id },
        data: {
          level: dto.level,
          scopeLimits: (dto.scopeLimits ?? {}) as Prisma.InputJsonValue,
          isActive: dto.isActive ?? true,
          updatedBy: actorId,
        },
      });
    }

    return this.policyTable.create({
      data: {
        id: createId(),
        organizationId: orgId,
        scope: dto.scope,
        scopeId: dto.scopeId ?? null,
        level: dto.level,
        scopeLimits: (dto.scopeLimits ?? {}) as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async updatePolicy(orgId: string, id: string, dto: UpdateAutonomyPolicyDto, actorId: string) {
    const policy = await this.policyTable.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!policy) throw new BadRequestException('Policy not found');

    return this.policyTable.update({
      where: { id },
      data: {
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.scopeLimits !== undefined && { scopeLimits: dto.scopeLimits as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        updatedBy: actorId,
      },
    });
  }

  async deletePolicy(orgId: string, id: string) {
    const policy = await this.policyTable.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!policy) throw new BadRequestException('Policy not found');
    return this.policyTable.delete({ where: { id } });
  }

  // ── Post-Approval Policy Check ───────────────────────────────────
  //
  // Used by AIApprovalsService at execution time to ensure a human approval granted
  // under old policy cannot bypass a tighter policy that now explicitly BLOCKs the action.
  // Returns { blocked: false } if the current policy still permits execution after human
  // approval; returns { blocked: true, reason } if the action must not proceed.
  //
  // Intentionally does NOT create AIAction/AIApproval records and does NOT call the
  // executor — it is a read-only gate check only.
  async evaluatePostApproval(params: {
    organizationId: string;
    userId: string | null;
    toolName: string;
    parameters: Record<string, unknown>;
    agentId?: string | null;
  }): Promise<{ blocked: boolean; reason?: string }> {
    const { organizationId, userId, toolName, parameters, agentId } = params;

    const definition = getToolPermissionDefinition(toolName);
    if (!definition) {
      return { blocked: true, reason: `Tool "${toolName}" is no longer registered in the permission registry.` };
    }

    const effectiveUserId = userId ?? '';
    const effectiveAgentId = agentId ?? undefined;

    const policy = await this.resolvePolicy(organizationId, effectiveUserId, effectiveAgentId);
    const scopeLimits = policy ? (policy.scopeLimits as ScopeLimits) : {};

    const scopeBlock = this.checkScopeLimits(toolName, parameters, scopeLimits);
    if (scopeBlock) {
      return { blocked: true, reason: `Scope limit exceeded: ${scopeBlock}` };
    }

    const level = (policy?.level as AutonomyLevel | undefined) ?? 'APPROVAL_REQUIRED';
    const outcome = POLICY_MATRIX[definition.riskLevel][level];

    if (outcome === 'BLOCKED') {
      return {
        blocked: true,
        reason: `Tool "${toolName}" (risk: ${definition.riskLevel}) is now blocked at autonomy level ${level}.`,
      };
    }

    return { blocked: false };
  }

  // ── Policy Evaluation ────────────────────────────────────────────

  async evaluate(params: EvaluatePolicyParams): Promise<PolicyDecision> {
    const { organizationId, userId, toolName, parameters, agentId, locationIds } = params;

    const definition = getToolPermissionDefinition(toolName);
    if (!definition) {
      await this.audit(organizationId, userId, 'AI_POLICY_BLOCKED', toolName, {
        reason: 'Tool not registered',
      });
      return {
        outcome: 'BLOCKED',
        level: 'APPROVAL_REQUIRED',
        riskLevel: 'CRITICAL',
        reason: `Tool "${toolName}" is not registered in the permission registry.`,
      };
    }

    const riskLevel = definition.riskLevel;
    const level = await this.resolveLevel(organizationId, userId, agentId);

    const policy = await this.resolvePolicy(organizationId, userId, agentId);
    const scopeLimits = policy ? (policy.scopeLimits as ScopeLimits) : {};

    const scopeBlock = this.checkScopeLimits(toolName, parameters, scopeLimits);
    if (scopeBlock) {
      await this.audit(organizationId, userId, 'AI_POLICY_SCOPE_VIOLATED', toolName, {
        level,
        riskLevel,
        violation: scopeBlock,
      });
      if (level === 'LIMITED_AUTONOMY' || level === 'SCHEDULED_AUTONOMY') {
        return this.queueForApproval(organizationId, userId, toolName, parameters, level, riskLevel, `Scope limit: ${scopeBlock}`);
      }
      return {
        outcome: 'BLOCKED',
        level,
        riskLevel,
        reason: `Scope limit exceeded: ${scopeBlock}`,
      };
    }

    const outcome = POLICY_MATRIX[riskLevel][level];

    await this.audit(organizationId, userId, 'AI_POLICY_EVALUATED', toolName, {
      level,
      riskLevel,
      outcome,
    });

    switch (outcome) {
      case 'ADVISORY':
        return {
          outcome: 'ADVISORY',
          level,
          riskLevel,
          suggestion: `Action "${toolName}" was reviewed. At autonomy level ${level}, this action can only be suggested, not executed.`,
        };

      case 'DRAFT':
        return this.createDraft(organizationId, userId, toolName, parameters, level, riskLevel);

      case 'QUEUED_FOR_APPROVAL':
        return this.queueForApproval(organizationId, userId, toolName, parameters, level, riskLevel);

      case 'EXECUTED':
        return this.executeNow(organizationId, userId, toolName, parameters, level, riskLevel, locationIds ?? null);

      case 'BLOCKED':
        await this.audit(organizationId, userId, 'AI_POLICY_BLOCKED', toolName, { level, riskLevel });
        return {
          outcome: 'BLOCKED',
          level,
          riskLevel,
          reason: `Tool "${toolName}" (risk: ${riskLevel}) is blocked at autonomy level ${level}.`,
        };
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async resolveLevel(
    orgId: string,
    userId: string,
    agentId?: string,
  ): Promise<AutonomyLevel> {
    const policy = await this.resolvePolicy(orgId, userId, agentId);
    return (policy?.level as AutonomyLevel | undefined) ?? 'APPROVAL_REQUIRED';
  }

  private async resolvePolicy(orgId: string, userId: string, agentId?: string) {
    const userPolicy = await this.policyTable.findFirst({
      where: { organizationId: orgId, scope: 'user', scopeId: userId, isActive: true },
    });
    if (userPolicy) return userPolicy;

    if (agentId) {
      const agentPolicy = await this.policyTable.findFirst({
        where: { organizationId: orgId, scope: 'agent', scopeId: agentId, isActive: true },
      });
      if (agentPolicy) return agentPolicy;
    }

    return this.policyTable.findFirst({
      where: { organizationId: orgId, scope: 'org', isActive: true },
    });
  }

  private checkScopeLimits(
    toolName: string,
    parameters: Record<string, unknown>,
    limits: ScopeLimits,
  ): string | null {
    if (limits.allowedTools && limits.allowedTools.length > 0) {
      if (!limits.allowedTools.includes(toolName)) {
        return `Tool "${toolName}" is not in the allowed tools list`;
      }
    }

    if (limits.financialCapNgn !== undefined) {
      const amount = Number(parameters['amount'] ?? parameters['totalAmount'] ?? parameters['value'] ?? 0);
      if (amount > limits.financialCapNgn) {
        return `Amount ₦${amount.toLocaleString()} exceeds financial cap of ₦${limits.financialCapNgn.toLocaleString()}`;
      }
    }

    if (limits.recipientCap !== undefined) {
      const recipients = parameters['recipients'];
      const count = Array.isArray(recipients) ? recipients.length : 1;
      if (count > limits.recipientCap) {
        return `Recipient count ${count} exceeds cap of ${limits.recipientCap}`;
      }
    }

    if (limits.locationIds && limits.locationIds.length > 0) {
      const locationId = parameters['locationId'] as string | undefined;
      if (locationId && !limits.locationIds.includes(locationId)) {
        return `Location "${locationId}" is not in the allowed locations list`;
      }
    }

    if (limits.timeWindowStart || limits.timeWindowEnd) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (limits.timeWindowStart && currentTime < limits.timeWindowStart) {
        return `Current time ${currentTime} is before allowed window ${limits.timeWindowStart}`;
      }
      if (limits.timeWindowEnd && currentTime > limits.timeWindowEnd) {
        return `Current time ${currentTime} is after allowed window ${limits.timeWindowEnd}`;
      }
    }

    return null;
  }

  private async createDraft(
    orgId: string,
    userId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    level: AutonomyLevel,
    riskLevel: ToolRiskLevel,
  ): Promise<PolicyDecision> {
    const action = await this.prisma.aIAction.create({
      data: {
        id: createId(),
        organizationId: orgId,
        userId,
        action: toolName,
        parameters: parameters as Prisma.InputJsonValue,
        status: 'PENDING',
        autonomyLevel: level,
        policyDecision: 'DRAFT',
      } as never,
    });

    return { outcome: 'DRAFT', level, riskLevel, actionId: action.id };
  }

  private async queueForApproval(
    orgId: string,
    userId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    level: AutonomyLevel,
    riskLevel: ToolRiskLevel,
    reason?: string,
  ): Promise<PolicyDecision> {
    const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);

    const action = await this.prisma.aIAction.create({
      data: {
        id: createId(),
        organizationId: orgId,
        userId,
        action: toolName,
        parameters: parameters as Prisma.InputJsonValue,
        status: 'PENDING',
        autonomyLevel: level,
        policyDecision: 'QUEUED_FOR_APPROVAL',
        expiresAt,
      } as never,
    });

    const approval = await this.prisma.aIApproval.create({
      data: {
        id: createId(),
        organizationId: orgId,
        actionId: action.id,
        requestedBy: userId,
        expiresAt,
        reason: reason ?? null,
      },
    });

    return {
      outcome: 'QUEUED_FOR_APPROVAL',
      level,
      riskLevel,
      actionId: action.id,
      approvalId: approval.id,
      expiresAt,
    };
  }

  private async executeNow(
    orgId: string,
    userId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    level: AutonomyLevel,
    riskLevel: ToolRiskLevel,
    locationIds: string[] | null = null,
  ): Promise<PolicyDecision> {
    const tool = await this.prisma.aITool.findFirst({
      where: { organizationId: orgId, name: toolName, isActive: true },
    });

    const action = await this.prisma.aIAction.create({
      data: {
        id: createId(),
        organizationId: orgId,
        userId,
        toolId: tool?.id ?? null,
        action: toolName,
        parameters: parameters as Prisma.InputJsonValue,
        status: 'EXECUTING',
        autonomyLevel: level,
        policyDecision: 'EXECUTED',
      } as never,
    });

    try {
      let result: unknown = null;
      if (tool) {
        result = await this.executor.execute(tool, parameters, orgId, locationIds);
      }
      await this.prisma.aIAction.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          result: result as Prisma.InputJsonValue,
          executedAt: new Date(),
        },
      });
      return { outcome: 'EXECUTED', level, riskLevel, actionId: action.id, result };
    } catch (err: unknown) {
      await this.prisma.aIAction.update({
        where: { id: action.id },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }

  private async audit(
    orgId: string,
    userId: string,
    action: string,
    toolName: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditService.log({
        organizationId: orgId,
        userId,
        action,
        entity: 'AITool',
        entityId: toolName,
        metadata,
      });
    } catch (err) {
      this.logger.error('Failed to write policy audit log', err);
    }
  }
}
