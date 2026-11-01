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
  type SocialPublishJobData,
  type SocialStatusCheckJobData,
} from '@knef/constants';
import { SocialPublisherService } from '../services/social-publisher.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class SocialPublishingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocialPublishingProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly socialPublisher: SocialPublisherService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.MARKETING,
      async (job: Job) => this.process(job),
      { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 3 },
    );

    this.worker.on('completed', (job) =>
      this.logger.debug(`Social job ${job.id} (${job.name}) completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Social job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Social publishing processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.SOCIAL_PUBLISH:
        await this.handlePublish(job.data as SocialPublishJobData);
        break;
      case JOB_TYPES.SOCIAL_STATUS_CHECK:
        await this.handleStatusCheck(job.data as SocialStatusCheckJobData);
        break;
      default:
        this.logger.warn(`SocialPublishingProcessor: unknown job type ${job.name}`);
    }
  }

  private async handlePublish(data: SocialPublishJobData): Promise<void> {
    this.logger.log(
      `Publishing attempt ${data.attemptId} (${data.provider}, org=${data.organizationId})`,
    );
    await this.socialPublisher.executePublish(data.attemptId);
  }

  private async handleStatusCheck(data: SocialStatusCheckJobData): Promise<void> {
    this.logger.log(
      `Status check for attempt ${data.attemptId} (${data.provider})`,
    );
    await this.socialPublisher.checkPublicationStatus(
      data.attemptId,
      data.provider,
      data.providerPublishId,
    );
  }
}
