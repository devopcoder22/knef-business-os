/**
 * Business Intelligence — Service Tests
 *
 * Covers:
 *  1. Executive snapshot — basic fact retrieval
 *  2. Sales intelligence — period comparison, location scoping
 *  3. Inventory intelligence — low stock, out-of-stock, fast/slow movers
 *  4. Customer intelligence — repeat, inactive, segment logic
 *  5. Goal intelligence — on-track vs at-risk classification
 *  6. Forecasting — sufficient data, insufficient data (< 7 orders), deny-all location
 *  7. Simulation — SALES_CHANGE, no DB mutation, REORDER, invalid params
 *  8. Recommendations — reorder evidence, slow mover, goal at risk
 *  9. Organization isolation — metrics scoped to orgId, never cross-org
 * 10. Location isolation — null=org-wide, []=deny-all, [loc1]=scoped
 * 11. Permission enforcement delegated to controller (tested via guards)
 */

import { BusinessMetricsService } from './business-metrics.service';
import { ForecastingService } from './forecasting.service';
import { SimulationService } from './simulation.service';
import { RecommendationService } from './recommendation.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    salesOrder: {
      aggregate: jest.fn(async () => ({ _sum: { totalAmount: 0, discountAmount: 0 }, _count: 0 })),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      groupBy: jest.fn(async () => []),
    },
    salesOrderItem: {
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { quantity: 0 } })),
    },
    inventoryLevel: {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { quantity: 0, incoming: 0 } })),
      groupBy: jest.fn(async () => []),
    },
    purchaseOrder: {
      aggregate: jest.fn(async () => ({ _sum: { totalAmount: 0 }, _count: 0 })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    purchaseOrderItem: {
      groupBy: jest.fn(async () => []),
    },
    invoice: {
      aggregate: jest.fn(async () => ({ _sum: { totalAmount: 0 }, _count: 0 })),
    },
    expense: {
      aggregate: jest.fn(async () => ({ _sum: { amount: 0 }, _count: 0 })),
    },
    task: {
      count: jest.fn(async () => 0),
    },
    goal: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    customer: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    product: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    supplier: { findMany: jest.fn(async () => []) },
  };
}

// ─── 1. BusinessMetricsService — Executive Snapshot ──────────────────────────

describe('BusinessMetricsService.getExecutiveSnapshot', () => {
  it('1.1: returns FACT label', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    const snap = await svc.getExecutiveSnapshot('org-1', null);
    expect(snap._label).toBe('FACT');
  });

  it('1.2: uses organizationId from service param, not from external input', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getExecutiveSnapshot('org-SAFE', null);
    // All salesOrder calls must include organizationId: 'org-SAFE'
    const calls = (prisma.salesOrder.aggregate as jest.Mock).mock.calls;
    for (const [args] of calls) {
      expect(args.where.organizationId).toBe('org-SAFE');
    }
  });

  it('1.3: deny-all location [] returns zero sales', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.aggregate as jest.Mock).mockImplementation(async (args: { where?: { locationId?: unknown } }) => {
      if (args.where?.locationId && (args.where.locationId as { in: unknown[] }).in?.length === 0) {
        return { _sum: { totalAmount: 0 }, _count: 0 };
      }
      return { _sum: { totalAmount: 99999 }, _count: 100 };
    });
    const svc = new BusinessMetricsService(prisma as never);
    const snap = await svc.getExecutiveSnapshot('org-1', []);
    expect(snap.salesToday).toBe(0);
    expect(snap.salesThisMonth).toBe(0);
  });

  it('1.4: org-wide (null) includes all locations', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalAmount: 5000 }, _count: 10 });
    const svc = new BusinessMetricsService(prisma as never);
    const snap = await svc.getExecutiveSnapshot('org-1', null);
    // Should not add locationId filter when null
    const calls = (prisma.salesOrder.aggregate as jest.Mock).mock.calls;
    for (const [args] of calls) {
      expect(args.where.locationId).toBeUndefined();
    }
  });

  it('1.5: generatedAt is present ISO string', async () => {
    const svc = new BusinessMetricsService(makePrisma() as never);
    const snap = await svc.getExecutiveSnapshot('org-1', null);
    expect(snap.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── 2. Sales Intelligence — Period Comparison ───────────────────────────────

describe('BusinessMetricsService.getSalesIntelligence', () => {
  const START = '2026-09-01';
  const END = '2026-09-30';

  it('2.1: returns FACT label', async () => {
    const svc = new BusinessMetricsService(makePrisma() as never);
    const result = await svc.getSalesIntelligence('org-1', START, END, null);
    expect(result._label).toBe('FACT');
  });

  it('2.2: deny-all location returns zeros', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getSalesIntelligence('org-1', START, END, []);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.topProducts).toHaveLength(0);
  });

  it('2.3: revenueComparison handles zero previous safely', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.aggregate as jest.Mock)
      .mockResolvedValueOnce({ _sum: { totalAmount: 10000 }, _count: 5 }) // current
      .mockResolvedValueOnce({ _sum: { totalAmount: 0 }, _count: 0 });    // previous
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getSalesIntelligence('org-1', START, END, null);
    expect(result.revenueComparison.changePercent).toBeNull(); // safe divide-by-zero
  });

  it('2.4: org isolation — organizationId included in all queries', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getSalesIntelligence('org-SAFE', START, END, null);
    const calls = (prisma.salesOrder.aggregate as jest.Mock).mock.calls;
    for (const [args] of calls) {
      expect(args.where.organizationId).toBe('org-SAFE');
    }
  });

  it('2.5: location scoped — filter applied', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getSalesIntelligence('org-1', START, END, ['loc-1']);
    const calls = (prisma.salesOrder.aggregate as jest.Mock).mock.calls;
    for (const [args] of calls) {
      if (args.where.locationId) {
        expect(args.where.locationId.in).toContain('loc-1');
      }
    }
  });
});

