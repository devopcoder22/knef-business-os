import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type GenerateReportJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import { ReportDataService } from '../services/report-data.service';
import { ReportExportersService } from '../services/report-exporters.service';
import type { WorkerConfig } from '../config/worker.config';
import type { Prisma } from '@prisma/client';

type ReportFormat = 'csv' | 'xlsx' | 'pdf';
const VALID_FORMATS: ReportFormat[] = ['csv', 'xlsx', 'pdf'];

@Injectable()
export class ReportsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportData: ReportDataService,
    private readonly exporters: ReportExportersService,
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

    this.worker.on('completed', (job) =>
      this.logger.debug(`Report job ${job.id} completed`),
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

  private async process(job: Job): Promise<{ filePath: string; sizeBytes: number } | undefined> {
    if (job.name === JOB_TYPES.GENERATE_REPORT) {
      return this.generateReport(job.data as GenerateReportJobData);
    }
    return undefined;
  }

  private async generateReport(data: GenerateReportJobData): Promise<{ filePath: string; sizeBytes: number }> {
    const { organizationId, reportType, params, requestedBy } = data;
    const format = this.parseFormat(params.format as string | undefined);
    const start = Date.now();

    this.logger.log(
      `Generating report: type=${reportType} format=${format} org=${organizationId}`,
    );

    // ── Validate report type ───────────────────────────────────────────────
    const knownTypes = [
      'sales.summary', 'sales.orders',
      'inventory.valuation', 'inventory.low_stock',
      'finance.pl', 'finance.expenses',
      'staff.attendance', 'purchasing.summary',
    ];
    if (!knownTypes.includes(reportType)) {
      throw new UnrecoverableError(`Unknown report type: ${reportType}`);
    }

    const uploadDir = this.config.get<string>('UPLOAD_DIR', '/app/uploads');

    // ── Generate data ──────────────────────────────────────────────────────
    const dataset = await this.reportData.generate(organizationId, reportType, params);

    // ── Export file ────────────────────────────────────────────────────────
    const { filePath, sizeBytes } = await this.exporters.export(
      dataset,
      format,
      uploadDir,
      organizationId,
    );

    // ── Audit ──────────────────────────────────────────────────────────────
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: requestedBy,
        action: 'REPORT_GENERATED',
        entity: 'Report',
        entityId: reportType,
        metadata: {
          reportType,
          format,
          rowCount: dataset.rows.length,
          sizeBytes,
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Report ready: ${filePath} (${dataset.rows.length} rows, ${sizeBytes} bytes, ${Date.now() - start}ms)`,
    );

    return { filePath, sizeBytes };
  }

  private parseFormat(raw: string | undefined): ReportFormat {
    const f = (raw ?? 'csv').toLowerCase() as ReportFormat;
    return VALID_FORMATS.includes(f) ? f : 'csv';
  }
}
