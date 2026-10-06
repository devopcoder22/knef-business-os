/**
 * Stage 16 Remediation + Final Closure — Security and Correctness Tests
 *
 * Covers all gaps identified in the Stage 16 closure audit:
 *  1. Controller rule validation (NaN, out-of-range %, negative monetary)
 *  2. Discount check fires BEFORE DB write (pre-commit enforcement)
 *  3. Margin bypass prevention (partial costPrice → reject)
 *  4. Refund rule integration (checkRefundAmount called, ruleCheck returned)
 *  5. Self-approval prevention in PurchasingService
 *  6. Approver location scope enforcement in PurchasingService
 *  7. Requester authority recheck in PurchasingService (isActive + permission)
 *  8. Atomic PO approval idempotency (count=0 concurrent case)
 *  9. Self-approval prevention in FinanceService
 * 10. Requester authority recheck in FinanceService (isActive + permission)
 * 11. Atomic expense approval idempotency (count=0 concurrent case)
 * 12. Refund hard block — above threshold blocks before any DB mutation
 * 13. Requester permission recheck — PO approval blocked when permission revoked
 * 14. Requester permission recheck — expense approval blocked when permission revoked
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { POStatus, ExpenseStatus } from '@prisma/client';
import { PurchasingService } from '../purchasing/purchasing.service';
import { FinanceService } from '../finance/finance.service';
import { SalesService } from '../sales/sales.service';
import { BusinessRulesController } from './business-rules.controller';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}

function makeEventEmitter() {
  return { emit: jest.fn() };
}

function makeBusinessRuleService(overrides: Record<string, jest.Mock> = {}) {
  return {
    checkDiscount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.sales.max_discount_percent', reason: 'ok', threshold: 20, observedValue: 0 })),
    checkMargin: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.sales.min_margin_percent', reason: 'ok', threshold: 10, observedValue: 100 })),
    checkPurchaseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.purchasing.approval_threshold_ngn', reason: 'ok', threshold: 500_000, observedValue: 0 })),
    checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.expense.approval_threshold_ngn', reason: 'ok', threshold: 100_000, observedValue: 0 })),
    checkRefundAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.sales.refund_approval_threshold_ngn', reason: 'ok', threshold: 50_000, observedValue: 0 })),
    getAllThresholds: jest.fn(async () => ({})),
    getRuleThreshold: jest.fn(async () => 0),
    ...overrides,
  };
}

function makeInventoryService() {
  return { recordMovement: jest.fn() };
}

function makePermissionsService(hasPermission = true) {
  return {
    getResolvedPermissions: jest.fn(async () => ({
      data: {
        effective: hasPermission
          ? ['purchasing.create', 'finance.expenses.create', 'sales.refund']
          : [],
      },
    })),
  };
}

function makeSettingsService(findAllResult: unknown[] = []) {
  return {
    findAll: jest.fn(async () => ({ data: findAllResult })),
    update: jest.fn(async () => ({ data: [] })),
    getValue: jest.fn(async () => null),
  };
}

function makePrismaForPurchasing(orderOverrides?: Record<string, unknown>, userExists = true) {
  const order = {
    id: 'po-1',
    reference: 'PO-001',
    status: POStatus.SUBMITTED,
    totalAmount: { toString: () => '600000' },
    locationId: 'loc-A',
    createdBy: 'user-requester',
    supplierId: 'sup-1',
    ...orderOverrides,
  };
  return {
    purchaseOrder: {
      findFirst: jest.fn(async () => order),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => order),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    user: {
      findFirst: jest.fn(async () => userExists ? { id: 'user-requester' } : null),
    },
    goodsReceipt: { findMany: jest.fn(async () => []) },
    supplierInvoice: { findMany: jest.fn(async () => []) },
  };
}

function makePrismaForFinance(expenseOverrides?: Record<string, unknown>, userExists = true) {
  const expense = {
    id: 'exp-1',
    reference: 'EXP-001',
    status: ExpenseStatus.PENDING,
    amount: { toString: () => '150000' },
    submittedBy: 'user-requester',
    categoryId: null,
    ...expenseOverrides,
  };
  return {
    expense: {
      findFirst: jest.fn(async () => expense),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => expense),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    user: {
      findFirst: jest.fn(async () => userExists ? { id: 'user-requester' } : null),
    },
  };
}

function makePurchasingService(prismaOverrides?: Record<string, unknown>, userExists = true, hasPermission = true) {
  const prisma = makePrismaForPurchasing(prismaOverrides, userExists);
  return new PurchasingService(
    prisma as never,
    makeInventoryService() as never,
    makeEventEmitter() as never,
    makeBusinessRuleService() as never,
    makeAuditService() as never,
    makePermissionsService(hasPermission) as never,
  );
}

function makeFinanceService(expenseOverrides?: Record<string, unknown>, userExists = true, hasPermission = true) {
  const prisma = makePrismaForFinance(expenseOverrides, userExists);
  return new FinanceService(
    prisma as never,
    makeBusinessRuleService() as never,
    makeAuditService() as never,
    makePermissionsService(hasPermission) as never,
  );
}

function makeSalesService(prismaOverrides: Record<string, unknown> = {}, businessRuleOverrides: Record<string, jest.Mock> = {}) {
  const prisma = {
    salesOrder: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'so-1',
        reference: 'SO-001',
        ...args.data,
        customer: null,
        items: [],
      })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'so-1',
        status: args.data.status ?? 'COMPLETED',
      })),
    },
    payment: { create: jest.fn(async () => null) },
    ...prismaOverrides,
  };
  return new SalesService(
    prisma as never,
    makeInventoryService() as never,
    makeEventEmitter() as never,
    makeBusinessRuleService(businessRuleOverrides) as never,
    makeAuditService() as never,
  );
}

// ── 1. Controller — Rule Validation ──────────────────────────────────────────

describe('BusinessRulesController — updateRules validation', () => {
  function makeController(settingsResult: unknown[] = []) {
    const settingsService = makeSettingsService(settingsResult);
    const auditService = makeAuditService();
    const businessRuleService = makeBusinessRuleService();
    const prisma = { purchaseOrder: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) }, expense: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) } };
    return new BusinessRulesController(
      businessRuleService as never,
      settingsService as never,
      prisma as never,
      auditService as never,
    );
  }

  const mockUser = { id: 'user-1', organizationId: 'org-1' } as never;

  it('rejects NaN value', async () => {
    const ctrl = makeController();
    await expect(
      ctrl.updateRules(mockUser, { settings: [{ key: 'rules.purchasing.approval_threshold_ngn', value: 'abc' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects percent rule above 100', async () => {
    const ctrl = makeController();
    await expect(
      ctrl.updateRules(mockUser, { settings: [{ key: 'rules.sales.max_discount_percent', value: '101' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects negative percent rule', async () => {
    const ctrl = makeController();
    await expect(
      ctrl.updateRules(mockUser, { settings: [{ key: 'rules.sales.min_margin_percent', value: '-5' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects negative monetary threshold', async () => {
    const ctrl = makeController();
    await expect(
      ctrl.updateRules(mockUser, { settings: [{ key: 'rules.expense.approval_threshold_ngn', value: '-1000' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts valid percent in range [0, 100]', async () => {
    const ctrl = makeController([]);
    await expect(
      ctrl.updateRules(mockUser, { settings: [{ key: 'rules.sales.max_discount_percent', value: '25' }] }),
    ).resolves.not.toThrow();
  });

  it('accepts valid zero monetary threshold', async () => {
    const ctrl = makeController([]);
    await expect(
      ctrl.updateRules(mockUser, { settings: [{ key: 'rules.purchasing.approval_threshold_ngn', value: '0' }] }),
    ).resolves.not.toThrow();
  });
});

// ── 2. SalesService — Discount enforcement pre-commit ────────────────────────

describe('SalesService — discount enforcement (pre-commit)', () => {
  it('throws BadRequestException before DB write when discount exceeds threshold', async () => {
    const discountExceeded = jest.fn(async () => ({
      allowed: true,
      approvalRequired: true,
      ruleId: 'rules.sales.max_discount_percent',
      reason: 'Discount 25% exceeds threshold 20%',
      threshold: 20,
      observedValue: 25,
    }));
    const svc = makeSalesService({}, { checkDiscount: discountExceeded });
    const prismaCreate = (svc as unknown as { prisma: { salesOrder: { create: jest.Mock } } }).prisma.salesOrder.create;

    await expect(
      svc.createSalesOrder(
        'org-1',
        {
          locationId: 'loc-1',
          items: [{ productId: 'p1', quantity: 1, unitPrice: '100', discountRate: '25' }],
        } as never,
        'user-1',
        null,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prismaCreate).not.toHaveBeenCalled();
  });

  it('proceeds to DB write when discount is within threshold', async () => {
    const svc = makeSalesService();
    const prismaCreate = (svc as unknown as { prisma: { salesOrder: { create: jest.Mock } } }).prisma.salesOrder.create;

    await expect(
      svc.createSalesOrder(
        'org-1',
        {
          locationId: 'loc-1',
          items: [{ productId: 'p1', quantity: 1, unitPrice: '100', discountRate: '10' }],
        } as never,
        'user-1',
        null,
      ),
    ).resolves.toBeDefined();

    expect(prismaCreate).toHaveBeenCalled();
  });
});

// ── 3. SalesService — Margin bypass prevention ───────────────────────────────

describe('SalesService — margin bypass prevention', () => {
  it('throws BadRequestException when some but not all items have costPrice', async () => {
    const svc = makeSalesService();

    await expect(
      svc.createSalesOrder(
        'org-1',
        {
          locationId: 'loc-1',
          items: [
            { productId: 'p1', quantity: 1, unitPrice: '100', costPrice: '50' },
            { productId: 'p2', quantity: 1, unitPrice: '100' },
          ],
        } as never,
        'user-1',
        null,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('skips margin check silently when NO items have costPrice', async () => {
    const checkMargin = jest.fn(async () => ({ allowed: true, approvalRequired: false }));
    const svc = makeSalesService({}, { checkMargin });

    await svc.createSalesOrder(
      'org-1',
      {
        locationId: 'loc-1',
        items: [{ productId: 'p1', quantity: 1, unitPrice: '100' }],
      } as never,
      'user-1',
      null,
    );

    expect(checkMargin).not.toHaveBeenCalled();
  });
});

// ── 4. SalesService — Refund rule integration ─────────────────────────────────

describe('SalesService — refund rule integration', () => {
  it('calls checkRefundAmount and includes ruleCheck in response when below threshold', async () => {
    const ruleCheck = { allowed: true, approvalRequired: false, ruleId: 'rules.sales.refund_approval_threshold_ngn', reason: 'ok', threshold: 100_000, observedValue: 75_000 };
    const checkRefundAmount = jest.fn(async () => ruleCheck);
    const prisma = {
      salesOrder: {
        findFirst: jest.fn(async () => ({
          id: 'so-1',
          status: 'COMPLETED',
          totalAmount: { toString: () => '75000' },
          paidAmount: { toString: () => '75000' },
          customerId: 'cust-1',
          locationId: 'loc-1',
          items: [],
        })),
        update: jest.fn(async () => ({ id: 'so-1', status: 'REFUNDED' })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      invoice: { findMany: jest.fn(async () => []) },
      payment: { create: jest.fn(async () => null), findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter() as never,
      makeBusinessRuleService({ checkRefundAmount }) as never,
      makeAuditService() as never,
    );

    const result = await svc.refundSalesOrder('org-1', 'so-1', {}, 'user-1') as { ruleCheck: unknown };
    expect(checkRefundAmount).toHaveBeenCalledWith('org-1', expect.any(Number));
    expect(result.ruleCheck).toEqual(ruleCheck);
  });
});

// ── 5. PurchasingService — Self-approval prevention ──────────────────────────

describe('PurchasingService — self-approval prevention', () => {
  it('throws ForbiddenException when approver is the same as requester', async () => {
    const svc = makePurchasingService({ createdBy: 'user-approver' });
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver'),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ── 6. PurchasingService — Approver location scope ───────────────────────────

describe('PurchasingService — approver location scope', () => {
  it('throws ForbiddenException when approver is scoped to different location', async () => {
    const svc = makePurchasingService({ locationId: 'loc-B', createdBy: 'user-requester' });
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', ['loc-A']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows approval when approver has org-wide scope (null)', async () => {
    const svc = makePurchasingService({ locationId: 'loc-B', createdBy: 'user-requester' });
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', null),
    ).resolves.not.toThrow();
  });

  it('allows approval when approver locationIds includes PO location', async () => {
    const svc = makePurchasingService({ locationId: 'loc-A', createdBy: 'user-requester' });
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', ['loc-A', 'loc-B']),
    ).resolves.not.toThrow();
  });
});

// ── 7. PurchasingService — Requester authority recheck ───────────────────────

describe('PurchasingService — requester authority recheck', () => {
  it('throws ForbiddenException when requester user is no longer active', async () => {
    const svc = makePurchasingService(undefined, false);
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('proceeds when requester is still active', async () => {
    const svc = makePurchasingService(undefined, true);
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', null),
    ).resolves.not.toThrow();
  });
});

// ── 8. PurchasingService — Atomic approval idempotency ───────────────────────

describe('PurchasingService — atomic approval (concurrent case)', () => {
  it('returns idempotent:true when updateMany count=0 and order is already APPROVED', async () => {
    const prisma = {
      purchaseOrder: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({
            id: 'po-1', reference: 'PO-001', status: POStatus.SUBMITTED,
            totalAmount: { toString: () => '600000' }, locationId: 'loc-A', createdBy: 'req-user', supplierId: 'sup-1',
          })
          .mockResolvedValueOnce({
            id: 'po-1', reference: 'PO-001', status: POStatus.APPROVED,
            totalAmount: { toString: () => '600000' }, locationId: 'loc-A', createdBy: 'req-user', supplierId: 'sup-1',
          }),
        updateMany: jest.fn(async () => ({ count: 0 })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      user: { findFirst: jest.fn(async () => ({ id: 'req-user' })) },
      goodsReceipt: { findMany: jest.fn(async () => []) },
      supplierInvoice: { findMany: jest.fn(async () => []) },
    };
    const svc = new PurchasingService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter() as never,
      makeBusinessRuleService() as never,
      makeAuditService() as never,
      makePermissionsService() as never,
    );

    const result = await svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', null) as { idempotent: boolean };
    expect(result.idempotent).toBe(true);
  });
});

// ── 9. FinanceService — Self-approval prevention ─────────────────────────────

describe('FinanceService — self-approval prevention', () => {
  it('throws ForbiddenException when approver is the expense submitter', async () => {
    const svc = makeFinanceService({ submittedBy: 'user-self' });
    await expect(svc.approveExpense('org-1', 'exp-1', 'user-self')).rejects.toThrow(ForbiddenException);
  });
});

// ── 10. FinanceService — Requester authority recheck ────────────────────────

describe('FinanceService — requester authority recheck', () => {
  it('throws ForbiddenException when expense submitter is no longer active', async () => {
    const svc = makeFinanceService(undefined, false);
    await expect(svc.approveExpense('org-1', 'exp-1', 'user-approver')).rejects.toThrow(ForbiddenException);
  });

  it('proceeds when expense submitter is still active', async () => {
    const svc = makeFinanceService(undefined, true);
    await expect(svc.approveExpense('org-1', 'exp-1', 'user-approver')).resolves.not.toThrow();
  });
});

// ── 12. SalesService — Refund hard block ────────────────────────────────────

describe('SalesService — refund threshold hard block', () => {
  function makeRefundPrisma() {
    return {
      salesOrder: {
        findFirst: jest.fn(async () => ({
          id: 'so-1',
          status: 'COMPLETED',
          totalAmount: { toString: () => '75000' },
          paidAmount: { toString: () => '75000' },
          customerId: 'cust-1',
          locationId: 'loc-1',
          items: [],
        })),
        update: jest.fn(async () => ({ id: 'so-1', status: 'REFUNDED' })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      invoice: { findMany: jest.fn(async () => []) },
      payment: { create: jest.fn(async () => null), findMany: jest.fn(async () => []) },
      customer: { updateMany: jest.fn(async () => ({})) },
    };
  }

  it('refund below threshold → proceeds without throw', async () => {
    const checkRefundAmount = jest.fn(async () => ({
      allowed: true,
      approvalRequired: false,
      ruleId: 'rules.sales.refund_approval_threshold_ngn',
      reason: 'ok',
      threshold: 100_000,
      observedValue: 75_000,
    }));
    const prisma = makeRefundPrisma();
    const svc = new SalesService(
      prisma as never,
      makeInventoryService() as never,
      makeEventEmitter() as never,
      makeBusinessRuleService({ checkRefundAmount }) as never,
      makeAuditService() as never,
    );

    await expect(svc.refundSalesOrder('org-1', 'so-1', {}, 'user-1')).resolves.not.toThrow();
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(prisma.salesOrder.update).toHaveBeenCalled();
  });

  it('refund above threshold → ForbiddenException, no DB mutations', async () => {
    const checkRefundAmount = jest.fn(async () => ({
      allowed: false,
      approvalRequired: true,
      ruleId: 'rules.sales.refund_approval_threshold_ngn',
      reason: 'Refund exceeds threshold',
      threshold: 50_000,
      observedValue: 75_000,
    }));
    const inventoryService = makeInventoryService();
    const prisma = makeRefundPrisma();
    const svc = new SalesService(
      prisma as never,
      inventoryService as never,
      makeEventEmitter() as never,
      makeBusinessRuleService({ checkRefundAmount }) as never,
      makeAuditService() as never,
    );

    await expect(svc.refundSalesOrder('org-1', 'so-1', {}, 'user-1')).rejects.toThrow(ForbiddenException);
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });
});

// ── 13. PurchasingService — Requester permission recheck ─────────────────────

describe('PurchasingService — requester permission recheck', () => {
  it('throws ForbiddenException when requester permission purchasing.create is revoked', async () => {
    const svc = makePurchasingService(undefined, true, false);
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('proceeds when requester still holds purchasing.create', async () => {
    const svc = makePurchasingService(undefined, true, true);
    await expect(
      svc.approvePurchaseOrder('org-1', 'po-1', 'user-approver', null),
    ).resolves.not.toThrow();
  });
});

// ── 14. FinanceService — Requester permission recheck ────────────────────────

describe('FinanceService — requester permission recheck', () => {
  it('throws ForbiddenException when requester permission finance.expenses.create is revoked', async () => {
    const svc = makeFinanceService(undefined, true, false);
    await expect(svc.approveExpense('org-1', 'exp-1', 'user-approver')).rejects.toThrow(ForbiddenException);
  });

  it('proceeds when requester still holds finance.expenses.create', async () => {
    const svc = makeFinanceService(undefined, true, true);
    await expect(svc.approveExpense('org-1', 'exp-1', 'user-approver')).resolves.not.toThrow();
  });
});

// ── 11. FinanceService — Atomic approval idempotency ────────────────────────

describe('FinanceService — atomic approval (concurrent case)', () => {
  it('returns idempotent:true when updateMany count=0 and expense is already APPROVED', async () => {
    const expense = {
      id: 'exp-1', reference: 'EXP-001', status: ExpenseStatus.PENDING,
      amount: { toString: () => '150000' }, submittedBy: 'req-user', categoryId: null,
    };
    const approvedExpense = { ...expense, status: ExpenseStatus.APPROVED };
    const prisma = {
      expense: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(expense)
          .mockResolvedValueOnce(approvedExpense),
        updateMany: jest.fn(async () => ({ count: 0 })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      user: { findFirst: jest.fn(async () => ({ id: 'req-user' })) },
    };
    const svc = new FinanceService(
      prisma as never,
      makeBusinessRuleService() as never,
      makeAuditService() as never,
      makePermissionsService() as never,
    );

    const result = await svc.approveExpense('org-1', 'exp-1', 'user-approver') as { idempotent: boolean };
    expect(result.idempotent).toBe(true);
  });
});