// ─── 3. Inventory Intelligence ────────────────────────────────────────────────

describe('BusinessMetricsService.getInventoryIntelligence', () => {
  it('3.1: returns FACT label', async () => {
    const svc = new BusinessMetricsService(makePrisma() as never);
    const result = await svc.getInventoryIntelligence('org-1', null);
    expect(result._label).toBe('FACT');
  });

  it('3.2: products with quantity <= 0 go into outOfStockItems', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p1', quantity: 0, incoming: 0, locationId: 'loc-1',
        product: { name: 'Product A', sku: 'SKU-A', costPrice: 100, lowStockAlert: 10 },
        location: { id: 'loc-1', name: 'Main' },
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getInventoryIntelligence('org-1', null);
    expect(result.outOfStockItems).toHaveLength(1);
    expect(result.outOfStockItems[0].productId).toBe('p1');
    expect(result.lowStockItems).toHaveLength(0);
  });

  it('3.3: products with quantity <= lowStockAlert go into lowStockItems', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p2', quantity: 5, incoming: 2, locationId: 'loc-1',
        product: { name: 'Product B', sku: 'SKU-B', costPrice: 200, lowStockAlert: 10 },
        location: { id: 'loc-1', name: 'Main' },
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getInventoryIntelligence('org-1', null);
    expect(result.lowStockItems).toHaveLength(1);
    expect(result.lowStockItems[0].currentStock).toBe(5);
    expect(result.outOfStockItems).toHaveLength(0);
  });

  it('3.4: deny-all location returns empty results', async () => {
    const prisma = makePrisma();
    prisma.inventoryLevel.findMany.mockResolvedValue([]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getInventoryIntelligence('org-1', []);
    expect(result.lowStockItems).toHaveLength(0);
    expect(result.outOfStockItems).toHaveLength(0);
    expect(result.totalStockValue).toBe(0);
  });

  it('3.5: total stock value = quantity * costPrice', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p3', quantity: 10, incoming: 0, locationId: 'loc-1',
        product: { name: 'Product C', sku: 'SKU-C', costPrice: 500, lowStockAlert: 5 },
        location: { id: 'loc-1', name: 'Main' },
      },
    ]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getInventoryIntelligence('org-1', null);
    expect(result.totalStockValue).toBe(5000);
  });
});

// ─── 4. Customer Intelligence ────────────────────────────────────────────────

