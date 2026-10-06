/**
 * Stage 20 Remediation — Finance Edge-Case Tests
 *
 * Coverage:
 *  1.  markExpensePaid — PAID expense (double-pay) → BadRequestException, no TX
 *  2.  markExpensePaid — PENDING expense → BadRequestException, no TX
 *  3.  recordPayment — receipt is created with TX client (tx.receipt.create), not root prisma
 *  4.  recordPayment — receipt rollback: if receipt.create fails, payment.create is also rolled back
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

// ── 1 & 2: Expense double-pay guards ─────────────────────────────────────────

describe('FinanceService — markExpensePaid double-pay guard', () => {
  function makePrismaWithExpenseStatus(status: ExpenseStatus) {
    const expense = {
      id: 'exp-1',
      organizationId: ORG,
      reference: 'EXP-001',
      status,
      amount: new Prisma.Decimal('100000'),
    };
    const $transaction = jest.fn(async () => null);
    return {
      prisma: {
        expense: { findFirst: jest.fn(async () => expense) },
        bankAccount: { findFirst: jest.fn(async () => null) },
        bankTransaction: { create: jest.fn(async () => null) },
        $transaction,
      },
      $transaction,
    };
  }

  it('1: PAID expense → BadRequestException before any TX', async () => {
    const { prisma, $transaction } = makePrismaWithExpenseStatus(ExpenseStatus.PAID);
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

  it('2: PENDING expense → BadRequestException before any TX', async () => {
    const { prisma, $transaction } = makePrismaWithExpenseStatus(ExpenseStatus.PENDING);
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

// ── 3 & 4: POS receipt uses TX client ────────────────────────────────────────

describe('SalesService.recordPayment — receipt uses TX client', () => {
  function makeInvoice() {
    return {
      id: 'inv-1',
      organizationId: ORG,
      status: 'UNPAID',
      paidAmount: '0',
      totalAmount: '100000',
      customerId: null,
      currency: 'NGN',
      orderId: null,
    };
  }

  it('3: receipt.create is called on the TX client (tx), not on root prisma', async () => {
    const invoice = makeInvoice();
    const updatedInvoice = { ...invoice, paidAmount: '100000', status: 'PAID', payments: [], customer: null };

    const rootReceiptCreate = jest.fn(async () => null);
    const txReceiptCreate = jest.fn(async () => null);
    const txPaymentCreate = jest.fn(async () => null);

    const prisma: Record<string, unknown> = {
      invoice: {
        findFirst: jest.fn(async () => updatedInvoice),
        update: jest.fn(async () => updatedInvoice),
        findMany: jest.fn(async () => []),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      receipt: { create: rootReceiptCreate },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    };

    // TX receives its own tx object with tx.receipt.create
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
      const tx = {
        invoice: {
          findFirst: jest.fn(async () => invoice),
          update: jest.fn(async () => updatedInvoice),
        },
        payment: { findFirst: jest.fn(async () => null), create: txPaymentCreate },
        receipt: { create: txReceiptCreate },
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

    await svc.recordPayment(ORG, 'inv-1', { amount: '100000', method: 'CASH' } as never);

    // Receipt must have been created via TX client
    expect(txReceiptCreate).toHaveBeenCalled();
    // Root prisma receipt.create must NOT have been called directly
    expect(rootReceiptCreate).not.toHaveBeenCalled();
  });

  it('4: if receipt.create throws inside TX, payment.create effect is rolled back', async () => {
    const invoice = makeInvoice();
    const txPaymentCreate = jest.fn(async () => null);
    const rootPaymentCreate = jest.fn(async () => null);

    const prisma: Record<string, unknown> = {
      invoice: {
        findFirst: jest.fn(async () => invoice),
        update: jest.fn(async () => invoice),
        findMany: jest.fn(async () => []),
      },
      payment: {
        findFirst: jest.fn(async () => null),
        create: rootPaymentCreate,
        findMany: jest.fn(async () => []),
      },
      receipt: { create: jest.fn(async () => null) },
      customer: { updateMany: jest.fn(async () => ({})) },
      salesOrder: { findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    };

    // TX propagates error (simulates rollback)
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
      const tx = {
        invoice: {
          findFirst: jest.fn(async () => invoice),
          update: jest.fn(async () => invoice),
        },
        payment: { findFirst: jest.fn(async () => null), create: txPaymentCreate },
        receipt: { create: jest.fn(async () => { throw new Error('receipt write failed'); }) },
        salesOrder: { update: jest.fn(async () => ({})) },
      };
      // fn will throw when receipt.create fails; propagate (= rollback)
      return fn(tx);
    });

    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter(),
      makeBusinessRuleService() as never,
      makeAuditService() as never,
    );

    await expect(
      svc.recordPayment(ORG, 'inv-1', { amount: '100000', method: 'CASH' } as never),
    ).rejects.toThrow('receipt write failed');

    // payment.create was called inside TX but the whole TX threw (simulated rollback)
    // The key assertion: root prisma.payment.create was NEVER called directly
    expect(rootPaymentCreate).not.toHaveBeenCalled();
    // TX payment.create was called but its effects are rolled back with the TX
    expect(txPaymentCreate).toHaveBeenCalled();
  });
});
