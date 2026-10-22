import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AdvertisingCampaignSyncJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

// Sync all active advertising accounts every 4 hours
const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class AdvertisingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdvertisingScheduler.name);
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

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUES.ADVERTISING, { connection: this.connection });

    // Run immediately on startup, then every 4 hours
    void this.poll();
    this.timer = setInterval(() => void this.poll(), SYNC_INTERVAL_MS);

    this.logger.log(`Advertising scheduler started (interval=${SYNC_INTERVAL_MS}ms / 4 hours)`);
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
      await this.dispatchCampaignSyncs();
    } catch (err: unknown) {
      this.logger.error(
        `Advertising scheduler poll error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async dispatchCampaignSyncs(): Promise<void> {
    const activeAccounts = await this.prisma.advertisingAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        organizationId: true,
        provider: true,
      },
    });

    if (activeAccounts.length === 0) {
      this.logger.debug('No active advertising accounts to sync');
      return;
    }

    this.logger.log(`Dispatching campaign sync for ${activeAccounts.length} active account(s)`);

    const jobs = activeAccounts.map((account) => ({
      name: JOB_TYPES.ADVERTISING_CAMPAIGN_SYNC,
      data: {
        organizationId: account.organizationId,
        advertisingAccountId: account.id,
        provider: account.provider,
      } satisfies AdvertisingCampaignSyncJobData,
      opts: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 2,
        backoff: { type: 'exponential' as const, delay: 10_000 },
      },
    }));

    await this.queue.addBulk(jobs);

    this.logger.log(`Queued ${jobs.length} advertising campaign sync job(s)`);
  }
}
