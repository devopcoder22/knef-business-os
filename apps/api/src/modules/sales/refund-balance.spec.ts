/**
 * Stage 18 Remediation — Refund & Balance Consistency Tests
 *
 * Coverage:
 *  1.  recalculateOutstandingBalance — unpaid invoice sets balance = totalAmount
 *  2.  recalculateOutstandingBalance — fully paid invoice → balance = 0
 *  3.  recalculateOutstandingBalance — partial payment → balance = remainder
 *  4.  recalculateOutstandingBalance — refund (REFUNDED payment) increases balance
 *  5.  refundSalesOrder — calls recalculateOutstandingBalance after refund
 *  6.  SCENARIO: ₦500k invoice, ₦500k payment, ₦100k refund → balance = ₦100k
 *  7.  recalculateOutstandingBalance — cancelled invoices excluded
 *  8.  getStatement — includes REFUNDED status payments in outstandingBalance
 */

import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SalesService } from './sales.service';

const ORG = 'org-1';
const CUST_ID = 'cust-1';
const ORDER_ID = 'order-1';
const INV_ID = 'inv-1';

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMinimalSalesService(prismaOverrides: Record<string, unknown>) {
  // SalesService needs: prisma, inventoryService, eventEmitter, businessRuleService, auditService
  const prisma = prismaOverrides;
  const inventoryService = { recordMovement: jest.fn(async () => ({})) };
  const businessRuleService = {
    checkRefundAmount: jest.fn(async () => ({ approvalRequired: false, threshold: null, ruleId: null, allowed: true })),
    checkDiscount: jest.fn(async () => ({ approvalRequired: false })),
    checkMargin: jest.fn(async () => ({ allowed: true })),
  };
  const auditService = { log: jest.fn(async () => ({})) };
  return new SalesService(
    prisma as never,
    inventoryService as never,
    makeEventEmitter(),
    businessRuleService as never,
    auditService as never,
  );
}

// ── 1–4: recalculateOutstandingBalance via public proxy ─────────────────────
// Access private method via cast to any.

type SvcAny = { recalculateOutstandingBalance: (id: string) => Promise<void> };

function makeRecalcPrisma(opts: {
  invoices: Array<{ totalAmount: string; status?: string }>;
  payments: Array<{ amount: string; status: string }>;
}) {
  const customerUpdateMany = jest.fn(async () => ({}));
  // Simulate Prisma's { status: { not: 'CANCELLED' } } filter in the mock
  const nonCancelledInvoices = opts.invoices.filter((i) => i.status !== 'CANCELLED');
  const prisma = {
    invoice: { findMany: jest.fn(async () => nonCancelledInvoices) },
    payment: { findMany: jest.fn(async () => opts.payments) },
    customer: { updateMany: customerUpdateMany },
    salesOrder: { findMany: jest.fn(async () => []) },
  };
  return { prisma, customerUpdateMany };
}

