import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type SyncCalendarJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

const SYNC_INTERVAL_HOURS = 1;

@Injectable()
export class CalendarSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarSyncScheduler.name);
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
    const intervalMs = this.config.get<number>('CALENDAR_POLL_INTERVAL_MS', 300_000);

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUES.CALENDAR, { connection: this.connection });

    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);

    this.logger.log(`Calendar sync scheduler started (interval=${intervalMs}ms)`);
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
      await this.enqueueStaleIntegrations();
    } catch (err: unknown) {
      this.logger.error(
        `Calendar sync scheduler error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async enqueueStaleIntegrations(): Promise<void> {
    const staleThreshold = new Date(
      Date.now() - SYNC_INTERVAL_HOURS * 60 * 60 * 1_000,
    );

    const integrations = await this.prisma.calendarIntegration.findMany({
      where: {
        isActive: true,
        syncEnabled: true,
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lte: staleThreshold } },
        ],
      },
      take: 100,
    });

    if (integrations.length === 0) return;

    this.logger.log(`Enqueuing ${integrations.length} calendar integration(s) for sync`);

    const jobs = integrations.map((integration) => {
      const data: SyncCalendarJobData = {
        connectionId: integration.id,
        organizationId: integration.organizationId,
        userId: integration.userId,
        provider: integration.provider,
      };
      return {
        name: JOB_TYPES.SYNC_CALENDAR,
        data,
        opts: {
          jobId: `cal:${integration.id}`,
          removeOnComplete: 20,
          removeOnFail: 50,
          attempts: 2,
          backoff: { type: 'fixed' as const, delay: 60_000 },
        },
      };
    });

    await this.queue.addBulk(jobs);
  }
}
