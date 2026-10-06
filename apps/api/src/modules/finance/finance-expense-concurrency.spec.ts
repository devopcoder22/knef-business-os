/**
 * Stage 21 Remediation — Expense Payment Concurrency Tests
 *
 * Coverage:
 *  1.  markExpensePaid invokes $transaction with Serializable isolation level
 *  2.  Bank account balance read uses tx client (not root prisma)
 *  3.  Expense status re-verified inside TX (in-TX re-read)
 *  4.  Second concurrent call sees PAID expense inside TX → BadRequestException
 *  5.  P2034 (Serializable conflict) → ConflictException
 *  6.  Successful TX → EXPENSE_PAID audit log emitted
 *  7.  Failed TX (exception inside) → no EXPENSE_PAID audit log
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ExpenseStatus } from '@prisma/client';
import { FinanceService } from './finance.service';

const ORG = 'org-1';

function makeBusinessRuleService() {
  return {
    checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
  };
}
function makePermissionsService() {
  return { getResolvedPermissions: jest.fn(async () => ({ data: { effective: [] } })) };
}
function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}

function makeApprovedExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    organizationId: ORG,
    reference: 'EXP-001',
    status: ExpenseStatus.APPROVED,
    amount: new Prisma.Decimal('70000'),
    ...overrides,
  };
}

function makeAccount(balance: string) {
  return {
    id: 'bank-1',
    organizationId: ORG,
    balance: new Prisma.Decimal(balance),
    isActive: true,
  };
}

// ── 1: Serializable isolation level ──────────────────────────────────────────

describe('FinanceService.markExpensePaid — Serializable isolation', () => {
  it('1: $transaction called with Serializable isolation level', async () => {
    const expense = makeApprovedExpense();
    const account = makeAccount('100000');
    const paidExpense = { ...expense, status: ExpenseStatus.PAID };

    let capturedOpts: unknown;
    const prisma = {
      expense: { findFirst: jest.fn(async () => expense) },
      bankAccount: { findFirst: jest.fn(async () => account) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, opts?: unknown) => {
        capturedOpts = opts;
        const tx = {
          expense: { findFirst: jest.fn(async () => expense), update: jest.fn(async () => paidExpense) },
          bankAccount: { findFirst: jest.fn(async () => account), update: jest.fn(async () => account) },
          bankTransaction: { create: jest.fn(async () => null) },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAudit() as never,
      makePermissionsService() as never,
    );

    await svc.markExpensePaid(ORG, 'exp-1', { bankAccountId: 'bank-1' } as never, 'user-1');

    expect(capturedOpts).toMatchObject({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});

// ── 2: Bank account read uses TX client ───────────────────────────────────────

describe('FinanceService.markExpensePaid — bank account read via TX client', () => {
  it('2: bankAccount.findFirst called on tx, not root prisma', async () => {
    const expense = makeApprovedExpense();
    const account = makeAccount('100000');
    const paidExpense = { ...expense, status: ExpenseStatus.PAID };

    const rootBankAccountFindFirst = jest.fn(async () => account);
    const txBankAccountFindFirst = jest.fn(async () => account);

    const prisma = {
      expense: { findFirst: jest.fn(async () => expense) },
      bankAccount: { findFirst: rootBankAccountFindFirst },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
        const tx = {
          expense: { findFirst: jest.fn(async () => expense), update: jest.fn(async () => paidExpense) },
          bankAccount: { findFirst: txBankAccountFindFirst, update: jest.fn(async () => account) },
          bankTransaction: { create: jest.fn(async () => null) },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAudit() as never,
      makePermissionsService() as never,
    );

    await svc.markExpensePaid(ORG, 'exp-1', { bankAccountId: 'bank-1' } as never, 'user-1');

    // TX client's findFirst was used for the authoritative balance read
    expect(txBankAccountFindFirst).toHaveBeenCalled();
    // Root prisma bankAccount.findFirst was NOT called inside the TX
    expect(rootBankAccountFindFirst).not.toHaveBeenCalled();
  });
});

// ── 3: Expense re-read inside TX ──────────────────────────────────────────────

describe('FinanceService.markExpensePaid — in-TX expense re-read', () => {
  it('3: expense.findFirst called on tx client for authoritative status check', async () => {
    const expense = makeApprovedExpense();
    const paidExpense = { ...expense, status: ExpenseStatus.PAID };
    const txExpenseFindFirst = jest.fn(async () => expense);

    const prisma = {
      expense: { findFirst: jest.fn(async () => expense) },
      bankAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
        const tx = {
          expense: { findFirst: txExpenseFindFirst, update: jest.fn(async () => paidExpense) },
          bankAccount: { findFirst: jest.fn(), update: jest.fn() },
          bankTransaction: { create: jest.fn(async () => null) },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAudit() as never,
      makePermissionsService() as never,
    );

    // No bankAccountId to simplify — expense update still goes through TX
    await svc.markExpensePaid(ORG, 'exp-1', {} as never, 'user-1');

    expect(txExpenseFindFirst).toHaveBeenCalledWith({ where: { id: 'exp-1', organizationId: ORG } });
  });
});

// ── 4: Concurrent double-pay: second caller sees PAID inside TX ───────────────

describe('FinanceService.markExpensePaid — concurrent double-pay blocked', () => {
  it('4: second TX sees expense already PAID → BadRequestException, no BankTransaction created', async () => {
    const approvedExpense = makeApprovedExpense();
    const paidExpense = { ...approvedExpense, status: ExpenseStatus.PAID };
    const txBankTxCreate = jest.fn(async () => null);

    const prisma = {
      expense: {
        // Outer (pre-TX) check still sees APPROVED
        findFirst: jest.fn(async () => approvedExpense),
      },
      bankAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
        const tx = {
          // In-TX re-read returns PAID — concurrent first caller already committed
          expense: { findFirst: jest.fn(async () => paidExpense), update: jest.fn(async () => paidExpense) },
          bankAccount: { findFirst: jest.fn(), update: jest.fn() },
          bankTransaction: { create: txBankTxCreate },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAudit() as never,
      makePermissionsService() as never,
    );

    await expect(
      svc.markExpensePaid(ORG, 'exp-1', { bankAccountId: 'bank-1' } as never, 'user-2'),
    ).rejects.toThrow(BadRequestException);

    expect(txBankTxCreate).not.toHaveBeenCalled();
  });
});

// ── 5: P2034 → ConflictException ─────────────────────────────────────────────

describe('FinanceService.markExpensePaid — P2034 → ConflictException', () => {
  it('5: Serializable TX conflict (P2034) → ConflictException, not HTTP 500', async () => {
    const expense = makeApprovedExpense();
    const p2034 = new Prisma.PrismaClientKnownRequestError('Transaction conflict', {
      code: 'P2034',
      clientVersion: '5.0.0',
    });

    const prisma = {
      expense: { findFirst: jest.fn(async () => expense) },
      bankAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(async () => { throw p2034; }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAudit() as never,
      makePermissionsService() as never,
    );

    await expect(
      svc.markExpensePaid(ORG, 'exp-1', {} as never, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });
});

// ── 6: Successful TX → audit log ─────────────────────────────────────────────

describe('FinanceService.markExpensePaid — audit log on success', () => {
  it('6: EXPENSE_PAID audit log emitted after successful commit', async () => {
    const expense = makeApprovedExpense();
    const paidExpense = { ...expense, status: ExpenseStatus.PAID };
    const audit = makeAudit();

    const prisma = {
      expense: { findFirst: jest.fn(async () => expense) },
      bankAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
        const tx = {
          expense: { findFirst: jest.fn(async () => expense), update: jest.fn(async () => paidExpense) },
          bankAccount: { findFirst: jest.fn(), update: jest.fn() },
          bankTransaction: { create: jest.fn(async () => null) },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      audit as never,
      makePermissionsService() as never,
    );

    await svc.markExpensePaid(ORG, 'exp-1', {} as never, 'user-1');

    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPENSE_PAID', entityId: 'exp-1' }),
    );
  });
});

// ── 7: Failed TX → no audit log ──────────────────────────────────────────────

describe('FinanceService.markExpensePaid — no audit log on failed TX', () => {
  it('7: TX throws BadRequestException → EXPENSE_PAID audit log NOT emitted', async () => {
    const expense = makeApprovedExpense();
    const paidExpense = { ...expense, status: ExpenseStatus.PAID };
    const audit = makeAudit();

    const prisma = {
      expense: { findFirst: jest.fn(async () => expense) },
      bankAccount: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
        const tx = {
          expense: { findFirst: jest.fn(async () => paidExpense), update: jest.fn() }, // PAID → throws
          bankAccount: { findFirst: jest.fn(), update: jest.fn() },
          bankTransaction: { create: jest.fn() },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      audit as never,
      makePermissionsService() as never,
    );

    await expect(
      svc.markExpensePaid(ORG, 'exp-1', {} as never, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    await new Promise((r) => setTimeout(r, 10));
    expect(audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPENSE_PAID' }),
    );
  });
});
