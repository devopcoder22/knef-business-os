import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { AdjustmentStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import type { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';

@Injectable()
export class StockAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    organizationId: string,
    query: { page?: number; limit?: number },
    locationIds: string[] | null = null,
  ) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (locationIds !== null) {
      where['locationId'] = { in: locationIds };
    }

    const [adjustments, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);

    return {
      data: adjustments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string, locationIds: string[] | null = null) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({
      where: { id, organizationId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });
    if (!adjustment) throw new NotFoundException('Stock adjustment not found');
    // IDOR: user must be authorized for the adjustment's location
    if (locationIds !== null && !locationIds.includes(adjustment.locationId)) {
      throw new NotFoundException('Stock adjustment not found');
    }
    return adjustment;
  }

  async create(
    organizationId: string,
    dto: CreateStockAdjustmentDto,
    userId: string,
    locationIds: string[] | null = null,
  ) {
    // Location gate: user must be authorized for the target location
    if (locationIds !== null && !locationIds.includes(dto.locationId)) {
      throw new ForbiddenException('Not authorized for this location');
    }

    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, organizationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    const reference = await this.generateReference(organizationId);

    const adjustment = await this.prisma.stockAdjustment.create({
      data: {
        id: createId(),
        organizationId,
        locationId: dto.locationId,
        reference,
        reason: dto.reason,
        notes: dto.notes,
        adjustedBy: userId,
        status: AdjustmentStatus.PENDING,
      },
    });

    // Snapshot current quantities and create items
    for (const item of dto.items) {
      const level = await this.prisma.inventoryLevel.findFirst({
        where: {
          productId: item.productId,
          variantId: item.variantId ?? null,
          locationId: dto.locationId,
        },
      });
      const currentQty = level?.quantity ?? 0;
      const difference = item.adjustedQty - currentQty;

      await this.prisma.stockAdjustmentItem.create({
        data: {
          id: createId(),
          adjustmentId: adjustment.id,
          productId: item.productId,
          variantId: item.variantId,
          currentQty,
          adjustedQty: item.adjustedQty,
          difference,
          notes: item.notes,
        },
      });
    }

    return this.findOne(organizationId, adjustment.id);
  }

  async approve(organizationId: string, id: string, userId: string, locationIds: string[] | null = null) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!adjustment) throw new NotFoundException('Stock adjustment not found');
    if (locationIds !== null && !locationIds.includes(adjustment.locationId)) {
      throw new ForbiddenException('Not authorized for this location');
    }
    if (adjustment.status !== AdjustmentStatus.PENDING) {
      throw new BadRequestException('Only PENDING adjustments can be approved');
    }

    // Apply each adjustment via InventoryService
    for (const item of adjustment.items) {
      if (item.difference === 0) continue;

      const movementType =
        item.difference > 0 ? MovementType.ADJUSTMENT_ADD : MovementType.ADJUSTMENT_REMOVE;

      await this.inventoryService.recordMovement(organizationId, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        locationId: adjustment.locationId,
        type: movementType,
        quantity: item.difference,
        referenceType: 'StockAdjustment',
        referenceId: id,
        notes: `Adjustment ${adjustment.reference}: ${adjustment.reason}`,
        createdBy: userId,
      });
    }

    const updated = await this.prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: AdjustmentStatus.APPROVED,
        approvedBy: userId,
      },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'ADJUSTMENT_APPROVED',
      entity: 'StockAdjustment',
      entityId: id,
      newValues: { reference: adjustment.reference, reason: adjustment.reason },
    });

    return updated;
  }

  async reject(
    organizationId: string,
    id: string,
    userId: string,
    reason?: string,
    locationIds: string[] | null = null,
  ) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({
      where: { id, organizationId },
    });
    if (!adjustment) throw new NotFoundException('Stock adjustment not found');
    if (locationIds !== null && !locationIds.includes(adjustment.locationId)) {
      throw new ForbiddenException('Not authorized for this location');
    }
    if (adjustment.status !== AdjustmentStatus.PENDING) {
      throw new BadRequestException('Only PENDING adjustments can be rejected');
    }

    return this.prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: AdjustmentStatus.REJECTED,
        notes: reason ? `${adjustment.notes ?? ''}\nRejection reason: ${reason}` : adjustment.notes,
      },
    });
  }

  private async generateReference(organizationId: string): Promise<string> {
    const count = await this.prisma.stockAdjustment.count({ where: { organizationId } });
    const seq = String(count + 1).padStart(6, '0');
    return `ADJ${seq}`;
  }
}
