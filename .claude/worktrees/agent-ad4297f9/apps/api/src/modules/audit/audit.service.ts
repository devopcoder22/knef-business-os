import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';

export interface AuditLogEntry {
  organizationId: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryDto {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          id: createId(),
          ...entry,
          oldValues: entry.oldValues as object | undefined,
          newValues: entry.newValues as object | undefined,
          metadata: entry.metadata as object | undefined,
        },
      })
      .catch((err) => {
        // Audit logs should never break the main flow
        console.error('Failed to write audit log:', err);
      });
  }

  async findAll(organizationId: string, query: AuditQueryDto) {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      entity,
      entityId,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (userId) where['userId'] = userId;
    if (action) where['action'] = { contains: action, mode: 'insensitive' };
    if (entity) where['entity'] = entity;
    if (entityId) where['entityId'] = entityId;
    if (startDate || endDate) {
      where['createdAt'] = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: Math.min(limit, 100),
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit: Math.min(limit, 100),
        totalPages: Math.ceil(total / Math.min(limit, 100)),
      },
    };
  }
}
