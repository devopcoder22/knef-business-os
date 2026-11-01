/**
 * Global Search — Service Tests
 *
 * Covers:
 *  1. Short-query guard
 *  2. Per-entity permission filtering (users cannot see entities they lack view on)
 *  3. Organization isolation (orgId sourced from AuthUser, never from input)
 *  4. Location scope enforcement:
 *      - null  → no locationId filter
 *      - []    → zero results (deny-all)
 *      - [...] → where.locationId = { in: [...] }
 *  5. Sensitive-field minimisation (salary, bank, gateway data never selected)
 *  6. Type filtering (?types=PRODUCT,CUSTOMER)
 *  7. Response shape (query, total, results, byType)
 */

import type { AuthUser } from '@knef/types';
import { SearchService } from './search.service';

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'u@example.com',
    firstName: 'U',
    lastName: 'One',
    roles: [],
    permissions: [],
    locationIds: null,
    ...overrides,
  };
}

const ALL_PERMS = [
  'products.view',
  'customers.view',
  'sales.view',
  'staff.view',
  'suppliers.view',
  'finance.view',
  'inventory.view',
  'tasks.view',
];

function makePrisma() {
  return {
    product: { findMany: jest.fn(async () => []) },
    customer: { findMany: jest.fn(async () => []) },
    salesOrder: { findMany: jest.fn(async () => []) },
    invoice: { findMany: jest.fn(async () => []) },
    employee: { findMany: jest.fn(async () => []) },
    supplier: { findMany: jest.fn(async () => []) },
    payment: { findMany: jest.fn(async () => []) },
    expense: { findMany: jest.fn(async () => []) },
    bankTransaction: { findMany: jest.fn(async () => []) },
    serializedUnit: { findMany: jest.fn(async () => []) },
    task: { findMany: jest.fn(async () => []) },
  };
}

function makeLocationScope(ret: string[] | null = null) {
  return {
    getUserLocationIds: jest.fn(async () => ret),
    isOrgWide: jest.fn((ids: string[] | null) => ids === null),
    assertAccess: jest.fn(),
    assertAllAccess: jest.fn(),
    applyToWhere: jest.fn(),
    canAccess: jest.fn(),
  };
}

type PrismaMock = {
  product: { findMany: jest.Mock };
  customer: { findMany: jest.Mock };
  salesOrder: { findMany: jest.Mock };
  invoice: { findMany: jest.Mock };
  employee: { findMany: jest.Mock };
  supplier: { findMany: jest.Mock };
  payment: { findMany: jest.Mock };
  expense: { findMany: jest.Mock };
  bankTransaction: { findMany: jest.Mock };
  serializedUnit: { findMany: jest.Mock };
  task: { findMany: jest.Mock };
};

function buildService(
  prismaOverrides: Record<string, unknown> = {},
  locScope = makeLocationScope(),
) {
  const prisma = { ...makePrisma(), ...prismaOverrides } as PrismaMock;
  const svc = new SearchService(prisma as never, locScope as never);
  return { svc, prisma, locScope };
}

