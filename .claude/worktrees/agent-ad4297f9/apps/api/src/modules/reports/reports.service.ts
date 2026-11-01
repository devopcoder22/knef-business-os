import { Injectable } from '@nestjs/common';
import { Prisma, ExpenseStatus, OrderStatus, PaymentStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function parseStart(d: string): Date {
  return new Date(d);
}

function parseEnd(d: string): Date {
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  return end;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesSummaryQuery {
  startDate: string;
  endDate: string;
  locationId?: string;
  channel?: string;
}

export interface SalesProductsQuery {
  startDate: string;
  endDate: string;
  locationId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}

export interface SalesCustomersQuery {
  startDate: string;
  endDate: string;
  page?: number;
  limit?: number;
}

export interface SalesDailyQuery {
  startDate: string;
  endDate: string;
  locationId?: string;
}

export interface SalesExportQuery {
  startDate: string;
  endDate: string;
  type: 'orders' | 'items';
}

export interface InventoryValuationQuery {
  locationId?: string;
  categoryId?: string;
}

export interface InventoryMovementQuery {
  startDate: string;
  endDate: string;
  locationId?: string;
  productId?: string;
  type?: MovementType;
  page?: number;
  limit?: number;
}

export interface InventoryLowStockQuery {
  locationId?: string;
}

export interface InventoryTurnoverQuery {
  startDate: string;
  endDate: string;
  locationId?: string;
}

export interface PurchasingSummaryQuery {
  startDate: string;
  endDate: string;
  supplierId?: string;
}

export interface PurchasingSuppliersQuery {
  startDate: string;
  endDate: string;
}

export interface FinancePLQuery {
  startDate: string;
  endDate: string;
}

export interface FinanceCashflowQuery {
  startDate: string;
  endDate: string;
}

export interface FinanceExpensesQuery {
  startDate: string;
  endDate: string;
  categoryId?: string;
  status?: ExpenseStatus;
  page?: number;
  limit?: number;
}

export interface StaffAttendanceQuery {
  startDate: string;
  endDate: string;
  employeeId?: string;
  departmentId?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Metadata wrapper ───────────────────────────────────────────

  private meta(startDate: string, endDate: string) {
    return {
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SALES REPORTS
  // ═══════════════════════════════════════════════════════════════

  async getSalesSummary(organizationId: string, q: SalesSummaryQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const orderWhere: Prisma.SalesOrderWhereInput = {
      organizationId,
      createdAt: { gte: start, lt: end },
    };
    if (q.locationId) orderWhere.locationId = q.locationId;
    if (q.channel) orderWhere.channel = q.channel as never;

    const completedWhere: Prisma.SalesOrderWhereInput = {
      ...orderWhere,
      status: OrderStatus.COMPLETED,
    };

    const [
      allOrders,
      completedAgg,
      cancelledCount,
      refundedCount,
      ordersForDay,
      ordersForChannel,
      ordersForLocation,
      topItemsRaw,
      paymentMethodRaw,
    ] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: orderWhere,
        _count: true,
        _sum: { totalAmount: true, discountAmount: true, taxAmount: true },
      }),
      this.prisma.salesOrder.aggregate({
        where: completedWhere,
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.count({ where: { ...orderWhere, status: OrderStatus.CANCELLED } }),
      this.prisma.salesOrder.count({ where: { ...orderWhere, status: OrderStatus.REFUNDED } }),
      // revenue by day
      this.prisma.salesOrder.findMany({
        where: completedWhere,
        select: { totalAmount: true, createdAt: true },
      }),
      // revenue by channel
      this.prisma.salesOrder.groupBy({
        by: ['channel'],
        where: completedWhere,
        _sum: { totalAmount: true },
        _count: true,
      }),
      // revenue by location
      this.prisma.salesOrder.groupBy({
        by: ['locationId'],
        where: completedWhere,
        _sum: { totalAmount: true },
        _count: true,
      }),
      // top products by revenue
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: {
          order: completedWhere,
        },
        _sum: { totalPrice: true, quantity: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 10,
      }),
      // payment method breakdown
      this.prisma.payment.groupBy({
        by: ['method'],
        where: {
          organizationId,
          status: PaymentStatus.COMPLETED,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // build revenue by day map
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of ordersForDay) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { revenue: 0, orders: 0 };
      cur.revenue += Number(o.totalAmount ?? 0);
      cur.orders += 1;
      dayMap.set(key, cur);
    }
    const revenueByDay = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));

    // resolve location names
    const locationIds = ordersForLocation.map(r => r.locationId);
    const locations = locationIds.length > 0
      ? await this.prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, name: true },
        })
      : [];
    const locationMap = new Map(locations.map(l => [l.id, l.name]));

    // resolve product names
    const productIds = topItemsRaw.map(r => r.productId);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];
    const productMap = new Map(products.map(p => [p.id, p]));

    const totalOrders = allOrders._count;
    const totalRevenue = Number(completedAgg._sum.totalAmount ?? 0);
    const avgOrderValue = completedAgg._count > 0
      ? totalRevenue / completedAgg._count
      : 0;

    return {
      data: {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalDiscount: Number(allOrders._sum.discountAmount ?? 0),
        totalTax: Number(allOrders._sum.taxAmount ?? 0),
        completedOrders: completedAgg._count,
        cancelledOrders: cancelledCount,
        refundedOrders: refundedCount,
        revenueByDay,
        revenueByChannel: ordersForChannel.map(r => ({
          channel: r.channel,
          revenue: Number(r._sum.totalAmount ?? 0),
          orders: r._count,
        })),
        revenueByLocation: ordersForLocation.map(r => ({
          locationId: r.locationId,
          locationName: locationMap.get(r.locationId) ?? 'Unknown',
          revenue: Number(r._sum.totalAmount ?? 0),
        })),
        topProducts: topItemsRaw.map(r => {
          const p = productMap.get(r.productId);
          return {
            productId: r.productId,
            name: p?.name ?? 'Unknown',
            sku: p?.sku ?? '',
            quantitySold: r._sum.quantity ?? 0,
            revenue: Number(r._sum.totalPrice ?? 0),
          };
        }),
        paymentMethodBreakdown: paymentMethodRaw.map(r => ({
          method: r.method,
          amount: Number(r._sum.amount ?? 0),
          count: r._count,
        })),
      },
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getSalesProducts(organizationId: string, q: SalesProductsQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const skip = (page - 1) * limit;

    const orderWhere: Prisma.SalesOrderWhereInput = {
      organizationId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: start, lt: end },
    };
    if (q.locationId) orderWhere.locationId = q.locationId;

    const itemWhere: Prisma.SalesOrderItemWhereInput = { order: orderWhere };
    if (q.categoryId) {
      itemWhere.product = { categoryId: q.categoryId };
    }

    const grouped = await this.prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: itemWhere,
      _sum: { totalPrice: true, quantity: true, costPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
    });

    const total = grouped.length;
    const page_data = grouped.slice(skip, skip + limit);
    const productIds = page_data.map(r => r.productId);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          include: { category: { select: { id: true, name: true } } },
        })
      : [];
    const productMap = new Map(products.map(p => [p.id, p]));

    const data = page_data.map(r => {
      const p = productMap.get(r.productId);
      const revenue = Number(r._sum.totalPrice ?? 0);
      const costTotal = Number(r._sum.costPrice ?? 0) * (r._sum.quantity ?? 0);
      const grossProfit = revenue - costTotal;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      return {
        productId: r.productId,
        name: p?.name ?? 'Unknown',
        sku: p?.sku ?? '',
        category: p?.category?.name ?? 'Uncategorized',
        quantitySold: r._sum.quantity ?? 0,
        revenue,
        costTotal,
        grossProfit,
        grossMargin: parseFloat(grossMargin.toFixed(2)),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getSalesCustomers(organizationId: string, q: SalesCustomersQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const skip = (page - 1) * limit;

    const orderWhere: Prisma.SalesOrderWhereInput = {
      organizationId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: start, lt: end },
      customerId: { not: null },
    };

    const grouped = await this.prisma.salesOrder.groupBy({
      by: ['customerId'],
      where: orderWhere,
      _count: true,
      _sum: { totalAmount: true },
      _max: { createdAt: true },
    });

    const total = grouped.length;
    const page_data = grouped.slice(skip, skip + limit);
    const customerIds = page_data
      .map(r => r.customerId)
      .filter((id): id is string => id !== null);
    const customers = customerIds.length > 0
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, firstName: true, lastName: true, phone: true },
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.id, c]));

    const data = page_data.map(r => {
      const c = r.customerId ? customerMap.get(r.customerId) : undefined;
      const totalSpent = Number(r._sum.totalAmount ?? 0);
      const orderCount = r._count;
      return {
        customerId: r.customerId,
        name: c ? `${c.firstName} ${c.lastName}`.trim() : 'Walk-in',
        phone: c?.phone ?? '',
        orderCount,
        totalSpent,
        avgOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
        lastOrderDate: r._max.createdAt?.toISOString() ?? null,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getSalesDaily(organizationId: string, q: SalesDailyQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const where: Prisma.SalesOrderWhereInput = {
      organizationId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: start, lt: end },
    };
    if (q.locationId) where.locationId = q.locationId;

    const refundedWhere: Prisma.SalesOrderWhereInput = {
      organizationId,
      status: { in: [OrderStatus.REFUNDED, OrderStatus.PARTIAL_REFUND] },
      createdAt: { gte: start, lt: end },
    };
    if (q.locationId) refundedWhere.locationId = q.locationId;

    const [orders, refunds] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        select: { totalAmount: true, createdAt: true },
      }),
      this.prisma.salesOrder.findMany({
        where: refundedWhere,
        select: { totalAmount: true, createdAt: true },
      }),
    ]);

    const dayMap = new Map<string, { revenue: number; orders: number; returns: number }>();
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { revenue: 0, orders: 0, returns: 0 };
      cur.revenue += Number(o.totalAmount ?? 0);
      cur.orders += 1;
      dayMap.set(key, cur);
    }
    for (const o of refunds) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const cur = dayMap.get(key) ?? { revenue: 0, orders: 0, returns: 0 };
      cur.returns += 1;
      dayMap.set(key, cur);
    }

    const data = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        revenue: v.revenue,
        orders: v.orders,
        avgOrderValue: v.orders > 0 ? v.revenue / v.orders : 0,
        returns: v.returns,
      }));

    return { data, meta: this.meta(q.startDate, q.endDate) };
  }

  async getSalesExportData(organizationId: string, q: SalesExportQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const where: Prisma.SalesOrderWhereInput = {
      organizationId,
      createdAt: { gte: start, lt: end },
    };

    if (q.type === 'orders') {
      const orders = await this.prisma.salesOrder.findMany({
        where,
        select: {
          reference: true,
          status: true,
          channel: true,
          totalAmount: true,
          discountAmount: true,
          taxAmount: true,
          paidAmount: true,
          createdAt: true,
          completedAt: true,
          customer: { select: { firstName: true, lastName: true, phone: true } },
          location: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return orders.map(o => ({
        reference: o.reference,
        status: o.status,
        channel: o.channel,
        customer: o.customer
          ? `${o.customer.firstName} ${o.customer.lastName}`.trim()
          : 'Walk-in',
        location: o.location.name,
        totalAmount: Number(o.totalAmount),
        discountAmount: Number(o.discountAmount),
        taxAmount: Number(o.taxAmount),
        paidAmount: Number(o.paidAmount),
        createdAt: o.createdAt.toISOString(),
        completedAt: o.completedAt?.toISOString() ?? '',
      }));
    } else {
      const items = await this.prisma.salesOrderItem.findMany({
        where: { order: where },
        select: {
          quantity: true,
          unitPrice: true,
          costPrice: true,
          discountRate: true,
          taxRate: true,
          totalPrice: true,
          order: { select: { reference: true, createdAt: true, status: true } },
          product: { select: { name: true, sku: true } },
          variant: { select: { name: true, sku: true } },
        },
        orderBy: { order: { createdAt: 'desc' } },
      });
      return items.map(i => ({
        orderReference: i.order.reference,
        orderStatus: i.order.status,
        orderDate: i.order.createdAt.toISOString(),
        product: i.product.name,
        sku: i.product.sku,
        variant: i.variant?.name ?? '',
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        costPrice: Number(i.costPrice),
        discountRate: Number(i.discountRate),
        taxRate: Number(i.taxRate),
        totalPrice: Number(i.totalPrice),
      }));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // INVENTORY REPORTS
  // ═══════════════════════════════════════════════════════════════

  async getInventoryValuation(organizationId: string, q: InventoryValuationQuery) {
    const levelWhere: Prisma.InventoryLevelWhereInput = {
      product: { organizationId },
    };
    if (q.locationId) levelWhere.locationId = q.locationId;
    if (q.categoryId) {
      levelWhere.product = { organizationId, categoryId: q.categoryId };
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: levelWhere,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            costPrice: true,
            sellingPrice: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
        location: { select: { id: true, name: true } },
        variant: { select: { costPrice: true, sellingPrice: true } },
      },
    });

    let totalItems = 0;
    let totalUnits = 0;
    let totalCostValue = 0;
    let totalRetailValue = 0;

    const categoryMap = new Map<string, { name: string; items: number; units: number; costValue: number; retailValue: number }>();
    const locationMap = new Map<string, { name: string; units: number; costValue: number }>();
    const seenProducts = new Set<string>();

    for (const lvl of levels) {
      if (lvl.quantity <= 0) continue;

      const costPrice = lvl.variant ? Number(lvl.variant.costPrice) : Number(lvl.product.costPrice);
      const sellingPrice = lvl.variant ? Number(lvl.variant.sellingPrice) : Number(lvl.product.sellingPrice);
      const costVal = costPrice * lvl.quantity;
      const retailVal = sellingPrice * lvl.quantity;

      totalUnits += lvl.quantity;
      totalCostValue += costVal;
      totalRetailValue += retailVal;

      if (!seenProducts.has(lvl.product.id)) {
        totalItems++;
        seenProducts.add(lvl.product.id);
      }

      // by category
      const catKey = lvl.product.categoryId ?? '__none__';
      const catName = lvl.product.category?.name ?? 'Uncategorized';
      const catCur = categoryMap.get(catKey) ?? { name: catName, items: 0, units: 0, costValue: 0, retailValue: 0 };
      catCur.units += lvl.quantity;
      catCur.costValue += costVal;
      catCur.retailValue += retailVal;
      if (!seenProducts.has(`${catKey}:${lvl.product.id}`)) {
        catCur.items++;
        seenProducts.add(`${catKey}:${lvl.product.id}`);
      }
      categoryMap.set(catKey, catCur);

      // by location
      const locCur = locationMap.get(lvl.locationId) ?? { name: lvl.location.name, units: 0, costValue: 0 };
      locCur.units += lvl.quantity;
      locCur.costValue += costVal;
      locationMap.set(lvl.locationId, locCur);
    }

    return {
      data: {
        totalItems,
        totalUnits,
        totalCostValue,
        totalRetailValue,
        potentialProfit: totalRetailValue - totalCostValue,
        byCategory: Array.from(categoryMap.entries()).map(([, v]) => v),
        byLocation: Array.from(locationMap.entries()).map(([locationId, v]) => ({
          locationId,
          ...v,
        })),
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  async getInventoryMovement(organizationId: string, q: InventoryMovementQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryMovementWhereInput = {
      organizationId,
      createdAt: { gte: start, lt: end },
    };
    if (q.locationId) where.locationId = q.locationId;
    if (q.productId) where.productId = q.productId;
    if (q.type) where.type = q.type;

    const [movements, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    const productIds = [...new Set(movements.map(m => m.productId))];
    const locationIds = [...new Set(movements.map(m => m.locationId))];

    const [products, locations] = await Promise.all([
      productIds.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true },
          })
        : [],
      locationIds.length > 0
        ? this.prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const pMap = new Map(products.map(p => [p.id, p]));
    const lMap = new Map(locations.map(l => [l.id, l.name]));

    const data = movements.map(m => ({
      id: m.id,
      productId: m.productId,
      productName: pMap.get(m.productId)?.name ?? 'Unknown',
      sku: pMap.get(m.productId)?.sku ?? '',
      locationId: m.locationId,
      locationName: lMap.get(m.locationId) ?? 'Unknown',
      type: m.type,
      quantity: m.quantity,
      quantityBefore: m.quantityBefore,
      quantityAfter: m.quantityAfter,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getInventoryLowStock(organizationId: string, q: InventoryLowStockQuery) {
    const where: Prisma.InventoryLevelWhereInput = {
      product: { organizationId },
    };
    if (q.locationId) where.locationId = q.locationId;

    const levels = await this.prisma.inventoryLevel.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, lowStockAlert: true } },
        location: { select: { id: true, name: true } },
      },
    });

    const lowStock = levels.filter(l => l.quantity <= l.product.lowStockAlert);

    return {
      data: lowStock.map(l => ({
        productId: l.productId,
        name: l.product.name,
        sku: l.product.sku,
        locationId: l.locationId,
        locationName: l.location.name,
        quantity: l.quantity,
        lowStockAlert: l.product.lowStockAlert,
      })),
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  async getInventoryTurnover(organizationId: string, q: InventoryTurnoverQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);
    const periodDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const levelWhere: Prisma.InventoryLevelWhereInput = {
      product: { organizationId },
    };
    if (q.locationId) levelWhere.locationId = q.locationId;

    const movementWhere: Prisma.InventoryMovementWhereInput = {
      organizationId,
      createdAt: { gte: start, lt: end },
    };
    if (q.locationId) movementWhere.locationId = q.locationId;

    const [levels, soldMovements, receivedMovements] = await Promise.all([
      this.prisma.inventoryLevel.findMany({
        where: levelWhere,
        include: { product: { select: { id: true, name: true, sku: true } } },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['productId'],
        where: { ...movementWhere, type: MovementType.SALE },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ['productId'],
        where: { ...movementWhere, type: MovementType.PURCHASE_RECEIPT },
        _sum: { quantity: true },
      }),
    ]);

    const soldMap = new Map(soldMovements.map(m => [m.productId, m._sum.quantity ?? 0]));
    const receivedMap = new Map(receivedMovements.map(m => [m.productId, m._sum.quantity ?? 0]));

    // dedupe by productId
    const seenProductIds = new Set<string>();
    const data: {
      productId: string;
      name: string;
      sku: string;
      openingStock: number;
      closingStock: number;
      sold: number;
      received: number;
      turnoverRate: number;
      daysOfInventory: number;
    }[] = [];

    for (const lvl of levels) {
      if (seenProductIds.has(lvl.productId)) continue;
      seenProductIds.add(lvl.productId);

      const closingStock = lvl.quantity;
      const sold = soldMap.get(lvl.productId) ?? 0;
      const received = receivedMap.get(lvl.productId) ?? 0;
      const openingStock = closingStock - received + sold;
      const avgStock = (openingStock + closingStock) / 2;
      const turnoverRate = avgStock > 0 ? sold / avgStock : 0;
      const daysOfInventory = sold > 0 ? (avgStock / sold) * periodDays : 0;

      data.push({
        productId: lvl.productId,
        name: lvl.product.name,
        sku: lvl.product.sku,
        openingStock,
        closingStock,
        sold,
        received,
        turnoverRate: parseFloat(turnoverRate.toFixed(4)),
        daysOfInventory: parseFloat(daysOfInventory.toFixed(1)),
      });
    }

    return { data, meta: this.meta(q.startDate, q.endDate) };
  }

  async getInventoryExportData(
    organizationId: string,
    type: 'valuation' | 'movement' | 'low-stock',
  ) {
    if (type === 'valuation') {
      const result = await this.getInventoryValuation(organizationId, {});
      return result.data.byCategory as unknown as Record<string, unknown>[];
    } else if (type === 'low-stock') {
      const result = await this.getInventoryLowStock(organizationId, {});
      return result.data as unknown as Record<string, unknown>[];
    } else {
      // movement — last 30 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const result = await this.getInventoryMovement(organizationId, {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        limit: 10000,
      });
      return result.data as unknown as Record<string, unknown>[];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PURCHASING REPORTS
  // ═══════════════════════════════════════════════════════════════

  async getPurchasingSummary(organizationId: string, q: PurchasingSummaryQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      createdAt: { gte: start, lt: end },
    };
    if (q.supplierId) where.supplierId = q.supplierId;

    const [allAgg, bySupplier, byStatus, receipts] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['supplierId'],
        where,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { totalAmount: true },
      }),
      // for avg lead time
      this.prisma.goodsReceipt.findMany({
        where: {
          organizationId,
          createdAt: { gte: start, lt: end },
        },
        include: {
          purchaseOrder: { select: { createdAt: true } },
        },
      }),
    ]);

    const supplierIds = bySupplier.map(r => r.supplierId);
    const suppliers = supplierIds.length > 0
      ? await this.prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : [];
    const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));

    const totalValue = Number(allAgg._sum.totalAmount ?? 0);
    const totalPaid = Number(allAgg._sum.paidAmount ?? 0);

    let leadDaysTotal = 0;
    let leadDaysCount = 0;
    for (const r of receipts) {
      if (r.purchaseOrder) {
        const days = (r.receivedAt.getTime() - r.purchaseOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        leadDaysTotal += days;
        leadDaysCount++;
      }
    }

    return {
      data: {
        totalOrders: allAgg._count,
        totalValue,
        totalPaid,
        totalOutstanding: totalValue - totalPaid,
        bySupplier: bySupplier.map(r => ({
          supplierId: r.supplierId,
          name: supplierMap.get(r.supplierId) ?? 'Unknown',
          orders: r._count,
          value: Number(r._sum.totalAmount ?? 0),
          paid: Number(r._sum.paidAmount ?? 0),
          outstanding: Number(r._sum.totalAmount ?? 0) - Number(r._sum.paidAmount ?? 0),
        })),
        byStatus: byStatus.map(r => ({
          status: r.status,
          count: r._count,
          value: Number(r._sum.totalAmount ?? 0),
        })),
        avgLeadDays: leadDaysCount > 0 ? parseFloat((leadDaysTotal / leadDaysCount).toFixed(1)) : 0,
      },
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getPurchasingSuppliers(organizationId: string, q: PurchasingSuppliersQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const poWhere: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      createdAt: { gte: start, lt: end },
    };

    const grouped = await this.prisma.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: poWhere,
      _count: true,
      _sum: { totalAmount: true },
    });

    const supplierIds = grouped.map(r => r.supplierId);
    const suppliers = supplierIds.length > 0
      ? await this.prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true, rating: true },
        })
      : [];
    const supplierMap = new Map(suppliers.map(s => [s.id, s]));

    // on-time vs late deliveries (compare expectedDate vs receivedAt on GoodsReceipt)
    const receipts = await this.prisma.goodsReceipt.findMany({
      where: { organizationId, createdAt: { gte: start, lt: end } },
      include: { purchaseOrder: { select: { supplierId: true, expectedDate: true } } },
    });

    const deliveryMap = new Map<string, { onTime: number; late: number }>();
    for (const r of receipts) {
      const supplierId = r.purchaseOrder?.supplierId;
      if (!supplierId) continue;
      const cur = deliveryMap.get(supplierId) ?? { onTime: 0, late: 0 };
      const expected = r.purchaseOrder?.expectedDate;
      if (expected && r.receivedAt > expected) {
        cur.late++;
      } else {
        cur.onTime++;
      }
      deliveryMap.set(supplierId, cur);
    }

    const data = grouped.map(r => {
      const s = supplierMap.get(r.supplierId);
      const d = deliveryMap.get(r.supplierId) ?? { onTime: 0, late: 0 };
      return {
        supplierId: r.supplierId,
        name: s?.name ?? 'Unknown',
        orders: r._count,
        value: Number(r._sum.totalAmount ?? 0),
        onTimeDeliveries: d.onTime,
        lateDeliveries: d.late,
        rating: s?.rating ?? null,
      };
    });

    return { data, meta: this.meta(q.startDate, q.endDate) };
  }

  // ═══════════════════════════════════════════════════════════════
  // FINANCE REPORTS
  // ═══════════════════════════════════════════════════════════════

  async getFinancePL(organizationId: string, q: FinancePLQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const completedOrderWhere: Prisma.SalesOrderWhereInput = {
      organizationId,
      status: OrderStatus.COMPLETED,
      completedAt: { gte: start, lt: end },
    };

    const [revenueAgg, cogsItems, expensesRaw] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: completedOrderWhere,
        _sum: { totalAmount: true },
      }),
      // COGS = sum of costPrice * quantity for items in completed orders
      this.prisma.salesOrderItem.findMany({
        where: { order: completedOrderWhere },
        select: { costPrice: true, quantity: true },
      }),
      // Operating expenses (PAID)
      this.prisma.expense.findMany({
        where: {
          organizationId,
          status: ExpenseStatus.PAID,
          date: { gte: start, lt: end },
        },
        include: { category: { select: { id: true, name: true } } },
      }),
    ]);

    const revenue = Number(revenueAgg._sum.totalAmount ?? 0);
    const costOfGoods = cogsItems.reduce(
      (sum, i) => sum + Number(i.costPrice) * i.quantity,
      0,
    );
    const grossProfit = revenue - costOfGoods;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const operatingExpenses = expensesRaw.reduce((sum, e) => sum + Number(e.amount), 0);
    const netProfit = grossProfit - operatingExpenses;
    const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    // expense breakdown by category
    const catMap = new Map<string, { category: string; amount: number }>();
    for (const e of expensesRaw) {
      const catName = e.category?.name ?? 'Uncategorized';
      const cur = catMap.get(catName) ?? { category: catName, amount: 0 };
      cur.amount += Number(e.amount);
      catMap.set(catName, cur);
    }
    const expenseBreakdown = Array.from(catMap.values()).map(c => ({
      category: c.category,
      amount: c.amount,
      pct: operatingExpenses > 0 ? parseFloat(((c.amount / operatingExpenses) * 100).toFixed(2)) : 0,
    }));

    return {
      data: {
        revenue,
        costOfGoods,
        grossProfit,
        grossMarginPct: parseFloat(grossMarginPct.toFixed(2)),
        operatingExpenses,
        netProfit,
        netMarginPct: parseFloat(netMarginPct.toFixed(2)),
        expenseBreakdown,
      },
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getFinanceCashflow(organizationId: string, q: FinanceCashflowQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const [payments, expenses] = await Promise.all([
      // inflows = completed payments received
      this.prisma.payment.findMany({
        where: {
          organizationId,
          status: PaymentStatus.COMPLETED,
          createdAt: { gte: start, lt: end },
        },
        select: { amount: true, method: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // outflows = PAID expenses
      this.prisma.expense.findMany({
        where: {
          organizationId,
          status: ExpenseStatus.PAID,
          date: { gte: start, lt: end },
        },
        include: { category: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);

    const inflows = payments.map(p => ({
      date: p.createdAt.toISOString().slice(0, 10),
      source: p.method,
      amount: Number(p.amount),
    }));

    const outflows = expenses.map(e => ({
      date: e.date.toISOString().slice(0, 10),
      category: e.category?.name ?? 'Uncategorized',
      amount: Number(e.amount),
    }));

    const totalInflows = inflows.reduce((s, i) => s + i.amount, 0);
    const totalOutflows = outflows.reduce((s, o) => s + o.amount, 0);
    const netCashFlow = totalInflows - totalOutflows;

    // opening balance: sum of bank account balances (approximate)
    const bankAgg = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { balance: true },
    });
    const closingBalance = Number(bankAgg._sum.balance ?? 0);
    const openingBalance = closingBalance - netCashFlow;

    return {
      data: {
        inflows,
        outflows,
        netCashFlow,
        openingBalance,
        closingBalance,
      },
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getFinanceExpenses(organizationId: string, q: FinanceExpensesQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {
      organizationId,
      date: { gte: start, lt: end },
    };
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.status) where.status = q.status;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take: limit,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: data.map(e => ({
        id: e.id,
        reference: e.reference,
        description: e.description,
        category: e.category?.name ?? 'Uncategorized',
        amount: Number(e.amount),
        status: e.status,
        vendor: e.vendor,
        date: e.date.toISOString().slice(0, 10),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getFinanceExportData(
    organizationId: string,
    q: { startDate: string; endDate: string },
    type: 'pl' | 'cashflow' | 'expenses',
  ) {
    if (type === 'pl') {
      const result = await this.getFinancePL(organizationId, q);
      return [result.data as unknown as Record<string, unknown>];
    } else if (type === 'cashflow') {
      const result = await this.getFinanceCashflow(organizationId, q);
      return [
        ...result.data.inflows.map(i => ({ flow: 'inflow', ...i })),
        ...result.data.outflows.map(o => ({ flow: 'outflow', date: o.date, category: o.category, amount: o.amount })),
      ] as Record<string, unknown>[];
    } else {
      const result = await this.getFinanceExpenses(organizationId, { ...q, limit: 10000 });
      return result.data as unknown as Record<string, unknown>[];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STAFF REPORTS
  // ═══════════════════════════════════════════════════════════════

  async getStaffAttendance(organizationId: string, q: StaffAttendanceQuery) {
    const start = parseStart(q.startDate);
    const end = parseEnd(q.endDate);

    const employeeWhere: Prisma.EmployeeWhereInput = { organizationId };
    if (q.departmentId) employeeWhere.departmentId = q.departmentId;
    if (q.employeeId) employeeWhere.id = q.employeeId;

    const employees = await this.prisma.employee.findMany({
      where: employeeWhere,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const employeeIds = employees.map(e => e.id);

    const attendanceWhere: Prisma.AttendanceWhereInput = {
      employeeId: { in: employeeIds },
      date: { gte: start, lt: end },
    };

    const attendance = await this.prisma.attendance.findMany({
      where: attendanceWhere,
      orderBy: { date: 'asc' },
    });

    // summary counts
    const summary = {
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      leave: 0,
      totalWorkingDays: 0,
    };

    const employeeMap = new Map(employees.map(e => [e.id, e]));
    const byEmployeeMap = new Map<
      string,
      { present: number; absent: number; late: number; hoursWorked: number }
    >();
    const dayMap = new Map<string, { present: number; absent: number; late: number }>();

    for (const a of attendance) {
      summary.totalWorkingDays++;
      switch (a.status) {
        case 'PRESENT': summary.present++; break;
        case 'ABSENT': summary.absent++; break;
        case 'LATE': summary.late++; break;
        case 'HALF_DAY': summary.halfDay++; break;
        case 'LEAVE': summary.leave++; break;
      }

      // by employee
      const emp = byEmployeeMap.get(a.employeeId) ?? { present: 0, absent: 0, late: 0, hoursWorked: 0 };
      if (a.status === 'PRESENT') emp.present++;
      if (a.status === 'ABSENT') emp.absent++;
      if (a.status === 'LATE') emp.late++;
      emp.hoursWorked += Number(a.hoursWorked ?? 0);
      byEmployeeMap.set(a.employeeId, emp);

      // by day
      const key = a.date.toISOString().slice(0, 10);
      const day = dayMap.get(key) ?? { present: 0, absent: 0, late: 0 };
      if (a.status === 'PRESENT') day.present++;
      if (a.status === 'ABSENT') day.absent++;
      if (a.status === 'LATE') day.late++;
      dayMap.set(key, day);
    }

    const byEmployee = Array.from(byEmployeeMap.entries()).map(([employeeId, v]) => {
      const emp = employeeMap.get(employeeId);
      const fullName = emp
        ? `${emp.user.firstName} ${emp.user.lastName}`.trim()
        : 'Unknown';
      return { employeeId, name: fullName, ...v };
    });

    const daily = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));

    return {
      data: { summary, byEmployee, daily },
      meta: this.meta(q.startDate, q.endDate),
    };
  }

  async getStaffExportData(organizationId: string, q: { startDate: string; endDate: string }) {
    const result = await this.getStaffAttendance(organizationId, q);
    return result.data.byEmployee as unknown as Record<string, unknown>[];
  }
}
