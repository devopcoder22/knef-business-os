import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { QueueService } from '../../common/services/queue.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AutomationConditionEvaluatorService } from './automation-condition-evaluator.service';
import type { ConditionNode, EvaluationContext } from './automation-condition-evaluator.service';
import { QUEUES, JOB_TYPES, type AutomationExecuteJobData } from '@knef/constants';
import type { AutomationRule } from '@prisma/client';

const MAX_AUTOMATION_DEPTH = 3;

// ── Event envelope ────────────────────────────────────────────────────────────

export interface AutomationEventEnvelope {
  eventType: string;
  organizationId: string;
  locationId?: string | null;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  occurredAt: Date;
  automationDepth: number;
  causationId?: string | null;
  data: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a stable, minute-scoped eventId for deduplication.
 * Same entity + same event type within the same minute = same eventId.
 */
export function generateEventId(
  eventType: string,
  organizationId: string,
  entityId: string | undefined,
): string {
  const minute = Math.floor(Date.now() / 60_000);
  return createHash('sha256')
    .update(`${eventType}:${organizationId}:${entityId ?? ''}:${minute}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Simple template renderer: replaces {{field.path}} with values from the envelope.
 * Safe — only accesses the envelope object, no eval.
 */
function renderTemplate(template: string, envelope: AutomationEventEnvelope): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const trimmed = path.trim();
    const parts = trimmed.split('.');
    let val: unknown = { ...envelope, ...envelope.data };
    for (const p of parts) {
      if (val === null || val === undefined || typeof val !== 'object') { val = undefined; break; }
      val = (val as Record<string, unknown>)[p];
    }
    return val === undefined || val === null ? '' : String(val);
  });
}

function renderParams(
  params: Record<string, unknown>,
  envelope: AutomationEventEnvelope,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    resolved[k] = typeof v === 'string' ? renderTemplate(v, envelope) : v;
  }
  return resolved;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AutomationActionDispatcherService {
  private readonly logger = new Logger(AutomationActionDispatcherService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly prisma: PrismaService,
    private readonly conditionEvaluator: AutomationConditionEvaluatorService,
  ) {}

  /**
   * Main entry point — called by AutomationEventsListener for every business event.
   * Finds matching rules, evaluates conditions, persists execution records, enqueues jobs.
   */
  async dispatchForEvent(
    rules: AutomationRule[],
    envelope: AutomationEventEnvelope,
  ): Promise<void> {
    if (envelope.automationDepth >= MAX_AUTOMATION_DEPTH) {
      this.logger.warn(
        `Event ${envelope.eventType} (org=${envelope.organizationId}) reached max automation depth ${MAX_AUTOMATION_DEPTH} — stopping chain`,
      );
      return;
    }

    const eventId = generateEventId(envelope.eventType, envelope.organizationId, envelope.entityId);
    const evalContext: EvaluationContext = { ...envelope, data: envelope.data };

    for (const rule of rules) {
      // Evaluate conditions
      const conditions = Array.isArray(rule.conditions) ? (rule.conditions as unknown as ConditionNode[]) : [];
      const conditionsMet = this.conditionEvaluator.evaluate(conditions, evalContext);

      if (!conditionsMet) {
        this.logger.debug(`Rule ${rule.id} conditions not met for event ${envelope.eventType}`);
        continue;
      }

      const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as Array<{ type: string; params?: Record<string, unknown> }>) : [];

      for (let idx = 0; idx < actions.length; idx++) {
        const action = actions[idx];
        await this.createAndEnqueueExecution(rule, envelope, eventId, action, idx);
      }

      // Update rule metadata
      await this.prisma.automationRule.update({
        where: { id: rule.id },
        data: {
          lastTriggeredAt: new Date(),
          triggerCount: { increment: 1 },
        },
      });
    }
  }

  private async createAndEnqueueExecution(
    rule: AutomationRule,
    envelope: AutomationEventEnvelope,
    eventId: string,
    action: { type: string; params?: Record<string, unknown> },
    actionIndex: number,
  ): Promise<void> {
    const resolvedParams = renderParams(action.params ?? {}, envelope);
    const executionId = createId();

    // Persist execution record — unique constraint prevents duplicate from replayed events
    let execution: { id: string } | null = null;
    try {
      execution = await this.prisma.automationExecution.create({
        data: {
          id: executionId,
          organizationId: rule.organizationId,
          ruleId: rule.id,
          eventId,
          eventType: envelope.eventType,
          locationId: envelope.locationId ?? null,
          status: 'PENDING',
          actionType: action.type,
          actionIndex,
          causationId: envelope.causationId ?? null,
          automationDepth: envelope.automationDepth,
        },
        select: { id: true },
      });
    } catch {
      // Unique constraint violation = duplicate event; skip silently
      this.logger.debug(
        `Execution for rule ${rule.id} eventId=${eventId} actionIndex=${actionIndex} already exists — skipping (idempotent)`,
      );
      return;
    }

    const jobData: AutomationExecuteJobData = {
      executionId: execution.id,
      ruleId: rule.id,
      organizationId: rule.organizationId,
      eventId,
      eventType: envelope.eventType,
      locationId: envelope.locationId ?? null,
      actionType: action.type,
      actionIndex,
      actionParams: resolvedParams,
      eventData: envelope.data,
      automationDepth: envelope.automationDepth,
      causationId: envelope.causationId ?? null,
    };

    const jobId = `auto:${rule.id}:${eventId}:${actionIndex}`;

    await this.queue.enqueue<AutomationExecuteJobData>(
      QUEUES.AUTOMATION,
      JOB_TYPES.AUTOMATION_EXECUTE,
      jobData,
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    this.logger.log(
      `Enqueued automation job ${jobId} for rule ${rule.id} (${action.type}, depth=${envelope.automationDepth})`,
    );
  }

  /**
   * Simulate rule evaluation without executing any actions.
   * Returns match result and condition evaluation details.
   */
  simulateRule(
    rule: AutomationRule,
    testData: Record<string, unknown>,
  ): {
    conditionsMet: boolean;
    actionsWouldExecute: Array<{ type: string; resolvedParams: Record<string, unknown> }>;
  } {
    const conditions = Array.isArray(rule.conditions)
      ? (rule.conditions as unknown as ConditionNode[])
      : [];
    const evalContext: EvaluationContext = { data: testData, ...testData };
    const conditionsMet = this.conditionEvaluator.evaluate(conditions, evalContext);

    const fakeEnvelope: AutomationEventEnvelope = {
      eventType: rule.trigger,
      organizationId: rule.organizationId,
      occurredAt: new Date(),
      automationDepth: 0,
      data: testData,
    };

    const actions = Array.isArray(rule.actions)
      ? (rule.actions as unknown as Array<{ type: string; params?: Record<string, unknown> }>)
      : [];
    const actionsWouldExecute = conditionsMet
      ? actions.map((a) => ({
          type: a.type,
          resolvedParams: renderParams(a.params ?? {}, fakeEnvelope),
        }))
      : [];

    return { conditionsMet, actionsWouldExecute };
  }
}
