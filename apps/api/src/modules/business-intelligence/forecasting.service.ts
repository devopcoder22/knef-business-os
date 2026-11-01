import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { OrderStatus } from '@prisma/client';
import type { ForecastResult, InventoryDepletionForecast, DailyProjection } from './types/bi.types';

const INSUFFICIENT: ForecastResult = {
  metric: '',
  historicalWindowDays: 0,
  forecastHorizonDays: 0,
  method: 'INSUFFICIENT_DATA',
  projectedValue: null,
  confidence: 'NONE',
  assumptions: [],
  limitations: ['Insufficient historical data to generate a forecast.'],
  dataPoints: 0,
  _label: 'FORECAST',
};

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Simple n-period moving average
function movingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Weighted moving average: more recent weeks weigh heavier
function weightedMovingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const n = values.length;
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < n; i++) {
    const weight = i + 1;
    weightedSum += values[i] * weight;
    totalWeight += weight;
  }
  return weightedSum / totalWeight;
}

@Injectable()
export class ForecastingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Sales Forecast ─────────────────────────────────────────────────────────

  async forecastSales(
    organizationId: string,
    locationIds: string[] | null,
    forecastHorizonDays: number = 30,
    historicalWindowDays: number = 90,
  ): Promise<ForecastResult> {
    const MINIMUM_DAYS = 14;

    if (historicalWindowDays < MINIMUM_DAYS) {
      return { ...INSUFFICIENT, metric: 'sales_revenue', historicalWindowDays, forecastHorizonDays };
    }

    const end = new Date();
    const start = addDays(end, -historicalWindowDays);

    const locationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
          ? { locationId: { in: [] as string[] } }
          : { locationId: { in: locationIds } };

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        organizationId,
        status: OrderStatus.COMPLETED,
        createdAt: { gte: start, lt: end },
        ...locationFilter,
      },
      select: { totalAmount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (orders.length < 7) {
      return {
        ...INSUFFICIENT,
        metric: 'sales_revenue',
        historicalWindowDays,
        forecastHorizonDays,
        dataPoints: orders.length,
        limitations: [`Only ${orders.length} completed orders found in the historical window. Minimum 7 required.`],
      };
    }

    // Bucket into weeks
    const weeklyTotals: number[] = [];
    let currentWeekStart = new Date(start);
    while (currentWeekStart < end) {
      const weekEnd = addDays(currentWeekStart, 7);
      const weekRevenue = orders
        .filter((o) => o.createdAt >= currentWeekStart && o.createdAt < weekEnd)
        .reduce((s, o) => s + toNum(o.totalAmount), 0);
      weeklyTotals.push(weekRevenue);
      currentWeekStart = weekEnd;
    }

    if (weeklyTotals.length < 2) {
      return { ...INSUFFICIENT, metric: 'sales_revenue', historicalWindowDays, forecastHorizonDays, dataPoints: orders.length };
    }

    const wma = weightedMovingAverage(weeklyTotals);
    const projectedWeekly = wma;
    const projectedTotal = (projectedWeekly / 7) * forecastHorizonDays;

    // Daily projections
    const dailyAvg = projectedWeekly / 7;
    const dailyProjections: DailyProjection[] = [];
    for (let i = 0; i < forecastHorizonDays; i++) {
      dailyProjections.push({
        date: addDays(end, i).toISOString().slice(0, 10),
        projected: Math.round(dailyAvg),
      });
    }

    const confidence = orders.length >= 60 ? 'MEDIUM' : 'LOW';

    return {
      metric: 'sales_revenue',
      historicalWindowDays,
      forecastHorizonDays,
      method: 'WEIGHTED_MOVING_AVERAGE',
      projectedValue: Math.round(projectedTotal),
      confidence,
      assumptions: [
        'Current demand patterns continue at similar pace.',
        'No major seasonal events or disruptions are assumed.',
        `Based on ${orders.length} completed orders over the last ${historicalWindowDays} days.`,
      ],
      limitations: [
        'Does not account for seasonality.',
        'Does not account for planned promotions or external events.',
        'Accuracy improves with more historical data.',
      ],
      dataPoints: orders.length,
      dailyProjections,
      _label: 'FORECAST',
    };
  }

  // ─── Inventory Depletion Forecast ────────────────────────────────────────────

  async forecastInventoryDepletion(
    organizationId: string,
    locationIds: string[] | null,
    productIds?: string[],
  ): Promise<InventoryDepletionForecast[]> {
    const thirtyDaysAgo = addDays(new Date(), -30);

    const locationFilter =
      locationIds === null
        ? {}
        : locationIds.length === 0
          ? { locationId: { in: [] as string[] } }
          : { locationId: { in: locationIds } };

    const [salesVelocity, levels] = await Promise.all([
      this.prisma.salesOrderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            organizationId,
            status: OrderStatus.COMPLETED,
            createdAt: { gte: thirtyDaysAgo },
            ...locationFilter,
          },
          ...(productIds ? { productId: { in: productIds } } : {}),
        },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryLevel.findMany({
        where: {
          product: { organizationId },
          ...locationFilter,
          ...(productIds ? { productId: { in: productIds } } : {}),
        },
        select: {
          productId: true,
          quantity: true,
          product: { select: { name: true } },
        },
      }),
    ]);

    // Aggregate stock by product
    const stockMap = new Map<string, { name: string; totalQty: number }>();
    for (const lvl of levels) {
      const existing = stockMap.get(lvl.productId);
      if (existing) {
        existing.totalQty += lvl.quantity;
      } else {
        stockMap.set(lvl.productId, { name: lvl.product.name, totalQty: lvl.quantity });
      }
    }

    const results: InventoryDepletionForecast[] = [];
    for (const sv of salesVelocity) {
      const stock = stockMap.get(sv.productId);
      if (!stock) continue;
      const soldIn30Days = toNum(sv._sum.quantity);
      const avgDailySales = soldIn30Days / 30;
      const daysRemaining = avgDailySales > 0 ? Math.floor(stock.totalQty / avgDailySales) : null;
      const projectedStockoutDate = daysRemaining !== null
        ? addDays(new Date(), daysRemaining).toISOString().slice(0, 10)
        : null;

      results.push({
        productId: sv.productId,
        name: stock.name,
        currentStock: stock.totalQty,
        avgDailySales,
        daysRemaining,
        projectedStockoutDate,
        _label: 'FORECAST',
      });
    }

    return results.sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
  }
}
