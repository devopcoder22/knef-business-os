import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { OrderStatus } from '@prisma/client';
import type { SimulationInput, SimulationResult } from './types/bi.types';

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// IMPORTANT: This service NEVER writes to the database.
// All calculations are pure computations on read-only data.

@Injectable()
export class SimulationService {
  constructor(private readonly prisma: PrismaService) {}

  async simulate(
    organizationId: string,
    locationIds: string[] | null,
    input: SimulationInput,
  ): Promise<SimulationResult> {
    const windowDays = input.baselinePeriodDays ?? 30;

    if (windowDays < 1 || windowDays > 365) {
      throw new BadRequestException('baselinePeriodDays must be between 1 and 365.');
    }

    switch (input.scenario) {
      case 'SALES_CHANGE':
        return this.simulateSalesChange(organizationId, locationIds, windowDays, input.parameters);
      case 'MARGIN_CHANGE':
        return this.simulateMarginChange(organizationId, locationIds, windowDays, input.parameters);
      case 'EXPENSE_CHANGE':
        return this.simulateExpenseChange(organizationId, windowDays, input.parameters);
      case 'DEMAND_CHANGE':
        return this.simulateDemandChange(organizationId, locationIds, input.parameters);
      case 'REORDER':
        return this.simulateReorder(organizationId, locationIds, input.parameters);
      default:
        throw new BadRequestException(`Unknown simulation scenario: ${String(input.scenario)}`);
    }
  }

  private async simulateSalesChange(
    organizationId: string,
    locationIds: string[] | null,
    windowDays: number,
    params: Record<string, number | string>,
  ): Promise<SimulationResult> {
    const changePercent = Number(params['changePercent'] ?? 0);
    if (isNaN(changePercent) || changePercent < -100 || changePercent > 1000) {
      throw new BadRequestException('changePercent must be between -100 and 1000.');
    }

    const start = addDays(new Date(), -windowDays);
    const locationFilter = this.buildLocationFilter(locationIds);

    const agg = await this.prisma.salesOrder.aggregate({
      where: {
        organizationId,
        status: OrderStatus.COMPLETED,
        createdAt: { gte: start },
        ...locationFilter,
      },
      _sum: { totalAmount: true, discountAmount: true },
      _count: true,
    });

    const baselineRevenue = toNum(agg._sum.totalAmount);
    const baselineOrders = toNum(agg._count);
    const baselineAvgOrder = baselineOrders > 0 ? baselineRevenue / baselineOrders : 0;

    const multiplier = 1 + changePercent / 100;
    const projectedRevenue = baselineRevenue * multiplier;
    const projectedOrders = Math.round(baselineOrders * multiplier);
    const projectedAvgOrder = projectedOrders > 0 ? projectedRevenue / projectedOrders : 0;

    return {
      scenario: 'SALES_CHANGE',
      _label: 'SIMULATION',
      WARNING: 'THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA',
      baseline: {
        periodDays: windowDays,
        revenue: Math.round(baselineRevenue),
        orders: baselineOrders,
        avgOrderValue: Math.round(baselineAvgOrder),
      },
      assumptions: [
        `Sales change of ${changePercent > 0 ? '+' : ''}${changePercent}% applied uniformly.`,
        `Baseline is the last ${windowDays} days of completed orders.`,
        'Average order value assumed to remain constant.',
      ],
      simulatedInputs: { changePercent, multiplier },
      calculatedOutcome: {
        projectedRevenue: Math.round(projectedRevenue),
        projectedOrders,
        projectedAvgOrderValue: Math.round(projectedAvgOrder),
        projectedAdditionalRevenue: Math.round(projectedRevenue - baselineRevenue),
      },
      differences: {
        revenueChange: Math.round(projectedRevenue - baselineRevenue),
        ordersChange: projectedOrders - baselineOrders,
        revenueChangePercent: changePercent,
      },
      caveats: [
        'This is a proportional scaling — real results depend on market conditions.',
        'Does not account for capacity constraints, supplier availability, or staff capacity.',
        'No purchasing, inventory, or financial records have been modified.',
      ],
    };
  }

