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
import { QUEUES, JOB_TYPES, type IngestDocumentJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class DocumentsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsProcessor.name);
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
      QUEUES.DOCUMENTS,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Document job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Documents processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.INGEST_DOCUMENT) {
      await this.ingestDocument(job.data as IngestDocumentJobData);
    }
  }

  private async ingestDocument(data: IngestDocumentJobData): Promise<void> {
    this.logger.log(
      `Ingesting document ${data.documentId} for org ${data.organizationId}`,
    );

    // RAG document ingestion: chunk content, generate embeddings, store vectors
    // Placeholder — implementation depends on pgvector schema and embedding provider
    await this.prisma.auditLog.create({
      data: {
        organizationId: data.organizationId,
        userId: 'worker',
        action: 'DOCUMENT_INGESTED',
        entity: 'Document',
        entityId: data.documentId,
        metadata: data.metadata as Prisma.InputJsonValue,
      },
    }).catch(() => {});
  }
}