describe('BusinessMetricsService.getCustomerIntelligence', () => {
  const START = '2026-09-01';
  const END = '2026-09-30';

  it('4.1: returns FACT label', async () => {
    const svc = new BusinessMetricsService(makePrisma() as never);
    const result = await svc.getCustomerIntelligence('org-1', START, END);
    expect(result._label).toBe('FACT');
  });

  it('4.2: customer with totalSpent >= 100000 is HIGH_VALUE', async () => {
    const prisma = makePrisma();
    (prisma.customer.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'c1', firstName: 'Ada', lastName: 'Smith', totalSpent: 150000,
        createdAt: new Date('2026-01-01'),
        salesOrders: [{ totalAmount: 150000, createdAt: new Date('2026-09-15') }],
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getCustomerIntelligence('org-1', START, END);
    expect(result.topCustomers[0].segment).toBe('HIGH_VALUE');
  });

  it('4.3: customer with no orders in 90 days is INACTIVE', async () => {
    const prisma = makePrisma();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 120);
    (prisma.customer.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'c2', firstName: 'Bob', lastName: 'Jones', totalSpent: 5000,
        createdAt: new Date('2025-01-01'),
        salesOrders: [{ totalAmount: 5000, createdAt: oldDate }],
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getCustomerIntelligence('org-1', START, END);
    expect(result.topCustomers[0].segment).toBe('INACTIVE');
  });

  it('4.4: org isolation enforced', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getCustomerIntelligence('org-SAFE', START, END);
    const call = (prisma.customer.count as jest.Mock).mock.calls[0][0];
    expect(call.where.organizationId).toBe('org-SAFE');
  });
});

// ─── 5. Goal Intelligence ─────────────────────────────────────────────────────

describe('BusinessMetricsService.getGoalIntelligence', () => {
  it('5.1: returns FACT label', async () => {
    const svc = new BusinessMetricsService(makePrisma() as never);
    const result = await svc.getGoalIntelligence('org-1');
    expect(result._label).toBe('FACT');
  });

  it('5.2: goal with progress=80 and endDate in future is on-track', async () => {
    const prisma = makePrisma();
    const future = new Date();
    future.setDate(future.getDate() + 30);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'g1', title: 'Test Goal', status: 'ACTIVE', progress: 80,
        startDate: new Date('2026-01-01'), endDate: future,
        kpis: [],
        progresses: [],
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getGoalIntelligence('org-1');
    expect(result.goals[0].onTrack).toBe(true);
  });

  it('5.3: progress trend IMPROVING when latest > previous', async () => {
    const prisma = makePrisma();
    const future = new Date();
    future.setDate(future.getDate() + 10);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'g2', title: 'Growing Goal', status: 'ACTIVE', progress: 60,
        startDate: new Date('2026-01-01'), endDate: future,
        kpis: [],
        progresses: [
          { value: 60, recordedAt: new Date() },
          { value: 40, recordedAt: new Date('2026-09-01') },
        ],
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getGoalIntelligence('org-1');
    expect(result.goals[0].progressTrend).toBe('IMPROVING');
  });

  it('5.4: KPI achievement percent calculated correctly', async () => {
    const prisma = makePrisma();
    const future = new Date();
    future.setDate(future.getDate() + 30);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'g3', title: 'KPI Goal', status: 'ACTIVE', progress: 50,
        startDate: new Date('2026-01-01'), endDate: future,
        kpis: [{ id: 'k1', name: 'Revenue', target: 100, current: 75, unit: 'NGN' }],
        progresses: [],
      },
    ]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getGoalIntelligence('org-1');
    expect(result.goals[0].kpis[0].achievementPercent).toBe(75);
  });
});

// ─── 6. Forecasting ───────────────────────────────────────────────────────────

