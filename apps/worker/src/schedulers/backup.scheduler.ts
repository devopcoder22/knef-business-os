import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type RunBackupJobData } from '@knef/constants';
import type { WorkerConfig } from '../config/worker.config';

const CHECK_INTERVAL_MS = 60 * 60 * 1_000; // check once per hour

@Injectable()
export class BackupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupScheduler.name);
  private timer!: ReturnType<typeof setInterval>;
  private queue!: Queue;
  private connection!: Redis;
  private lastBackupDate: string | null = null;

  constructor(private readonly config: ConfigService<WorkerConfig>) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUES.BACKUP, { connection: this.connection });

    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);

    this.logger.log('Backup scheduler started (daily at configured hour)');
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.queue.close();
    await this.connection.quit();
  }

  private async check(): Promise<void> {
    try {
      const backupHour = this.config.get<number>('BACKUP_CRON_HOUR', 2);
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      if (now.getHours() === backupHour && this.lastBackupDate !== today) {
        this.lastBackupDate = today;
        await this.enqueueBackup();
      }
    } catch (err: unknown) {
      this.logger.error(
        `Backup scheduler error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async enqueueBackup(): Promise<void> {
    const data: RunBackupJobData = { triggeredBy: 'scheduler' };

    await this.queue.add(JOB_TYPES.RUN_BACKUP, data, {
      jobId: `backup:${new Date().toISOString().slice(0, 10)}`,
      removeOnComplete: 7,
      removeOnFail: 30,
      attempts: 2,
      backoff: { type: 'fixed', delay: 5 * 60 * 1_000 },
    });

    this.logger.log('Daily backup job enqueued');
  }
}
