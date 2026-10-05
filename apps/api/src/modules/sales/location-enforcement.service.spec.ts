/**
 * Location-Based Access Enforcement — Security Tests
 *
 * Verifies that location-scoped users can only access data for their authorized
 * locations across Sales, Purchasing, Inventory, and Reports modules.
 *
 * Invariants:
 *   locationIds = null  → org-wide (no restriction)
 *   locationIds = ['L1'] → only location L1 permitted
 *
 * Coverage:
 *   1. L1 user accesses L1 data → allowed
 *   2. L1 user accesses L2 data → denied (IDOR protection)
 *   3. L1+L2 user accesses both → allowed
 *   4. Org-wide user accesses all → allowed
 *   5. Sales list filters by authorized locations
 *   6. Sales create in unauthorized location → denied
 *   7. Purchasing list filters by authorized locations
 *   8. Purchasing findOne IDOR → denied for wrong location
 *   9. Inventory levels filter by authorized locations
 *  10. Inventory levels: caller-supplied locationId validated against scope
 *  11. Cross-org isolation: records from other orgs never returned
 */

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PurchasingService } from '../purchasing/purchasing.service';
import { InventoryService } from '../inventory/inventory.service';

function makeEventEmitter() {
  return { emit: jest.fn() };
}

// ── shared mock factory ───────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    salesOrder: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
    },
    purchaseOrder: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
    },
    goodsReceipt: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
    },
    inventoryLevel: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    ...overrides,
  };
}

function makeInventoryService() {
  return { recordMovement: jest.fn() };
}

function makeBusinessRuleService() {
  return {
    checkDiscount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.sales.max_discount_percent', reason: 'ok', threshold: 20, observedValue: 0 })),
    checkMargin: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.sales.min_margin_percent', reason: 'ok', threshold: 10, observedValue: 100 })),
    checkPurchaseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.purchasing.approval_threshold_ngn', reason: 'ok', threshold: 500000, observedValue: 0 })),
    checkExpenseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.expense.approval_threshold_ngn', reason: 'ok', threshold: 100000, observedValue: 0 })),
    checkRefundAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false, ruleId: 'rules.sales.refund_approval_threshold_ngn', reason: 'ok', threshold: 50000, observedValue: 0 })),
    getAllThresholds: jest.fn(async () => ({})),
    getRuleThreshold: jest.fn(async () => 0),
  };
}

function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}

function makePermissionsService() {
  return {
    getResolvedPermissions: jest.fn(async () => ({
      data: { effective: ['purchasing.create', 'finance.expenses.create'] },
    })),
  };
}

// ── 1. SalesService — list filters ───────────────────────────────────────────

