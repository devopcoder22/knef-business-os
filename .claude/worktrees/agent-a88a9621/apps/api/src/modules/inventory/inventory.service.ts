import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createId } from '@paralleldrive/cuid2';
import { MovementType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

export interface RecordMovementParams {
  productId: string;
  variantId?: string;
  locationId: string;
  type: MovementType;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdBy: string;
}

export interface InventoryLevelFilters {
  locationId?: string;
  productId?: string;
  variantId?: string;
  lowStockOnly?: boolean;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getLevels(organizationId: string, filters: InventoryLevelFilters) {
    const { locationId, productId, variantId, lowStockOnly } = filters;

    const where: Record<string, unknown> = {
      product: { organizationId },
    };
    if (locationId) where['locationId'] = locationId;
    if (productId) where['productId'] = productId;
    if (variantId !== undefined) where['variantId'] = variantId ?? null;

    const levels = await this.prisma.inventoryLevel.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            lowStockAlert: true,
            status: true,
          },
        },
        location: { select: { id: true, name: true, code: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
      orderBy: [{ product: { name: 'asc' } }],
    });

    if (lowStockOnly) {
      return levels.filter((l) => l.quantity <= l.product.lowStockAlert);
    }

    return levels;
  }

  async recordMovement(
    organizationId: string,
    params: RecordMovementParams,
  ) {
    const {
      productId,
      variantId,
      locationId,
      type,
      quantity,
      referenceType,
      referenceId,
      notes,
      createdBy,
    } = params;

    // Validate product belongs to org
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, lowStockAlert: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const result = await this.prisma.$transaction(async (tx) => {
      // Get or create inventory level
      let level = await tx.inventoryLevel.findFirst({
        where: {
          productId,
          locationId,
          variantId: variantId ?? null,
        },
      });

      if (!level) {
        level = await tx.inventoryLevel.create({
          data: {
            id: createId(),
            productId,
            variantId: variantId ?? null,
            locationId,
            quantity: 0,
            reserved: 0,
            incoming: 0,
          },
        });
      }

      const quantityBefore = level.quantity;
      const quantityAfter = quantityBefore + quantity;

      // Prevent negative stock
      if (quantityAfter < 0) {
        throw new HttpException(
          `Insufficient stock: only ${quantityBefore} units available`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // Update level
      const updatedLevel = await tx.inventoryLevel.update({
        where: { id: level.id },
        data: { quantity: quantityAfter },
      });

      // Create movement record (immutable ledger)
      const movement = await tx.inventoryMovement.create({
        data: {
          id: createId(),
          organizationId,
          productId,
          variantId: variantId ?? null,
          locationId,
          type,
          quantity,
          quantityBefore,
          quantityAfter,
          referenceType,
          referenceId,
          notes,
          createdBy,
        },
      });

      return { level: updatedLevel, movement };
    });

    // Emit events after transaction
    this.eventEmitter.emit('inventory.updated', {
      organizationId,
      productId,
      locationId,
      quantity: result.level.quantity,
    });

    if (result.level.quantity <= product.lowStockAlert) {
      this.eventEmitter.emit('inventory.low', {
        organizationId,
        productId,
        locationId,
        quantity: result.level.quantity,
        threshold: product.lowStockAlert,
      });
    }

    return result;
  }

  async getMovements(
    organizationId: string,
    productId: string,
    filters: { locationId?: string; from?: string; to?: string; type?: MovementType },
  ) {
    const { locationId, from, to, type } = filters;

    const where: Record<string, unknown> = { organizationId, productId };
    if (locationId) where['locationId'] = locationId;
    if (type) where['type'] = type;
    if (from || to) {
      where['createdAt'] = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    return this.prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getValuation(organizationId: string, locationId?: string) {
    const where: Record<string, unknown> = {
      product: { organizationId },
    };
    if (locationId) where['locationId'] = locationId;

    const levels = await this.prisma.inventoryLevel.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            costPrice: true,
            sellingPrice: true,
          },
        },
      },
    });

    let totalCostValue = 0;
    let totalRetailValue = 0;

    const items = levels.map((level) => {
      const costValue = Number(level.product.costPrice) * level.quantity;
      const retailValue = Number(level.product.sellingPrice) * level.quantity;
      totalCostValue += costValue;
      totalRetailValue += retailValue;

      return {
        product: level.product,
        qty: level.quantity,
        costValue,
        retailValue,
      };
    });

    return {
      totalCostValue,
      totalRetailValue,
      items,
    };
  }

  async getProductIntelligence(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, lowStockAlert: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const levels = await this.prisma.inventoryLevel.findMany({
      where: { productId },
      include: { location: { select: { id: true, name: true } } },
    });

    const totalStock = levels.reduce((sum, l) => sum + l.quantity, 0);
    const stockByLocation: Record<string, number> = {};
    levels.forEach((l) => {
      stockByLocation[l.location.name] = l.quantity;
    });

    // 30-day sales velocity
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesMovements = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        productId,
        type: MovementType.SALE,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { quantity: true },
    });

    const unitsSold = salesMovements.reduce(
      (sum, m) => sum + Math.abs(m.quantity),
      0,
    );
    const salesVelocity = unitsSold / 30;
    const daysOfStock = salesVelocity > 0 ? Math.floor(totalStock / salesVelocity) : Infinity;
    const isLowStock = totalStock <= product.lowStockAlert;

    return {
      totalStock,
      stockByLocation,
      isLowStock,
      daysOfStock: daysOfStock === Infinity ? null : daysOfStock,
      salesVelocity: Math.round(salesVelocity * 100) / 100,
      reorderSuggestion: isLowStock || (daysOfStock !== Infinity && daysOfStock < 14),
    };
  }

  async getDashboardSummary(organizationId: string, locationId?: string) {
    const productWhere: Record<string, unknown> = {
      organizationId,
      trackInventory: true,
    };

    const levelWhere: Record<string, unknown> = {
      product: { organizationId },
    };
    if (locationId) levelWhere['locationId'] = locationId;

    const [totalProducts, levels, recentMovements] = await Promise.all([
      this.prisma.product.count({ where: productWhere }),
      this.prisma.inventoryLevel.findMany({
        where: levelWhere,
        include: {
          product: { select: { id: true, lowStockAlert: true, costPrice: true } },
        },
      }),
      this.prisma.inventoryMovement.findMany({
        where: {
          organizationId,
          ...(locationId ? { locationId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // Aggregate by product
    const productMap = new Map<string, { total: number; alert: number; cost: number }>();
    for (const level of levels) {
      const existing = productMap.get(level.productId) ?? {
        total: 0,
        alert: level.product.lowStockAlert,
        cost: Number(level.product.costPrice),
      };
      existing.total += level.quantity;
      productMap.set(level.productId, existing);
    }

    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalInventoryValue = 0;

    productMap.forEach((v) => {
      if (v.total === 0) outOfStockCount++;
      else if (v.total <= v.alert) lowStockCount++;
      totalInventoryValue += v.total * v.cost;
    });

    const totalSKUs = await this.prisma.productVariant.count({
      where: { product: { organizationId } },
    });

    return {
      totalProducts,
      totalSKUs,
      lowStockCount,
      outOfStockCount,
      totalInventoryValue,
      recentMovements,
    };
  }

  async setOpeningStock(
    organizationId: string,
    params: {
      productId: string;
      variantId?: string;
      locationId: string;
      quantity: number;
      notes?: string;
      createdBy: string;
    },
  ) {
    // Get current level first
    const level = await this.prisma.inventoryLevel.findFirst({
      where: {
        productId: params.productId,
        locationId: params.locationId,
        variantId: params.variantId ?? null,
      },
    });

    const currentQty = level?.quantity ?? 0;
    const difference = params.quantity - currentQty;

    // Set absolute quantity via adjustment
    return this.recordMovement(organizationId, {
      productId: params.productId,
      variantId: params.variantId,
      locationId: params.locationId,
      type: MovementType.OPENING_STOCK,
      quantity: difference,
      notes: params.notes ?? 'Opening stock',
      createdBy: params.createdBy,
    });
  }
}
