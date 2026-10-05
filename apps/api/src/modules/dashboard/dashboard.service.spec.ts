/**
 * Stage 18 — Dashboard Service
 *
 * Coverage:
 *  1.  getStats — returns all KPI keys with numeric values
 *  2.  getStats — todayRevenue is sum of today's COMPLETED payments with amount > 0
 *  3.  getStats — monthVsPrevPercent is null when prevMonth revenue is 0
 *  4.  getStats — monthVsPrevPercent is positive % when month > prevMonth
 *  5.  getStats — monthVsPrevPercent is negative % when month < prevMonth
 *  6.  getStats — locationIds=null passes no location filter (org-wide)
 *  7.  getStats — locationIds=[] adds deny-all filter (no rows returned)
 *  8.  getStats — needsAttention includes OVERDUE_INVOICES when count > 0
 *  9.  getStats — needsAttention is empty when all counts are zero
 * 10.  getStats — org isolation: organizationId is passed to every query
 */

import { DashboardService } from './dashboard.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

const ORG = 'org-1';

const now = new Date();
const todayStart = new Date(now);
todayStart.setHours(0, 0, 0, 0);

function makePrisma(opts: {
  todayPaymentSum?: number;
  monthPaymentSum?: number;
  prevMonthPaymentSum?: number;
  activeOrders?: number;
  lowStockItems?: Array<{ id: string; quantity: number; product: { id: string; name: string; sku: string; lowStockAlert: number }; location: { id: string; name: string } }>;
  openTasks?: number;
  pendingPOs?: number;
  overdueInvoices?: number;
  newCustomers?: number;
  outstandingCustomers?: number;
  recentSales?: object[];
  recentTasks?: object[];
  pendingPOItems?: object[];
  overdueTaskCount?: number;
} = {}) {
  const {
    todayPaymentSum = 50_000,
    monthPaymentSum = 800_000,
    prevMonthPaymentSum = 500_000,
    activeOrders = 3,
    lowStockItems = [],
    openTasks = 5,
    pendingPOs = 2,
    overdueInvoices = 0,
    newCustomers = 10,
    outstandingCustomers = 4,
    recentSales = [],
    recentTasks = [],
    pendingPOItems = [],
    overdueTaskCount = 0,
  } = opts;

  let paymentCallCount = 0;
  let taskCountCallCount = 0;

  return {
    payment: {
      aggregate: jest.fn(async () => {
        paymentCallCount++;
        // 1st call = todayRevenue, 2nd = monthRevenue, 3rd = prevMonthRevenue
        const sum =
          paymentCallCount === 1 ? todayPaymentSum
          : paymentCallCount === 2 ? monthPaymentSum
          : prevMonthPaymentSum;
        return { _sum: { amount: sum } };
      }),
    },
    salesOrder: {
      count: jest.fn(async () => activeOrders),
      findMany: jest.fn(async () => recentSales),
    },
    inventoryLevel: {
      findMany: jest.fn(async () => lowStockItems),
    },
    task: {
      count: jest.fn(async () => {
        taskCountCallCount++;
        // 1st call = openTasks (status IN_PROGRESS/TODO), 2nd = overdueTaskCount (+ dueDate < now)
        return taskCountCallCount === 1 ? openTasks : overdueTaskCount;
      }),
      findMany: jest.fn(async () => recentTasks),
    },
    purchaseOrder: {
      count: jest.fn(async () => pendingPOs),
      findMany: jest.fn(async () => pendingPOItems),
    },
    invoice: {
      count: jest.fn(async () => overdueInvoices),
    },
    customer: {
      count: jest.fn(async (args: { where: Record<string, unknown> }) => {
        if (args.where.createdAt) return newCustomers;
        return outstandingCustomers;
      }),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DashboardService — getStats', () => {
  it('1: returns all KPI keys with numeric values', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    const kpis = data.kpis;
    expect(typeof kpis.todayRevenue).toBe('number');
    expect(typeof kpis.activeOrders).toBe('number');
    expect(typeof kpis.lowStockCount).toBe('number');
    expect(typeof kpis.openTasks).toBe('number');
    expect(typeof kpis.pendingPOs).toBe('number');
    expect(typeof kpis.overdueInvoices).toBe('number');
    expect(typeof kpis.newCustomersThisMonth).toBe('number');
    expect(typeof kpis.customersWithOutstanding).toBe('number');
    expect(typeof kpis.monthRevenue).toBe('number');
  });

  it('2: todayRevenue equals sum of today COMPLETED payments', async () => {
    const prisma = makePrisma({ todayPaymentSum: 75_000 });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.todayRevenue).toBe(75_000);
  });

  it('3: monthVsPrevPercent is null when prevMonth revenue is 0', async () => {
    const prisma = makePrisma({ prevMonthPaymentSum: 0 });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.monthVsPrevPercent).toBeNull();
  });

  it('4: monthVsPrevPercent is positive when current month > prevMonth', async () => {
    const prisma = makePrisma({ monthPaymentSum: 1_000_000, prevMonthPaymentSum: 500_000 });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.monthVsPrevPercent).toBe(100);
  });

  it('5: monthVsPrevPercent is negative when current month < prevMonth', async () => {
    const prisma = makePrisma({ monthPaymentSum: 250_000, prevMonthPaymentSum: 500_000 });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.kpis.monthVsPrevPercent).toBe(-50);
  });

  it('6: locationIds=null passes no location filter to salesOrder query', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, null);
    const orderCountCall = (prisma.salesOrder.count as jest.Mock).mock.calls[0][0];
    expect(orderCountCall.where.locationId).toBeUndefined();
  });

  it('7: locationIds=[] uses deny-all pattern (locationId: "__none__")', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, []);
    const orderCountCall = (prisma.salesOrder.count as jest.Mock).mock.calls[0][0];
    expect(orderCountCall.where.locationId).toBe('__none__');
  });

  it('8: needsAttention includes OVERDUE_INVOICES when count > 0', async () => {
    const prisma = makePrisma({ overdueInvoices: 3 });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    const item = data.needsAttention.find((n) => n.type === 'OVERDUE_INVOICES');
    expect(item).toBeDefined();
    expect(item!.count).toBe(3);
    expect(item!.link).toContain('/invoices');
  });

  it('9: needsAttention is empty when all attention counts are zero', async () => {
    const prisma = makePrisma({
      overdueInvoices: 0,
      pendingPOs: 0,
      lowStockItems: [],
      outstandingCustomers: 0,
      recentTasks: [],
    });
    const svc = new DashboardService(prisma as never);
    const { data } = await svc.getStats(ORG, null);
    expect(data.needsAttention).toHaveLength(0);
  });

  it('10: organizationId is passed in WHERE to all major queries', async () => {
    const prisma = makePrisma();
    const svc = new DashboardService(prisma as never);
    await svc.getStats(ORG, null);

    const paymentCall = (prisma.payment.aggregate as jest.Mock).mock.calls[0][0];
    expect(paymentCall.where.organizationId).toBe(ORG);

    const orderCall = (prisma.salesOrder.count as jest.Mock).mock.calls[0][0];
    expect(orderCall.where.organizationId).toBe(ORG);

    const taskCall = (prisma.task.count as jest.Mock).mock.calls[0][0];
    expect(taskCall.where.organizationId).toBe(ORG);

    const invoiceCall = (prisma.invoice.count as jest.Mock).mock.calls[0][0];
    expect(invoiceCall.where.organizationId).toBe(ORG);
  });
});
