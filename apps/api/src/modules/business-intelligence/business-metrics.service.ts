import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { OrderStatus, POStatus, InvoiceStatus, GoalStatus } from '@prisma/client';
import type {
  ExecutiveSnapshot,
  SalesIntelligence,
  InventoryIntelligence,
  PurchasingIntelligence,
  CustomerIntelligence,
  GoalIntelligence,
  TopProductItem,
  LowStockItem,
  OutOfStockItem,
  MovingItem,
  GoalInsightItem,
  KpiInsightItem,
  PeriodComparison,
  DailyTrendItem,
} from './types/bi.types';

function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function safePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function comparison(current: number, previous: number): PeriodComparison {
  return {
    current,
    previous,
    change: current - previous,
    changePercent: safePct(current, previous),
  };
}

function startOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOf(d);
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

@Injectable()
export class BusinessMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Executive Snapshot ─────────────────────────────────────────────────────

  async getExecutiveSnapshot(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<ExecutiveSnapshot> {
    const now = new Date();
    const todayStart = startOf(now);
    const weekStart = daysAgo(7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const locationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
          ? { locationId: { in: [] as string[] } }
          : { locationId: { in: locationIds } };

    const completedWhere = {
      organizationId,
      status: OrderStatus.COMPLETED,
      ...locationFilter,
    };

    const [
      salesTodayAgg,
      salesWeekAgg,
      salesMonthAgg,
      ordersMonth,
      inventoryLevels,
      products,
      pendingPOs,
      unpaidInvoices,
      expensesMonth,
      overdueTasks,
      activeGoals,
      newCustomers,
      activeCustomers,
    ] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { ...completedWhere, createdAt: { gte: todayStart } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.salesOrder.aggregate({
        where: { ...completedWhere, createdAt: { gte: weekStart } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.aggregate({
        where: { ...completedWhere, createdAt: { gte: monthStart, lt: monthEnd } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.count({
        where: { ...completedWhere, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      this.prisma.inventoryLevel.findMany({
        where: {
          product: { organizationId },
          ...(locationIds !== null ? { locationId: { in: locationIds } } : {}),
        },
        select: { quantity: true, product: { select: { costPrice: true } } },
      }),
      this.prisma.product.count({ where: { organizationId } }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          organizationId,
          status: { in: [POStatus.SUBMITTED, POStatus.APPROVED, POStatus.PARTIALLY_RECEIVED] },
          ...(locationIds !== null ? { locationId: { in: locationIds } } : {}),
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL] },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: {
          organizationId,
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.task.count({
        where: {
          organizationId,
          status: { notIn: ['DONE' as const, 'CANCELLED' as const] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.goal.findMany({
        where: { organizationId, status: GoalStatus.ACTIVE },
        select: { progress: true, endDate: true },
      }),
      this.prisma.customer.count({
        where: { organizationId, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      this.prisma.salesOrder.groupBy({
        by: ['customerId'],
        where: { ...completedWhere, createdAt: { gte: monthStart, lt: monthEnd }, customerId: { not: null } },
        _count: true,
      }),
    ]);

    const totalStockValue = inventoryLevels.reduce(
      (sum, il) => sum + toNum(il.product.costPrice) * il.quantity,
      0,
    );
    const lowStockCount = inventoryLevels.filter((il) => il.quantity > 0 && il.quantity <= 10).length;
    const outOfStockCount = inventoryLevels.filter((il) => il.quantity <= 0).length;

    const goalsOnTrack = activeGoals.filter((g) => {
      const daysLeft = Math.ceil((g.endDate.getTime() - now.getTime()) / 86400000);
      const totalDays = Math.ceil((g.endDate.getTime() - now.getTime()) / 86400000);
      return g.progress >= 50 || daysLeft > totalDays * 0.3;
    }).length;

    const ordersMonthCount = toNum(salesTodayAgg._count);
    const avgOV = safeDiv(toNum(salesMonthAgg._sum.totalAmount), ordersMonth) ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      period: {
        startDate: monthStart.toISOString().slice(0, 10),
        endDate: now.toISOString().slice(0, 10),
      },
      salesToday: toNum(salesTodayAgg._sum.totalAmount),
      salesThisWeek: toNum(salesWeekAgg._sum.totalAmount),
      salesThisMonth: toNum(salesMonthAgg._sum.totalAmount),
      ordersThisMonth: ordersMonth,
      avgOrderValue: avgOV,
      inventoryValue: totalStockValue,
      lowStockCount,
      outOfStockCount,
      pendingPurchaseOrders: toNum(pendingPOs._count),
      pendingPurchaseOrderValue: toNum(pendingPOs._sum.totalAmount),
      unpaidInvoicesCount: toNum(unpaidInvoices._count),
      unpaidInvoicesValue: toNum(unpaidInvoices._sum.totalAmount),
      expensesThisMonth: toNum(expensesMonth._sum.amount),
      overdueTasks,
      activeGoals: activeGoals.length,
      goalsOnTrack,
      goalsAtRisk: activeGoals.length - goalsOnTrack,
      newCustomersThisMonth: newCustomers,
      activeCustomersThisMonth: activeCustomers.length,
      _label: 'FACT',
    };
  }

  // ─── Sales Intelligence ─────────────────────────────────────────────────────

  async getSalesIntelligence(
    organizationId: string,
    startDate: string,
    endDate: string,
    locationIds: string[] | null,
  ): Promise<SalesIntelligence> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    const periodDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    const prevEnd = new Date(start);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - periodDays);

    const locationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
          ? { locationId: { in: [] as string[] } }
          : { locationId: { in: locationIds } };

    const baseWhere = { organizationId, ...locationFilter };
    const currCompleted = { ...baseWhere, status: OrderStatus.COMPLETED, createdAt: { gte: start, lt: end } };
    const prevCompleted = { ...baseWhere, status: OrderStatus.COMPLETED, createdAt: { gte: prevStart, lt: prevEnd } };

    const [
      currAgg,
      prevAgg,
      currCount,
      prevCount,
      currCancelled,
      dailyRaw,
      topItemsRaw,
      categoryRaw,
    ] = await Promise.all([
      this.prisma.salesOrder.aggregate({ where: currCompleted, _sum: { totalAmount: true }, _count: true }),
      this.prisma.salesOrder.aggregate({ where: prevCompleted, _sum: { totalAmount: true }, _count: true }),
      this.prisma.salesOrder.count({ where: { ...baseWhere, createdAt: { gte: start, lt: end } } }),
      this.prisma.salesOrder.count({ where: { ...baseWhere, createdAt: { gte: prevStart, lt: prevEnd } } }),
      this.prisma.salesOrder.count({ where: { ...baseWhere, status: OrderStatus.CANCELLED, createdAt: { gte: start, lt: end } } }),
      this.prisma.salesOrder.findMany({
        where: currCompleted,
        select: { totalAmount: true, createdAt: true },
      }),
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: { order: currCompleted },
        _sum: { totalPrice: true, quantity: true, costPrice: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 20,
      }),
      this.prisma.salesOrderItem.findMany({
        where: { order: currCompleted },
        select: {
          totalPrice: true,
          quantity: true,
          product: { select: { id: true, categoryId: true, category: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const currRevenue = toNum(currAgg._sum.totalAmount);
    const prevRevenue = toNum(prevAgg._sum.totalAmount);
    const currOrders = currCount;
    const prevOrders = prevCount;

    // Daily trend
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of dailyRaw) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const existing = dayMap.get(key) ?? { revenue: 0, orders: 0 };
      existing.revenue += toNum(o.totalAmount);
      existing.orders += 1;
      dayMap.set(key, existing);
    }
    const dailyTrend: DailyTrendItem[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Top products need name lookup
    const productIds = topItemsRaw.map((i) => i.productId);
    const productMap = new Map(
      (await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true },
      })).map((p) => [p.id, p]),
    );

    const topProducts: TopProductItem[] = topItemsRaw.slice(0, 10).map((item) => {
      const p = productMap.get(item.productId);
      const revenue = toNum(item._sum.totalPrice);
      const cost = toNum(item._sum.costPrice) * toNum(item._sum.quantity);
      return {
        productId: item.productId,
        name: p?.name ?? 'Unknown',
        sku: p?.sku ?? '',
        quantitySold: toNum(item._sum.quantity),
        revenue,
        grossProfit: revenue - cost,
      };
    });

    const bottomProducts: TopProductItem[] = [...topItemsRaw].reverse().slice(0, 5).map((item) => {
      const p = productMap.get(item.productId);
      const revenue = toNum(item._sum.totalPrice);
      const cost = toNum(item._sum.costPrice) * toNum(item._sum.quantity);
      return {
        productId: item.productId,
        name: p?.name ?? 'Unknown',
        sku: p?.sku ?? '',
        quantitySold: toNum(item._sum.quantity),
        revenue,
        grossProfit: revenue - cost,
      };
    });

    // Category aggregation
    const catMap = new Map<string, { name: string; revenue: number; quantity: number }>();
    for (const item of categoryRaw) {
      const catId = item.product.categoryId ?? '_none';
      const catName = item.product.category?.name ?? 'Uncategorised';
      const existing = catMap.get(catId) ?? { name: catName, revenue: 0, quantity: 0 };
      existing.revenue += toNum(item.totalPrice);
      existing.quantity += toNum(item.quantity);
      catMap.set(catId, existing);
    }
    const byCategory = Array.from(catMap.entries()).map(([id, v]) => ({
      categoryId: id === '_none' ? null : id,
      categoryName: v.name,
      revenue: v.revenue,
      quantity: v.quantity,
    }));

    const completedCount = toNum(currAgg._count);
    const avgOrderValue = safeDiv(currRevenue, completedCount) ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      totalRevenue: currRevenue,
      totalOrders: currOrders,
      completedOrders: completedCount,
      cancelledOrders: currCancelled,
      avgOrderValue,
      revenueComparison: comparison(currRevenue, prevRevenue),
      ordersComparison: comparison(currOrders, prevOrders),
      topProducts,
      bottomProducts,
      byCategory,
      dailyTrend,
      _label: 'FACT',
    };
  }

  // ─── Inventory Intelligence ─────────────────────────────────────────────────

  async getInventoryIntelligence(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<InventoryIntelligence> {
    const locationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
          ? { locationId: { in: [] as string[] } }
          : { locationId: { in: locationIds } };

    const levels = await this.prisma.inventoryLevel.findMany({
      where: {
        product: { organizationId },
        ...locationFilter,
      },
      select: {
        productId: true,
        quantity: true,
        incoming: true,
        locationId: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            costPrice: true,
            lowStockAlert: true,
          },
        },
        location: { select: { id: true, name: true } },
      },
    });

    // Aggregate by product
    const productMap = new Map<
      string,
      { name: string; sku: string; costPrice: number; lowStockAlert: number; totalQty: number; totalIncoming: number; locationId?: string; locationName?: string }
    >();
    for (const lvl of levels) {
      const existing = productMap.get(lvl.productId);
      if (existing) {
        existing.totalQty += lvl.quantity;
        existing.totalIncoming += lvl.incoming;
      } else {
        productMap.set(lvl.productId, {
          name: lvl.product.name,
          sku: lvl.product.sku,
          costPrice: toNum(lvl.product.costPrice),
          lowStockAlert: lvl.product.lowStockAlert ?? 10,
          totalQty: lvl.quantity,
          totalIncoming: lvl.incoming,
          locationId: lvl.locationId,
          locationName: lvl.location.name,
        });
      }
    }

    const totalStockValue = Array.from(productMap.values()).reduce(
      (sum, p) => sum + p.costPrice * Math.max(p.totalQty, 0),
      0,
    );

    const lowStockItems: LowStockItem[] = [];
    const outOfStockItems: OutOfStockItem[] = [];

    for (const [productId, p] of productMap.entries()) {
      if (p.totalQty <= 0) {
        outOfStockItems.push({ productId, name: p.name, sku: p.sku, incomingStock: p.totalIncoming });
      } else if (p.totalQty <= p.lowStockAlert) {
        lowStockItems.push({
          productId,
          name: p.name,
          sku: p.sku,
          currentStock: p.totalQty,
          lowStockAlert: p.lowStockAlert,
          incomingStock: p.totalIncoming,
        });
      }
    }

    // Fast/slow movers: sales in last 30 days
    const thirtyDaysAgo = daysAgo(30);
    const salesVelocity = await this.prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          organizationId,
          status: OrderStatus.COMPLETED,
          createdAt: { gte: thirtyDaysAgo },
          ...locationFilter,
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
    });

    const fastMovers: MovingItem[] = salesVelocity.slice(0, 10).map((s) => {
      const p = productMap.get(s.productId);
      const sold = toNum(s._sum.quantity);
      const stock = p?.totalQty ?? 0;
      const avgDaily = sold / 30;
      return {
        productId: s.productId,
        name: p?.name ?? 'Unknown',
        sku: p?.sku ?? '',
        unitsSold30Days: sold,
        currentStock: stock,
        daysOfStockRemaining: avgDaily > 0 ? Math.floor(stock / avgDaily) : null,
      };
    });

    const slowMovers: MovingItem[] = salesVelocity.slice(-10).map((s) => {
      const p = productMap.get(s.productId);
      const sold = toNum(s._sum.quantity);
      const stock = p?.totalQty ?? 0;
      const avgDaily = sold / 30;
      return {
        productId: s.productId,
        name: p?.name ?? 'Unknown',
        sku: p?.sku ?? '',
        unitsSold30Days: sold,
        currentStock: stock,
        daysOfStockRemaining: avgDaily > 0 ? Math.floor(stock / avgDaily) : null,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalStockValue,
      totalProducts: productMap.size,
      lowStockItems,
      outOfStockItems,
      fastMovers,
      slowMovers,
      _label: 'FACT',
    };
  }

  // ─── Purchasing Intelligence ────────────────────────────────────────────────

  async getPurchasingIntelligence(
    organizationId: string,
    startDate: string,
    endDate: string,
    locationIds: string[] | null,
  ): Promise<PurchasingIntelligence> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    const locationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
          ? { locationId: { in: [] as string[] } }
          : { locationId: { in: locationIds } };

    const [pendingPOs, periodPOs] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: {
          organizationId,
          status: { in: [POStatus.SUBMITTED, POStatus.APPROVED, POStatus.PARTIALLY_RECEIVED] },
          ...locationFilter,
        },
        select: {
          id: true,
          reference: true,
          supplierId: true,
          supplier: { select: { name: true } },
          totalAmount: true,
          expectedDate: true,
          status: true,
        },
        orderBy: { expectedDate: 'asc' },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          organizationId,
          createdAt: { gte: start, lt: end },
          ...locationFilter,
        },
        select: {
          supplierId: true,
          supplier: { select: { name: true } },
          totalAmount: true,
          status: true,
        },
      }),
    ]);

    const incomingStock = pendingPOs.map((po) => ({
      purchaseOrderId: po.id,
      reference: po.reference,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      expectedDate: po.expectedDate?.toISOString().slice(0, 10) ?? null,
      totalAmount: toNum(po.totalAmount),
      status: po.status,
    }));

    const pendingOrderValue = pendingPOs.reduce((s, p) => s + toNum(p.totalAmount), 0);

    // Supplier summary for the period
    const supplierMap = new Map<string, { name: string; orderCount: number; totalSpent: number; pendingOrders: number }>();
    for (const po of periodPOs) {
      const existing = supplierMap.get(po.supplierId) ?? { name: po.supplier.name, orderCount: 0, totalSpent: 0, pendingOrders: 0 };
      existing.orderCount++;
      existing.totalSpent += toNum(po.totalAmount);
      const pendingStatuses: string[] = [POStatus.SUBMITTED, POStatus.APPROVED, POStatus.PARTIALLY_RECEIVED];
      if (pendingStatuses.includes(po.status)) {
        existing.pendingOrders++;
      }
      supplierMap.set(po.supplierId, existing);
    }

    const supplierSummary = Array.from(supplierMap.entries())
      .map(([supplierId, v]) => ({ supplierId, supplierName: v.name, ...v }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    return {
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      pendingOrders: pendingPOs.length,
      pendingOrderValue,
      incomingStock,
      supplierSummary,
      _label: 'FACT',
    };
  }

  // ─── Customer Intelligence ──────────────────────────────────────────────────

  async getCustomerIntelligence(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<CustomerIntelligence> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    const inactiveCutoff = daysAgo(90);

    const [totalCustomers, newThisPeriod, activeThisPeriod, topCustomersRaw, inactiveCount] = await Promise.all([
      this.prisma.customer.count({ where: { organizationId } }),
      this.prisma.customer.count({ where: { organizationId, createdAt: { gte: start, lt: end } } }),
      this.prisma.salesOrder.groupBy({
        by: ['customerId'],
        where: { organizationId, status: OrderStatus.COMPLETED, createdAt: { gte: start, lt: end }, customerId: { not: null } },
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.customer.findMany({
        where: { organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          totalSpent: true,
          createdAt: true,
          salesOrders: {
            where: { status: OrderStatus.COMPLETED },
            select: { totalAmount: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { totalSpent: 'desc' },
        take: 20,
      }),
      this.prisma.customer.count({
        where: {
          organizationId,
          salesOrders: {
            none: { createdAt: { gte: inactiveCutoff } },
          },
        },
      }),
    ]);

    const HIGH_VALUE_THRESHOLD = 100000;
    const topCustomers = topCustomersRaw.slice(0, 10).map((c) => {
      const orderCount = c.salesOrders.length;
      const totalSpent = toNum(c.totalSpent);
      const lastOrder = c.salesOrders[0];
      const lastOrderDate = lastOrder?.createdAt.toISOString().slice(0, 10) ?? null;
      const daysSinceLast = lastOrderDate
        ? Math.ceil((Date.now() - new Date(lastOrderDate).getTime()) / 86400000)
        : Infinity;

      let segment: 'NEW' | 'REPEAT' | 'HIGH_VALUE' | 'INACTIVE' | 'AT_RISK';
      if (totalSpent >= HIGH_VALUE_THRESHOLD) segment = 'HIGH_VALUE';
      else if (daysSinceLast > 90) segment = 'INACTIVE';
      else if (daysSinceLast > 30) segment = 'AT_RISK';
      else if (orderCount > 1) segment = 'REPEAT';
      else segment = 'NEW';

      return {
        customerId: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        orderCount,
        totalSpent,
        lastOrderDate,
        segment,
      };
    });

    const repeatCustomers = activeThisPeriod.filter((a) => toNum(a._count) > 1).length;

    return {
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      totalCustomers,
      newThisPeriod,
      activeThisPeriod: activeThisPeriod.length,
      repeatCustomers,
      inactiveCustomers: inactiveCount,
      topCustomers,
      _label: 'FACT',
    };
  }

  // ─── Goal / KPI Intelligence ────────────────────────────────────────────────

  async getGoalIntelligence(organizationId: string): Promise<GoalIntelligence> {
    const now = new Date();

    const goals = await this.prisma.goal.findMany({
      where: { organizationId },
      include: {
        kpis: true,
        progresses: {
          orderBy: { recordedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { endDate: 'asc' },
    });

    const active = goals.filter((g) => g.status === GoalStatus.ACTIVE);
    const achieved = goals.filter((g) => g.status === GoalStatus.ACHIEVED);
    const missed = goals.filter((g) => g.status === GoalStatus.MISSED);

    const goalItems: GoalInsightItem[] = goals.map((g) => {
      const daysRemaining = Math.ceil((g.endDate.getTime() - now.getTime()) / 86400000);
      const kpis: KpiInsightItem[] = g.kpis.map((k) => ({
        kpiId: k.id,
        name: k.name,
        target: toNum(k.target),
        current: toNum(k.current),
        unit: k.unit,
        achievementPercent: toNum(k.target) > 0 ? (toNum(k.current) / toNum(k.target)) * 100 : 0,
      }));

      // Trend: compare latest 2 progress entries
      let progressTrend: GoalInsightItem['progressTrend'] = 'UNKNOWN';
      if (g.progresses.length >= 2) {
        const latest = g.progresses[0].value;
        const prev = g.progresses[1].value;
        if (latest > prev) progressTrend = 'IMPROVING';
        else if (latest < prev) progressTrend = 'DECLINING';
        else progressTrend = 'STABLE';
      }

      const onTrack =
        g.status === GoalStatus.ACTIVE &&
        daysRemaining > 0 &&
        (g.progress >= 50 || daysRemaining > 14);

      return {
        goalId: g.id,
        title: g.title,
        status: g.status,
        progress: g.progress,
        startDate: g.startDate.toISOString().slice(0, 10),
        endDate: g.endDate.toISOString().slice(0, 10),
        daysRemaining,
        kpis,
        progressTrend,
        onTrack,
      };
    });

    const onTrackCount = goalItems.filter((g) => g.onTrack).length;

    return {
      generatedAt: new Date().toISOString(),
      totalActive: active.length,
      onTrack: onTrackCount,
      atRisk: active.length - onTrackCount,
      achieved: achieved.length,
      missed: missed.length,
      goals: goalItems,
      _label: 'FACT',
    };
  }
}