  private async simulateMarginChange(
    organizationId: string,
    locationIds: string[] | null,
    windowDays: number,
    params: Record<string, number | string>,
  ): Promise<SimulationResult> {
    const marginChangePoints = Number(params['marginChangePoints'] ?? 0);
    if (isNaN(marginChangePoints) || Math.abs(marginChangePoints) > 100) {
      throw new BadRequestException('marginChangePoints must be between -100 and 100.');
    }

    const start = addDays(new Date(), -windowDays);
    const locationFilter = this.buildLocationFilter(locationIds);

    const items = await this.prisma.salesOrderItem.findMany({
      where: {
        order: {
          organizationId,
          status: OrderStatus.COMPLETED,
          createdAt: { gte: start },
          ...locationFilter,
        },
      },
      select: { totalPrice: true, costPrice: true, quantity: true },
    });

    const totalRevenue = items.reduce((s, i) => s + toNum(i.totalPrice), 0);
    const totalCost = items.reduce((s, i) => s + toNum(i.costPrice) * i.quantity, 0);
    const baselineGrossProfit = totalRevenue - totalCost;
    const baselineMargin = totalRevenue > 0 ? (baselineGrossProfit / totalRevenue) * 100 : 0;

    const simulatedMargin = baselineMargin + marginChangePoints;
    const simulatedGrossProfit = (simulatedMargin / 100) * totalRevenue;
    const profitChange = simulatedGrossProfit - baselineGrossProfit;

    return {
      scenario: 'MARGIN_CHANGE',
      _label: 'SIMULATION',
      WARNING: 'THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA',
      baseline: {
        periodDays: windowDays,
        revenue: Math.round(totalRevenue),
        costOfGoods: Math.round(totalCost),
        grossProfit: Math.round(baselineGrossProfit),
        grossMarginPercent: Math.round(baselineMargin * 100) / 100,
      },
      assumptions: [
        `Gross margin changes by ${marginChangePoints > 0 ? '+' : ''}${marginChangePoints} percentage points.`,
        'Revenue volume remains unchanged.',
        'Change is applied uniformly across all products.',
      ],
      simulatedInputs: { marginChangePoints, simulatedMarginPercent: simulatedMargin },
      calculatedOutcome: {
        simulatedGrossProfit: Math.round(simulatedGrossProfit),
        simulatedMarginPercent: Math.round(simulatedMargin * 100) / 100,
      },
      differences: {
        grossProfitChange: Math.round(profitChange),
        marginPointChange: marginChangePoints,
      },
      caveats: [
        'Margin change could result from pricing adjustments, cost reduction, or product mix shift.',
        'No inventory costs, supplier prices, or sales records have been modified.',
        'This simulation does not account for price elasticity.',
      ],
    };
  }

  private async simulateExpenseChange(
    organizationId: string,
    windowDays: number,
    params: Record<string, number | string>,
  ): Promise<SimulationResult> {
    const changePercent = Number(params['changePercent'] ?? 0);
    if (isNaN(changePercent) || changePercent < -100 || changePercent > 1000) {
      throw new BadRequestException('changePercent must be between -100 and 1000.');
    }

    const start = addDays(new Date(), -windowDays);

    const agg = await this.prisma.expense.aggregate({
      where: { organizationId, createdAt: { gte: start } },
      _sum: { amount: true },
      _count: true,
    });

    const baselineExpenses = toNum(agg._sum.amount);
    const baselineCount = toNum(agg._count);
    const simulatedExpenses = baselineExpenses * (1 + changePercent / 100);

    return {
      scenario: 'EXPENSE_CHANGE',
      _label: 'SIMULATION',
      WARNING: 'THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA',
      baseline: {
        periodDays: windowDays,
        totalExpenses: Math.round(baselineExpenses),
        expenseCount: baselineCount,
      },
      assumptions: [
        `Expenses change by ${changePercent > 0 ? '+' : ''}${changePercent}% uniformly.`,
        `Baseline is total approved/pending expenses over the last ${windowDays} days.`,
      ],
      simulatedInputs: { changePercent },
      calculatedOutcome: {
        simulatedExpenses: Math.round(simulatedExpenses),
        expenseSaving: Math.round(baselineExpenses - simulatedExpenses),
      },
      differences: {
        expenseChange: Math.round(simulatedExpenses - baselineExpenses),
        expenseChangePercent: changePercent,
      },
      caveats: [
        'No expense records have been created or modified.',
        'Savings depend on which expense categories can be reduced.',
      ],
    };
  }

