import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { GoalsService } from '../goals/goals.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../communications/notifications.service';
import { AIPermissionCheckerService } from '../ai-actions/ai-permission-checker.service';
import { PERMISSIONS } from '@knef/constants';

interface ProposedTaskData {
  title: string;
  description?: string;
  priority?: string;
  estimatedHours?: number;
  dueDate?: string | null;
  dependsOn?: string | null;
}

export interface ExecutionResult {
  tasksCreated: number;
  tasksFailed: number;
  kpisLinked: number;
  planStatus: string;
  errors: string[];
}

@Injectable()
export class PlanExecutorService {
  private readonly logger = new Logger(PlanExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly goalsService: GoalsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly permissionChecker: AIPermissionCheckerService,
  ) {}

  async execute(
    organizationId: string,
    planId: string,
    executorId: string,
    stepIds?: string[],
  ): Promise<ExecutionResult> {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, organizationId },
      include: { taskLinks: { where: { isProposed: true } } },
    });

    if (!plan) throw new BadRequestException('Plan not found');
    if (plan.status !== 'APPROVED') {
      throw new BadRequestException('Only approved plans can be executed');
    }

    // Enforce permission: executor must have task.create
    const ctx = await this.permissionChecker.resolveExecutionContext(executorId, organizationId);
    if (!ctx.resolvedPermissions.includes(PERMISSIONS.TASKS.CREATE)) {
      throw new BadRequestException('You do not have permission to create tasks');
    }

    // Fast-fail for sequential full-plan duplicate (per-link atomics handle concurrency)
    const alreadyExecuted = await this.prisma.planTaskLink.count({
      where: { planId, isProposed: false },
    });
    if (alreadyExecuted > 0 && !stepIds) {
      throw new BadRequestException('Plan has already been executed. To re-execute specific steps, provide stepIds.');
    }

    const result: ExecutionResult = { tasksCreated: 0, tasksFailed: 0, kpisLinked: 0, planStatus: 'ACTIVE', errors: [] };

    // Filter links to requested steps (or all proposed)
    let links = plan.taskLinks;
    if (stepIds && stepIds.length > 0) {
      links = links.filter((l) => l.stepId && stepIds.includes(l.stepId));
    }

    const bulkThreshold = 20;
    if (links.length > bulkThreshold) {
      throw new BadRequestException(
        `This plan would create ${links.length} tasks. Review and approve via preview-execution first, then provide specific stepIds to execute in batches.`,
      );
    }

    for (const link of links) {
      // Atomic claim: only one concurrent caller can flip isProposed true → false.
      // Any caller that gets count=0 knows another request already owns this link.
      const claimed = await this.prisma.planTaskLink.updateMany({
        where: { id: link.id, isProposed: true },
        data: { isProposed: false },
      });
      if (claimed.count === 0) {
        // Link already claimed by a concurrent execution — skip without error
        continue;
      }

      const data = link.proposedData as ProposedTaskData | null;
      if (!data) continue;

      try {
        const task = await this.tasksService.create(
          organizationId,
          {
            title: data.title,
            description: data.description,
            priority: (data.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') ?? 'MEDIUM',
            dueDate: data.dueDate ?? undefined,
            estimatedHours: data.estimatedHours !== undefined ? String(data.estimatedHours) : undefined,
            goalId: plan.goalId ?? undefined,
            assigneeId: plan.ownerId ?? undefined,
          },
          executorId,
        );

        // Attach the real taskId now that creation succeeded
        await this.prisma.planTaskLink.update({
          where: { id: link.id },
          data: { taskId: task.id },
        });

        result.tasksCreated++;

        await this.audit.log({
          organizationId,
          userId: executorId,
          action: 'PLAN_TASK_CREATED',
          entity: 'Task',
          entityId: task.id,
          metadata: { planId, title: data.title },
        });
      } catch (err: unknown) {
        // Task creation failed — roll back the atomic claim so this link
        // remains eligible for a safe retry (isProposed: true, taskId: null).
        await this.prisma.planTaskLink.update({
          where: { id: link.id },
          data: { isProposed: true },
        }).catch((rollbackErr: unknown) => {
          this.logger.error(`Failed to roll back link ${link.id} after task creation error`, rollbackErr);
        });

        const msg = err instanceof Error ? err.message : 'Task creation failed';
        result.errors.push(`${data.title}: ${msg}`);
        result.tasksFailed++;
        this.logger.error(`Task creation failed for plan ${planId}: ${msg}`);
      }
    }

    // Link KPIs from plan metadata if goalId is set
    if (plan.goalId) {
      const planRecord = await this.prisma.plan.findFirst({ where: { id: planId }, select: { metadata: true } });

      const meta = planRecord?.metadata as { kpis?: Array<{ name: string; target: string; unit?: string }> } | null;
      if (meta?.kpis) {
        for (const kpi of meta.kpis) {
          try {
            await this.goalsService.addKpi(organizationId, plan.goalId, {
              name: kpi.name,
              target: kpi.target,
              unit: kpi.unit,
            });
            result.kpisLinked++;
          } catch {
            // KPI creation failure is non-fatal
          }
        }
      }
    }

    // Conditional update: only transition APPROVED → ACTIVE (idempotent for concurrent callers)
    await this.prisma.plan.updateMany({
      where: { id: planId, status: 'APPROVED' },
      data: { status: 'ACTIVE' },
    });

    await this.audit.log({
      organizationId,
      userId: executorId,
      action: 'PLAN_EXECUTED',
      entity: 'Plan',
      entityId: planId,
      metadata: result as unknown as Record<string, unknown>,
    });

    // Notify owner
    if (plan.ownerId) {
      await this.notifications.createNotification({
        organizationId,
        userId: plan.ownerId,
        type: 'SUCCESS',
        title: 'Plan Executed',
        body: `"${plan.title}" has been executed. ${result.tasksCreated} tasks created.`,
        data: { planId },
      }).catch(() => {});
    }

    return { ...result, planStatus: 'ACTIVE' };
  }
}