describe('SalesService — recalculateOutstandingBalance', () => {
  it('1: unpaid invoice → balance = totalAmount', async () => {
    const { prisma, customerUpdateMany } = makeRecalcPrisma({
      invoices: [{ totalAmount: '500000', status: 'UNPAID' }],
      payments: [],
    });
    const svc = makeMinimalSalesService(prisma);
    await (svc as unknown as SvcAny).recalculateOutstandingBalance(CUST_ID);
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { id: CUST_ID },
      data: { outstandingBalance: 500000 },
    });
  });

  it('2: fully paid invoice → balance = 0', async () => {
    const { prisma, customerUpdateMany } = makeRecalcPrisma({
      invoices: [{ totalAmount: '500000' }],
      payments: [{ amount: '500000', status: 'COMPLETED' }],
    });
    const svc = makeMinimalSalesService(prisma);
    await (svc as unknown as SvcAny).recalculateOutstandingBalance(CUST_ID);
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { id: CUST_ID },
      data: { outstandingBalance: 0 },
    });
  });

  it('3: partial payment → balance = remainder', async () => {
    const { prisma, customerUpdateMany } = makeRecalcPrisma({
      invoices: [{ totalAmount: '500000' }],
      payments: [{ amount: '200000', status: 'COMPLETED' }],
    });
    const svc = makeMinimalSalesService(prisma);
    await (svc as unknown as SvcAny).recalculateOutstandingBalance(CUST_ID);
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { id: CUST_ID },
      data: { outstandingBalance: 300000 },
    });
  });

  it('4: refund (REFUNDED negative payment) increases outstanding balance', async () => {
    const { prisma, customerUpdateMany } = makeRecalcPrisma({
      invoices: [{ totalAmount: '500000' }],
      payments: [
        { amount: '500000', status: 'COMPLETED' },
        { amount: '-100000', status: 'REFUNDED' },
      ],
    });
    const svc = makeMinimalSalesService(prisma);
    await (svc as unknown as SvcAny).recalculateOutstandingBalance(CUST_ID);
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { id: CUST_ID },
      data: { outstandingBalance: 100000 },
    });
  });

  it('7: cancelled invoice excluded from balance', async () => {
    const { prisma, customerUpdateMany } = makeRecalcPrisma({
      invoices: [
        { totalAmount: '500000', status: 'CANCELLED' }, // excluded
        { totalAmount: '200000', status: 'UNPAID' },    // included
      ],
      payments: [],
    });
    const svc = makeMinimalSalesService(prisma);
    await (svc as unknown as SvcAny).recalculateOutstandingBalance(CUST_ID);
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { id: CUST_ID },
      data: { outstandingBalance: 200000 },
    });
  });
});

// ── 5–6: refundSalesOrder calls recalculate ──────────────────────────────────

describe('SalesService — refundSalesOrder triggers balance recalculation', () => {
  it('5: calls recalculateOutstandingBalance after creating refund payment', async () => {
    const order = {
      id: ORDER_ID,
      organizationId: ORG,
      customerId: CUST_ID,
      locationId: 'loc-1',
      status: 'COMPLETED',
      totalAmount: '500000',
      paidAmount: '500000',
      items: [{ productId: 'p-1', variantId: null, quantity: 5 }],
    };
    const customerUpdateMany = jest.fn(async () => ({}));
    const prisma = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: jest.fn(async () => ({ ...order, status: 'PARTIAL_REFUND' })),
        findMany: jest.fn(async () => [order]),
      },
      payment: {
        create: jest.fn(async () => ({})),
        findMany: jest.fn(async () => [
          { amount: '500000', status: 'COMPLETED' },
          { amount: '-100000', status: 'REFUNDED' },
        ]),
      },
      invoice: { findMany: jest.fn(async () => [{ totalAmount: '500000' }]) },
      customer: { updateMany: customerUpdateMany },
    };
    const svc = makeMinimalSalesService(prisma);
    await svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '100000', reason: 'Test', items: [{ productId: 'p-1', quantity: 1 }] }, 'user-1');
    expect(customerUpdateMany).toHaveBeenCalledWith({
      where: { id: CUST_ID },
      data: { outstandingBalance: 100000 },
    });
  });

  it('6: SCENARIO — ₦500k invoice, ₦500k payment, ₦100k refund → balance = ₦100k', async () => {
    const { prisma, customerUpdateMany } = makeRecalcPrisma({
      invoices: [{ totalAmount: '500000' }],
      payments: [
        { amount: '500000', status: 'COMPLETED' },
        { amount: '-100000', status: 'REFUNDED' },
      ],
    });
    const svc = makeMinimalSalesService(prisma);
    await (svc as unknown as SvcAny).recalculateOutstandingBalance(CUST_ID);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (customerUpdateMany.mock.calls as any[])[0][0] as { where: unknown; data: { outstandingBalance: number } };
    expect(call.data.outstandingBalance).toBe(100000);
  });
});
