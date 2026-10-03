import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import { createId } from '@paralleldrive/cuid2';
import { QUEUES, JOB_TYPES, type IngestDocumentJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import { EmbeddingService, chunkText } from '../services/embedding.service';
import type { WorkerConfig } from '../config/worker.config';
import type { Prisma } from '@prisma/client';

const MAX_CONTENT_BYTES = 10 * 1024 * 1024; // 10 MB safety limit

@Injectable()
export class DocumentsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
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

    this.worker.on('completed', (job) =>
      this.logger.debug(`Document job ${job.id} completed`),
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
    const { documentId, organizationId } = data;
    const start = Date.now();

    // ── Load document ──────────────────────────────────────────────────────
    const doc = await this.prisma.aIDocument.findFirst({
      where: { id: documentId, organizationId },
    });

    if (!doc) {
      // Stale job — document was deleted before processing
      throw new UnrecoverableError(`Document ${documentId} not found in org ${organizationId}`);
    }

    if (!doc.content || doc.content.trim().length === 0) {
      throw new UnrecoverableError(`Document ${documentId} has no content to index`);
    }

    if (Buffer.byteLength(doc.content, 'utf8') > MAX_CONTENT_BYTES) {
      throw new UnrecoverableError(`Document ${documentId} content exceeds ${MAX_CONTENT_BYTES} byte limit`);
    }

    this.logger.log(`Ingesting document ${documentId} (org=${organizationId})`);

    // ── Mark as processing ─────────────────────────────────────────────────
    await this.prisma.aIDocument.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' },
    });

    try {
      // ── Delete stale chunks (idempotent reindex) ───────────────────────
      await this.prisma.aIDocumentChunk.deleteMany({ where: { documentId } });

      // ── Chunk content ──────────────────────────────────────────────────
      const chunks = chunkText(doc.content);

      if (chunks.length === 0) {
        await this.prisma.aIDocument.update({
          where: { id: documentId },
          data: { status: 'READY', chunkCount: 0 },
        });
        return;
      }

      this.logger.debug(`Document ${documentId}: ${chunks.length} chunk(s) to embed`);

      // ── Create chunk records first, then store embeddings ─────────────
      const chunkIds: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const id = createId();
        chunkIds.push(id);
        await this.prisma.aIDocumentChunk.create({
          data: {
            id,
            documentId,
            chunkIndex: i,
            content: chunks[i],
            tokenCount: Math.ceil(chunks[i].split(/\s+/).length * 1.3),
            metadata: { documentTitle: doc.title, organizationId } as Prisma.InputJsonValue,
          },
        });
      }

      // ── Generate and store embeddings ──────────────────────────────────
      let embeddedCount = 0;
      for (let i = 0; i < chunks.length; i++) {
        const vector = await this.embedding.generateEmbedding(organizationId, chunks[i]);
        if (vector) {
          await this.embedding.storeEmbedding(chunkIds[i], vector);
          embeddedCount++;
        }
      }

      // ── Mark ready ─────────────────────────────────────────────────────
      await this.prisma.aIDocument.update({
        where: { id: documentId },
        data: { status: 'READY', chunkCount: chunks.length },
      });

      this.logger.log(
        `Document ${documentId} ingested: ${chunks.length} chunks, ${embeddedCount} embedded (${Date.now() - start}ms)`,
      );
    } catch (err: unknown) {
      await this.prisma.aIDocument.update({
        where: { id: documentId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }
}
