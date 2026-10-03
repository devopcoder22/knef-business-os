import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { parseExpression } from 'cron-parser';
import { QUEUES, JOB_TYPES, type ScheduledAgentJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

/**
 * Compute the next occurrence of a cron schedule after `fromDate`.
 * Uses UTC throughout — the worker has no per-agent timezone in the current schema.
 * Throws CronError from cron-parser for invalid expressions.
 */
export function nextRunFromCron(cronExpression: string, fromDate: Date = new Date()): Date {
  const interval = parseExpression(cronExpression, {
    currentDate: fromDate,
    tz: 'UTC',
  });
  return interval.next().toDate();
}

/**
 * Deterministic BullMQ job ID for a scheduled agent execution.
 *
 * Format: agent:<agentId>:<ISO-minute>
 *   - Same agent + same scheduled occurrence → identical ID → BullMQ deduplicates.
 *   - Next occurrence → different ID (different minute bucket).
 *   - Minute precision matches the minimum cron granularity.
 */
export function scheduledJobId(agentId: string, scheduledAt: Date): string {
  return `agent:${agentId}:${scheduledAt.toISOString().slice(0, 16)}`;
}

@Injectable()
export class AIAgentScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AIAgentScheduler.name);
  private timer!: ReturnType<typeof setInterval>;
  private queue!: Queue;
  private connection!: Redis;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const intervalMs = this.config.get<number>('AI_AGENT_POLL_INTERVAL_MS', 60_000);

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUES.AI_AGENT, { connection: this.connection });

    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);

    this.logger.log(`AI agent scheduler started (interval=${intervalMs}ms)`);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.queue.close();
    await this.connection.quit();
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.dispatchDueAgents();
    } catch (err: unknown) {
      this.logger.error(
        `AI agent scheduler error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async dispatchDueAgents(): Promise<void> {
    const now = new Date();

    const agents = await this.prisma.aIScheduledAgent.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      take: 50,
    });

    if (agents.length === 0) return;

    this.logger.log(`Dispatching ${agents.length} due AI agent(s)`);

    for (const agent of agents) {
      // Validate + compute next occurrence BEFORE dispatching.
      // If the cron expression is invalid, deactivate the agent and skip —
      // an invalid expression would cause a tight retry loop otherwise.
      const scheduledOccurrence = agent.nextRunAt ?? new Date();
      let nextRunAt: Date;
      try {
        nextRunAt = nextRunFromCron(agent.cronExpression, scheduledOccurrence);
      } catch {
        this.logger.error(
          `Agent ${agent.id}: invalid cron expression "${agent.cronExpression}" — deactivating`,
        );
        await this.prisma.aIScheduledAgent.update({
          where: { id: agent.id },
          data: {
            isActive: false,
            lastStatus: 'SCHEDULE_ERROR: invalid cron expression',
          },
        });
        continue;
      }

      const jobData: ScheduledAgentJobData = {
        agentId: agent.id,
        organizationId: agent.organizationId,
      };

      // Deterministic job ID — same scheduled occurrence always produces the same ID.
      // Two scheduler instances polling concurrently will attempt the same job ID;
      // BullMQ deduplicates so only one logical execution is enqueued.
      const jobId = scheduledJobId(agent.id, scheduledOccurrence);

      await this.queue.add(JOB_TYPES.RUN_SCHEDULED_AGENT, jobData, {
        jobId,
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
      });

      // Advance nextRunAt from the original scheduled time to prevent drift.
      // (Using agent.nextRunAt as the base, not Date.now(), so an 08:00 job stays at 08:00.)
      await this.prisma.aIScheduledAgent.update({
        where: { id: agent.id },
        data: { nextRunAt },
      });

      this.logger.debug(`Agent ${agent.id} dispatched (job=${jobId}, nextRunAt=${nextRunAt.toISOString()})`);
    }
  }
}
