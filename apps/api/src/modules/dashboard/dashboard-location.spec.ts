/**
 * Stage 18 Remediation — Dashboard Location Security & Authorization Tests
 *
 * Coverage:
 *  1.  GET /dashboard without REPORTS.VIEW permission → PermissionGuard throws ForbiddenException
 *  2.  locationIds=[L1] — revenue payment query uses invoice.order.locationId filter
 *  3.  locationIds=[L1] — overdue invoice query uses order.locationId filter
 *  4.  locationIds=[L1] — pending PO query uses direct locationId filter
 *  5.  locationIds=[] — todayRevenue uses deny-all payment location filter
 *  6.  locationIds=[] — monthRevenue uses deny-all payment location filter
 *  7.  locationIds=[] — activeOrders = 0 (deny-all order filter)
 *  8.  locationIds=[] — overdueInvoices = 0 (deny-all invoice filter)
 *  9.  locationIds=[] — pendingPOs = 0 (deny-all PO filter)
 * 10.  lowStockCount is not capped by the preview size (12 low-stock → count=12, preview≤8)
 * 11.  lowStockCount works correctly when >8 items below threshold
 */

import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DashboardService } from './dashboard.service';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { DashboardController } from './dashboard.controller';

const ORG = 'org-1';
const L1 = 'loc-1';

function makePrismaForLocation(opts: {
  paymentSum?: number;
  activeOrders?: number;
  overdueInvoices?: number;
  pendingPOs?: number;
  lowStockItems?: Array<{ id: string; quantity: number; product: { id: string; name: string; sku: string; lowStockAlert: number }; location: { id: string; name: string } }>;
} = {}) {
  return {
    payment: {
      aggregate: jest.fn(async () => {
        return { _sum: { amount: opts.paymentSum ?? 0 } };
      }),
    },
    salesOrder: {
      count: jest.fn(async () => opts.activeOrders ?? 0),
      findMany: jest.fn(async () => []),
    },
    inventoryLevel: {
      findMany: jest.fn(async () => opts.lowStockItems ?? []),
    },
    task: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    purchaseOrder: {
      count: jest.fn(async () => opts.pendingPOs ?? 0),
      findMany: jest.fn(async () => []),
    },
    invoice: {
      count: jest.fn(async () => opts.overdueInvoices ?? 0),
    },
    customer: {
      count: jest.fn(async () => 0),
    },
  };
}

// ── 1: Authorization guard ────────────────────────────────────────────────────

describe('DashboardController — authorization', () => {
  it('1: user without REPORTS.VIEW throws ForbiddenException', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['reports:view']),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const user = { permissions: ['customers:view'], organizationId: ORG, locationIds: null };
    const mockContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    };
    expect(() => guard.canActivate(mockContext as never)).toThrow(ForbiddenException);
  });
});

// ── 2–4: Location filter shape validation ────────────────────────────────────

describe('DashboardService — location filter propagation', () => {
  it('2: locationIds=[L1] — payment aggregate uses invoice.order.locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, [L1]);
    const payCall = (prisma.payment.aggregate as jest.Mock).mock.calls[0][0];
    expect(payCall.where.invoice).toEqual({ order: { locationId: { in: [L1] } } });
  });

  it('3: locationIds=[L1] — invoice count uses order.locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, [L1]);
    const invCall = (prisma.invoice.count as jest.Mock).mock.calls[0][0];
    expect(invCall.where.order).toEqual({ locationId: { in: [L1] } });
  });

  it('4: locationIds=[L1] — purchaseOrder count uses direct locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, [L1]);
    const poCall = (prisma.purchaseOrder.count as jest.Mock).mock.calls[0][0];
    expect(poCall.where.locationId).toEqual({ in: [L1] });
  });
});

// ── 5–9: locationIds=[] deny-all ─────────────────────────────────────────────

describe('DashboardService — locationIds=[] deny-all semantics', () => {
  it('5: locationIds=[] — payment aggregate uses deny-all invoice.order.locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, []);
    const payCall = (prisma.payment.aggregate as jest.Mock).mock.calls[0][0];
    expect(payCall.where.invoice).toEqual({ order: { locationId: '__none__' } });
  });

  it('6: locationIds=[] — month revenue also uses deny-all payment filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, []);
    // 2nd payment.aggregate call = month revenue
    const monthCall = (prisma.payment.aggregate as jest.Mock).mock.calls[1][0];
    expect(monthCall.where.invoice).toEqual({ order: { locationId: '__none__' } });
  });

  it('7: locationIds=[] — salesOrder count uses deny-all locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, []);
    const orderCall = (prisma.salesOrder.count as jest.Mock).mock.calls[0][0];
    expect(orderCall.where.locationId).toBe('__none__');
  });

  it('8: locationIds=[] — invoice count uses deny-all order.locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, []);
    const invCall = (prisma.invoice.count as jest.Mock).mock.calls[0][0];
    expect(invCall.where.order).toEqual({ locationId: '__none__' });
  });

  it('9: locationIds=[] — purchaseOrder count uses deny-all locationId filter', async () => {
    const prisma = makePrismaForLocation();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, []);
    const poCall = (prisma.purchaseOrder.count as jest.Mock).mock.calls[0][0];
    expect(poCall.where.locationId).toBe('__none__');
  });
});

// ── 10–11: Low-stock count vs preview ────────────────────────────────────────

describe('DashboardService — lowStockCount independent of preview', () => {
  function makeLowStockItems(count: number, qty = 3, alert = 5) {
    return Array.from({ length: count }, (_, i) => ({
      id: `il-${i}`,
      quantity: qty,
      product: { id: `p-${i}`, name: `Product ${i}`, sku: `SKU-${i}`, lowStockAlert: alert },
      location: { id: 'loc-1', name: 'Main' },
    }));
  }

  it('10: 12 low-stock items → count=12, preview≤8', async () => {
    const prisma = makePrismaForLocation({
      lowStockItems: makeLowStockItems(12),
    });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.lowStockCount).toBe(12);
    expect(data.lowStockItems.length).toBeLessThanOrEqual(8);
  });

  it('11: 20 low-stock items → count=20, preview=8', async () => {
    const prisma = makePrismaForLocation({
      lowStockItems: makeLowStockItems(20),
    });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.lowStockCount).toBe(20);
    expect(data.lowStockItems.length).toBe(8);
  });

  it('threshold boundary: qty=4 alert=5 → low stock', async () => {
    const prisma = makePrismaForLocation({
      lowStockItems: [{ id: 'il-1', quantity: 4, product: { id: 'p-1', name: 'P', sku: 'S', lowStockAlert: 5 }, location: { id: 'l', name: 'L' } }],
    });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.lowStockCount).toBe(1);
  });

  it('threshold boundary: qty=6 alert=5 → not low stock', async () => {
    const prisma = makePrismaForLocation({
      lowStockItems: [{ id: 'il-1', quantity: 6, product: { id: 'p-1', name: 'P', sku: 'S', lowStockAlert: 5 }, location: { id: 'l', name: 'L' } }],
    });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.lowStockCount).toBe(0);
  });

  it('threshold: qty=15 alert=20 → low stock', async () => {
    const prisma = makePrismaForLocation({
      lowStockItems: [{ id: 'il-1', quantity: 15, product: { id: 'p-1', name: 'P', sku: 'S', lowStockAlert: 20 }, location: { id: 'l', name: 'L' } }],
    });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.lowStockCount).toBe(1);
  });
});
