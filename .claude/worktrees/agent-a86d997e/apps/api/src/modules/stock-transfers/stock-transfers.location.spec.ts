/**
 * StockTransfersService — location enforcement security tests
 *
 * Enforces that location-scoped users cannot create, view, or mutate
 * stock transfers involving locations they are not authorized for.
 *
 * Security rules:
 *   - findAll: user sees transfers involving at least one of their authorized locations
 *   - findOne: IDOR protected — user must have access to at least one involved location
 *   - create: BOTH fromLocation and toLocation must be authorized
 *   - addItems/submit/approve/receive/cancel: BOTH locations must be authorized
 */

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';

const makeTransfer = (fromLocationId: string, toLocationId: string, extra: Record<string, unknown> = {}) => ({
  id: 'transfer-1',
  organizationId: 'org1',
  reference: 'TRF000001',
  fromLocationId,
  toLocationId,
  status: 'PENDING',
  notes: null,
  requestedBy: 'user1',
  approvedBy: null,
  shippedAt: null,
  receivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [],
  ...extra,
});

function makePrisma(transferOverride?: Record<string, unknown> | null) {
  return {
    stockTransfer: {
      findMany: jest.fn(async () => (transferOverride ? [transferOverride] : [])),
      findFirst: jest.fn(async () => transferOverride ?? null),
      count: jest.fn(async () => (transferOverride ? 1 : 0)),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'new-transfer',
        ...args.data,
      })),
      update: jest.fn(async (_args: unknown) => ({ id: 'transfer-1', status: 'CANCELLED' })),
    },
    location: {
      findFirst: jest.fn(async (args: { where: { id: string } }) =>
        args.where.id ? { id: args.where.id, organizationId: 'org1' } : null,
      ),
    },
    inventoryLevel: {
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => null),
    },
    stockTransferItem: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => args.data),
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

describe('StockTransfersService.findAll — location filtering', () => {
  it('1: L1 user list → WHERE includes OR filter for L1', async () => {
    const prisma = makePrisma(null);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await svc.findAll('org1', {}, ['loc-L1']);

    const [call] = (prisma.stockTransfer.findMany as jest.Mock).mock.calls;
    expect(call[0].where.OR).toEqual([
      { fromLocationId: { in: ['loc-L1'] } },
      { toLocationId: { in: ['loc-L1'] } },
    ]);
  });

  it('2: org-wide user list → no OR location filter in WHERE', async () => {
    const prisma = makePrisma(null);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await svc.findAll('org1', {}, null);

    const [call] = (prisma.stockTransfer.findMany as jest.Mock).mock.calls;
    expect(call[0].where).not.toHaveProperty('OR');
  });
});

// ── 2. findOne (IDOR) ─────────────────────────────────────────────────────────

describe('StockTransfersService.findOne — IDOR protection', () => {
  it('3 (IDOR): L1 user finds L2→L2 transfer → NotFoundException', async () => {
    const transfer = makeTransfer('loc-L2', 'loc-L3');
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.findOne('org1', 'transfer-1', ['loc-L1'])).rejects.toThrow(NotFoundException);
  });

  it('4 (IDOR): L1 user finds L1→L2 transfer → allowed (has access to fromLocation)', async () => {
    const transfer = makeTransfer('loc-L1', 'loc-L2');
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    const result = await svc.findOne('org1', 'transfer-1', ['loc-L1']);
    expect(result.fromLocationId).toBe('loc-L1');
  });

  it('5 (IDOR): L2 user finds L1→L2 transfer → allowed (has access to toLocation)', async () => {
    const transfer = makeTransfer('loc-L1', 'loc-L2');
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    const result = await svc.findOne('org1', 'transfer-1', ['loc-L2']);
    expect(result.toLocationId).toBe('loc-L2');
  });

  it('6: org-wide user finds any transfer → allowed', async () => {
    const transfer = makeTransfer('loc-L3', 'loc-L4');
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    const result = await svc.findOne('org1', 'transfer-1', null);
    expect(result.id).toBe('transfer-1');
  });
});

// ── 3. create (gate) ──────────────────────────────────────────────────────────

