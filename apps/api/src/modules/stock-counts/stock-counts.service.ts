import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { MovementType } from '@prisma/client';

// Extended enum — new values added in Phase 24P migration
type CountStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED'
  | 'COMPLETED'
  | 'CANCELLED';

const CountStatus = {
  DRAFT: 'DRAFT' as CountStatus,
  IN_PROGRESS: 'IN_PROGRESS' as CountStatus,
  SUBMITTED: 'SUBMITTED' as CountStatus,
  UNDER_REVIEW: 'UNDER_REVIEW' as CountStatus,
  APPROVED: 'APPROVED' as CountStatus,
  REJECTED: 'REJECTED' as CountStatus,
  POSTED: 'POSTED' as CountStatus,
  COMPLETED: 'COMPLETED' as CountStatus,
  CANCELLED: 'CANCELLED' as CountStatus,
};
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CreateStockCountDto } from './dto/create-stock-count.dto';
import type { CountedItemDto } from './dto/submit-stock-count.dto';

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async findAll(
    organizationId: string,
    query: { page?: number; limit?: number; status?: string; locationId?: string },
  ) {
    const { page = 1, limit = 20, status, locationId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (status) where['status'] = status;
    if (locationId) where['locationId'] = locationId;

    const [counts, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where,
        skip,
        take: limit,
        include: {
          location: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    return {
      data: counts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const count = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
      include: {
        location: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, costPrice: true } },
          },
          orderBy: [{ product: { name: 'asc' } }],
        },
      },
    });
    if (!count) throw new NotFoundException('Stock count not found');
    return count;
  }

  async createCount(organizationId: string, dto: CreateStockCountDto, userId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, organizationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    const reference = await this.generateReference(organizationId);

    const stockCount = await this.prisma.stockCount.create({
      data: {
        id: createId(),
        organizationId,
        locationId: dto.locationId,
        reference,
        status: CountStatus.DRAFT as any,
        createdBy: userId,
        assignedTo: dto.assignedTo,
        scopeType: dto.scopeType,
        scope: dto.scope as any,
        notes: dto.notes,
      } as any,
    });

    return stockCount;
  }

  async beginCount(organizationId: string, id: string, userId: string) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if (stockCount.status !== CountStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT counts can be started');
    }

    // Snapshot current inventory levels as systemQty
    const levelWhere: Record<string, unknown> = {
      locationId: stockCount.locationId,
      product: { organizationId },
    };
    if ((stockCount as any).scopeType === 'category' && (stockCount as any).scope) {
      const scope = (stockCount as any).scope as { categoryId?: string };
      if (scope.categoryId) {
        levelWhere['product'] = { organizationId, categoryId: scope.categoryId };
      }
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: levelWhere,
      include: {
        product: { select: { id: true, costPrice: true } },
        variant: { select: { id: true } },
      },
    });

    // Create count items with cost snapshot
    await this.prisma.stockCountItem.createMany({
      data: levels.map((level) => ({
        id: createId(),
        stockCountId: stockCount.id,
        productId: level.productId,
        variantId: level.variantId,
        systemQty: level.quantity,
        countedQty: 0,
        variance: -level.quantity,
        unitCostSnapshot: level.product.costPrice,
        varianceValue: 0,
      })) as any,
    });

    return this.prisma.stockCount.update({
      where: { id },
      data: {
        status: CountStatus.IN_PROGRESS as any,
        startedAt: new Date(),
        countedBy: userId,
      },
    });
  }

  async submitCount(
    organizationId: string,
    id: string,
    countedItems: CountedItemDto[],
    userId: string,
  ) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if (stockCount.status !== CountStatus.IN_PROGRESS) {
      throw new BadRequestException('Only IN_PROGRESS counts can be submitted');
    }

    for (const counted of countedItems) {
      const item = stockCount.items.find((i) => i.id === counted.stockCountItemId);
      if (!item) continue;

      const variance = Number(counted.countedQty) - Number(item.systemQty);
      const varianceValue = (item as any).unitCostSnapshot
        ? variance * Number((item as any).unitCostSnapshot)
        : 0;

      await this.prisma.stockCountItem.update({
        where: { id: counted.stockCountItemId },
        data: {
          countedQty: counted.countedQty,
          variance,
          varianceValue,
          notes: counted.notes,
          countedAt: new Date(),
        } as any,
      });
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: {
        status: CountStatus.SUBMITTED as any,
        submittedAt: new Date(),
      } as any,
    });
  }

  async beginReview(organizationId: string, id: string) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if (stockCount.status !== CountStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED counts can be put under review');
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: { status: CountStatus.UNDER_REVIEW as any, reviewedAt: new Date() } as any,
    });
  }

  async approveCount(organizationId: string, id: string) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if (stockCount.status !== CountStatus.UNDER_REVIEW) {
      throw new BadRequestException('Only UNDER_REVIEW counts can be approved');
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: { status: CountStatus.APPROVED as any, approvedAt: new Date() } as any,
    });
  }

  async rejectCount(organizationId: string, id: string, reason: string) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if (stockCount.status !== CountStatus.UNDER_REVIEW) {
      throw new BadRequestException('Only UNDER_REVIEW counts can be rejected');
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: {
        status: CountStatus.REJECTED as any,
        rejectionReason: reason,
      } as any,
    });
  }

  async postCount(organizationId: string, id: string, userId: string) {
    // Atomic claim: prevent concurrent posts
    const claimed = await this.prisma.stockCount.updateMany({
      where: { id, organizationId, status: CountStatus.APPROVED as any },
      data: { status: CountStatus.POSTED as any, postedAt: new Date() } as any,
    });
    if (claimed.count === 0) {
      const existing = await this.prisma.stockCount.findFirst({
        where: { id, organizationId },
        select: { status: true },
      });
      if (!existing) throw new NotFoundException('Stock count not found');
      if ((existing.status as any) === CountStatus.POSTED) {
        throw new ConflictException('Stock count has already been posted');
      }
      throw new BadRequestException('Only APPROVED counts can be posted');
    }

    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id },
      include: { items: true },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');

    // Intervening movement safety: compare current live qty vs snapshot
    for (const item of stockCount.items) {
      const liveLevel = await this.prisma.inventoryLevel.findFirst({
        where: {
          productId: item.productId,
          variantId: item.variantId ?? null,
          locationId: stockCount.locationId,
        },
      });

      const liveQty = liveLevel ? Number(liveLevel.quantity) : 0;
      const snapshotQty = Number(item.systemQty);
      const countedQty = Number(item.countedQty);

      // Adjust for any movements that happened since snapshot
      const interveningDelta = liveQty - snapshotQty;
      const adjustedVariance = countedQty - snapshotQty;

      if (adjustedVariance === 0) continue;

      // Apply the count correction relative to current live quantity
      const correctionQty = adjustedVariance - interveningDelta;
      if (correctionQty === 0) continue;

      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId: stockCount.locationId,
        type: MovementType.COUNT_CORRECTION,
        quantity: correctionQty,
        referenceType: 'StockCount',
        referenceId: id,
        notes: `Posted from ${stockCount.reference} (snapshot: ${snapshotQty}, counted: ${countedQty}, live at post: ${liveQty})`,
        createdBy: userId,
      });
    }

    return this.findOne(organizationId, id);
  }

  async cancelCount(organizationId: string, id: string) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if ([CountStatus.POSTED, CountStatus.CANCELLED].includes(stockCount.status as any)) {
      throw new BadRequestException('Cannot cancel a POSTED or already CANCELLED count');
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: { status: CountStatus.CANCELLED as any },
    });
  }

  private async generateReference(organizationId: string): Promise<string> {
    const count = await this.prisma.stockCount.count({ where: { organizationId } });
    const seq = String(count + 1).padStart(6, '0');
    return `CNT${seq}`;
  }
}
