import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateMemoryDto, ListMemoriesDto } from './dto/ai.dto';

@Injectable()
export class AIMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async remember(
    orgId: string,
    dto: CreateMemoryDto,
  ) {
    const { scope, scopeId, key, value, type, importance, expiresAt } = dto;

    return this.prisma.aIMemory.upsert({
      where: {
        organizationId_scope_scopeId_key: {
          organizationId: orgId,
          scope,
          scopeId: scopeId ?? '',
          key,
        },
      },
      create: {
        id: createId(),
        organizationId: orgId,
        scope,
        scopeId: scopeId ?? '',
        key,
        value,
        type: type ?? 'text',
        importance: importance ?? 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      update: {
        value,
        type: type ?? 'text',
        importance: importance ?? 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
  }

  async recall(orgId: string, scope: string, scopeId?: string, limit = 10) {
    const now = new Date();
    return this.prisma.aIMemory.findMany({
      where: {
        organizationId: orgId,
        scope,
        ...(scopeId !== undefined && { scopeId }),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { importance: 'desc' },
      take: limit,
    });
  }

  async forget(orgId: string, id: string): Promise<void> {
    const mem = await this.prisma.aIMemory.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!mem) throw new NotFoundException('Memory not found');
    await this.prisma.aIMemory.delete({ where: { id } });
  }

  async listMemories(orgId: string, opts: ListMemoriesDto) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (opts.scope) where.scope = opts.scope;

    const [data, total] = await Promise.all([
      this.prisma.aIMemory.findMany({
        where,
        orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.aIMemory.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }
}
