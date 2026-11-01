import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES } from '@knef/constants';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection!: Redis;
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.connection.on('error', (err: Error) =>
      this.logger.warn(`BullMQ Redis error: ${err.message}`),
    );

    for (const queueName of Object.values(QUEUES)) {
      this.queues.set(
        queueName,
        new Queue(queueName, { connection: this.connection }),
      );
    }

    this.logger.log(`BullMQ queues initialized: ${Object.values(QUEUES).join(', ')}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    await this.connection.quit();
  }

  async enqueue<T>(
    queueName: string,
    jobType: string,
    data: T,
    opts?: JobsOptions,
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);

    const job = await queue.add(jobType, data, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      ...opts,
    });

    return job.id ?? '';
  }

  async enqueueBulk<T>(
    queueName: string,
    jobType: string,
    items: T[],
    opts?: JobsOptions,
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);

    const jobs = items.map((data) => ({
      name: jobType,
      data,
      opts: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5_000 },
        ...opts,
      },
    }));

    await queue.addBulk(jobs);
  }

  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async getAllQueueStats(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const name of this.queues.keys()) {
      result[name] = await this.getQueueStats(name);
    }
    return result;
  }
}
