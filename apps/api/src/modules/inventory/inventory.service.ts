import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createId } from '@paralleldrive/cuid2';
import { MovementType, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

export type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

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

  async getLevels(
    organizationId: string,
    filters: InventoryLevelFilters,
    locationIds: string[] | null = null,
  ) {
    const { locationId, productId, variantId, lowStockOnly } = filters;

    const where: Record<string, unknown> = {
      product: { organizationId },
    };
    if (locationId) {
      // Validate caller-supplied locationId against user's authorized locations
      if (locationIds !== null && !locationIds.includes(locationId)) {
        return []; // return empty rather than throwing (consistent with filter behavior)
      }
      where['locationId'] = locationId;
    } else if (locationIds !== null) {
      // No specific location requested: restrict to user's authorized locations
      where['locationId'] = { in: locationIds };
    }
    // If locationIds is null and no locationId filter: org-wide access, no restriction
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
    tx?: PrismaTx,
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

    const client = tx ?? this.prisma;

    // Validate product belongs to org
    const product = await client.product.findFirst({
      where: { id: productId, organizationId },
      select: { id: true, lowStockAlert: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const doWork = async (txClient: typeof this.prisma | PrismaTx) => {
      let level = await txClient.inventoryLevel.findFirst({
        where: {
          productId,
          locationId,
          variantId: variantId ?? null,
        },
      });

      if (!level) {
        level = await txClient.inventoryLevel.create({
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

      if (quantityAfter < 0) {
        throw new HttpException(
          `Insufficient stock: only ${quantityBefore} units available`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const updatedLevel = await txClient.inventoryLevel.update({
        where: { id: level.id },
        data: { quantity: quantityAfter },
      });

      const movement = await txClient.inventoryMovement.create({
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
    };

    const result = tx ? await doWork(tx) : await this.prisma.$transaction(doWork);

    // Only emit events when not inside a parent transaction
    if (!tx) {
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
    }

    return result;
  }

  async getMovements(
    organizationId: string,
    productId: string,
    filters: { locationId?: string; from?: string; to?: string; type?: MovementType },
    locationIds: string[] | null = null,
  ) {
    const { locationId, from, to, type } = filters;

    const where: Record<string, unknown> = { organizationId, productId };
    if (locationId) {
      if (locationIds !== null && !locationIds.includes(locationId)) {
        return [];
      }
      where['locationId'] = locationId;
    } else if (locationIds !== null) {
      where['locationId'] = { in: locationIds };
    }
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

  async getValuation(
    organizationId: string,
    locationId?: string,
    locationIds: string[] | null = null,
  ) {
    const where: Record<string, unknown> = {
      product: { organizationId },
    };
    if (locationId) {
      if (locationIds !== null && !locationIds.includes(locationId)) {
        return { totalCostValue: 0, totalRetailValue: 0, items: [] };
      }
      where['locationId'] = locationId;
    } else if (locationIds !== null) {
      where['locationId'] = { in: locationIds };
    }

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

  async getDashboardSummary(
    organizationId: string,
    locationId?: string,
    locationIds: string[] | null = null,
  ) {
    const productWhere: Record<string, unknown> = {
      organizationId,
      status: 'ACTIVE',
    };

    const levelWhere: Record<string, unknown> = {
      product: { organizationId },
    };

    // Resolve effective locationId filter, respecting scope
    let effectiveLocationIdFilter: Record<string, unknown> | undefined;
    if (locationId) {
      if (locationIds !== null && !locationIds.includes(locationId)) {
        // Requested location is outside user's authorized scope — return empty summary
        return {
          totalProducts: 0,
          totalSKUs: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
          totalInventoryValue: 0,
          recentMovements: [],
        };
      }
      levelWhere['locationId'] = locationId;
      effectiveLocationIdFilter = { locationId };
    } else if (locationIds !== null) {
      levelWhere['locationId'] = { in: locationIds };
      effectiveLocationIdFilter = { locationId: { in: locationIds } };
    }

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
          ...(effectiveLocationIdFilter ?? {}),
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

    const totalSKUs = await this.prisma.product.count({ where: { organizationId } });

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

  async getHealthReport(
    organizationId: string,
    filters: { locationId?: string; brandId?: string; categoryId?: string },
    locationIds: string[] | null = null,
  ) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Build level filter
    const productFilter: Record<string, unknown> = { organizationId, trackInventory: true, status: 'ACTIVE' };
    if (filters.brandId) productFilter['brandId'] = filters.brandId;
    if (filters.categoryId) productFilter['categoryId'] = filters.categoryId;

    const levelWhere: Record<string, unknown> = { product: productFilter };

    if (filters.locationId) {
      if (locationIds !== null && !locationIds.includes(filters.locationId)) {
        return { summary: this.emptyHealthSummary(), items: [] };
      }
      levelWhere['locationId'] = filters.locationId;
    } else if (locationIds !== null) {
      levelWhere['locationId'] = { in: locationIds };
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: levelWhere,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            lowStockAlert: true,
            brandId: true,
            categoryId: true,
          },
        },
        location: { select: { id: true, name: true } },
      },
    });

    if (!levels.length) return { summary: this.emptyHealthSummary(), items: [] };

    const productIds = [...new Set(levels.map((l) => l.productId))];

    const [sales30, sales90] = await Promise.all([
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          order: {
            organizationId,
            status: { notIn: ['CANCELLED', 'DRAFT'] },
            createdAt: { gte: thirtyDaysAgo },
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: {
          productId: { in: productIds },
          order: {
            organizationId,
            status: { notIn: ['CANCELLED', 'DRAFT'] },
            createdAt: { gte: ninetyDaysAgo },
          },
        },
        _sum: { quantity: true },
      }),
    ]);

    const sales30Map = new Map(sales30.map((s) => [s.productId, s._sum.quantity ?? 0]));
    const sales90Map = new Map(sales90.map((s) => [s.productId, s._sum.quantity ?? 0]));

    const OVERSTOCK_DAYS_THRESHOLD = 90;
    const FAST_MOVING_DAILY_THRESHOLD = 1; // >= 1 unit/day in last 30 days

    const items = levels.map((level) => {
      const qty = level.quantity;
      const lowStockAlert = level.product.lowStockAlert;
      const sold30d = Number(sales30Map.get(level.productId) ?? 0);
      const sold90d = Number(sales90Map.get(level.productId) ?? 0);
      const avgDailySales = sold30d / 30;
      const daysOfStock = avgDailySales > 0 ? qty / avgDailySales : null;

      let classification: string;
      if (qty === 0) {
        classification = 'STOCKOUT';
      } else if (sold90d === 0) {
        // Zero velocity in 90 days: dead stock regardless of qty level
        classification = 'DEAD_STOCK';
      } else if (qty <= lowStockAlert) {
        classification = 'LOW_STOCK';
      } else if (avgDailySales >= FAST_MOVING_DAILY_THRESHOLD) {
        classification = 'FAST_MOVING';
      } else if (daysOfStock !== null && daysOfStock > OVERSTOCK_DAYS_THRESHOLD) {
        classification = 'OVERSTOCK';
      } else {
        classification = 'SLOW_MOVING';
      }

      return {
        productId: level.productId,
        product: level.product,
        location: level.location,
        quantity: qty,
        lowStockAlert,
        sold30d,
        sold90d,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        daysOfStock: daysOfStock !== null ? Math.round(daysOfStock) : null,
        classification,
      };
    });

    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.classification] = (counts[item.classification] ?? 0) + 1;
    }

    return {
      summary: {
        total: items.length,
        STOCKOUT: counts['STOCKOUT'] ?? 0,
        LOW_STOCK: counts['LOW_STOCK'] ?? 0,
        DEAD_STOCK: counts['DEAD_STOCK'] ?? 0,
        SLOW_MOVING: counts['SLOW_MOVING'] ?? 0,
        FAST_MOVING: counts['FAST_MOVING'] ?? 0,
        OVERSTOCK: counts['OVERSTOCK'] ?? 0,
      },
      items,
    };
  }

  private emptyHealthSummary() {
    return { total: 0, STOCKOUT: 0, LOW_STOCK: 0, DEAD_STOCK: 0, SLOW_MOVING: 0, FAST_MOVING: 0, OVERSTOCK: 0 };
  }
}
