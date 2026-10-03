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
import * as fs from 'fs';
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

  private async process(job: Job): Promise<{ filePath: string; sizeBytes: number } | undefined> {
    if (job.name === JOB_TYPES.RUN_BACKUP) {
      return this.runBackup(job.data as RunBackupJobData);
    }
    return undefined;
  }

  private async runBackup(data: RunBackupJobData): Promise<{ filePath: string; sizeBytes: number }> {
    const backupDir = this.config.get<string>('BACKUP_DIR', '/app/backups');
    const backupScript = path.resolve('/app/scripts/backup.sh');
    const retentionDays = this.config.get<number>('BACKUP_RETENTION_DAYS', 7);

    this.logger.log(`Starting backup (triggered by: ${data.triggeredBy})`);

    // Collect stdout lines to parse BACKUP_FILE= and BACKUP_SIZE= markers
    const stdoutLines: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('bash', [backupScript], {
        env: {
          ...process.env,
          BACKUP_DIR: backupDir,
          BACKUP_RETENTION_DAYS: String(retentionDays),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (d: Buffer) => {
        const text = d.toString();
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) {
            stdoutLines.push(trimmed);
            this.logger.debug(`backup: ${trimmed}`);
          }
        }
      });
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

    // Parse BACKUP_FILE= and BACKUP_SIZE= from script stdout
    let filePath: string | undefined;
    let reportedSize: number | undefined;

    for (const line of stdoutLines) {
      if (line.startsWith('BACKUP_FILE=')) {
        filePath = line.slice('BACKUP_FILE='.length);
      } else if (line.startsWith('BACKUP_SIZE=')) {
        reportedSize = parseInt(line.slice('BACKUP_SIZE='.length), 10);
      }
    }

    // Verify backup file exists and has non-zero size
    if (!filePath) {
      throw new Error('Backup script did not report BACKUP_FILE — cannot verify output');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file not found after script exit: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      throw new Error(`Backup file is empty (0 bytes): ${filePath}`);
    }

    const sizeBytes = stat.size;

    if (reportedSize !== undefined && reportedSize !== sizeBytes) {
      this.logger.warn(
        `Backup size mismatch: script reported ${reportedSize} bytes, stat shows ${sizeBytes} bytes`,
      );
    }

    this.logger.log(`Backup verified: ${filePath} (${sizeBytes} bytes)`);

    return { filePath, sizeBytes };
  }
}
