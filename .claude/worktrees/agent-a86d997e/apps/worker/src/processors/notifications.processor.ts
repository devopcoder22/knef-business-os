import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { createId } from '@paralleldrive/cuid2';
import { QUEUES, JOB_TYPES, type NotificationJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
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
      QUEUES.NOTIFICATIONS,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 10 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Notification job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Notifications processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.SEND_NOTIFICATION) {
      await this.createNotification(job.data as NotificationJobData);
    }
  }

  private async createNotification(data: NotificationJobData): Promise<void> {
    await this.prisma.notification.create({
      data: {
        id: createId(),
        organizationId: data.organizationId,
        userId: data.userId,
        title: data.title,
        body: data.message,
        type: 'INFO',
        data: {
          entityId: data.entityId,
          entityType: data.entityType,
          ...data.metadata,
        },
        isRead: false,
      },
    });
  }
}
