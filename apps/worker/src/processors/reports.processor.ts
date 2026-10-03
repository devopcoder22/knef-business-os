import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import type { Prisma } from '@prisma/client';
import { QUEUES, JOB_TYPES, type GenerateReportJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class ReportsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsProcessor.name);
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
      QUEUES.REPORTS,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 3 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Report job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Reports processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.GENERATE_REPORT) {
      await this.generateReport(job.data as GenerateReportJobData);
    }
  }

  private async generateReport(data: GenerateReportJobData): Promise<void> {
    this.logger.log(
      `Generating report '${data.reportType}' for org ${data.organizationId} (requested by ${data.requestedBy})`,
    );

    // Log the report generation request via audit
    await this.prisma.auditLog.create({
      data: {
        organizationId: data.organizationId,
        userId: data.requestedBy,
        action: 'REPORT_GENERATED',
        entity: 'Report',
        entityId: data.reportType,
        metadata: { params: data.params } as Prisma.InputJsonValue,
      },
    }).catch(() => {});
  }
}