  private async simulateDemandChange(
    organizationId: string,
    locationIds: string[] | null,
    params: Record<string, number | string>,
  ): Promise<SimulationResult> {
    const demandChangePercent = Number(params['demandChangePercent'] ?? 0);
    if (isNaN(demandChangePercent) || demandChangePercent < -100 || demandChangePercent > 1000) {
      throw new BadRequestException('demandChangePercent must be between -100 and 1000.');
    }

    const start = addDays(new Date(), -30);
    const locationFilter = this.buildLocationFilter(locationIds);

    const [salesVelocity, stockLevels] = await Promise.all([
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            organizationId,
            status: OrderStatus.COMPLETED,
            createdAt: { gte: start },
            ...locationFilter,
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryLevel.groupBy({
        by: ['productId'],
        where: {
          product: { organizationId },
          ...locationFilter,
        },
        _sum: { quantity: true },
      }),
    ]);

    const stockMap = new Map(stockLevels.map((s) => [s.productId, toNum(s._sum.quantity)]));

    const multiplier = 1 + demandChangePercent / 100;
    const affected = salesVelocity
      .map((sv) => {
        const currentDailyDemand = toNum(sv._sum.quantity) / 30;
        const newDailyDemand = currentDailyDemand * multiplier;
        const currentStock = stockMap.get(sv.productId) ?? 0;
        const currentDaysRemaining = currentDailyDemand > 0 ? Math.floor(currentStock / currentDailyDemand) : null;
        const newDaysRemaining = newDailyDemand > 0 ? Math.floor(currentStock / newDailyDemand) : null;
        return {
          productId: sv.productId,
          currentDailyDemand: Math.round(currentDailyDemand * 100) / 100,
          simulatedDailyDemand: Math.round(newDailyDemand * 100) / 100,
          currentStock,
          currentDaysRemaining,
          simulatedDaysRemaining: newDaysRemaining,
        };
      })
      .slice(0, 20);

    const productsRunningOut = affected.filter(
      (a) => a.simulatedDaysRemaining !== null && a.simulatedDaysRemaining < 14,
    ).length;

    return {
      scenario: 'DEMAND_CHANGE',
      _label: 'SIMULATION',
      WARNING: 'THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA',
      baseline: {
        periodDays: 30,
        productsTracked: salesVelocity.length,
      },
      assumptions: [
        `Demand changes by ${demandChangePercent > 0 ? '+' : ''}${demandChangePercent}% across all products.`,
        'Baseline demand calculated from last 30 days of completed orders.',
        'Current stock levels are unchanged.',
      ],
      simulatedInputs: { demandChangePercent, multiplier },
      calculatedOutcome: {
        productsWithLessThan14DaysStock: productsRunningOut,
        topAffectedProducts: affected.length,
      },
      differences: {
        productsRunningOutCount: productsRunningOut,
      },
      caveats: [
        'No inventory records have been modified.',
        'Actual demand changes may vary by product.',
        'Does not account for inbound purchase orders.',
      ],
    };
  }

  private async simulateReorder(
    organizationId: string,
    locationIds: string[] | null,
    params: Record<string, number | string>,
  ): Promise<SimulationResult> {
    const productId = String(params['productId'] ?? '');
    const reorderQty = Number(params['reorderQty'] ?? 0);
    const unitCost = Number(params['unitCost'] ?? 0);

    if (!productId) throw new BadRequestException('productId is required for reorder simulation.');
    if (reorderQty <= 0) throw new BadRequestException('reorderQty must be positive.');
    if (unitCost < 0) throw new BadRequestException('unitCost cannot be negative.');

    const locationFilter = this.buildLocationFilter(locationIds);

    const [product, currentLevels, salesVelocity] = await Promise.all([
      this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { id: true, name: true, sku: true, costPrice: true, lowStockAlert: true },
      }),
      this.prisma.inventoryLevel.aggregate({
        where: { productId, product: { organizationId }, ...locationFilter },
        _sum: { quantity: true, incoming: true },
      }),
      this.prisma.salesOrderItem.aggregate({
        where: {
          productId,
          order: {
            organizationId,
            status: OrderStatus.COMPLETED,
            createdAt: { gte: addDays(new Date(), -30) },
            ...locationFilter,
          },
        },
        _sum: { quantity: true },
      }),
    ]);

    if (!product) throw new BadRequestException('Product not found in this organization.');

    const currentStock = toNum(currentLevels._sum.quantity);
    const incomingStock = toNum(currentLevels._sum.incoming);
    const soldIn30Days = toNum(salesVelocity._sum.quantity);
    const avgDailySales = soldIn30Days / 30;
    const totalCost = reorderQty * (unitCost || toNum(product.costPrice));
    const projectedStockAfterReorder = currentStock + reorderQty;
    const projectedDaysRemaining = avgDailySales > 0
      ? Math.floor(projectedStockAfterReorder / avgDailySales)
      : null;

    return {
      scenario: 'REORDER',
      _label: 'SIMULATION',
      WARNING: 'THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA',
      baseline: {
        productId,
        productName: product.name,
        sku: product.sku,
        currentStock,
        incomingStock,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        currentDaysRemaining: avgDailySales > 0 ? Math.floor(currentStock / avgDailySales) : 'N/A',
      },
      assumptions: [
        `Reorder quantity: ${reorderQty} units.`,
        `Unit cost used: ${unitCost || toNum(product.costPrice)}.`,
        'Daily sales velocity based on last 30 days.',
        'No demand changes assumed.',
      ],
      simulatedInputs: { reorderQty, unitCost: unitCost || toNum(product.costPrice) },
      calculatedOutcome: {
        totalReorderCost: Math.round(totalCost),
        projectedStockAfterReorder,
        projectedDaysRemaining: projectedDaysRemaining ?? 'No sales history',
      },
      differences: {
        additionalStock: reorderQty,
        additionalDaysOfStock: projectedDaysRemaining !== null && avgDailySales > 0
          ? projectedDaysRemaining - Math.floor(currentStock / avgDailySales)
          : 0,
      },
      caveats: [
        'NO Purchase Order has been created. This is a simulation only.',
        'Actual procurement must go through the standard purchasing workflow.',
        'No inventory records have been modified.',
      ],
    };
  }

  private buildLocationFilter(locationIds: string[] | null): Record<string, unknown> {
    if (locationIds === null) return {};
    if (locationIds.length === 0) return { locationId: { in: [] as string[] } };
    return { locationId: { in: locationIds } };
  }
}
