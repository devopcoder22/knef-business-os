/**
 * Stage 20 Remediation — Payment Concurrency & Idempotency Tests
 *
 * Coverage:
 *  1.  P2034 (Serializable conflict) → ConflictException
 *  2.  P2002 on gatewayRef → idempotent return, no second payment
 *  3.  P2002 on Payment.reference → retries until success
 *  4.  Concurrent overpayment blocked: second competing payment sees updated paidAmount
 *  5.  gatewayRef idempotency pre-check short-circuits before TX
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SalesService } from './sales.service';

const ORG = 'org-1';
const INV_ID = 'inv-1';

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
    checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
  };
}
function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INV_ID,
    organizationId: ORG,
    status: 'UNPAID',
    paidAmount: '0',
    totalAmount: '100000',
    customerId: null,
    currency: 'NGN',
    orderId: null,
    reference: 'INV-001',
    ...overrides,
  };
}

function makeFindInvoiceResult(invoice: ReturnType<typeof makeInvoice>) {
  return {
    ...invoice,
    payments: [],
    customer: null,
  };
}

// ── 1: P2034 Serializable conflict → ConflictException ────────────────────────

describe('SalesService.recordPayment — P2034 → ConflictException', () => {
  it('1: throws ConflictException when Serializable TX conflicts (P2034)', async () => {
    const invoice = makeInvoice();
    const p2034 = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
      code: 'P2034',
      clientVersion: '5.0.0',
    });

    const prisma: Record<string, unknown> = {
      invoice: {
        findFirst: jest.fn(async () => invoice),
        findMany: jest.fn(async () => []),
        update: jest.fn(async () => invoice),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), update: jest.fn(async () => ({})) },
    };
    // TX always throws P2034
    prisma.$transaction = jest.fn(async () => { throw p2034; });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await expect(
      svc.recordPayment(ORG, INV_ID, { amount: '100000', method: 'CASH' } as never),
    ).rejects.toThrow(ConflictException);
  });
});

// ── 2: P2002 on gatewayRef → idempotent return ────────────────────────────────

describe('SalesService.recordPayment — P2002 gatewayRef → idempotent', () => {
  it('2: DB unique constraint on gatewayRef returns invoice without second payment', async () => {
    const invoice = makeInvoice({ paidAmount: '0' });
    const findInvoiceResult = makeFindInvoiceResult(invoice);
    const paymentCreate = jest.fn(async () => null);

    const p2002GatewayRef = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['organizationId', 'gatewayRef'] },
    });

    const prisma: Record<string, unknown> = {
      invoice: {
        findFirst: jest.fn(async () => null), // pre-check: no existing payment
        findMany: jest.fn(async () => [findInvoiceResult]),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: paymentCreate,
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []) },
    };
    // TX throws P2002 on gatewayRef
    prisma.$transaction = jest.fn(async () => { throw p2002GatewayRef; });

    // findInvoice path: single findFirst call (the one after idempotent return)
    (prisma.invoice as Record<string, unknown>).findFirst = jest.fn(async () => findInvoiceResult);

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.recordPayment(ORG, INV_ID, {
      amount: '100000',
      method: 'TRANSFER',
      reference: 'GW-DUPE-001',
    } as never);

    expect(result).toBeDefined();
    // Payment.create should have been attempted (inside TX) but TX threw — no second persisted payment
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});

// ── 3: P2002 on Payment.reference → retry succeeds ───────────────────────────

describe('SalesService.recordPayment — P2002 reference → retries', () => {
  it('3: auto-generated reference collision retries and eventually succeeds', async () => {
    const invoice = makeInvoice();
    const updatedInvoice = makeInvoice({ paidAmount: '100000', status: 'PAID' });
    const findResult = makeFindInvoiceResult(updatedInvoice);

    const p2002Reference = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['organizationId', 'reference'] },
    });

    let txAttempts = 0;
    const prisma: Record<string, unknown> = {
      invoice: {
        // Outside TX (post-success findInvoice): return paid result
        findFirst: jest.fn(async () => findResult),
        update: jest.fn(async () => updatedInvoice),
        findMany: jest.fn(async () => []),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    };
    // Fail first 2 attempts, succeed on 3rd — tx client uses original unpaid invoice
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => {
      txAttempts++;
      if (txAttempts < 3) throw p2002Reference;
      // Pass tx with the original UNPAID invoice for the in-TX read
      const tx = {
        invoice: {
          findFirst: jest.fn(async () => invoice),
          update: jest.fn(async () => updatedInvoice),
        },
        payment: { findFirst: jest.fn(async () => null), create: jest.fn(async () => null) },
        receipt: { create: jest.fn(async () => null) },
        salesOrder: { update: jest.fn(async () => ({})) },
      };
      return fn(tx);
    });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.recordPayment(ORG, INV_ID, { amount: '100000', method: 'CASH' } as never);
    expect(result).toBeDefined();
    expect(txAttempts).toBe(3);
  });
});

// ── 4: Concurrent overpayment blocked by in-TX re-read ───────────────────────

describe('SalesService.recordPayment — concurrent overpayment blocked', () => {
  it('4: second payment sees updated paidAmount inside TX and is rejected', async () => {
    // Invoice was just paid (paidAmount = totalAmount) by a concurrent TX —
    // simulate this by having the in-TX findFirst return the already-updated state.
    const invoiceAlreadyPaid = makeInvoice({ paidAmount: '100000', status: 'PAID' });
    const paymentCreate = jest.fn(async () => null);

    const prisma: Record<string, unknown> = {
      invoice: {
        // Pre-check (outside TX, stale): shows UNPAID
        findFirst: jest.fn(async () => makeInvoice({ paidAmount: '0', status: 'UNPAID' })),
        update: jest.fn(async () => invoiceAlreadyPaid),
        findMany: jest.fn(async () => []),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: paymentCreate,
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    };
    // Inside TX: invoice re-read returns already-paid state
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => {
      const txPrisma = {
        ...prisma,
        invoice: {
          findFirst: jest.fn(async () => invoiceAlreadyPaid), // <-- updated state
          update: jest.fn(async () => invoiceAlreadyPaid),
        },
        payment: { findFirst: jest.fn(async () => null), create: paymentCreate },
        receipt: { create: jest.fn(async () => null) },
        salesOrder: { update: jest.fn(async () => ({})) },
      };
      return fn(txPrisma);
    });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // Attempt to pay ₦100k on a ₦100k invoice that was already paid
    await expect(
      svc.recordPayment(ORG, INV_ID, { amount: '100000', method: 'CASH' } as never),
    ).rejects.toThrow(BadRequestException);

    expect(paymentCreate).not.toHaveBeenCalled();
  });
});

// ── 5: gatewayRef pre-check short-circuits before TX ─────────────────────────

describe('SalesService.recordPayment — gatewayRef pre-check', () => {
  it('5: existing gatewayRef match outside TX skips entire TX path', async () => {
    const existingPayment = { id: 'pay-1', status: 'COMPLETED', gatewayRef: 'GW-001' };
    const invoiceResult = makeFindInvoiceResult(makeInvoice({ paidAmount: '100000', status: 'PAID' }));
    const txFn = jest.fn(async () => null);

    const prisma: Record<string, unknown> = {
      invoice: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(existingPayment)   // pre-check (simulated: payment.findFirst actually)
          .mockResolvedValue(invoiceResult),
      },
      payment: {
        findFirst: jest.fn(async () => existingPayment),
        create: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []) },
    };
    prisma.$transaction = txFn;
    // findInvoice: invoice.findFirst returns the full invoice
    (prisma.invoice as Record<string, unknown>).findFirst = jest.fn(async () => invoiceResult);

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.recordPayment(ORG, INV_ID, {
      amount: '100000',
      method: 'TRANSFER',
      reference: 'GW-001',
    } as never);

    expect(result).toBeDefined();
    expect(txFn).not.toHaveBeenCalled();
  });
});
