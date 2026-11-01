import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import {
  QUEUES,
  JOB_TYPES,
  type AdvertisingAccountSyncJobData,
  type AdvertisingCampaignSyncJobData,
  type AdvertisingMetricsSyncJobData,
  type AdvertisingActionSubmitJobData,
} from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class AdvertisingSyncProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdvertisingSyncProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.ADVERTISING,
      async (job: Job) => this.process(job),
      { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 2 },
    );

    this.worker.on('completed', (job) =>
      this.logger.debug(`Advertising job ${job.id} (${job.name}) completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Advertising job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Advertising sync processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.ADVERTISING_ACCOUNT_SYNC:
        await this.handleAccountSync(job.data as AdvertisingAccountSyncJobData);
        break;
      case JOB_TYPES.ADVERTISING_CAMPAIGN_SYNC:
        await this.handleCampaignSync(job.data as AdvertisingCampaignSyncJobData);
        break;
      case JOB_TYPES.ADVERTISING_METRICS_SYNC:
        await this.handleMetricsSync(job.data as AdvertisingMetricsSyncJobData);
        break;
      case JOB_TYPES.ADVERTISING_ACTION_SUBMIT:
        await this.handleActionSubmit(job.data as AdvertisingActionSubmitJobData);
        break;
      default:
        this.logger.warn(`AdvertisingSyncProcessor: unknown job type ${job.name}`);
    }
  }

  private async handleAccountSync(data: AdvertisingAccountSyncJobData): Promise<void> {
    this.logger.warn(
      `Account sync skipped — provider ${data.provider} is FOUNDATION ONLY ` +
      `(accountId=${data.advertisingAccountId}, org=${data.organizationId})`,
    );
    // Update lastSyncedAt to reflect attempt
    await this.prisma.advertisingAccount.updateMany({
      where: {
        id: data.advertisingAccountId,
        organizationId: data.organizationId,
      },
      data: { lastSyncedAt: new Date() },
    });
  }

  private async handleCampaignSync(data: AdvertisingCampaignSyncJobData): Promise<void> {
    this.logger.warn(
      `Campaign sync skipped — provider ${data.provider} is FOUNDATION ONLY ` +
      `(accountId=${data.advertisingAccountId}, org=${data.organizationId})`,
    );
  }

  private async handleMetricsSync(data: AdvertisingMetricsSyncJobData): Promise<void> {
    this.logger.warn(
      `Metrics sync skipped — provider ${data.provider} is FOUNDATION ONLY ` +
      `(accountId=${data.advertisingAccountId}, org=${data.organizationId}, ` +
      `from=${data.fromDate}, to=${data.toDate})`,
    );
  }

  private async handleActionSubmit(data: AdvertisingActionSubmitJobData): Promise<void> {
    this.logger.log(
      `Processing action submit for actionId=${data.actionId} (org=${data.organizationId})`,
    );

    // Re-read action from DB — do NOT use job payload for mutation values
    const action = await this.prisma.advertisingAction.findUnique({
      where: { id: data.actionId },
    });

    if (!action) {
      this.logger.warn(`handleActionSubmit: action ${data.actionId} not found in DB`);
      return;
    }

    // All providers are FOUNDATION ONLY
    const errorMessage =
      `Provider ${action.provider} is not yet active (foundation-only). ` +
      'This action requires the provider to be fully integrated.';

    await this.prisma.advertisingAction.update({
      where: { id: data.actionId },
      data: {
        status: 'FAILED',
        submittedAt: new Date(),
        errorMessage,
      },
    });

    this.logger.warn(
      `Action ${data.actionId} (${action.actionType}, ${action.provider}) failed — ` +
      'provider is foundation-only',
    );
  }
}
