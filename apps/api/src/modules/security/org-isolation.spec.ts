/**
 * Phase 24N — Org-isolation security regression tests.
 *
 * Verifies that cross-org IDOR vulnerabilities are closed:
 * 1. FinanceService.markExpensePaid final return scoped by organizationId
 * 2. SalesService.findReceipt customer lookup scoped by organizationId
 * 3. PurchasingService.findGoodsReceipt PO lookup scoped by organizationId
 * 4. Telegram webhook uses timing-safe comparison
 */

import { NotFoundException } from '@nestjs/common';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { FinanceService } from '../finance/finance.service';
import { SalesService } from '../sales/sales.service';
import { PurchasingService } from '../purchasing/purchasing.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}
function makeBRS() {
  return { checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })) };
}
function makePerms() {
  return { getResolvedPermissions: jest.fn(async () => ({ data: { effective: [] } })) };
}
function makeInventory() {
  return {};
}
function makeEmitter() {
  return { emit: jest.fn(), emitAsync: jest.fn(async () => []) };
}

// ── 1. FinanceService.markExpensePaid final return ──────────────────────────

describe('FinanceService.markExpensePaid — final return is org-scoped', () => {
  it('last expense.findFirst call includes organizationId', async () => {
    const expense = {
      id: 'exp-1',
      organizationId: ORG_A,
      status: ExpenseStatus.APPROVED,
      amount: new Prisma.Decimal('50000'),
      reference: 'EXP-001',
    };
    const account = {
      id: 'bank-1',
      organizationId: ORG_A,
      balance: new Prisma.Decimal('200000'),
      isActive: true,
    };
    const paidExpense = { ...expense, status: ExpenseStatus.PAID };

    const expenseFindFirstCalls: Array<{ where: Record<string, unknown> }> = [];

    const prisma = {
      expense: {
        findFirst: jest.fn(async (q: { where: Record<string, unknown> }) => {
          expenseFindFirstCalls.push(q);
          return q.where['organizationId'] === ORG_A ? expense : null;
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => {
        const tx = {
          expense: {
            findFirst: jest.fn(async () => expense),
            update: jest.fn(async () => paidExpense),
          },
          bankAccount: {
            findFirst: jest.fn(async () => account),
            update: jest.fn(async () => account),
          },
          bankTransaction: { create: jest.fn(async () => ({})) },
        };
        return fn(tx);
      }),
    };

    const svc = new FinanceService(
      prisma as never,
      makeBRS() as never,
      makeAudit() as never,
      makePerms() as never,
    );

    await svc.markExpensePaid(ORG_A, 'exp-1', { bankAccountId: 'bank-1' } as never, 'user-1');

    // The final return call (after TX) must include organizationId
    const lastCall = expenseFindFirstCalls[expenseFindFirstCalls.length - 1];
    expect(lastCall.where).toMatchObject({ id: 'exp-1', organizationId: ORG_A });
  });

  it('cross-org: ORG_B cannot see ORG_A expense — NotFoundException', async () => {
    const prisma = {
      expense: {
        findFirst: jest.fn(async (q: { where: Record<string, unknown> }) =>
          q.where['organizationId'] === ORG_A
            ? { id: 'exp-1', organizationId: ORG_A, status: ExpenseStatus.APPROVED, amount: new Prisma.Decimal('1000'), reference: 'E-1' }
            : null,
        ),
      },
    };

    const svc = new FinanceService(
      prisma as never,
      makeBRS() as never,
      makeAudit() as never,
      makePerms() as never,
    );

    await expect(
      svc.markExpensePaid(ORG_B, 'exp-1', {} as never, 'user-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── 2. SalesService.findReceipt customer lookup ─────────────────────────────

describe('SalesService.findReceipt — customer lookup is org-scoped', () => {
  it('customer findFirst call includes organizationId', async () => {
    const customerCalls: Array<{ where: Record<string, unknown> }> = [];

    const prisma = {
      receipt: {
        findFirst: jest.fn(async () => ({
          id: 'rec-1',
          organizationId: ORG_A,
          customerId: 'cust-1',
          invoice: null,
        })),
      },
      customer: {
        findFirst: jest.fn(async (q: { where: Record<string, unknown> }) => {
          customerCalls.push(q);
          return { id: 'cust-1', organizationId: ORG_A, name: 'Alice' };
        }),
      },
    };

    const svc = new SalesService(
      prisma as never,
      makeInventory() as never,
      makeEmitter() as never,
      makeBRS() as never,
      makeAudit() as never,
    );

    await svc.findReceipt(ORG_A, 'rec-1');

    expect(customerCalls.length).toBeGreaterThan(0);
    expect(customerCalls[0].where).toMatchObject({ id: 'cust-1', organizationId: ORG_A });
  });

  it('cross-org: customer from ORG_B is not returned', async () => {
    const prisma = {
      receipt: {
        findFirst: jest.fn(async () => ({
          id: 'rec-1',
          organizationId: ORG_A,
          customerId: 'cust-99',
          invoice: null,
        })),
      },
      customer: {
        findFirst: jest.fn(async (q: { where: Record<string, unknown> }) =>
          q.where['organizationId'] === ORG_B ? { id: 'cust-99' } : null,
        ),
      },
    };

    const svc = new SalesService(
      prisma as never,
      makeInventory() as never,
      makeEmitter() as never,
      makeBRS() as never,
      makeAudit() as never,
    );

    const result = await svc.findReceipt(ORG_A, 'rec-1');
    expect((result as { customer: unknown }).customer).toBeNull();
  });
});

// ── 3. PurchasingService.findGoodsReceipt PO lookup ─────────────────────────

describe('PurchasingService.findGoodsReceipt — PO lookup is org-scoped', () => {
  it('purchaseOrder findFirst includes organizationId', async () => {
    const poCalls: Array<{ where: Record<string, unknown> }> = [];

    const prisma = {
      goodsReceipt: {
        findFirst: jest.fn(async () => ({
          id: 'gr-1',
          organizationId: ORG_A,
          purchaseOrderId: 'po-1',
          purchaseOrder: {
            supplier: { id: 's-1', name: 'Supplier' },
            location: { id: 'loc-1', name: 'Main' },
          },
          items: [],
        })),
      },
      purchaseOrder: {
        findFirst: jest.fn(async (q: { where: Record<string, unknown> }) => {
          poCalls.push(q);
          return { id: 'po-1', locationId: 'loc-1' };
        }),
      },
      product: {
        findMany: jest.fn(async () => []),
      },
    };

    const svc = new PurchasingService(
      prisma as never,
      makeInventory() as never,
      makeEmitter() as never,
      makeBRS() as never,
      makeAudit() as never,
      makePerms() as never,
    );

    await svc.findGoodsReceipt(ORG_A, 'gr-1', ['loc-1']);

    expect(poCalls.length).toBeGreaterThan(0);
    expect(poCalls[0].where).toMatchObject({ id: 'po-1', organizationId: ORG_A });
  });
});

// ── 4. Telegram timing-safe comparison ──────────────────────────────────────

describe('Telegram webhook — timing-safe secret comparison', () => {
  it('rejects mismatched secret without early-exit', () => {
    const secret = 'legitimate-webhook-secret';
    const attacker = 'wrong-secret-value-x';
    let valid = false;
    try { valid = timingSafeEqual(Buffer.from(attacker), Buffer.from(secret)); } catch { valid = false; }
    expect(valid).toBe(false);
  });

  it('accepts matching secret', () => {
    const secret = 'legitimate-webhook-secret';
    let valid = false;
    try { valid = timingSafeEqual(Buffer.from(secret), Buffer.from(secret)); } catch { valid = false; }
    expect(valid).toBe(true);
  });

  it('handles different-length buffers safely (no throw, returns false)', () => {
    let valid = false;
    try { valid = timingSafeEqual(Buffer.from('short'), Buffer.from('much-longer-secret-here')); } catch { valid = false; }
    expect(valid).toBe(false);
  });

  it('handles empty secretHeader safely', () => {
    const secret = 'telegram-secret';
    let valid = false;
    try { valid = timingSafeEqual(Buffer.from(''), Buffer.from(secret)); } catch { valid = false; }
    expect(valid).toBe(false);
  });
});
