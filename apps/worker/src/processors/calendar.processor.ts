import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type SyncCalendarJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class CalendarProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarProcessor.name);
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
      QUEUES.CALENDAR,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Calendar job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Calendar processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.SYNC_CALENDAR) {
      await this.syncCalendar(job.data as SyncCalendarJobData);
    }
  }

  private async syncCalendar(data: SyncCalendarJobData): Promise<void> {
    this.logger.log(
      `Syncing calendar integration ${data.connectionId} (provider: ${data.provider}) for user ${data.userId}`,
    );

    const integration = await this.prisma.calendarIntegration.findFirst({
      where: {
        id: data.connectionId,
        userId: data.userId,
        organizationId: data.organizationId,
        isActive: true,
        syncEnabled: true,
      },
    });

    if (!integration) {
      this.logger.warn(`Calendar integration ${data.connectionId} not found or disabled`);
      return;
    }

    await this.prisma.calendarIntegration.update({
      where: { id: data.connectionId },
      data: { lastSyncAt: new Date() },
    });

    this.logger.debug(`Calendar sync completed for integration ${data.connectionId}`);
  }
}