describe('StockTransfersService.create — location gate', () => {
  it('7: L1 user creates L1→L2 transfer → ForbiddenException (L2 not authorized)', async () => {
    const prisma = makePrisma(null);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(
      svc.create('org1', { fromLocationId: 'loc-L1', toLocationId: 'loc-L2' } as never, 'user1', ['loc-L1']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('8: L1 user creates L2→L1 transfer → ForbiddenException (L2 not authorized)', async () => {
    const prisma = makePrisma(null);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(
      svc.create('org1', { fromLocationId: 'loc-L2', toLocationId: 'loc-L1' } as never, 'user1', ['loc-L1']),
    ).rejects.toThrow(ForbiddenException);
  });

  it('9: L1+L2 user creates L1→L2 transfer → passes auth gate', async () => {
    const prisma = makePrisma(makeTransfer('loc-L1', 'loc-L2'));
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    // Should not throw ForbiddenException at location gate
    let threw = false;
    try {
      await svc.create(
        'org1',
        { fromLocationId: 'loc-L1', toLocationId: 'loc-L2', items: [] } as never,
        'user1',
        ['loc-L1', 'loc-L2'],
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });

  it('10: org-wide user creates any transfer → passes auth gate', async () => {
    const prisma = makePrisma(makeTransfer('loc-L5', 'loc-L6'));
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    let threw = false;
    try {
      await svc.create(
        'org1',
        { fromLocationId: 'loc-L5', toLocationId: 'loc-L6', items: [] } as never,
        'user1',
        null,
      );
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });
});

// ── 4. State transitions (approve, cancel) ─────────────────────────────────

describe('StockTransfersService — state transition location gates', () => {
  it('11: L1 user approves L2→L3 transfer → ForbiddenException', async () => {
    const transfer = makeTransfer('loc-L2', 'loc-L3', { status: 'PENDING' });
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.approve('org1', 'transfer-1', 'user1', ['loc-L1'])).rejects.toThrow(ForbiddenException);
  });

  it('12: L1 user cancels L2→L1 transfer → ForbiddenException (L2 not authorized)', async () => {
    const transfer = makeTransfer('loc-L2', 'loc-L1', { status: 'DRAFT' });
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.cancel('org1', 'transfer-1', 'user1', ['loc-L1'])).rejects.toThrow(ForbiddenException);
  });

  it('13: L1+L2 user cancels L1→L2 transfer → passes auth gate', async () => {
    const transfer = makeTransfer('loc-L1', 'loc-L2', { status: 'DRAFT', items: [] });
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    let threw = false;
    try {
      await svc.cancel('org1', 'transfer-1', 'user1', ['loc-L1', 'loc-L2']);
    } catch (e) {
      threw = e instanceof ForbiddenException;
    }
    expect(threw).toBe(false);
  });

  it('14: L1 user submits L1→L2 transfer (needs both) → ForbiddenException', async () => {
    const transfer = makeTransfer('loc-L1', 'loc-L2', { status: 'DRAFT', items: [{ id: 'i1' }] });
    const prisma = makePrisma(transfer);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.submit('org1', 'transfer-1', 'user1', ['loc-L1'])).rejects.toThrow(ForbiddenException);
  });
});

// ── 5. Cross-org isolation ────────────────────────────────────────────────────

describe('StockTransfersService — cross-org isolation', () => {
  it('15: findAll always includes organizationId in WHERE', async () => {
    const prisma = makePrisma(null);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await svc.findAll('org-correct', {}, null);

    const [call] = (prisma.stockTransfer.findMany as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });

  it('16: findOne always scopes to organizationId in WHERE', async () => {
    const prisma = makePrisma(null);
    const svc = new StockTransfersService(prisma as never, makeInventorySvc() as never, makeAuditSvc() as never);

    await expect(svc.findOne('org-correct', 'transfer-1', null)).rejects.toThrow(NotFoundException);
    const [call] = (prisma.stockTransfer.findFirst as jest.Mock).mock.calls;
    expect(call[0].where.organizationId).toBe('org-correct');
  });
});
