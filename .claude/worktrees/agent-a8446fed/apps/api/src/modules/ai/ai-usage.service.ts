import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { ListUsageLogsDto, CreateBudgetDto, UpdateBudgetDto } from './dto/ai.dto';

@Injectable()
export class AIUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsageLogs(orgId: string, opts: ListUsageLogsDto) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (opts.providerId) where.providerId = opts.providerId;
    if (opts.dateFrom || opts.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (opts.dateFrom) dateFilter.gte = new Date(opts.dateFrom);
      if (opts.dateTo) dateFilter.lte = new Date(opts.dateTo);
      where.createdAt = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.aIUsageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { provider: { select: { name: true, provider: true } } },
      }),
      this.prisma.aIUsageLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getUsageSummary(orgId: string) {
    // Last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const logs = await this.prisma.aIUsageLog.findMany({
      where: { organizationId: orgId, createdAt: { gte: since } },
      include: { provider: { select: { name: true, provider: true } } },
    });

    let totalCost = 0;
    let totalTokens = 0;
    const byProvider: Record<string, { cost: number; tokens: number }> = {};
    const byModel: Record<string, { cost: number; tokens: number; count: number }> = {};
    const byDay: Record<string, { cost: number; tokens: number }> = {};

    for (const log of logs) {
      const cost = Number(log.costUsd);
      const tokens = log.totalTokens;
      totalCost += cost;
      totalTokens += tokens;

      // By provider
      const provKey = log.provider?.name ?? log.providerId ?? 'unknown';
      if (!byProvider[provKey]) byProvider[provKey] = { cost: 0, tokens: 0 };
      byProvider[provKey].cost += cost;
      byProvider[provKey].tokens += tokens;

      // By model
      if (!byModel[log.model]) byModel[log.model] = { cost: 0, tokens: 0, count: 0 };
      byModel[log.model].cost += cost;
      byModel[log.model].tokens += tokens;
      byModel[log.model].count++;

      // By day
      const day = log.createdAt.toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { cost: 0, tokens: 0 };
      byDay[day].cost += cost;
      byDay[day].tokens += tokens;
    }

    const topModel = Object.entries(byModel).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? null;

    return {
      totalCost,
      totalTokens,
      requestCount: logs.length,
      topModel,
      byProvider,
      byModel,
      byDay: Object.entries(byDay)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async listBudgets(orgId: string) {
    return this.prisma.aIBudget.findMany({
      where: { organizationId: orgId },
      include: { provider: { select: { name: true, provider: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBudget(orgId: string, dto: CreateBudgetDto) {
    return this.prisma.aIBudget.create({
      data: {
        id: createId(),
        organizationId: orgId,
        providerId: dto.providerId ?? null,
        period: dto.period,
        limitUsd: dto.limitUsd,
        spentUsd: 0,
        alertAt: dto.alertAt ?? dto.limitUsd * 0.8,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateBudget(orgId: string, id: string, dto: UpdateBudgetDto) {
    return this.prisma.aIBudget.update({
      where: { id },
      data: {
        ...(dto.limitUsd !== undefined && { limitUsd: dto.limitUsd }),
        ...(dto.alertAt !== undefined && { alertAt: dto.alertAt }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
