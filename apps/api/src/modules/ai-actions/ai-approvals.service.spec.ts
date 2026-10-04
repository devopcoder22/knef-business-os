/**
 * AIApprovalsService — security regression tests.
 *
 * Verifies that at approval execution time the service:
 *   1. Re-resolves the original requestor's permissions from the DB (current-authority check).
 *   2. Passes the requestor's current location scope to the executor (location gate preserved).
 *   3. Blocks execution if the requestor's permission has been revoked since request creation.
 *   4. Org isolation — approval lookup is always scoped to the caller's org.
 *
 * Architecture chain:
 *   approve() → resolveExecutionContext(requestor) → checkToolPermission → executor.execute(locationIds)
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AIApprovalsService } from './ai-approvals.service';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval-1',
    organizationId: 'org-1',
    actionId: 'action-1',
    requestedBy: 'user-1',
    decision: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
    reason: null,
    ...overrides,
  };
}

function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    organizationId: 'org-1',
    userId: 'user-1',
    action: 'get_inventory_levels',
    parameters: { locationId: 'loc-L1' },
    status: 'PENDING',
    tool: { id: 'tool-1', name: 'get_inventory_levels', isActive: true, category: 'inventory' },
    ...overrides,
  };
}

function makePrisma(approval = makeApproval(), action = makeAction()) {
  return {
    aIApproval: {
      findFirst: jest.fn(async () => approval),
      update: jest.fn(async () => approval),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    aIAction: {
      findFirst: jest.fn(async () => action),
      update: jest.fn(async () => action),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
  };
}

function makePermissionChecker(locationIds: string[] | null = ['loc-L1']) {
  return {
    resolveExecutionContext: jest.fn(async (userId: string, orgId: string) => ({
      userId,
      organizationId: orgId,
      resolvedPermissions: ['inventory.view'],
      locationIds,
    })),
    checkToolPermission: jest.fn(async () => undefined),
  };
}

function makeExecutor() {
  return {
    execute: jest.fn(async () => ({ levels: [] })),
  };
}

function makeService(
  prisma = makePrisma(),
  executor = makeExecutor(),
  checker = makePermissionChecker(),
) {
  return new AIApprovalsService(
    prisma as never,
    executor as never,
    checker as never,
  );
}

// ── Test 1: Location scope forwarded to executor ──────────────────────────────

describe('AIApprovalsService.approve — location scope forwarded to executor', () => {
  it('T1: passes requestor L1 locationIds to executor so location gate holds at execution', async () => {
    const checker = makePermissionChecker(['loc-L1']);
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, checker);

    await service.approve('org-1', 'approval-1', 'approver-1');

    const [, , , locationIds] = (executor.execute as jest.Mock).mock.calls[0] as [
      unknown, unknown, unknown, string[] | null
    ];
    expect(locationIds).toEqual(['loc-L1']);
  });

  it('T2: org-wide requestor (locationIds=null) passes null to executor', async () => {
    const checker = makePermissionChecker(null);
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, checker);

    await service.approve('org-1', 'approval-1', 'approver-1');

    const [, , , locationIds] = (executor.execute as jest.Mock).mock.calls[0] as [
      unknown, unknown, unknown, string[] | null
    ];
    expect(locationIds).toBeNull();
  });

  it('T3: L2 locationIds are passed to executor, not L1', async () => {
    const checker = makePermissionChecker(['loc-L2']);
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, checker);

    await service.approve('org-1', 'approval-1', 'approver-1');

    const [, , , locationIds] = (executor.execute as jest.Mock).mock.calls[0] as [
      unknown, unknown, unknown, string[] | null
    ];
    expect(locationIds).toEqual(['loc-L2']);
  });
});

// ── Test 2: Current-authority permission recheck ──────────────────────────────

describe('AIApprovalsService.approve — current-authority permission recheck', () => {
  it('T4: resolveExecutionContext called with the original requestor userId, not the approver userId', async () => {
    const action = makeAction({ userId: 'original-user' });
    const prisma = makePrisma(makeApproval(), action);
    const checker = makePermissionChecker();
    const service = makeService(prisma, makeExecutor(), checker);

    await service.approve('org-1', 'approval-1', 'approver-99');

    expect(checker.resolveExecutionContext).toHaveBeenCalledWith('original-user', 'org-1');
  });

  it('T5: checkToolPermission called with requestor context and the action tool name', async () => {
    const checker = makePermissionChecker();
    const service = makeService(makePrisma(), makeExecutor(), checker);

    await service.approve('org-1', 'approval-1', 'approver-1');

    expect(checker.checkToolPermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'get_inventory_levels',
    );
  });

  it('T6: if requestor lost permission since original request, execution is blocked', async () => {
    const checker = makePermissionChecker();
    (checker.checkToolPermission as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException('Missing required permission: inventory.view'),
    );
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, checker);

    await expect(service.approve('org-1', 'approval-1', 'approver-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('T7: if action has no userId (agent-originated), execution proceeds without permission recheck', async () => {
    const action = makeAction({ userId: null });
    const prisma = makePrisma(makeApproval(), action);
    const checker = makePermissionChecker();
    const executor = makeExecutor();
    const service = makeService(prisma, executor, checker);

    await service.approve('org-1', 'approval-1', 'approver-1');

    expect(checker.resolveExecutionContext).not.toHaveBeenCalled();
    expect(checker.checkToolPermission).not.toHaveBeenCalled();
    expect(executor.execute).toHaveBeenCalled();
  });

  it('T8: agent-originated action (no userId) executes with null locationIds', async () => {
    const action = makeAction({ userId: null });
    const prisma = makePrisma(makeApproval(), action);
    const executor = makeExecutor();
    const service = makeService(prisma, executor, makePermissionChecker());

    await service.approve('org-1', 'approval-1', 'approver-1');

    const [, , , locationIds] = (executor.execute as jest.Mock).mock.calls[0] as [
      unknown, unknown, unknown, string[] | null
    ];
    expect(locationIds).toBeNull();
  });
});

// ── Test 3: Org isolation ─────────────────────────────────────────────────────

describe('AIApprovalsService.approve — org isolation', () => {
  it('T9: approval lookup scoped to caller orgId, not action orgId', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.approve('org-caller', 'approval-1', 'approver-1');

    const [findArgs] = (prisma.aIApproval.findFirst as jest.Mock).mock.calls[0] as [
      { where: { organizationId: string } }
    ];
    expect(findArgs.where.organizationId).toBe('org-caller');
  });

  it('T10: resolveExecutionContext called with caller orgId', async () => {
    const checker = makePermissionChecker();
    const service = makeService(makePrisma(), makeExecutor(), checker);

    await service.approve('org-caller', 'approval-1', 'approver-1');

    expect(checker.resolveExecutionContext).toHaveBeenCalledWith(
      expect.any(String),
      'org-caller',
    );
  });
});

// ── Test 4: Approval not found ────────────────────────────────────────────────

describe('AIApprovalsService.approve — not found', () => {
  it('T11: throws NotFoundException if approval does not exist in org', async () => {
    const prisma = makePrisma();
    (prisma.aIApproval.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const service = makeService(prisma);

    await expect(service.approve('org-1', 'nonexistent', 'approver-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ── Test 5: Executor receives orgId ──────────────────────────────────────────

describe('AIApprovalsService.approve — executor receives correct orgId', () => {
  it('T12: executor.execute called with orgId from caller, not from stored action', async () => {
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor);

    await service.approve('org-correct', 'approval-1', 'approver-1');

    const [, , orgId] = (executor.execute as jest.Mock).mock.calls[0] as [
      unknown, unknown, string
    ];
    expect(orgId).toBe('org-correct');
  });
});
