/**
 * StockAdjustmentsService — location enforcement security tests
 *
 * Enforces that location-scoped users can only create, view, or mutate
 * stock adjustments for locations they are authorized for.
 */

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';

function makeAdjustment(locationId: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'adj-1',
    organizationId: 'org1',
    locationId,
    reference: 'ADJ000001',
    reason: 'COUNT_CORRECTION',
    notes: null,
    adjustedBy: 'user1',
    approvedBy: null,
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    ...extra,
  };
}

function makePrisma(adjOverride?: Record<string, unknown> | null) {
  return {
    stockAdjustment: {
      findMany: jest.fn(async () => (adjOverride ? [adjOverride] : [])),
      findFirst: jest.fn(async () => adjOverride ?? null),
      count: jest.fn(async () => (adjOverride ? 1 : 0)),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'adj-new', ...args.data })),
      update: jest.fn(async (_args: unknown) => ({ id: 'adj-1', status: 'APPROVED' })),
    },
    stockAdjustmentItem: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => args.data),
    },
    location: {
      findFirst: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id ? { id: args.where.id, organizationId: 'org1' } : null,
      ),
    },
    inventoryLevel: {
      findFirst: jest.fn(async () => ({ quantity: 10 })),
    },
  };
}

function makeInventorySvc() {
  return { recordMovement: jest.fn() };
}

function makeAuditSvc() {
  return { log: jest.fn() };
}

// ── 1. findAll ────────────────────────────────────────────────────────────────

describe('StockAdjustmentsService.findAll — location filtering', () => {
  it('1: L1 user list → WHERE.locationId = { in: [L1] }', async () => {
    const prisma = makePrisma(null);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await svc.findAll('org1', {}, ['loc-L1']);

    const [call] = (prisma.stockAdjustment.findMany as jest.Mock).mock.calls;
    expect(call[0].where.locationId).toEqual({ in: ['loc-L1'] });
  });

  it('2: org-wide user list → no locationId filter', async () => {
    const prisma = makePrisma(null);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await svc.findAll('org1', {}, null);

    const [call] = (prisma.stockAdjustment.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('locationId');
  });
});

// ── 2. findOne (IDOR) ─────────────────────────────────────────────────────────

describe('StockAdjustmentsService.findOne — IDOR protection', () => {
  it('3 (IDOR): L1 user finds L2 adjustment → NotFoundException', async () => {
    const adj = makeAdjustment('loc-L2');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.findOne('org1', 'adj-1', ['loc-L1'])).rejects.toThrow(NotFoundException);
  });

  it('4: L1 user finds L1 adjustment → allowed', async () => {
    const adj = makeAdjustment('loc-L1');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    const result = await svc.findOne('org1', 'adj-1', ['loc-L1']);
    expect(result.locationId).toBe('loc-L1');
  });

  it('5: org-wide user finds any adjustment → allowed', async () => {
    const adj = makeAdjustment('loc-L9');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    const result = await svc.findOne('org1', 'adj-1', null);
    expect(result.id).toBe('adj-1');
  });
});

// ── 3. create (gate) ──────────────────────────────────────────────────────────

describe('StockAdjustmentsService.create — location gate', () => {
  it('6: L1 user creates adjustment for L2 → ForbiddenException', async () => {
    const prisma = makePrisma(null);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(
      svc.create('org1', { locationId: 'loc-L2', items: [], reason: 'DAMAGED' } as never, 'user1', ['loc-L1']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('7: L1 user creates adjustment for L1 → passes auth gate', async () => {
    const prisma = makePrisma(makeAdjustment('loc-L1'));
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    let threw = false;
    try {
      await svc.create(
        'org1',
        { locationId: 'loc-L1', items: [], reason: 'DAMAGED' } as never,
        'user1',
        ['loc-L1'],
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });

  it('8: org-wide user creates adjustment for any location → passes auth gate', async () => {
    const prisma = makePrisma(makeAdjustment('loc-L9'));
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    let threw = false;
    try {
      await svc.create(
        'org1',
        { locationId: 'loc-L9', items: [], reason: 'DAMAGED' } as never,
        'user1',
        null,
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });
});

// ── 4. approve / reject ───────────────────────────────────────────────────────

describe('StockAdjustmentsService — approve/reject location gates', () => {
  it('9: L1 user approves L2 adjustment → ForbiddenException', async () => {
    const adj = makeAdjustment('loc-L2');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.approve('org1', 'adj-1', 'user1', ['loc-L1'])).rejects.toThrow(ForbiddenException);
  });

  it('10: L1 user approves L1 adjustment → passes auth gate', async () => {
    const adj = makeAdjustment('loc-L1');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    let threw = false;
    try {
      await svc.approve('org1', 'adj-1', 'user1', ['loc-L1']);
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });

  it('11: L1 user rejects L2 adjustment → ForbiddenException', async () => {
    const adj = makeAdjustment('loc-L2');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.reject('org1', 'adj-1', 'user1', 'reason', ['loc-L1'])).rejects.toThrow(ForbiddenException);
  });

  it('12: org-wide user approves any adjustment → passes auth gate', async () => {
    const adj = makeAdjustment('loc-L9');
    const prisma = makePrisma(adj);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    let threw = false;
    try {
      await svc.approve('org1', 'adj-1', 'user1', null);
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });
});

// ── 5. Cross-org isolation ────────────────────────────────────────────────────

describe('StockAdjustmentsService — cross-org isolation', () => {
  it('13: findAll always includes organizationId in WHERE', async () => {
    const prisma = makePrisma(null);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await svc.findAll('org-correct', {}, null);

    const [call] = (prisma.stockAdjustment.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });

  it('14: findOne always scopes to organizationId', async () => {
    const prisma = makePrisma(null);
    const svc = new StockAdjustmentsService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.findOne('org-correct', 'adj-1', null)).rejects.toThrow(NotFoundException);
    const [call] = (prisma.stockAdjustment.findFirst as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });
});
