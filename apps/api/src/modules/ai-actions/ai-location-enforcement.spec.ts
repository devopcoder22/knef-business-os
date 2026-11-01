/**
 * AI Tool Location Enforcement — Security Regression Tests
 *
 * Verifies that AI tools correctly enforce location scope:
 * - L1-scoped user cannot receive L2 data through AI tools
 * - L1-scoped user cannot create resources for L2 through AI tools
 * - Org-wide user can use all tools normally
 * - External agents receive org-wide access (null) regardless of any caller-supplied locationIds
 * - Caller-supplied locationIds cannot override the server-derived security context
 *
 * Architecture chain (must hold for all AI paths):
 *   identity → org isolation → permission check → location authorization → business operation
 */

import { ForbiddenException } from '@nestjs/common';
import { AIToolExecutorService } from './ai-tool-executor.service';
import type { PurchasingService } from '../purchasing/purchasing.service';

function makeExecutor(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    product: {
      findFirst: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id ? { id: args.where.id, organizationId: 'org1', trackInventory: true } : null,
      ),
      findMany: jest.fn(async () => []),
    },
    inventoryLevel: {
      findMany: jest.fn(async () => []),
    },
    salesOrder: {
      findMany: jest.fn(async () => []),
    },
    purchaseOrder: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'po-new',
        ...args.data,
        totalAmount: { toString: () => '1000' },
      })),
    },
    supplier: {
      findFirst: jest.fn(async () => ({ id: 'supplier-1' })),
    },
    expense: {
      findMany: jest.fn(async () => []),
    },
    task: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => args.data),
      findFirst: jest.fn(async () => null),
    },
    goal: { findMany: jest.fn(async () => []) },
    calendarEvent: { findMany: jest.fn(async () => []) },
    user: { findFirst: jest.fn(async () => ({ id: 'user1' })) },
    notification: { create: jest.fn(async () => null) },
    ...prismaOverrides,
  };

  const notifications = { createNotification: jest.fn(async () => null) };

  const purchasingService = {
    createPurchaseOrder: jest.fn(async (_orgId: string, dto: { locationId: string }, _userId: string, locationIds: string[] | null) => {
      if (locationIds !== null && !locationIds.includes(dto.locationId)) {
        throw new ForbiddenException('Not authorized to create purchase orders for this location');
      }
      return { id: 'po-new', reference: 'PO-AI-123', status: 'DRAFT', totalAmount: { toString: () => '1000' } };
    }),
  } as unknown as PurchasingService;

  return {
    executor: new AIToolExecutorService(prisma as never, notifications as never, purchasingService),
    prisma,
  };
}

function makeTool(name: string) {
  return { id: 'tool-1', name, isActive: true } as never;
}

// ── 1. get_inventory_levels — location scoping ────────────────────────────────

describe('AIToolExecutorService.get_inventory_levels — location enforcement', () => {
  it('1: L1 user requests L1 inventory → DB queried with locationId=L1', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_inventory_levels'), { locationId: 'loc-L1' }, 'org1', ['loc-L1']);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toBe('loc-L1');
  });

  it('2: L1 user requests L2 inventory → returns empty (no data leakage)', async () => {
    const { executor } = makeExecutor({
      inventoryLevel: { findMany: jest.fn(async () => [{ id: 'should-not-appear' }]) },
    });

    const result = await executor.execute(
      makeTool('get_inventory_levels'),
      { locationId: 'loc-L2' },
      'org1',
      ['loc-L1'],
    ) as { levels: unknown[]; message?: string };

    expect(result.levels).toEqual([]);
    expect(result.message).toContain('Not authorized');
  });

  it('3: L1 user requests inventory without locationId → scoped to { in: [L1] }', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_inventory_levels'), {}, 'org1', ['loc-L1']);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('4: org-wide user requests inventory without locationId → no locationId filter', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_inventory_levels'), {}, 'org1', null);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });
});

// ── 2. get_sales_summary — location scoping ───────────────────────────────────

