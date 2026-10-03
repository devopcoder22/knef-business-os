import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { spawn } from 'child_process';
import { QUEUES, JOB_TYPES, type RunBackupJobData } from '@knef/constants';
import type { WorkerConfig } from '../config/worker.config';
import * as path from 'path';

@Injectable()
export class BackupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(private readonly config: ConfigService<WorkerConfig>) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.BACKUP,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 1 },
    );

    this.worker.on('completed', (job) =>
      this.logger.log(`Backup job ${job.id} completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Backup job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Backup processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.RUN_BACKUP) {
      await this.runBackup(job.data as RunBackupJobData);
    }
  }

  private async runBackup(data: RunBackupJobData): Promise<void> {
    const backupDir = this.config.get<string>('BACKUP_DIR', '/app/backups');
    const backupScript = path.resolve('/app/scripts/backup.sh');

    this.logger.log(`Starting backup (triggered by: ${data.triggeredBy})`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn('sh', [backupScript], {
        env: {
          ...process.env,
          BACKUP_DIR: backupDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (d: Buffer) =>
        this.logger.debug(`backup: ${d.toString().trim()}`),
      );
      child.stderr?.on('data', (d: Buffer) =>
        this.logger.warn(`backup stderr: ${d.toString().trim()}`),
      );

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Backup script exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }
}
