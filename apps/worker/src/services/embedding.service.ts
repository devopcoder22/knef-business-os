import { Injectable, Logger } from '@nestjs/common';
import { decrypt } from '@knef/utils';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/** Chunk plain text into overlapping word-window segments (matches APIKnowledgeService). */
export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  /**
   * Generate an embedding vector for a single text string using the
   * organization's configured OpenAI provider.
   *
   * Returns null if no OpenAI provider is configured (caller should fail gracefully).
   * Throws on transient API errors so BullMQ can retry.
   */
  async generateEmbedding(organizationId: string, text: string): Promise<number[] | null> {
    const provider = await this.prisma.aIProvider.findFirst({
      where: { organizationId, provider: 'openai', isActive: true },
      orderBy: { isDefault: 'desc' },
    });

    if (!provider) {
      this.logger.warn(`No active OpenAI provider for org ${organizationId} — cannot generate embedding`);
      return null;
    }

    const encKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    const apiKey = decrypt(provider.apiKeyEncrypted, encKey);
    const baseUrl = provider.baseUrl ?? 'https://api.openai.com';

    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new UnrecoverableError(`OpenAI embedding auth failure for org ${organizationId}: HTTP ${res.status}`);
    }

    if (!res.ok) {
      throw new Error(`OpenAI embeddings API: HTTP ${res.status}`);
    }

    const json = await res.json() as { data?: Array<{ embedding: number[] }> };
    const embedding = json.data?.[0]?.embedding;

    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding response: expected ${EMBEDDING_DIMENSIONS} dims, got ${embedding?.length ?? 0}`);
    }

    return embedding;
  }

  /**
   * Store an embedding vector in pgvector using raw SQL.
   * Prisma does not support the vector type natively.
   */
  async storeEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await this.prisma.$executeRaw`
      UPDATE "ai_document_chunks"
      SET embedding = ${vectorLiteral}::vector
      WHERE id = ${chunkId}
    `;
  }
}
