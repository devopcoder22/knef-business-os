import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { OrderStatus, POStatus } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import type { Recommendation } from './types/bi.types';

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

@Injectable()
export class RecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendations(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    const [reorderRecs, slowMovers, inactiveCustomers, goalAtRisk] = await Promise.all([
      this.getReorderRecommendations(organizationId, locationIds),
      this.getSlowMoverRecommendations(organizationId, locationIds),
      this.getInactiveCustomerRecommendations(organizationId),
      this.getGoalAtRiskRecommendations(organizationId),
    ]);

    recommendations.push(...reorderRecs, ...slowMovers, ...inactiveCustomers, ...goalAtRisk);

    // Sort by urgency
    const urgencyOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  }

  private async getReorderRecommendations(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<Recommendation[]> {
    const locationFilter = this.buildLocationFilter(locationIds);
    const thirtyDaysAgo = addDays(new Date(), -30);

    const [lowStockLevels, salesVelocity, pendingPOs] = await Promise.all([
      this.prisma.inventoryLevel.findMany({
        where: {
          product: { organizationId },
          ...locationFilter,
        },
        select: {
          productId: true,
          quantity: true,
          incoming: true,
          product: {
            select: { id: true, name: true, sku: true, lowStockAlert: true },
          },
        },
      }),
      this.prisma.salesOrderItem.groupBy({
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
      }),
      this.prisma.purchaseOrderItem.groupBy({
        by: ['productId'],
        where: {
          purchaseOrder: {
            organizationId,
            status: { in: [POStatus.SUBMITTED, POStatus.APPROVED, POStatus.PARTIALLY_RECEIVED] },
          },
        },
        _sum: { quantity: true, receivedQty: true },
      }),
    ]);

    // Aggregate stock by product
    const stockMap = new Map<string, { name: string; sku: string; lowStockAlert: number; totalQty: number; totalIncoming: number }>();
    for (const lvl of lowStockLevels) {
      const existing = stockMap.get(lvl.productId);
      if (existing) {
        existing.totalQty += lvl.quantity;
        existing.totalIncoming += lvl.incoming;
      } else {
        stockMap.set(lvl.productId, {
          name: lvl.product.name,
          sku: lvl.product.sku,
          lowStockAlert: lvl.product.lowStockAlert ?? 10,
          totalQty: lvl.quantity,
          totalIncoming: lvl.incoming,
        });
      }
    }

    const velocityMap = new Map(salesVelocity.map((s) => [s.productId, toNum(s._sum.quantity)]));
    const pendingMap = new Map(pendingPOs.map((p) => [p.productId, {
      quantity: toNum(p._sum.quantity),
      receivedQty: toNum(p._sum.receivedQty),
    }]));

    const recs: Recommendation[] = [];

    for (const [productId, stock] of stockMap.entries()) {
      const soldIn30Days = velocityMap.get(productId) ?? 0;
      const avgDailySales = soldIn30Days / 30;
      const daysRemaining = avgDailySales > 0 ? Math.floor(stock.totalQty / avgDailySales) : null;
      const inboundQty = (pendingMap.get(productId)?.quantity ?? 0) - (pendingMap.get(productId)?.receivedQty ?? 0);
      const effectiveStock = stock.totalQty + inboundQty;
      const effectiveDays = avgDailySales > 0 ? Math.floor(effectiveStock / avgDailySales) : null;

      const isLowStock = stock.totalQty <= stock.lowStockAlert;
      const isOutOfStock = stock.totalQty <= 0;
      const isCritical = daysRemaining !== null && daysRemaining <= 7;
      const hasNoInbound = inboundQty === 0;

      if ((isLowStock || isCritical) && hasNoInbound) {
        const suggestedQty = soldIn30Days > 0 ? Math.ceil(soldIn30Days * 1.5) : stock.lowStockAlert * 2;

        recs.push({
          id: createId(),
          type: 'REORDER',
          title: `Reorder ${stock.name}`,
          _label: 'RECOMMENDATION',
          supportingFacts: [
            `Current stock: ${stock.totalQty} units`,
            `Reorder level: ${stock.lowStockAlert} units`,
            `30-day sales: ${soldIn30Days} units`,
            daysRemaining !== null ? `Estimated days remaining: ${daysRemaining}` : 'No recent sales velocity data',
            `Inbound stock: ${inboundQty} units`,
          ],
          reasoning: isOutOfStock
            ? 'Product is out of stock with no inbound purchase orders.'
            : `Stock is below reorder level${isCritical ? ' and critically low' : ''}. No inbound purchase orders exist.`,
          expectedBenefit: `Prevent stockouts. At current velocity, suggested reorder: ${suggestedQty} units (~45 days of stock).`,
          risk: 'Stockout risk if not replenished. Over-ordering ties up capital.',
          urgency: isOutOfStock ? 'HIGH' : isCritical ? 'HIGH' : 'MEDIUM',
          confidence: soldIn30Days > 0 ? 'HIGH' : 'LOW',
          entityId: productId,
          entityType: 'product',
          entityName: stock.name,
        });
      }
    }

    return recs.slice(0, 10);
  }

  private async getSlowMoverRecommendations(
    organizationId: string,
    locationIds: string[] | null,
  ): Promise<Recommendation[]> {
    const locationFilter = this.buildLocationFilter(locationIds);
    const ninetyDaysAgo = addDays(new Date(), -90);

    const [stockLevels, salesVelocity] = await Promise.all([
      this.prisma.inventoryLevel.findMany({
        where: { product: { organizationId }, ...locationFilter },
        select: {
          productId: true,
          quantity: true,
          product: { select: { name: true, sku: true } },
        },
      }),
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            organizationId,
            status: OrderStatus.COMPLETED,
            createdAt: { gte: ninetyDaysAgo },
            ...locationFilter,
          },
        },
        _sum: { quantity: true },
      }),
    ]);

    const velocityMap = new Map(salesVelocity.map((s) => [s.productId, toNum(s._sum.quantity)]));
    const stockMap = new Map<string, { name: string; sku: string; totalQty: number }>();
    for (const lvl of stockLevels) {
      const existing = stockMap.get(lvl.productId);
      if (existing) {
        existing.totalQty += lvl.quantity;
      } else {
        stockMap.set(lvl.productId, { name: lvl.product.name, sku: lvl.product.sku, totalQty: lvl.quantity });
      }
    }

    const recs: Recommendation[] = [];
    for (const [productId, stock] of stockMap.entries()) {
      const soldIn90Days = velocityMap.get(productId) ?? 0;
      if (stock.totalQty > 0 && soldIn90Days === 0) {
        recs.push({
          id: createId(),
          type: 'REVIEW_SLOW_MOVER',
          title: `Review slow-moving stock: ${stock.name}`,
          _label: 'RECOMMENDATION',
          supportingFacts: [
            `Current stock: ${stock.totalQty} units`,
            '0 units sold in the last 90 days.',
          ],
          reasoning: 'Product has stock but no sales in 90 days, indicating potential dead stock.',
          expectedBenefit: 'Free up capital and warehouse space. Consider promotion, discount, or return to supplier.',
          risk: 'Continued holding cost and potential obsolescence.',
          urgency: 'LOW',
          confidence: 'HIGH',
          entityId: productId,
          entityType: 'product',
          entityName: stock.name,
        });
      }
    }

    return recs.slice(0, 5);
  }

  private async getInactiveCustomerRecommendations(organizationId: string): Promise<Recommendation[]> {
    const ninetyDaysAgo = addDays(new Date(), -90);

    const inactiveCustomers = await this.prisma.customer.findMany({
      where: {
        organizationId,
        salesOrders: {
          none: { createdAt: { gte: ninetyDaysAgo } },
          some: {}, // Has at least one order historically
        },
      },
      select: { id: true, firstName: true, lastName: true, totalSpent: true },
      orderBy: { totalSpent: 'desc' },
      take: 5,
    });

    if (inactiveCustomers.length === 0) return [];

    return [
      {
        id: createId(),
        type: 'REENGAGE_CUSTOMERS',
        title: `Re-engage ${inactiveCustomers.length} inactive customers`,
        _label: 'RECOMMENDATION',
        supportingFacts: [
          `${inactiveCustomers.length} previously active customers have not placed an order in 90+ days.`,
          `Top inactive customer by spend: ${inactiveCustomers[0].firstName} ${inactiveCustomers[0].lastName} (₦${toNum(inactiveCustomers[0].totalSpent).toLocaleString()})`,
        ],
        reasoning: 'Re-engaging lapsed customers is typically more cost-effective than acquiring new ones.',
        expectedBenefit: 'Recover revenue from known customers who have already demonstrated purchase intent.',
        risk: 'Customers may have churned due to competitor preference or product dissatisfaction.',
        urgency: 'MEDIUM',
        confidence: 'MEDIUM',
        entityType: 'customers',
      },
    ];
  }

  private async getGoalAtRiskRecommendations(organizationId: string): Promise<Recommendation[]> {
    const now = new Date();

    const activeGoals = await this.prisma.goal.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { id: true, title: true, progress: true, endDate: true },
    });

    const recs: Recommendation[] = [];

    for (const goal of activeGoals) {
      const daysRemaining = Math.ceil((goal.endDate.getTime() - now.getTime()) / 86400000);
      const isAtRisk = daysRemaining <= 14 && goal.progress < 80;
      const isNearDeadline = daysRemaining <= 7 && goal.progress < 100;

      if (isAtRisk || isNearDeadline) {
        recs.push({
          id: createId(),
          type: 'GOAL_AT_RISK',
          title: `Goal at risk: ${goal.title}`,
          _label: 'RECOMMENDATION',
          supportingFacts: [
            `Progress: ${goal.progress}%`,
            `Days remaining: ${daysRemaining}`,
            `Deadline: ${goal.endDate.toISOString().slice(0, 10)}`,
          ],
          reasoning: `Goal has ${daysRemaining} days remaining and is only ${goal.progress}% complete.`,
          expectedBenefit: 'Early intervention can help salvage the goal before the deadline passes.',
          risk: 'Goal will be missed without corrective action.',
          urgency: isNearDeadline ? 'HIGH' : 'MEDIUM',
          confidence: 'HIGH',
          entityId: goal.id,
          entityType: 'goal',
          entityName: goal.title,
        });
      }
    }

    return recs;
  }

  private buildLocationFilter(locationIds: string[] | null): Record<string, unknown> {
    if (locationIds === null) return {};
    if (locationIds.length === 0) return { locationId: { in: [] as string[] } };
    return { locationId: { in: locationIds } };
  }
}
