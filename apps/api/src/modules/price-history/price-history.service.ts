import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';

export type PriceType = 'COST' | 'SELLING';

export interface RecordPriceChangeParams {
  organizationId: string;
  productId: string;
  variantId?: string;
  priceType: PriceType;
  oldPrice: number;
  newPrice: number;
  reason?: string;
  source?: string;
  changedBy?: string;
}

@Injectable()
export class PriceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(
    organizationId: string,
    productId: string,
    query: {
      page?: number;
      limit?: number;
      priceType?: string;
      variantId?: string;
    },
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const { page = 1, limit = 50, priceType, variantId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { productId };
    if (priceType) where['priceType'] = priceType;
    if (variantId) where['variantId'] = variantId;

    const [history, total] = await Promise.all([
      (this.prisma as any).priceHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { effectiveAt: 'desc' },
      }),
      (this.prisma as any).priceHistory.count({ where }),
    ]);

    return {
      data: history,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findForOrg(
    organizationId: string,
    query: {
      page?: number;
      limit?: number;
      priceType?: string;
      from?: string;
      to?: string;
    },
  ) {
    const { page = 1, limit = 50, priceType, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (priceType) where['priceType'] = priceType;
    if (from || to) {
      where['effectiveAt'] = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [history, total] = await Promise.all([
      (this.prisma as any).priceHistory.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { effectiveAt: 'desc' },
      }),
      (this.prisma as any).priceHistory.count({ where }),
    ]);

    return {
      data: history,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async record(params: RecordPriceChangeParams): Promise<void> {
    if (params.oldPrice === params.newPrice) return;

    await (this.prisma as any).priceHistory.create({
      data: {
        id: createId(),
        organizationId: params.organizationId,
        productId: params.productId,
        variantId: params.variantId,
        priceType: params.priceType,
        oldPrice: params.oldPrice,
        newPrice: params.newPrice,
        reason: params.reason,
        source: params.source ?? 'MANUAL',
        changedBy: params.changedBy,
        effectiveAt: new Date(),
      },
    });
  }
}
