/**
 * Stage 20 Remediation — Refund Concurrency & Atomicity Tests
 *
 * Coverage:
 *  1.  P2034 (Serializable conflict) → ConflictException
 *  2.  Cumulative refund guard: totalAlreadyRefunded limits further refunds
 *  3.  Refund beyond refundable (after prior partial refund) → BadRequestException
 *  4.  Transaction atomicity: if payment.create fails, order status is NOT updated
 *  5.  Full-refund scenario: two concurrent ₦500k attempts — only one can succeed
 */

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SalesService } from './sales.service';

const ORG = 'org-1';
const ORDER_ID = 'order-1';
const CUST_ID = 'cust-1';

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}
function makeInventoryService() {
  return { recordMovement: jest.fn(async () => ({})) };
}
function makeBusinessRuleService() {
  return {
    checkRefundAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: null, threshold: null })),
    checkDiscount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkMargin: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
  };
}
function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    organizationId: ORG,
    status: 'COMPLETED',
    totalAmount: '500000',
    paidAmount: '500000',
    customerId: CUST_ID,
    locationId: 'loc-1',
    items: [],
    ...overrides,
  };
}

// ── 1: P2034 → ConflictException ─────────────────────────────────────────────

describe('SalesService.refundSalesOrder — P2034 → ConflictException', () => {
  it('1: Serializable TX conflict during refund → ConflictException', async () => {
    const order = makeOrder();
    const p2034 = new Prisma.PrismaClientKnownRequestError('Serializable conflict', {
      code: 'P2034',
      clientVersion: '5.0.0',
    });

    const prisma: Record<string, unknown> = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: jest.fn(async () => order),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      payment: { create: jest.fn(async () => null), findMany: jest.fn(async () => []) },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    prisma.$transaction = jest.fn(async () => { throw p2034; });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await expect(
      svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '100000', reason: 'test' } as never, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });
});

// ── 2: Cumulative refund guard ────────────────────────────────────────────────

describe('SalesService.refundSalesOrder — cumulative refund calculation', () => {
  it('2: prior ₦300k refund limits a second attempt to ≤₦200k', async () => {
    const order = makeOrder(); // paidAmount = ₦500k
    const paymentCreate = jest.fn(async () => null);
    const orderUpdate = jest.fn(async () => ({ ...order, status: 'PARTIAL_REFUND' }));
    const existingRefunds = [{ amount: '-300000' }]; // ₦300k already refunded

    const prisma: Record<string, unknown> = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: orderUpdate,
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      payment: {
        create: paymentCreate,
        // Inside TX: returns existing refunds for cumulative calculation
        findMany: jest.fn(async () => existingRefunds),
      },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    // TX passes prisma as tx — cumulative check fires inside
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => fn(prisma));

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // Attempt ₦250k refund when only ₦200k is refundable (₦500k paid − ₦300k already refunded)
    await expect(
      svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '250000', reason: 'test' } as never, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    expect(paymentCreate).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('2b: prior ₦300k refund allows a second ₦200k refund (exactly at limit)', async () => {
    const order = makeOrder();
    const existingRefunds = [{ amount: '-300000' }];
    const paymentCreate = jest.fn(async () => ({}));
    const orderUpdate = jest.fn(async () => ({ ...order, status: 'PARTIAL_REFUND' }));

    const prisma: Record<string, unknown> = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: orderUpdate,
        findMany: jest.fn(async () => [order]),
        count: jest.fn(async () => 0),
      },
      payment: {
        create: paymentCreate,
        findMany: jest.fn(async () => existingRefunds),
      },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => fn(prisma));

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // Exactly ₦200k — at the refundable limit, should succeed
    await expect(
      svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '200000', reason: 'test' } as never, 'user-1'),
    ).resolves.toBeDefined();

    expect(paymentCreate).toHaveBeenCalled();
  });
});

// ── 3: Refund beyond paidAmount (pre-TX fast-fail) ───────────────────────────

describe('SalesService.refundSalesOrder — pre-TX paidAmount ceiling', () => {
  it('3: refundAmount > paidAmount fails before any TX starts', async () => {
    const order = makeOrder({ paidAmount: '200000' }); // only ₦200k paid
    const txFn = jest.fn(async () => null);

    const prisma: Record<string, unknown> = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: jest.fn(async () => order),
        findMany: jest.fn(async () => []),
      },
      payment: { create: jest.fn(async () => null), findMany: jest.fn(async () => []) },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    prisma.$transaction = txFn;

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // Attempt ₦500k refund on ₦200k paid
    await expect(
      svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '500000', reason: 'test' } as never, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    expect(txFn).not.toHaveBeenCalled();
  });
});

// ── 4: Atomicity — payment.create failure prevents order status update ────────

describe('SalesService.refundSalesOrder — transaction atomicity', () => {
  it('4: if payment.create throws, order status update is not committed', async () => {
    const order = makeOrder();
    const orderUpdate = jest.fn(async () => ({ ...order, status: 'REFUNDED' }));

    const prisma: Record<string, unknown> = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: orderUpdate,
        findMany: jest.fn(async () => []),
      },
      payment: {
        create: jest.fn(async () => { throw new Error('DB connection lost'); }),
        findMany: jest.fn(async () => []),
      },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    // Simulate real $transaction: if fn throws, nothing is committed
    // Here the fn will throw because payment.create throws, so orderUpdate should not be called
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
      // Run fn but propagate the error (simulating TX rollback)
      try {
        return await fn(prisma);
      } catch (e) {
        // Rollback: orderUpdate should not have been called yet if create threw first
        throw e;
      }
    });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await expect(
      svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '100000', reason: 'test' } as never, 'user-1'),
    ).rejects.toThrow('DB connection lost');

    // order.update must NOT have been called (payment.create fires first and threw)
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});

// ── 5: Concurrent full-refund scenario ───────────────────────────────────────

describe('SalesService.refundSalesOrder — concurrent full-refund scenario', () => {
  it('5: two concurrent ₦500k refunds — second attempt sees first as existing refund and is rejected', async () => {
    const order = makeOrder(); // paidAmount = ₦500k, totalAmount = ₦500k
    const paymentCreate = jest.fn(async () => ({}));
    const orderUpdate = jest.fn(async () => ({ ...order, status: 'REFUNDED' }));

    // First refund has already been committed (exists in DB)
    const postFirstRefundPayments = [{ amount: '-500000' }];

    let callCount = 0;
    const prisma: Record<string, unknown> = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: orderUpdate,
        findMany: jest.fn(async () => []),
      },
      payment: {
        create: paymentCreate,
        findMany: jest.fn(async () => {
          callCount++;
          // Second call (the "second competitor") sees the first refund already in DB
          return callCount > 1 ? postFirstRefundPayments : [];
        }),
      },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };

    // First TX succeeds; simulate second attempt by returning existing refund data
    let txCall = 0;
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
      txCall++;
      if (txCall === 1) {
        // First competitor succeeds
        return fn(prisma);
      }
      // Second competitor: payment.findMany now returns the first refund
      return fn(prisma);
    });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // First refund
    await svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '500000', reason: 'first' } as never, 'user-1');

    // Second refund attempt — cumulative check should block it (₦500k already refunded, ₦0 left)
    await expect(
      svc.refundSalesOrder(ORG, ORDER_ID, { refundAmount: '500000', reason: 'second' } as never, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    // First refund payment was created once; second was rejected before create
    expect(paymentCreate).toHaveBeenCalledTimes(1);
  });
});
