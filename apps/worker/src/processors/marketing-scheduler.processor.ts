import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import {
  QUEUES,
  JOB_TYPES,
  type MarketingScheduleCheckJobData,
  type SocialPublishJobData,
} from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import * as crypto from 'crypto';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class MarketingSchedulerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketingSchedulerProcessor.name);
  private worker!: Worker;
  private connection!: Redis;
  private marketingQueue!: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL')!;
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.marketingQueue = new Queue(QUEUES.MARKETING, {
      connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    });

    this.worker = new Worker(QUEUES.MARKETING, async (job: Job) => this.process(job), {
      connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
      concurrency: 2,
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Marketing job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.marketingQueue?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.MARKETING_SCHEDULE_CHECK:
        await this.processScheduleCheck(job.data as MarketingScheduleCheckJobData);
        break;
      default:
        this.logger.warn(`Unknown marketing job type: ${job.name}`);
    }
  }

  private async processScheduleCheck(data: MarketingScheduleCheckJobData): Promise<void> {
    const { organizationId } = data;

    const due = await this.prisma.contentDraft.findMany({
      where: {
        organizationId,
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
      },
      select: { id: true, title: true, targetChannel: true },
    });

    if (due.length === 0) return;

    this.logger.log(
      `[MarketingScheduler] ${due.length} draft(s) due for publication in org ${organizationId}`,
    );

    for (const draft of due) {
      // Find active social accounts for this org
      const socialAccounts = await this.prisma.socialAccount.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, provider: true },
      });

      if (socialAccounts.length === 0) {
        this.logger.log(
          `[MarketingScheduler] Draft ${draft.id} due — no social accounts connected, skipping`,
        );
        continue;
      }

      for (const account of socialAccounts) {
        // Check if an attempt is already queued/running/published for this draft+account
        const existingAttempt = await this.prisma.publicationAttempt.findFirst({
          where: {
            organizationId,
            draftId: draft.id,
            socialAccountId: account.id,
            status: { in: ['QUEUED', 'UPLOADING', 'PROCESSING', 'PUBLISHED'] },
          },
        });

        if (existingAttempt) {
          this.logger.debug(
            `Attempt already exists for draft ${draft.id} + account ${account.id} — skipping`,
          );
          continue;
        }

        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`scheduler:${draft.id}:${account.id}:${Date.now()}`)
          .digest('hex');

        // Create attempt record
        const attempt = await this.prisma.publicationAttempt.create({
          data: {
            organizationId,
            draftId: draft.id,
            socialAccountId: account.id,
            provider: account.provider,
            externalAccountId: account.id, // will be resolved in executePublish
            status: 'QUEUED',
            idempotencyKey,
            attemptNumber: 1,
          },
        });

        const jobData: SocialPublishJobData = {
          attemptId: attempt.id,
          organizationId,
          draftId: draft.id,
          socialAccountId: account.id,
          provider: account.provider,
        };

        await this.marketingQueue.add(JOB_TYPES.SOCIAL_PUBLISH, jobData, {
          jobId: `social-publish:${attempt.id}`,
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 200,
        });

        this.logger.log(
          `[MarketingScheduler] Queued SOCIAL_PUBLISH for draft ${draft.id} → ${account.provider} account ${account.id}`,
        );
      }
    }
  }
}