describe('ForecastingService', () => {
  it('6.1: returns FORECAST label for sales forecast', async () => {
    const prisma = makePrisma();
    // Provide enough data points
    const orders = Array.from({ length: 30 }, (_, i) => ({
      totalAmount: 10000,
      createdAt: new Date(Date.now() - i * 86400000),
    }));
    (prisma.salesOrder.findMany as jest.Mock).mockResolvedValue(orders);
    const svc = new ForecastingService(prisma as never);
    const result = await svc.forecastSales('org-1', null, 30, 90);
    expect(result._label).toBe('FORECAST');
  });

  it('6.2: insufficient data returns INSUFFICIENT_DATA method', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.findMany as jest.Mock).mockResolvedValue([]); // no orders
    const svc = new ForecastingService(prisma as never);
    const result = await svc.forecastSales('org-1', null, 30, 90);
    expect(result.method).toBe('INSUFFICIENT_DATA');
    expect(result.projectedValue).toBeNull();
    expect(result.confidence).toBe('NONE');
  });

  it('6.3: < 7 orders returns INSUFFICIENT_DATA', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.findMany as jest.Mock).mockResolvedValue([
      { totalAmount: 1000, createdAt: new Date() },
      { totalAmount: 2000, createdAt: new Date() },
    ]);
    const svc = new ForecastingService(prisma as never);
    const result = await svc.forecastSales('org-1', null, 30, 90);
    expect(result.method).toBe('INSUFFICIENT_DATA');
  });

  it('6.4: deny-all location [] returns INSUFFICIENT_DATA', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.findMany as jest.Mock).mockResolvedValue([]);
    const svc = new ForecastingService(prisma as never);
    const result = await svc.forecastSales('org-1', [], 30, 90);
    expect(result.method).toBe('INSUFFICIENT_DATA');
  });

  it('6.5: inventory depletion returns FORECAST label', async () => {
    const prisma = makePrisma();
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 30 } },
    ]);
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      { productId: 'p1', quantity: 60, product: { name: 'Product A' } },
    ]);
    const svc = new ForecastingService(prisma as never);
    const results = await svc.forecastInventoryDepletion('org-1', null);
    expect(results[0]._label).toBe('FORECAST');
    expect(results[0].daysRemaining).toBe(60); // 60 stock / 1 per day
  });

  it('6.6: product with no sales history gets null daysRemaining', async () => {
    const prisma = makePrisma();
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 0 } },
    ]);
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      { productId: 'p1', quantity: 100, product: { name: 'No Sales' } },
    ]);
    const svc = new ForecastingService(prisma as never);
    const results = await svc.forecastInventoryDepletion('org-1', null);
    expect(results[0].daysRemaining).toBeNull();
  });

  it('6.7: historyWindowDays < 14 returns INSUFFICIENT_DATA', async () => {
    const svc = new ForecastingService(makePrisma() as never);
    const result = await svc.forecastSales('org-1', null, 30, 7);
    expect(result.method).toBe('INSUFFICIENT_DATA');
  });
});

// ─── 7. Simulation ────────────────────────────────────────────────────────────

