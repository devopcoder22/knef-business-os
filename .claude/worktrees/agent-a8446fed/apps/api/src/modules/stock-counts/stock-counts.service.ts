import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { CountStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import type { StartStockCountDto } from './dto/create-stock-count.dto';
import type { CountedItemDto } from './dto/submit-stock-count.dto';

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async findAll(organizationId: string, query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [counts, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        where: { organizationId },
        skip,
        take: limit,
        include: {
          location: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockCount.count({ where: { organizationId } }),
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
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
    if (!count) throw new NotFoundException('Stock count not found');
    return count;
  }

  async startCount(organizationId: string, dto: StartStockCountDto, userId: string) {
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
        status: CountStatus.IN_PROGRESS,
        countedBy: userId,
        notes: dto.notes,
      },
    });

    // Load all inventory levels for this location as count items
    const levels = await this.prisma.inventoryLevel.findMany({
      where: {
        locationId: dto.locationId,
        product: { organizationId },
      },
      include: {
        product: { select: { id: true } },
        variant: { select: { id: true } },
      },
    });

    for (const level of levels) {
      await this.prisma.stockCountItem.create({
        data: {
          id: createId(),
          stockCountId: stockCount.id,
          productId: level.productId,
          variantId: level.variantId,
          systemQty: level.quantity,
          countedQty: 0,
          variance: 0 - level.quantity, // Will be updated on submit
        },
      });
    }

    return this.findOne(organizationId, stockCount.id);
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

    // Update each counted item
    for (const counted of countedItems) {
      const item = stockCount.items.find((i) => i.id === counted.stockCountItemId);
      if (!item) continue;

      const variance = counted.countedQty - item.systemQty;

      await this.prisma.stockCountItem.update({
        where: { id: counted.stockCountItemId },
        data: {
          countedQty: counted.countedQty,
          variance,
          notes: counted.notes,
          countedAt: new Date(),
        },
      });
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: {
        status: CountStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async approveCount(organizationId: string, id: string, userId: string) {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!stockCount) throw new NotFoundException('Stock count not found');
    if (stockCount.status !== CountStatus.COMPLETED) {
      throw new BadRequestException('Only COMPLETED counts can be approved');
    }

    // Apply count corrections for items with variance
    for (const item of stockCount.items) {
      if (item.variance === 0) continue;

      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId: stockCount.locationId,
        type: MovementType.COUNT_CORRECTION,
        quantity: item.variance,
        referenceType: 'StockCount',
        referenceId: id,
        notes: `Count correction from ${stockCount.reference}`,
        createdBy: userId,
      });
    }

    return this.prisma.stockCount.update({
      where: { id },
      data: { status: CountStatus.APPROVED },
    });
  }

  private async generateReference(organizationId: string): Promise<string> {
    const count = await this.prisma.stockCount.count({ where: { organizationId } });
    const seq = String(count + 1).padStart(6, '0');
    return `CNT${seq}`;
  }
}
