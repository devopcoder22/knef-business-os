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
import { CalendarSyncService } from '../services/calendar-sync.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class CalendarProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly calendarSync: CalendarSyncService,
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

    this.worker.on('completed', (job) =>
      this.logger.debug(`Calendar job ${job.id} completed`),
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
    const start = Date.now();
    this.logger.log(
      `Syncing calendar integration ${data.connectionId} (${data.provider}, org=${data.organizationId})`,
    );

    await this.calendarSync.syncIntegration(data.connectionId, data.organizationId);

    this.logger.log(
      `Calendar sync complete: ${data.connectionId} (${Date.now() - start}ms)`,
    );
  }
}