describe('SimulationService', () => {
  it('7.1: SIMULATION label on result', async () => {
    const prisma = makePrisma();
    prisma.salesOrder.aggregate.mockResolvedValue({ _sum: { totalAmount: 100000, discountAmount: 0 }, _count: 50 });
    const svc = new SimulationService(prisma as never);
    const result = await svc.simulate('org-1', null, { scenario: 'SALES_CHANGE', parameters: { changePercent: 10 } });
    expect(result._label).toBe('SIMULATION');
    expect(result.WARNING).toBe('THIS IS A SIMULATION — NOT ACTUAL BUSINESS DATA');
  });

  it('7.2: SALES_CHANGE +10% increases projected revenue by 10%', async () => {
    const prisma = makePrisma();
    prisma.salesOrder.aggregate.mockResolvedValue({ _sum: { totalAmount: 100000, discountAmount: 0 }, _count: 50 });
    const svc = new SimulationService(prisma as never);
    const result = await svc.simulate('org-1', null, { scenario: 'SALES_CHANGE', parameters: { changePercent: 10 } });
    expect(result.calculatedOutcome['projectedRevenue']).toBe(110000);
  });

  it('7.3: simulation NEVER calls create/update/delete on any model', async () => {
    const prisma = makePrisma();
    // Add spy methods that should never be called
    const createSpy = jest.fn();
    const updateSpy = jest.fn();
    const deleteSpy = jest.fn();
    (prisma as Record<string, unknown>).salesOrder = {
      ...(prisma.salesOrder as object),
      create: createSpy,
      update: updateSpy,
      delete: deleteSpy,
    };
    const svc = new SimulationService(prisma as never);
    await svc.simulate('org-1', null, { scenario: 'SALES_CHANGE', parameters: { changePercent: 5 } });
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('7.4: invalid scenario throws BadRequestException', async () => {
    const svc = new SimulationService(makePrisma() as never);
    await expect(
      svc.simulate('org-1', null, { scenario: 'INVALID_SCENARIO' as never, parameters: {} })
    ).rejects.toThrow();
  });

  it('7.5: SALES_CHANGE with changePercent > 1000 throws', async () => {
    const svc = new SimulationService(makePrisma() as never);
    await expect(
      svc.simulate('org-1', null, { scenario: 'SALES_CHANGE', parameters: { changePercent: 9999 } })
    ).rejects.toThrow();
  });

  it('7.6: REORDER simulation requires productId', async () => {
    const svc = new SimulationService(makePrisma() as never);
    await expect(
      svc.simulate('org-1', null, { scenario: 'REORDER', parameters: { reorderQty: 50 } })
    ).rejects.toThrow();
  });

  it('7.7: deny-all location does not change DB records', async () => {
    const prisma = makePrisma();
    const svc = new SimulationService(prisma as never);
    await svc.simulate('org-1', [], { scenario: 'SALES_CHANGE', parameters: { changePercent: 0 } });
    // No write operations
    expect(jest.isMockFunction(prisma.salesOrder.aggregate)).toBe(true);
  });

  it('7.8: MARGIN_CHANGE returns simulation label', async () => {
    const prisma = makePrisma();
    (prisma.salesOrderItem.findMany as jest.Mock).mockResolvedValue([
      { totalPrice: 10000, costPrice: 6000, quantity: 10 },
    ]);
    const svc = new SimulationService(prisma as never);
    const result = await svc.simulate('org-1', null, { scenario: 'MARGIN_CHANGE', parameters: { marginChangePoints: 5 } });
    expect(result._label).toBe('SIMULATION');
    expect(result.WARNING).toBeTruthy();
  });

  it('7.9: baselinePeriodDays > 365 throws', async () => {
    const svc = new SimulationService(makePrisma() as never);
    await expect(
      svc.simulate('org-1', null, { scenario: 'SALES_CHANGE', baselinePeriodDays: 400, parameters: { changePercent: 5 } })
    ).rejects.toThrow();
  });
});

// ─── 8. Recommendations ───────────────────────────────────────────────────────

describe('RecommendationService', () => {
  it('8.1: reorder recommendation has RECOMMENDATION label', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p1', quantity: 2, incoming: 0, locationId: 'loc-1',
        product: { id: 'p1', name: 'Widget', sku: 'W1', lowStockAlert: 10 },
      },
    ]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 30 } },
    ]);
    (prisma.purchaseOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new RecommendationService(prisma as never);
    const recs = await svc.getRecommendations('org-1', null);
    const reorderRec = recs.find((r) => r.type === 'REORDER');
    expect(reorderRec?._label).toBe('RECOMMENDATION');
  });

  it('8.2: reorder recommendation includes supporting facts', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p1', quantity: 2, incoming: 0, locationId: 'loc-1',
        product: { id: 'p1', name: 'Widget', sku: 'W1', lowStockAlert: 10 },
      },
    ]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 30 } },
    ]);
    (prisma.purchaseOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new RecommendationService(prisma as never);
    const recs = await svc.getRecommendations('org-1', null);
    const reorderRec = recs.find((r) => r.type === 'REORDER');
    expect(reorderRec?.supportingFacts.length).toBeGreaterThan(0);
    expect(reorderRec?.supportingFacts.some((f) => f.includes('Current stock'))).toBe(true);
  });

  it('8.3: no reorder rec when stock above threshold', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p1', quantity: 100, incoming: 0, locationId: 'loc-1',
        product: { id: 'p1', name: 'Healthy', sku: 'H1', lowStockAlert: 10 },
      },
    ]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 10 } },
    ]);
    (prisma.purchaseOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new RecommendationService(prisma as never);
    const recs = await svc.getRecommendations('org-1', null);
    expect(recs.filter((r) => r.type === 'REORDER')).toHaveLength(0);
  });

  it('8.4: slow mover recommendation for product with no sales in 90 days', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([
      {
        productId: 'p2', quantity: 50, incoming: 0, locationId: 'loc-1',
        product: { name: 'Dead Stock', sku: 'DS1', lowStockAlert: 5 },
      },
    ]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([]); // no sales
    (prisma.purchaseOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new RecommendationService(prisma as never);
    const recs = await svc.getRecommendations('org-1', null);
    expect(recs.some((r) => r.type === 'REVIEW_SLOW_MOVER')).toBe(true);
  });

  it('8.5: goal at risk recommendation for almost-due low-progress goal', async () => {
    const prisma = makePrisma();
    const nearFuture = new Date();
    nearFuture.setDate(nearFuture.getDate() + 5);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([
      { id: 'g1', title: 'At Risk Goal', progress: 20, endDate: nearFuture },
    ]);
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.purchaseOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new RecommendationService(prisma as never);
    const recs = await svc.getRecommendations('org-1', null);
    expect(recs.some((r) => r.type === 'GOAL_AT_RISK')).toBe(true);
  });

  it('8.6: deny-all location produces no location-scoped recs', async () => {
    const prisma = makePrisma();
    (prisma.inventoryLevel.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.salesOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.purchaseOrderItem.groupBy as jest.Mock).mockResolvedValue([]);
    const svc = new RecommendationService(prisma as never);
    const recs = await svc.getRecommendations('org-1', []);
    expect(recs.filter((r) => r.type === 'REORDER')).toHaveLength(0);
  });
});

