/**
 * InventoryService.getHealthReport() — unit tests (Phase 24P)
 *
 * Covers all 6 classification categories with deterministic fixtures.
 */

import { InventoryService } from './inventory.service';

const PRODUCT_BASE = {
  id: 'p1',
  name: 'Widget',
  sku: 'WDG-001',
  lowStockAlert: 10,
  brandId: null,
  categoryId: null,
};
const LOCATION = { id: 'loc-1', name: 'Warehouse' };

function makeLevel(productId: string, qty: number, lowStockAlert = 10) {
  return {
    productId,
    quantity: qty,
    product: { ...PRODUCT_BASE, id: productId, lowStockAlert },
    location: LOCATION,
  };
}

function makePrisma(levels: ReturnType<typeof makeLevel>[], sales30: Record<string, number> = {}, sales90: Record<string, number> = {}) {
  return {
    inventoryLevel: {
      findMany: jest.fn(async () => levels),
    },
    salesOrderItem: {
      groupBy: jest.fn()
        .mockResolvedValueOnce(
          Object.entries(sales30).map(([productId, qty]) => ({ productId, _sum: { quantity: qty } })),
        )
        .mockResolvedValueOnce(
          Object.entries(sales90).map(([productId, qty]) => ({ productId, _sum: { quantity: qty } })),
        ),
    },
  };
}

function makeService(levels: ReturnType<typeof makeLevel>[], sales30: Record<string, number> = {}, sales90: Record<string, number> = {}) {
  const prisma = makePrisma(levels, sales30, sales90);
  const service = new InventoryService(prisma as never, { emit: jest.fn() } as never);
  return { service, prisma };
}

describe('InventoryService.getHealthReport() (Phase 24P)', () => {
  it('1: classifies STOCKOUT when quantity === 0', async () => {
    const { service } = makeService([makeLevel('p1', 0)]);
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('STOCKOUT');
    expect(result.summary.STOCKOUT).toBe(1);
  });

  it('2: classifies DEAD_STOCK when qty > 0 but no sales in 90 days', async () => {
    const { service } = makeService([makeLevel('p1', 50)], {}, {});
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('DEAD_STOCK');
    expect(result.summary.DEAD_STOCK).toBe(1);
  });

  it('3: DEAD_STOCK takes precedence over LOW_STOCK for zero-velocity item below alert', async () => {
    // qty=5, lowStockAlert=10 (would be LOW_STOCK) but no sales in 90 days
    const { service } = makeService([makeLevel('p1', 5, 10)], {}, {});
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('DEAD_STOCK');
  });

  it('4: classifies LOW_STOCK when qty <= lowStockAlert and has recent sales', async () => {
    const { service } = makeService([makeLevel('p1', 5, 10)], { p1: 15 }, { p1: 30 });
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('LOW_STOCK');
    expect(result.summary.LOW_STOCK).toBe(1);
  });

  it('5: classifies FAST_MOVING when avgDailySales >= 1 unit/day', async () => {
    // sold30d = 60 → avgDailySales = 2/day, qty=500 (not low)
    const { service } = makeService([makeLevel('p1', 500, 10)], { p1: 60 }, { p1: 100 });
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('FAST_MOVING');
    expect(result.summary.FAST_MOVING).toBe(1);
  });

  it('6: classifies OVERSTOCK when daysOfStock > 90 and avgDailySales > 0 but < 1/day', async () => {
    // sold30d = 3 → avgDailySales = 0.1/day; qty=100 → daysOfStock=1000
    const { service } = makeService([makeLevel('p1', 100, 10)], { p1: 3 }, { p1: 9 });
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('OVERSTOCK');
    expect(result.summary.OVERSTOCK).toBe(1);
  });

  it('7: classifies SLOW_MOVING when avgDailySales > 0 but low, daysOfStock <= 90', async () => {
    // sold30d = 20 → avgDailySales = 0.67/day; qty=50 → daysOfStock=75 (under 90)
    const { service } = makeService([makeLevel('p1', 50, 10)], { p1: 20 }, { p1: 50 });
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('SLOW_MOVING');
    expect(result.summary.SLOW_MOVING).toBe(1);
  });

  it('8: summary totals add up to items.length', async () => {
    const levels = [
      makeLevel('p1', 0),           // STOCKOUT
      makeLevel('p2', 50),          // DEAD_STOCK (no sales)
      makeLevel('p3', 5, 10),       // LOW_STOCK (has sales)
      makeLevel('p4', 500, 10),     // FAST_MOVING
      makeLevel('p5', 100, 10),     // OVERSTOCK
    ];
    const prisma = {
      inventoryLevel: { findMany: jest.fn(async () => levels) },
      salesOrderItem: {
        groupBy: jest.fn()
          // 30-day sales
          .mockResolvedValueOnce([
            { productId: 'p3', _sum: { quantity: 5 } },
            { productId: 'p4', _sum: { quantity: 60 } },
            { productId: 'p5', _sum: { quantity: 3 } },
          ])
          // 90-day sales
          .mockResolvedValueOnce([
            { productId: 'p3', _sum: { quantity: 15 } },
            { productId: 'p4', _sum: { quantity: 100 } },
            { productId: 'p5', _sum: { quantity: 9 } },
          ]),
      },
    };
    const service = new InventoryService(prisma as never, { emit: jest.fn() } as never);
    const result = await service.getHealthReport('org-1', {});
    const sumTotal = result.summary.STOCKOUT + result.summary.DEAD_STOCK + result.summary.LOW_STOCK +
      result.summary.FAST_MOVING + result.summary.OVERSTOCK + result.summary.SLOW_MOVING;
    expect(sumTotal).toBe(result.summary.total);
    expect(result.summary.total).toBe(5);
  });

  it('9: returns empty when no inventory levels found', async () => {
    const { service } = makeService([]);
    const result = await service.getHealthReport('org-1', {});
    expect(result.items).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it('10: DEAD_STOCK takes precedence over OVERSTOCK for zero-velocity item with high qty', async () => {
    // qty=1000, no sales in 90 days → would be OVERSTOCK if avgDailySales calculated, but DEAD_STOCK wins
    const { service } = makeService([makeLevel('p1', 1000, 10)], {}, {});
    const result = await service.getHealthReport('org-1', {});
    expect(result.items[0].classification).toBe('DEAD_STOCK');
  });
});
