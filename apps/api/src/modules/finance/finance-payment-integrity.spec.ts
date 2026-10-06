/**
 * Stage 20 — Finance & Payment Integrity Tests
 *
 * Coverage:
 *  1.  recordPayment — overpayment → BadRequestException
 *  2.  recordPayment — duplicate gatewayRef → idempotent (no second payment created)
 *  3.  refundSalesOrder — refund exceeds paidAmount → BadRequestException
 *  4.  reconcileTransaction — already reconciled → returns original (no update called)
 *  5.  markExpensePaid — insufficient bank balance → BadRequestException
 */

import { BadRequestException } from '@nestjs/common';
import { Prisma, ExpenseStatus } from '@prisma/client';
import { FinanceService } from './finance.service';
import { SalesService } from '../sales/sales.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const ORG = 'org-1';

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}
function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}
function makeBusinessRuleService() {
  return {
    checkRefundAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: null, threshold: null })),
    checkDiscount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkMargin: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
    checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
  };
}
function makePermissionsService() {
  return { getResolvedPermissions: jest.fn(async () => ({ data: { effective: [] } })) };
}
function makeInventoryService() {
  return { recordMovement: jest.fn(async () => ({})) };
}

// ── 1 & 2: recordPayment (SalesService) ─────────────────────────────────────

describe('SalesService — recordPayment integrity', () => {
  function makeInvoiceBase() {
    return {
      id: 'inv-1',
      organizationId: ORG,
      status: 'UNPAID',
      paidAmount: '0',
      totalAmount: '500000',
      customerId: null,
      currency: 'NGN',
    };
  }

  it('1: overpayment → BadRequestException before any DB write', async () => {
    const invoice = makeInvoiceBase();
    const paymentCreate = jest.fn(async () => null);
    const prisma: Record<string, unknown> = {
      invoice: {
        findFirst: jest.fn(async () => invoice),
        update: jest.fn(async () => invoice),
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
    // $transaction passes prisma as tx — overpayment check fires inside TX
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => fn(prisma));
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // ₦600k payment on a ₦500k invoice
    await expect(
      svc.recordPayment(ORG, 'inv-1', { amount: '600000', method: 'CASH' } as never),
    ).rejects.toThrow(BadRequestException);

    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('2: duplicate gatewayRef → idempotent return, no second payment created', async () => {
    const invoice = { ...makeInvoiceBase(), paidAmount: '500000', status: 'PAID' };
    const paymentCreate = jest.fn(async () => null);
    const existingPayment = { id: 'pay-existing', status: 'COMPLETED', gatewayRef: 'GW-REF-001' };
    const prisma = {
      invoice: {
        findFirst: jest.fn(async () => invoice),
        findMany: jest.fn(async () => []),
      },
      payment: {
        findFirst: jest.fn(async () => existingPayment),
        create: paymentCreate,
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []) },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    const result = await svc.recordPayment(ORG, 'inv-1', { amount: '500000', method: 'CASH', reference: 'GW-REF-001' } as never);
    expect(result).toBeDefined();
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});

// ── 3: refundSalesOrder paidAmount ceiling (SalesService) ────────────────────

describe('SalesService — refundSalesOrder paidAmount ceiling', () => {
  it('3: refund exceeds paidAmount → BadRequestException before any DB write', async () => {
    const order = {
      id: 'so-1',
      organizationId: ORG,
      status: 'COMPLETED',
      totalAmount: '500000',
      paidAmount: '300000',
      customerId: null,
      locationId: 'loc-1',
      items: [],
    };
    const paymentCreate = jest.fn(async () => null);
    const prisma = {
      salesOrder: {
        findFirst: jest.fn(async () => order),
        update: jest.fn(async () => order),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      payment: { create: paymentCreate, findMany: jest.fn(async () => []) },
      invoice: { findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    // ₦400k refund on an order where only ₦300k was paid
    await expect(
      svc.refundSalesOrder(ORG, 'so-1', { refundAmount: '400000', reason: 'test' } as never, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    expect(paymentCreate).not.toHaveBeenCalled();
  });
});

// ── 4: reconcileTransaction idempotency (FinanceService) ─────────────────────

describe('FinanceService — reconcileTransaction idempotency', () => {
  it('4: already-reconciled tx returned as-is without calling bankTransaction.update', async () => {
    const originalReconciledAt = new Date('2026-01-01T00:00:00Z');
    const tx = {
      id: 'tx-1',
      bankAccountId: 'bank-1',
      organizationId: ORG,
      reconciled: true,
      reconciledAt: originalReconciledAt,
    };
    const update = jest.fn(async () => ({ ...tx, reconciledAt: new Date() }));
    const prisma = {
      bankTransaction: {
        findFirst: jest.fn(async () => tx),
        update,
      },
    };
    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAuditService() as never,
      makePermissionsService() as never,
    );

    const result = await svc.reconcileTransaction(ORG, 'bank-1', 'tx-1') as typeof tx;
    expect(update).not.toHaveBeenCalled();
    expect(result.reconciledAt).toEqual(originalReconciledAt);
  });
});

// ── 5: markExpensePaid insufficient balance (FinanceService) ─────────────────

describe('FinanceService — markExpensePaid insufficient balance', () => {
  it('5: expense amount exceeds bank balance → BadRequestException, no ops executed', async () => {
    const expense = {
      id: 'exp-1',
      organizationId: ORG,
      reference: 'EXP-001',
      status: ExpenseStatus.APPROVED,
      amount: new Prisma.Decimal('500000'),
    };
    const account = {
      id: 'bank-1',
      organizationId: ORG,
      balance: new Prisma.Decimal('100000'),
      isActive: true,
    };
    const $transaction = jest.fn(async () => null);
    const prisma = {
      expense: {
        findFirst: jest.fn(async () => expense),
        update: jest.fn(async () => expense),
      },
      bankAccount: {
        findFirst: jest.fn(async () => account),
      },
      bankTransaction: { create: jest.fn(async () => null) },
      $transaction,
    };
    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAuditService() as never,
      makePermissionsService() as never,
    );

    await expect(
      svc.markExpensePaid(ORG, 'exp-1', { bankAccountId: 'bank-1' } as never, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    expect($transaction).not.toHaveBeenCalled();
  });
});