// ─────────────────────────────────────────────────────────────
describe('SearchService — GlobalSearch guards', () => {
  it('returns an empty response when q is shorter than 2 chars', async () => {
    const { svc } = buildService();
    const res = await svc.globalSearch(makeUser({ permissions: ALL_PERMS }), { q: 'a' } as never);
    expect(res).toEqual({ query: 'a', total: 0, results: [], byType: {} });
  });

  it('returns an empty response when q exceeds 100 chars (defensive)', async () => {
    const { svc } = buildService();
    const q = 'x'.repeat(101);
    const res = await svc.globalSearch(makeUser({ permissions: ALL_PERMS }), { q } as never);
    expect(res.total).toBe(0);
    expect(res.results).toEqual([]);
  });

  it('returns an empty response when user has NO permissions', async () => {
    const { svc, prisma } = buildService();
    const res = await svc.globalSearch(makeUser({ permissions: [] }), { q: 'hello' } as never);
    expect(res).toEqual({ query: 'hello', total: 0, results: [], byType: {} });
    for (const model of Object.values(prisma)) {
      expect((model as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Products', () => {
  it('matches by name/sku/barcode/variants, scoped to organizationId', async () => {
    const { svc, prisma } = buildService({
      product: {
        findMany: jest.fn(async () => [
          { id: 'p1', name: 'iPhone', sku: 'SKU1', barcode: null, status: 'ACTIVE' },
        ]),
      },
    });

    const res = await svc.globalSearch(
      makeUser({ organizationId: 'org-99', permissions: ['products.view'] }),
      { q: 'iphone' } as never,
    );

    expect(res.total).toBe(1);
    expect(res.results[0]).toMatchObject({
      type: 'PRODUCT',
      id: 'p1',
      title: 'iPhone',
      route: '/products/p1',
    });

    const [call] = prisma.product.findMany.mock.calls;
    expect(call[0].where.organizationId).toBe('org-99');
    const or = call[0].where.OR;
    expect(or.some((c: any) => c.name?.contains === 'iphone')).toBe(true);
    expect(or.some((c: any) => c.sku?.contains === 'iphone')).toBe(true);
    expect(or.some((c: any) => c.barcode?.equals === 'iphone')).toBe(true);
    expect(or.some((c: any) => c.gtin?.equals === 'iphone')).toBe(true);
    expect(or.some((c: any) => c.variants?.some?.sku?.contains === 'iphone')).toBe(true);
  });

  it('does not run product query if user lacks products.view', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ['customers.view'] }),
      { q: 'hello' } as never,
    );
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('selects only id/name/sku/barcode/status (no prices)', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ['products.view'] }),
      { q: 'xx' } as never,
    );
    const [call] = prisma.product.findMany.mock.calls;
    const select = call[0].select;
    expect(select).toEqual({ id: true, name: true, sku: true, barcode: true, status: true });
    expect(select.costPrice).toBeUndefined();
    expect(select.sellingPrice).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Customers', () => {
  it('matches firstName/lastName/phone/email/code', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ['customers.view'] }),
      { q: 'jane' } as never,
    );
    const or = prisma.customer.findMany.mock.calls[0][0].where.OR;
    expect(or.some((c: any) => c.firstName?.contains === 'jane')).toBe(true);
    expect(or.some((c: any) => c.lastName?.contains === 'jane')).toBe(true);
    expect(or.some((c: any) => c.phone?.contains === 'jane')).toBe(true);
    expect(or.some((c: any) => c.email?.contains === 'jane')).toBe(true);
    expect(or.some((c: any) => c.code?.equals === 'jane')).toBe(true);
  });

  it('does not query if user lacks customers.view', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'jane' } as never);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('does NOT select financial fields (totalSpent, creditLimit, outstandingBalance, loyaltyPoints)', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['customers.view'] }), { q: 'jane' } as never);
    const select = prisma.customer.findMany.mock.calls[0][0].select;
    expect(select.totalSpent).toBeUndefined();
    expect(select.creditLimit).toBeUndefined();
    expect(select.outstandingBalance).toBeUndefined();
    expect(select.loyaltyPoints).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Orders (location-aware)', () => {
  it('org-wide user: no locationId filter in WHERE', async () => {
    const loc = makeLocationScope(null);
    const { svc, prisma } = buildService({}, loc);
    await svc.globalSearch(
      makeUser({ permissions: ['sales.view'] }),
      { q: 'INV' } as never,
    );
    const where = prisma.salesOrder.findMany.mock.calls[0][0].where;
    expect(where.locationId).toBeUndefined();
  });

  it('location-scoped user: locationId = { in: [...] }', async () => {
    const loc = makeLocationScope(['L1', 'L2']);
    const { svc, prisma } = buildService({}, loc);
    await svc.globalSearch(
      makeUser({ permissions: ['sales.view'] }),
      { q: 'INV' } as never,
    );
    const where = prisma.salesOrder.findMany.mock.calls[0][0].where;
    expect(where.locationId).toEqual({ in: ['L1', 'L2'] });
  });

  it('deny-all (locationIds = []): returns zero order results without querying', async () => {
    const loc = makeLocationScope([]);
    const { svc, prisma } = buildService({}, loc);
    const res = await svc.globalSearch(
      makeUser({ permissions: ['sales.view'] }),
      { q: 'INV' } as never,
    );
    expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
    expect(res.byType.ORDER).toEqual([]);
  });

  it('user without sales.view: no order query runs', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'INV' } as never);
    expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
  });

  it('always filters by organizationId from AuthUser (never from input)', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ organizationId: 'ORG-TRUE', permissions: ['sales.view'] }),
      { q: 'INV' } as never,
    );
    expect(prisma.salesOrder.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUE');
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Invoices', () => {
  it('matches reference', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['sales.view'] }), { q: 'INV-1' } as never);
    const or = prisma.invoice.findMany.mock.calls[0][0].where.OR;
    expect(or.some((c: any) => c.reference?.contains === 'INV-1')).toBe(true);
  });

  it('does not query if user lacks sales.view', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'INV' } as never);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Staff (location-aware, sensitive)', () => {
  it('matches user firstName/lastName/email/employeeNumber', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['staff.view'] }), { q: 'john' } as never);
    const or = prisma.employee.findMany.mock.calls[0][0].where.OR;
    expect(or.some((c: any) => c.user?.firstName?.contains === 'john')).toBe(true);
    expect(or.some((c: any) => c.user?.lastName?.contains === 'john')).toBe(true);
    expect(or.some((c: any) => c.user?.email?.contains === 'john')).toBe(true);
    expect(or.some((c: any) => c.employeeNumber?.contains === 'john')).toBe(true);
  });

  it('applies location scope to Employee.locationId', async () => {
    const loc = makeLocationScope(['L1']);
    const { svc, prisma } = buildService({}, loc);
    await svc.globalSearch(makeUser({ permissions: ['staff.view'] }), { q: 'john' } as never);
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.locationId).toEqual({ in: ['L1'] });
  });

  it('deny-all (locationIds = []): zero staff results', async () => {
    const loc = makeLocationScope([]);
    const { svc, prisma } = buildService({}, loc);
    const res = await svc.globalSearch(makeUser({ permissions: ['staff.view'] }), { q: 'john' } as never);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
    expect(res.byType.STAFF).toEqual([]);
  });

  it('user without staff.view: no employee query runs', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'john' } as never);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('select does NOT include salary, bankAccount, emergencyPhone', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['staff.view'] }), { q: 'john' } as never);
    const select = prisma.employee.findMany.mock.calls[0][0].select;
    expect(select.salary).toBeUndefined();
    expect(select.bankAccount).toBeUndefined();
    expect(select.bankName).toBeUndefined();
    expect(select.bankCode).toBeUndefined();
    expect(select.emergencyName).toBeUndefined();
    expect(select.emergencyPhone).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Suppliers', () => {
  it('matches name/code/phone/email', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['suppliers.view'] }), { q: 'acme' } as never);
    const or = prisma.supplier.findMany.mock.calls[0][0].where.OR;
    expect(or.some((c: any) => c.name?.contains === 'acme')).toBe(true);
    expect(or.some((c: any) => c.code?.contains === 'acme')).toBe(true);
    expect(or.some((c: any) => c.phone?.contains === 'acme')).toBe(true);
    expect(or.some((c: any) => c.email?.contains === 'acme')).toBe(true);
  });

  it('does not query if user lacks suppliers.view', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'acme' } as never);
    expect(prisma.supplier.findMany).not.toHaveBeenCalled();
  });

  it('select does NOT include bankName/bankAccount/bankCode/taxId', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['suppliers.view'] }), { q: 'acme' } as never);
    const select = prisma.supplier.findMany.mock.calls[0][0].select;
    expect(select.bankName).toBeUndefined();
    expect(select.bankAccount).toBeUndefined();
    expect(select.bankCode).toBeUndefined();
    expect(select.taxId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Transactions (combined)', () => {
  it('runs all three sources in parallel: payments, expenses, bankTransactions', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['finance.view'] }), { q: 'REF-1' } as never);
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.expense.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.bankTransaction.findMany).toHaveBeenCalledTimes(1);
  });

  it('user without finance.view: no transaction queries run', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'REF' } as never);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.findMany).not.toHaveBeenCalled();
  });

  it('select does NOT include gatewayData, balanceBefore, balanceAfter', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['finance.view'] }), { q: 'REF' } as never);
    expect(prisma.payment.findMany.mock.calls[0][0].select.gatewayData).toBeUndefined();
    expect(prisma.bankTransaction.findMany.mock.calls[0][0].select.balanceBefore).toBeUndefined();
    expect(prisma.bankTransaction.findMany.mock.calls[0][0].select.balanceAfter).toBeUndefined();
    expect(prisma.expense.findMany.mock.calls[0][0].select.bankAccountId).toBeUndefined();
  });

  it('tags result source via metadata.source', async () => {
    const { svc } = buildService({
      payment: {
        findMany: jest.fn(async () => [
          { id: 'pay-1', reference: 'PAY', amount: '10', method: 'CASH', status: 'COMPLETED' },
        ]),
      },
      expense: {
        findMany: jest.fn(async () => [
          { id: 'ex-1', reference: 'EXP', amount: '5', description: 'd', vendor: 'v', status: 'PAID' },
        ]),
      },
      bankTransaction: {
        findMany: jest.fn(async () => [
          { id: 'bt-1', description: 'd', amount: '3', type: 'DEBIT', reference: 'BT' },
        ]),
      },
    });

    const res = await svc.globalSearch(
      makeUser({ permissions: ['finance.view'] }),
      { q: 'xx', limit: 10 } as never,
    );

    const sources = (res.byType.TRANSACTION ?? []).map((r) => r.metadata?.source);
    expect(sources).toEqual(expect.arrayContaining(['PAYMENT', 'EXPENSE', 'BANK_TRANSACTION']));
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — SerializedUnits (location-aware)', () => {
  it('exact + prefix match on imei1 / imei2 / serialNumber', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ['inventory.view'] }),
      { q: '358' } as never,
    );
    const or = prisma.serializedUnit.findMany.mock.calls[0][0].where.OR;
    expect(or.some((c: any) => c.imei1?.startsWith === '358')).toBe(true);
    expect(or.some((c: any) => c.imei2?.startsWith === '358')).toBe(true);
    expect(or.some((c: any) => c.serialNumber?.startsWith === '358')).toBe(true);
    expect(or.some((c: any) => c.imei1?.equals === '358')).toBe(true);
    expect(or.some((c: any) => c.imei2?.equals === '358')).toBe(true);
    expect(or.some((c: any) => c.serialNumber?.equals === '358')).toBe(true);
  });

  it('applies location scope to SerializedUnit.locationId', async () => {
    const loc = makeLocationScope(['L1']);
    const { svc, prisma } = buildService({}, loc);
    await svc.globalSearch(
      makeUser({ permissions: ['inventory.view'] }),
      { q: '358' } as never,
    );
    expect(prisma.serializedUnit.findMany.mock.calls[0][0].where.locationId).toEqual({ in: ['L1'] });
  });

  it('deny-all: zero serialized-unit results', async () => {
    const loc = makeLocationScope([]);
    const { svc, prisma } = buildService({}, loc);
    const res = await svc.globalSearch(
      makeUser({ permissions: ['inventory.view'] }),
      { q: '358' } as never,
    );
    expect(prisma.serializedUnit.findMany).not.toHaveBeenCalled();
    expect(res.byType.SERIALIZED_UNIT).toEqual([]);
  });

  it('user without inventory.view: no serialized-unit query runs', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ['products.view'] }),
      { q: '358' } as never,
    );
    expect(prisma.serializedUnit.findMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Tasks', () => {
  it('matches title (contains, insensitive) and tags (has)', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['tasks.view'] }), { q: 'urgent' } as never);
    const or = prisma.task.findMany.mock.calls[0][0].where.OR;
    expect(or.some((c: any) => c.title?.contains === 'urgent' && c.title?.mode === 'insensitive')).toBe(true);
    expect(or.some((c: any) => c.tags?.has === 'urgent')).toBe(true);
  });

  it('does not query if user lacks tasks.view', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'urgent' } as never);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Mixed permissions', () => {
  it('user with [products.view, customers.view] gets product & customer but NOT transaction results', async () => {
    const { svc, prisma } = buildService({
      product: {
        findMany: jest.fn(async () => [
          { id: 'p1', name: 'iPhone', sku: 'SKU1', barcode: null, status: 'ACTIVE' },
        ]),
      },
      customer: {
        findMany: jest.fn(async () => [
          { id: 'c1', firstName: 'Jane', lastName: 'Doe', phone: '555', email: null, code: 'C1' },
        ]),
      },
    });

    const res = await svc.globalSearch(
      makeUser({ permissions: ['products.view', 'customers.view'] }),
      { q: 'xx' } as never,
    );

    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.findMany).not.toHaveBeenCalled();

    expect(res.byType.PRODUCT).toHaveLength(1);
    expect(res.byType.CUSTOMER).toHaveLength(1);
    expect(res.byType.TRANSACTION).toBeUndefined();
    expect(res.byType.STAFF).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Type filtering', () => {
  it('types=PRODUCT: only products are queried', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ALL_PERMS }),
      { q: 'xx', types: 'PRODUCT' } as never,
    );
    expect(prisma.product.findMany).toHaveBeenCalled();
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
  });

  it('types=PRODUCT,CUSTOMER: both are queried', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ALL_PERMS }),
      { q: 'xx', types: 'PRODUCT,CUSTOMER' } as never,
    );
    expect(prisma.product.findMany).toHaveBeenCalled();
    expect(prisma.customer.findMany).toHaveBeenCalled();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('types=INVALID: no queries run (unknown types are discarded)', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ permissions: ALL_PERMS }),
      { q: 'xx', types: 'INVALID,BOGUS' } as never,
    );
    for (const model of Object.values(prisma)) {
      expect((model as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
    }
  });

  it('types=TRANSACTION but no finance.view: zero transactions returned', async () => {
    const { svc, prisma } = buildService();
    const res = await svc.globalSearch(
      makeUser({ permissions: ['products.view'] }),
      { q: 'xx', types: 'TRANSACTION' } as never,
    );
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(res.byType.TRANSACTION).toBeUndefined();
    expect(res.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Organization isolation', () => {
  it('every entity query includes organizationId from AuthUser', async () => {
    const { svc, prisma } = buildService();
    await svc.globalSearch(
      makeUser({ organizationId: 'ORG-TRUTH', permissions: ALL_PERMS }),
      { q: 'xx' } as never,
    );
    expect(prisma.product.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.customer.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.salesOrder.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.invoice.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.employee.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.supplier.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.payment.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.expense.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.bankTransaction.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.serializedUnit.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
    expect(prisma.task.findMany.mock.calls[0][0].where.organizationId).toBe('ORG-TRUTH');
  });
});

// ─────────────────────────────────────────────────────────────
describe('SearchService — Response shape', () => {
  it('returns { query, total, results, byType } correctly populated', async () => {
    const { svc } = buildService({
      product: {
        findMany: jest.fn(async () => [
          { id: 'p1', name: 'iPhone', sku: 'SKU1', barcode: null, status: 'ACTIVE' },
        ]),
      },
      customer: {
        findMany: jest.fn(async () => [
          { id: 'c1', firstName: 'Jane', lastName: 'Doe', phone: '555', email: null, code: 'C1' },
        ]),
      },
    });

    const res = await svc.globalSearch(
      makeUser({ permissions: ['products.view', 'customers.view'] }),
      { q: 'xx' } as never,
    );

    expect(res.query).toBe('xx');
    expect(res.total).toBe(2);
    expect(res.results).toHaveLength(2);
    expect(res.byType.PRODUCT).toHaveLength(1);
    expect(res.byType.CUSTOMER).toHaveLength(1);
  });

  it('fresh location scope is requested only when a location-aware entity is permitted', async () => {
    const loc = makeLocationScope(null);
    const { svc } = buildService({}, loc);
    await svc.globalSearch(makeUser({ permissions: ['products.view'] }), { q: 'xx' } as never);
    expect(loc.getUserLocationIds).not.toHaveBeenCalled();

    const loc2 = makeLocationScope(null);
    const { svc: svc2 } = buildService({}, loc2);
    await svc2.globalSearch(makeUser({ permissions: ['sales.view'] }), { q: 'xx' } as never);
    expect(loc2.getUserLocationIds).toHaveBeenCalledWith('user-1');
  });
});
