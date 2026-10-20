import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOB_TYPES, type MarketingScheduleCheckJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class MarketingSchedulerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketingSchedulerProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL')!;
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

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

    // Log due drafts but do NOT transition to PUBLISHED. Reaching scheduledAt alone does
    // not mean content has been published — actual channel delivery and the PUBLISHED
    // status transition are handled by Phase 24E channel-specific publishers.
    this.logger.log(
      `[MarketingScheduler] ${due.length} draft(s) due for publication in org ${organizationId} — awaiting Phase 24E publisher`,
    );
    for (const draft of due) {
      this.logger.log(
        `[MarketingScheduler] Draft ${draft.id} ("${draft.title}", ${draft.targetChannel}) is due — Phase 24E will publish`,
      );
    }
  }
}