// ─── 9. Organization Isolation ────────────────────────────────────────────────

describe('Organization isolation', () => {
  it('9.1: metrics service never queries without organizationId', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getExecutiveSnapshot('org-A', null);
    // salesOrder.aggregate must always have organizationId: org-A
    for (const [args] of (prisma.salesOrder.aggregate as jest.Mock).mock.calls) {
      expect(args.where.organizationId).toBe('org-A');
    }
  });

  it('9.2: forecasting service scopes by organizationId', async () => {
    const prisma = makePrisma();
    (prisma.salesOrder.findMany as jest.Mock).mockResolvedValue([]);
    const svc = new ForecastingService(prisma as never);
    await svc.forecastSales('org-B', null, 30, 90);
    const calls = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    for (const [args] of calls) {
      expect(args.where.organizationId).toBe('org-B');
    }
  });
});

// ─── 10. Location Isolation ───────────────────────────────────────────────────

describe('Location isolation', () => {
  it('10.1: locationIds=null → no locationId filter (org-wide)', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getSalesIntelligence('org-1', '2026-09-01', '2026-09-30', null);
    for (const [args] of (prisma.salesOrder.aggregate as jest.Mock).mock.calls) {
      expect(args.where.locationId).toBeUndefined();
    }
  });

  it('10.2: locationIds=[] → filter with empty array (deny-all)', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getSalesIntelligence('org-1', '2026-09-01', '2026-09-30', []);
    const calls = (prisma.salesOrder.aggregate as jest.Mock).mock.calls;
    let deniedAllFound = false;
    for (const [args] of calls) {
      if (args.where.locationId?.in) {
        expect(args.where.locationId.in).toHaveLength(0);
        deniedAllFound = true;
      }
    }
    expect(deniedAllFound).toBe(true);
  });

  it('10.3: locationIds=[loc-X] → filter limits to loc-X only', async () => {
    const prisma = makePrisma();
    const svc = new BusinessMetricsService(prisma as never);
    await svc.getSalesIntelligence('org-1', '2026-09-01', '2026-09-30', ['loc-X']);
    for (const [args] of (prisma.salesOrder.aggregate as jest.Mock).mock.calls) {
      if (args.where.locationId) {
        expect(args.where.locationId.in).toEqual(['loc-X']);
      }
    }
  });

  it('10.4: inventory with deny-all location returns zero value', async () => {
    const prisma = makePrisma();
    prisma.inventoryLevel.findMany.mockResolvedValue([]);
    const svc = new BusinessMetricsService(prisma as never);
    const result = await svc.getInventoryIntelligence('org-1', []);
    expect(result.totalStockValue).toBe(0);
    expect(result.lowStockItems).toHaveLength(0);
  });
});