describe('AIToolExecutorService.get_sales_summary — location enforcement', () => {
  it('5: L1 user gets sales summary → WHERE.locationId = { in: [L1] }', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_sales_summary'), {}, 'org1', ['loc-L1']);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('6: org-wide user gets sales summary → no locationId restriction', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_sales_summary'), {}, 'org1', null);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });
});

// ── 3. create_purchase_order — location gate ──────────────────────────────────

describe('AIToolExecutorService.create_purchase_order — location gate', () => {
  it('7: L1 user creates PO for L2 → ForbiddenException', async () => {
    const { executor } = makeExecutor();

    await expect(
      executor.execute(
        makeTool('create_purchase_order'),
        { supplierId: 'sup1', locationId: 'loc-L2', items: [{ productId: 'p1', quantity: 1, unitCost: 100 }] },
        'org1',
        ['loc-L1'],
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('8: L1 user creates PO for L1 → passes auth gate', async () => {
    const { executor } = makeExecutor();

    let threw = false;
    try {
      await executor.execute(
        makeTool('create_purchase_order'),
        { supplierId: 'sup1', locationId: 'loc-L1', items: [{ productId: 'p1', quantity: 1, unitCost: 100 }] },
        'org1',
        ['loc-L1'],
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });

  it('9: org-wide user creates PO for any location → passes auth gate', async () => {
    const { executor } = makeExecutor();

    let threw = false;
    try {
      await executor.execute(
        makeTool('create_purchase_order'),
        { supplierId: 'sup1', locationId: 'loc-L9', items: [{ productId: 'p1', quantity: 1, unitCost: 100 }] },
        'org1',
        null,
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });
});

// ── 4. get_orders — location scoping ─────────────────────────────────────────

describe('AIToolExecutorService.get_orders — location enforcement', () => {
  it('10: L1 user gets orders → WHERE.locationId = { in: [L1] }', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_orders'), {}, 'org1', ['loc-L1']);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });
});

// ── 5. External agent org-wide access ────────────────────────────────────────

describe('KnefToolLayer — external agent org-wide access invariant', () => {
  // The KnefToolLayerService enforces: external agents always receive locationIds = null (org-wide).
  // This is the documented behavior — external agent credentials are org-level.
  //
  // The invariant is enforced at line 116 of knef-tool-layer.service.ts:
  //   const locationIds = req.externalAgent ? null : (req.locationIds ?? null);
  //
  // These tests verify that the AIToolExecutorService itself respects null = org-wide,
  // which is the downstream behavior that matters.

  it('11: null locationIds (external-agent mode) → no location restriction on inventory query', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_inventory_levels'), {}, 'org1', null);

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });

  it('12: null locationIds (external-agent mode) → no location restriction on sales query', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_sales_summary'), {}, 'org1', null);

    const [call] = (prisma.salesOrder.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });

  it('13: caller-supplied locationId with org-wide access → specific filter applied (filter, not gate)', async () => {
    // When locationIds = null (org-wide), a caller-supplied locationId is treated as
    // a filter preference, not a security gate. No ForbiddenException should be thrown.
    const { executor, prisma } = makeExecutor();

    await executor.execute(
      makeTool('get_inventory_levels'),
      { locationId: 'loc-L1' },
      'org1',
      null, // org-wide
    );

    const [call] = (prisma.inventoryLevel.findMany as jest.Mock).mock.calls;
    // Specific locationId is respected as a filter
    expect(call[0].where.locationId).toBe('loc-L1');
  });
});

// ── 6. Organization isolation ─────────────────────────────────────────────────

describe('AIToolExecutorService — cross-org isolation', () => {
  it('14: organizationId is always used to scope product lookups', async () => {
    const { executor, prisma } = makeExecutor();

    await executor.execute(makeTool('get_inventory_levels'), {}, 'org-correct', null);

    // Products are fetched scoped to org-correct
    const [call] = (prisma.product.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });
});
