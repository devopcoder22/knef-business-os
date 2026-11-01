/**
 * Stage 22 — Purchase Order Approval Concurrency Tests
 *
 * The approval flow uses a conditional updateMany(WHERE status=SUBMITTED) as an
 * optimistic lock. This prevents concurrent double-approval without requiring
 * a Serializable transaction.
 *
 * Coverage:
 *  1.  First approver wins — updateMany returns count=1, approval committed
 *  2.  Second concurrent approver sees count=0 → re-reads APPROVED → idempotent return
 *  3.  Second concurrent approver sees count=0, order cancelled → BadRequestException
 *  4.  Self-approval prevented → ForbiddenException
 *  5.  Only SUBMITTED orders can be approved → BadRequestException for DRAFT
 *  6.  Already APPROVED → idempotent return without updateMany
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const ORG = 'org-1';
const PO_ID = 'po-1';
const APPROVER_ID = 'user-approver';
const CREATOR_ID = 'user-creator';

function makeEventEmitter() {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}
function makeAuditService() {
  return { log: jest.fn(async () => undefined) };
}
function makeBusinessRuleService() {
  return {
    checkPurchaseAmount: jest.fn(async () => ({ allowed: true, approvalRequired: false })),
  };
}
function makePermissionsService() {
  return {
    getResolvedPermissions: jest.fn(async () => ({
      data: { effective: ['purchasing.create', 'purchasing.approve'] },
    })),
  };
}
function makeInventoryService() {
  return { recordMovement: jest.fn(async () => ({})) };
}
function makeSubmittedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: PO_ID,
    organizationId: ORG,
    status: 'SUBMITTED',
    createdBy: CREATOR_ID,
    locationId: 'loc-1',
    supplierId: 'sup-1',
    totalAmount: '200000',
    reference: 'PO-001',
    ...overrides,
  };
}

function makePurchasingService(prisma: Record<string, unknown>) {
  return new PurchasingService(
    prisma as never,
    makeInventoryService() as never,
    makeEventEmitter(),
    makeBusinessRuleService() as never,
    makeAuditService() as never,
    makePermissionsService() as never,
  );
}

// ── 1: First approver wins ────────────────────────────────────────────────────

describe('PurchasingService.approvePurchaseOrder — first approver wins', () => {
  it('1: updateMany returns count=1 → approval committed, returns order', async () => {
    const order = makeSubmittedOrder();
    const approvedOrder = { ...order, status: 'APPROVED', approvedBy: APPROVER_ID };
    const updateMany = jest.fn(async () => ({ count: 1 }));

    const prisma = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValueOnce(order).mockResolvedValue(approvedOrder),
        updateMany,
      },
      user: { findFirst: jest.fn(async () => ({ id: CREATOR_ID })) },
    };

    const svc = makePurchasingService(prisma as Record<string, unknown>);
    const result = await svc.approvePurchaseOrder(ORG, PO_ID, APPROVER_ID, null);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: PO_ID, status: 'SUBMITTED' }),
      }),
    );
    expect(result).toMatchObject({ status: 'APPROVED' });
  });
});

// ── 2: Second concurrent approver — order already APPROVED ───────────────────

describe('PurchasingService.approvePurchaseOrder — concurrent second approver sees APPROVED', () => {
  it('2: updateMany returns count=0, re-read shows APPROVED → idempotent return', async () => {
    const order = makeSubmittedOrder();
    const alreadyApproved = { ...order, status: 'APPROVED', approvedBy: 'user-first-approver' };

    const prisma = {
      purchaseOrder: {
        // First findFirst (initial check) returns SUBMITTED
        // Second findFirst (after updateMany=0) returns APPROVED
        findFirst: jest.fn()
          .mockResolvedValueOnce(order)           // initial read
          .mockResolvedValueOnce(alreadyApproved), // re-read after conflict
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      user: { findFirst: jest.fn(async () => ({ id: CREATOR_ID })) },
    };

    const svc = makePurchasingService(prisma as Record<string, unknown>);
    const result = await svc.approvePurchaseOrder(ORG, PO_ID, APPROVER_ID, null) as Record<string, unknown>;

    expect(result.idempotent).toBe(true);
    expect(result.status).toBe('APPROVED');
  });
});

// ── 3: Second concurrent approver — order cancelled in race ──────────────────

describe('PurchasingService.approvePurchaseOrder — concurrent cancellation race', () => {
  it('3: updateMany returns count=0, re-read shows CANCELLED → BadRequestException', async () => {
    const order = makeSubmittedOrder();
    const cancelledOrder = { ...order, status: 'CANCELLED' };

    const prisma = {
      purchaseOrder: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(order)
          .mockResolvedValueOnce(cancelledOrder),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      user: { findFirst: jest.fn(async () => ({ id: CREATOR_ID })) },
    };

    const svc = makePurchasingService(prisma as Record<string, unknown>);
    await expect(
      svc.approvePurchaseOrder(ORG, PO_ID, APPROVER_ID, null),
    ).rejects.toThrow(BadRequestException);
  });
});

// ── 4: Self-approval prevented ────────────────────────────────────────────────

describe('PurchasingService.approvePurchaseOrder — self-approval', () => {
  it('4: approver is the creator → ForbiddenException before updateMany', async () => {
    const order = makeSubmittedOrder({ createdBy: APPROVER_ID }); // same person
    const updateMany = jest.fn(async () => ({ count: 0 }));

    const prisma = {
      purchaseOrder: { findFirst: jest.fn(async () => order), updateMany },
      user: { findFirst: jest.fn(async () => ({ id: APPROVER_ID })) },
    };

    const svc = makePurchasingService(prisma as Record<string, unknown>);
    await expect(
      svc.approvePurchaseOrder(ORG, PO_ID, APPROVER_ID, null),
    ).rejects.toThrow(ForbiddenException);

    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ── 5: Non-SUBMITTED order rejected ──────────────────────────────────────────

describe('PurchasingService.approvePurchaseOrder — non-SUBMITTED order', () => {
  it('5: DRAFT order → BadRequestException before any DB write', async () => {
    const order = makeSubmittedOrder({ status: 'DRAFT' });
    const updateMany = jest.fn(async () => ({ count: 0 }));

    const prisma = {
      purchaseOrder: { findFirst: jest.fn(async () => order), updateMany },
      user: { findFirst: jest.fn(async () => ({ id: CREATOR_ID })) },
    };

    const svc = makePurchasingService(prisma as Record<string, unknown>);
    await expect(
      svc.approvePurchaseOrder(ORG, PO_ID, APPROVER_ID, null),
    ).rejects.toThrow(BadRequestException);

    expect(updateMany).not.toHaveBeenCalled();
  });
});

// ── 6: Already APPROVED — idempotent fast-path ────────────────────────────────

describe('PurchasingService.approvePurchaseOrder — already APPROVED idempotency', () => {
  it('6: initial read already APPROVED → idempotent return without updateMany', async () => {
    const order = makeSubmittedOrder({ status: 'APPROVED', approvedBy: APPROVER_ID });
    const updateMany = jest.fn(async () => ({ count: 0 }));

    const prisma = {
      purchaseOrder: { findFirst: jest.fn(async () => order), updateMany },
      user: { findFirst: jest.fn(async () => ({ id: CREATOR_ID })) },
    };

    const svc = makePurchasingService(prisma as Record<string, unknown>);
    const result = await svc.approvePurchaseOrder(ORG, PO_ID, APPROVER_ID, null) as Record<string, unknown>;

    expect(result.idempotent).toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
