import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AICompletionService } from './ai-completion.service';
import type { UploadDocumentDto, ListDocumentsDto } from './dto/ai.dto';

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

interface RawChunkRow {
  id: string;
  content: string;
  document_id: string;
  distance: number;
  doc_title: string;
}

@Injectable()
export class AIKnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: AICompletionService,
  ) {}

  async uploadDocument(orgId: string, dto: UploadDocumentDto) {
    // 1. Create document with PROCESSING status
    const doc = await this.prisma.aIDocument.create({
      data: {
        id: createId(),
        organizationId: orgId,
        title: dto.title,
        description: dto.description ?? null,
        content: dto.content,
        mimeType: dto.mimeType ?? 'text/plain',
        fileUrl: null,
        fileSize: null,
        status: 'PROCESSING',
        chunkCount: 0,
        metadata: {},
      },
    });

    try {
      // 2. Split content into chunks
      const chunks = chunkText(dto.content);

      // 3. Create chunks
      const chunkIds: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = createId();
        chunkIds.push(chunkId);
        await this.prisma.aIDocumentChunk.create({
          data: {
            id: chunkId,
            documentId: doc.id,
            chunkIndex: i,
            content: chunks[i],
            tokenCount: Math.ceil(chunks[i].split(/\s+/).length * 1.3),
            metadata: {},
          },
        });
      }

      // 4. Try to generate embeddings via OpenAI
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.completion.generateEmbedding(orgId, chunks[i]);
        if (embedding) {
          const vectorStr = `[${embedding.join(',')}]`;
          const chunkId = chunkIds[i];
          await this.prisma.$executeRaw`
            UPDATE "ai_document_chunks"
            SET embedding = ${vectorStr}::vector
            WHERE id = ${chunkId}
          `;
        }
      }

      // 5. Update to READY
      return this.prisma.aIDocument.update({
        where: { id: doc.id },
        data: { status: 'READY', chunkCount: chunks.length },
      });
    } catch {
      // 6. On error: set FAILED
      await this.prisma.aIDocument.update({
        where: { id: doc.id },
        data: { status: 'FAILED' },
      });
      throw new Error('Document processing failed');
    }
  }

  async listDocuments(orgId: string, opts: ListDocumentsDto) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.aIDocument.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { chunks: true } } },
      }),
      this.prisma.aIDocument.count({ where: { organizationId: orgId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getDocument(orgId: string, id: string) {
    const doc = await this.prisma.aIDocument.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { chunks: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async deleteDocument(orgId: string, id: string): Promise<void> {
    const doc = await this.prisma.aIDocument.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.aIDocumentChunk.deleteMany({ where: { documentId: id } });
    await this.prisma.aIDocument.delete({ where: { id } });
  }

  async search(orgId: string, query: string, topK = 5) {
    // Try embedding-based search first
    const embedding = await this.completion.generateEmbedding(orgId, query);

    if (embedding) {
      const vectorLiteral = `[${embedding.join(',')}]`;
      try {
        const results = await this.prisma.$queryRaw<RawChunkRow[]>`
          SELECT c.id, c.content, c.document_id,
                 (c.embedding <=> ${vectorLiteral}::vector) as distance,
                 d.title as doc_title
          FROM ai_document_chunks c
          JOIN ai_documents d ON c.document_id = d.id
          WHERE d.organization_id = ${orgId} AND d.status = 'READY'
            AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> ${vectorLiteral}::vector
          LIMIT ${topK}
        `;

        return results.map((r) => ({
          chunk: { id: r.id, content: r.content, documentId: r.document_id },
          document: { id: r.document_id, title: r.doc_title },
          score: 1 - r.distance,
        }));
      } catch {
        // Fall through to text search
      }
    }

    // Fallback: text ILIKE search
    const chunks = await this.prisma.aIDocumentChunk.findMany({
      where: {
        document: { organizationId: orgId, status: 'READY' },
        content: { contains: query, mode: 'insensitive' },
      },
      include: { document: { select: { id: true, title: true } } },
      take: topK,
    });

    return chunks.map((c) => ({
      chunk: { id: c.id, content: c.content, documentId: c.documentId },
      document: { id: c.document.id, title: c.document.title },
      score: 0.5,
    }));
  }
}
