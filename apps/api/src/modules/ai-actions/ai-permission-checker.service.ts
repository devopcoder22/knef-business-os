import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { getToolPermissionDefinition } from './ai-tool-permission.registry';

export interface AIExecutionContext {
  userId: string;
  organizationId: string;
  /** Resolved effective permissions for this user (from PermissionsService) */
  resolvedPermissions: string[];
}

@Injectable()
export class AIPermissionCheckerService {
  private readonly logger = new Logger(AIPermissionCheckerService.name);

  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Resolve the full execution context for an authenticated user.
   * Call this once per AI request, then pass the context to checkToolPermission().
   */
  async resolveExecutionContext(userId: string, organizationId: string): Promise<AIExecutionContext> {
    const result = await this.permissionsService.getResolvedPermissions(organizationId, userId);
    const resolvedPermissions = result.data.effective;
    return { userId, organizationId, resolvedPermissions };
  }

  /**
   * Check whether the user in the given execution context is allowed to run a tool.
   *
   * Throws ForbiddenException if:
   * - the tool is not registered in the permission registry
   * - the user lacks the required permission
   *
   * Logs a warning and records to the audit log on denial.
   */
  async checkToolPermission(
    context: AIExecutionContext,
    toolName: string,
  ): Promise<void> {
    const definition = getToolPermissionDefinition(toolName);

    if (!definition) {
      this.logger.warn(
        `AI tool "${toolName}" is not registered in the permission registry. Denying. userId=${context.userId} orgId=${context.organizationId}`,
      );
      await this.recordDenial(context, toolName, 'Tool not registered in permission registry');
      throw new ForbiddenException(
        `AI tool "${toolName}" is not available. Contact your administrator.`,
      );
    }

    const hasPermission = context.resolvedPermissions.includes(definition.requiredPermission);

    if (!hasPermission) {
      this.logger.warn(
        `AI permission denied: tool="${toolName}" requires="${definition.requiredPermission}" userId=${context.userId} orgId=${context.organizationId}`,
      );
      await this.recordDenial(
        context,
        toolName,
        `Missing required permission: ${definition.requiredPermission}`,
      );
      throw new ForbiddenException(
        `You do not have permission to use the AI tool "${toolName}". Required permission: ${definition.requiredPermission}.`,
      );
    }

    this.logger.debug(
      `AI permission granted: tool="${toolName}" userId=${context.userId}`,
    );
  }

  /**
   * Returns true if the user has permission for the tool, false otherwise.
   * Does NOT throw. Use this for non-fatal checks.
   */
  async hasToolPermission(context: AIExecutionContext, toolName: string): Promise<boolean> {
    const definition = getToolPermissionDefinition(toolName);
    if (!definition) return false;
    return context.resolvedPermissions.includes(definition.requiredPermission);
  }

  private async recordDenial(
    context: AIExecutionContext,
    toolName: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.auditService.log({
        organizationId: context.organizationId,
        userId: context.userId,
        action: 'AI_TOOL_DENIED',
        entity: 'AITool',
        entityId: toolName,
        metadata: { toolName, reason, resolvedPermissions: context.resolvedPermissions },
      });
    } catch (err) {
      // Audit failure must never block the denial response
      this.logger.error('Failed to record AI denial audit log', err);
    }
  }
}