describe('SalesService — location enforcement', () => {
  it('1: L1-scoped user list passes { in: [L1] } to WHERE', async () => {
    const prisma = makePrisma();
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    await svc.listSalesOrders('org1', {}, ['loc-L1']);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('2: org-wide user list has no locationId filter in WHERE', async () => {
    const prisma = makePrisma();
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    await svc.listSalesOrders('org1', {}, null);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });

  it('3: L1+L2 user list passes { in: [L1, L2] }', async () => {
    const prisma = makePrisma();
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    await svc.listSalesOrders('org1', {}, ['loc-L1', 'loc-L2']);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1', 'loc-L2'] });
  });

  it('4 (IDOR): L1 user findOne for an order belonging to L2 → NotFoundException', async () => {
    const prisma = makePrisma({
      salesOrder: {
        findFirst: jest.fn(async () => ({ id: 'order-1', locationId: 'loc-L2' })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    await expect(svc.findSalesOrder('org1', 'order-1', ['loc-L1'])).rejects.toThrow(NotFoundException);
  });

  it('5 (IDOR): org-wide user findOne for any location → allowed', async () => {
    const prisma = makePrisma({
      salesOrder: {
        findFirst: jest.fn(async () => ({
          id: 'order-1',
          locationId: 'loc-L2',
          customer: null,
          location: null,
          items: [],
          invoices: [],
          payments: [],
        })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    const result = await svc.findSalesOrder('org1', 'order-1', null);
    expect(result.id).toBe('order-1');
  });

  it('6 (create): L1 user creating order for L2 → ForbiddenException', async () => {
    const prisma = makePrisma({
      salesOrder: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        create: jest.fn(),
      },
      customer: { findFirst: jest.fn(async () => null) },
      product: { findFirst: jest.fn(async () => null) },
    });
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    await expect(
      svc.createSalesOrder(
        'org1',
        { locationId: 'loc-L2', items: [{ productId: 'p1', quantity: 1, unitPrice: '100' }] } as never,
        'user1',
        ['loc-L1'],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('7 (create): org-wide user creating order for any location → proceeds past auth gate', async () => {
    const prisma = makePrisma({
      salesOrder: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        create: jest.fn(),
      },
      customer: { findFirst: jest.fn(async () => ({ id: 'cust1' })) },
      product: {
        findFirst: jest.fn(async () => ({
          id: 'p1',
          name: 'Product',
          sku: 'SKU',
          price: 100,
          taxRate: 0,
          organizationId: 'org1',
        })),
      },
      inventoryLevel: {
        findFirst: jest.fn(async () => ({ quantity: 10 })),
        update: jest.fn(),
      },
    });
    const inventorySvc = { recordMovement: jest.fn() };
    const svc = new SalesService(prisma as never, inventorySvc as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    // Auth gate should not throw for org-wide user (null locationIds)
    // Even if downstream logic throws for unrelated reasons (no mock for create),
    // the ForbiddenException must NOT be thrown.
    let threw = false;
    try {
      await svc.createSalesOrder(
        'org1',
        { locationId: 'loc-any', items: [{ productId: 'p1', quantity: 1, unitPrice: '100' }] } as never,
        'user1',
        null,
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });
});

// ── 2. PurchasingService — list + findOne ─────────────────────────────────────

describe('PurchasingService — location enforcement', () => {
  it('8: L1 user PO list passes { in: [L1] } to WHERE', async () => {
    const prisma = makePrisma();
    const svc = new PurchasingService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never, makePermissionsService() as never);

    await svc.listPurchaseOrders('org1', {}, ['loc-L1']);

    const [call] = (prisma.purchaseOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('9: org-wide user PO list has no locationId filter', async () => {
    const prisma = makePrisma();
    const svc = new PurchasingService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never, makePermissionsService() as never);

    await svc.listPurchaseOrders('org1', {}, null);

    const [call] = (prisma.purchaseOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });

  it('10 (IDOR): L1 user findOne for PO belonging to L2 → NotFoundException', async () => {
    const prisma = makePrisma({
      purchaseOrder: {
        findFirst: jest.fn(async () => ({
          id: 'po-1',
          locationId: 'loc-L2',
          items: [],
          receipts: [],
          supplier: null,
          location: null,
        })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new PurchasingService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never, makePermissionsService() as never);

    await expect(svc.findPurchaseOrder('org1', 'po-1', ['loc-L1'])).rejects.toThrow(NotFoundException);
  });

  it('11 (create): L1 user creating PO for L2 → ForbiddenException', async () => {
    const prisma = makePrisma();
    const svc = new PurchasingService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never, makePermissionsService() as never);

    await expect(
      svc.createPurchaseOrder(
        'org1',
        { locationId: 'loc-L2', items: [{ productId: 'p1', quantity: 1, unitCost: '100' }] } as never,
        'user1',
        ['loc-L1'],
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ── 3. InventoryService — level scoping ──────────────────────────────────────

describe('InventoryService — location enforcement', () => {
  function makeEventEmitter() {
    return { emit: jest.fn() };
  }

  it('12: L1 user getLevels without filter → locationId = { in: [L1] }', async () => {
    const prisma = makePrisma({
      inventoryLevel: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new InventoryService(prisma as never, makeEventEmitter() as never);

    await svc.getLevels('org1', {}, ['loc-L1']);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('13: org-wide user getLevels without filter → no locationId filter', async () => {
    const prisma = makePrisma({
      inventoryLevel: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new InventoryService(prisma as never, makeEventEmitter() as never);

    await svc.getLevels('org1', {}, null);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    // Should use { product: { organizationId } } but NOT restrict locationId
    expect(call[0].where).not.toHaveProperty('locationId');
  });

  it('14: L1 user getLevels with valid locationId=L1 → exact filter', async () => {
    const prisma = makePrisma({
      inventoryLevel: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    });
    const svc = new InventoryService(prisma as never, makeEventEmitter() as never);

    await svc.getLevels('org1', { locationId: 'loc-L1' }, ['loc-L1']);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toBe('loc-L1');
  });

  it('15 (scope): L1 user getLevels with locationId=L2 → returns empty (no data leakage)', async () => {
    // getLevels is a list endpoint: returns [] for unauthorized locationId rather than throwing,
    // consistent with filter-behavior design. The data never reaches the caller.
    const prisma = makePrisma({
      inventoryLevel: {
        findMany: jest.fn(async () => [{ id: 'should-not-appear' }]),
        count: jest.fn(async () => 1),
      },
    });
    const svc = new InventoryService(prisma as never, makeEventEmitter() as never);

    const result = await svc.getLevels('org1', { locationId: 'loc-L2' }, ['loc-L1']);
    expect(result).toEqual([]);
    // Crucially: DB was never even queried for the unauthorized location
    expect(prisma.inventoryLevel.findMany).not.toHaveBeenCalled();
  });
});

// ── 4. LocationScopeService — core logic ─────────────────────────────────────

describe('LocationScopeService — authorization logic', () => {
  // Import the real service — it has no DB in these unit tests; we test pure methods
  const { LocationScopeService } = require('../../common/services/location-scope.service');
  const svc = new LocationScopeService({} as never);

  it('16: isOrgWide(null) → true', () => {
    expect(svc.isOrgWide(null)).toBe(true);
  });

  it('17: isOrgWide([]) → false', () => {
    expect(svc.isOrgWide([])).toBe(false);
  });

  it('18: canAccess(null, anyId) → true', () => {
    expect(svc.canAccess(null, 'any-location')).toBe(true);
  });

  it('19: canAccess([L1], L1) → true', () => {
    expect(svc.canAccess(['loc-L1'], 'loc-L1')).toBe(true);
  });

  it('20: canAccess([L1], L2) → false', () => {
    expect(svc.canAccess(['loc-L1'], 'loc-L2')).toBe(false);
  });

  it('21: assertAccess(null, any) → no throw', () => {
    expect(() => svc.assertAccess(null, 'any')).not.toThrow();
  });

  it('22: assertAccess([L1], L1) → no throw', () => {
    expect(() => svc.assertAccess(['loc-L1'], 'loc-L1')).not.toThrow();
  });

  it('23: assertAccess([L1], L2) → ForbiddenException', () => {
    expect(() => svc.assertAccess(['loc-L1'], 'loc-L2')).toThrow(ForbiddenException);
  });

  it('24: assertAllAccess([L1,L2], [L1]) → no throw', () => {
    expect(() => svc.assertAllAccess(['loc-L1', 'loc-L2'], ['loc-L1'])).not.toThrow();
  });

  it('25: assertAllAccess([L1], [L1,L2]) → ForbiddenException', () => {
    expect(() => svc.assertAllAccess(['loc-L1'], ['loc-L1', 'loc-L2'])).toThrow(ForbiddenException);
  });

  it('26 (applyToWhere): org-wide + no requestedId → WHERE unchanged', () => {
    const where: Record<string, unknown> = { organizationId: 'org1' };
    svc.applyToWhere(where, null);
    expect(where).not.toHaveProperty('locationId');
  });

  it('27 (applyToWhere): org-wide + requestedId → adds exact filter', () => {
    const where: Record<string, unknown> = { organizationId: 'org1' };
    svc.applyToWhere(where, null, 'loc-L1');
    expect(where.locationId).toBe('loc-L1');
  });

  it('28 (applyToWhere): scoped + no requestedId → { in: [...] }', () => {
    const where: Record<string, unknown> = {};
    svc.applyToWhere(where, ['loc-L1', 'loc-L2']);
    expect(where.locationId).toEqual({ in: ['loc-L1', 'loc-L2'] });
  });

  it('29 (applyToWhere): scoped + valid requestedId → exact filter', () => {
    const where: Record<string, unknown> = {};
    svc.applyToWhere(where, ['loc-L1'], 'loc-L1');
    expect(where.locationId).toBe('loc-L1');
  });

  it('30 (applyToWhere): scoped + unauthorized requestedId → ForbiddenException', () => {
    const where: Record<string, unknown> = {};
    expect(() => svc.applyToWhere(where, ['loc-L1'], 'loc-L2')).toThrow(ForbiddenException);
  });
});

// ── 5. Cross-organization isolation ──────────────────────────────────────────

describe('Cross-organization isolation', () => {
  it('31: list query always includes organizationId in WHERE', async () => {
    const prisma = makePrisma();
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    await svc.listSalesOrders('org-correct', {}, null);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });

  it('32: findOne always scopes to organizationId in WHERE', async () => {
    const prisma = makePrisma();
    const svc = new SalesService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never);

    // Returns null = not found (organizationId mismatch handled by Prisma)
    await expect(svc.findSalesOrder('org-correct', 'order-1', null)).rejects.toThrow(NotFoundException);

    const [call] = (prisma.salesOrder.findFirst as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });

  it('33: purchasing list always includes organizationId', async () => {
    const prisma = makePrisma();
    const svc = new PurchasingService(prisma as never, makeInventoryService() as never, makeEventEmitter() as never, makeBusinessRuleService() as never, makeAuditService() as never, makePermissionsService() as never);

    await svc.listPurchaseOrders('org-correct', {}, null);

    const [call] = (prisma.purchaseOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });
});
