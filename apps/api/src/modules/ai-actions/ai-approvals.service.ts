import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ActionStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AIToolExecutorService } from './ai-tool-executor.service';
import { AIPermissionCheckerService, type AIExecutionContext } from './ai-permission-checker.service';
import { AIExecutionPolicyService } from './ai-execution-policy.service';
import type { ListApprovalsDto } from './dto/ai-actions.dto';

@Injectable()
export class AIApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: AIToolExecutorService,
    private readonly permissionChecker: AIPermissionCheckerService,
    private readonly policyService: AIExecutionPolicyService,
  ) {}

  async listPending(orgId: string) {
    const approvals = await this.prisma.aIApproval.findMany({
      where: {
        organizationId: orgId,
        decision: { equals: null },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with action + tool info
    return Promise.all(
      approvals.map(async (approval) => {
        if (!approval.actionId) return { ...approval, action: null };
        const action = await this.prisma.aIAction.findFirst({
          where: { id: approval.actionId },
          include: { tool: { select: { name: true, category: true } } },
        });
        return { ...approval, action };
      }),
    );
  }

  async approve(orgId: string, approvalId: string, userId: string, reason?: string) {
    const approval = await this.prisma.aIApproval.findFirst({
      where: { id: approvalId, organizationId: orgId },
    });
    if (!approval) throw new NotFoundException('Approval not found');

    // Rejected approval cannot be re-approved
    if (approval.decision === 'REJECTED') {
      throw new ConflictException('Approval has been rejected and cannot be executed');
    }

    await this.prisma.aIApproval.update({
      where: { id: approvalId },
      data: {
        decision: 'APPROVED',
        reviewedBy: userId,
        reason: reason ?? undefined,
        reviewedAt: new Date(),
      },
    });

    if (!approval.actionId) return { status: 'APPROVED' };

    const action = await this.prisma.aIAction.findFirst({
      where: { id: approval.actionId, organizationId: orgId },
      include: { tool: true },
    });
    if (!action || !action.tool) return { status: 'APPROVED' };

    // Terminal state guard — return existing outcome rather than re-executing
    if (action.status === 'COMPLETED') {
      return { status: 'COMPLETED', result: action.result };
    }
    if (action.status === 'FAILED' || action.status === 'REJECTED') {
      throw new ConflictException(`Action is in terminal state: ${action.status}`);
    }

    // Re-evaluate current autonomy policy — a policy tightened since the approval was
    // granted must block execution even if a human already clicked "approve".
    const policyCheck = await this.policyService.evaluatePostApproval({
      organizationId: orgId,
      userId: action.userId ?? null,
      toolName: action.action,
      parameters: action.parameters as Record<string, unknown>,
      agentId: action.externalAgentId ?? null,
    });
    if (policyCheck.blocked) {
      throw new ForbiddenException(policyCheck.reason ?? 'Current autonomy policy blocks execution of this action');
    }

    // Re-verify the original requestor still holds the required permission AND
    // location scope before executing — prevents privilege escalation via approval flow.
    let requestorContext: AIExecutionContext | undefined;
    if (action.userId) {
      requestorContext = await this.permissionChecker.resolveExecutionContext(action.userId, orgId);
      await this.permissionChecker.checkToolPermission(requestorContext, action.tool.name);
    }

    // Atomic claim: only the first concurrent caller that transitions PENDING/APPROVED →
    // EXECUTING succeeds (count=1). All others observe count=0 and must not execute.
    const claimed = await this.prisma.aIAction.updateMany({
      where: {
        id: action.id,
        status: { in: [ActionStatus.PENDING, ActionStatus.APPROVED] },
      },
      data: { status: ActionStatus.EXECUTING },
    });

    if (claimed.count === 0) {
      // Another concurrent caller already claimed execution — return current state safely
      const current = await this.prisma.aIAction.findFirst({ where: { id: action.id } });
      if (current?.status === 'COMPLETED') {
        return { status: 'COMPLETED', result: current.result };
      }
      return { status: current?.status ?? 'EXECUTING' };
    }

    try {
      const result = await this.executor.execute(
        action.tool,
        action.parameters as Record<string, unknown>,
        orgId,
        requestorContext?.locationIds ?? null,
        userId,
      );
      await this.prisma.aIAction.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          result: result as Prisma.InputJsonValue,
          executedAt: new Date(),
        },
      });
      return { status: 'COMPLETED', result };
    } catch (err: unknown) {
      await this.prisma.aIAction.update({
        where: { id: action.id },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }

  async reject(orgId: string, approvalId: string, userId: string, reason: string) {
    const approval = await this.prisma.aIApproval.findFirst({
      where: { id: approvalId, organizationId: orgId },
    });
    if (!approval) throw new NotFoundException('Approval not found');

    await this.prisma.aIApproval.update({
      where: { id: approvalId },
      data: {
        decision: 'REJECTED',
        reviewedBy: userId,
        reason,
        reviewedAt: new Date(),
      },
    });

    if (approval.actionId) {
      await this.prisma.aIAction.update({
        where: { id: approval.actionId },
        data: { status: 'REJECTED' },
      });
    }

    return { status: 'REJECTED' };
  }

  async getStats(orgId: string) {
    const now = new Date();
    const [pending, approved, rejected, expired] = await Promise.all([
      this.prisma.aIApproval.count({
        where: { organizationId: orgId, decision: { equals: null }, expiresAt: { gt: now } },
      }),
      this.prisma.aIApproval.count({
        where: { organizationId: orgId, decision: 'APPROVED' },
      }),
      this.prisma.aIApproval.count({
        where: { organizationId: orgId, decision: 'REJECTED' },
      }),
      this.prisma.aIApproval.count({
        where: { organizationId: orgId, decision: { equals: null }, expiresAt: { lt: now } },
      }),
    ]);
    return { pending, approved, rejected, expired };
  }

  async listHistory(orgId: string, query: ListApprovalsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AIApprovalWhereInput = { organizationId: orgId };
    if (query.decision) where.decision = query.decision;

    const [approvals, total] = await Promise.all([
      this.prisma.aIApproval.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.aIApproval.count({ where }),
    ]);

    // Enrich with action + tool info
    const data = await Promise.all(
      approvals.map(async (approval) => {
        if (!approval.actionId) return { ...approval, action: null };
        const action = await this.prisma.aIAction.findFirst({
          where: { id: approval.actionId },
          include: { tool: { select: { name: true, category: true } } },
        });
        return { ...approval, action };
      }),
    );

    return { data, meta: { total, page, limit } };
  }
}
