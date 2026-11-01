/**
 * AIApprovalsService — security regression tests.
 *
 * Verifies that at approval execution time the service:
 *   1. Re-resolves the original requestor's permissions from the DB (current-authority check).
 *   2. Passes the requestor's current location scope to the executor (location gate preserved).
 *   3. Blocks execution if the requestor's permission has been revoked since request creation.
 *   4. Org isolation — approval lookup is always scoped to the caller's org.
 *   5. Duplicate approval execution is prevented (sequential and concurrent).
 *   6. Terminal action states are respected (COMPLETED/FAILED/REJECTED).
 *   7. Re-evaluates current autonomy policy at execution time (tightened policy blocks stale approvals).
 *
 * Architecture chain:
 *   approve() → evaluatePostApproval (policy recheck)
 *             → resolveExecutionContext(requestor) → checkToolPermission
 *             → atomic claim (updateMany PENDING/APPROVED → EXECUTING)
 *             → executor.execute(locationIds)
 */

import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
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
    externalAgentId: null,
    action: 'get_inventory_levels',
    parameters: { locationId: 'loc-L1' },
    status: 'PENDING',
    result: null,
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
      updateMany: jest.fn(async () => ({ count: 1 })), // default: atomic claim succeeds
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

function makePolicyService(blocked = false, reason?: string) {
  return {
    evaluatePostApproval: jest.fn(async () => ({
      blocked,
      reason: blocked ? (reason ?? 'Policy blocked') : undefined,
    })),
  };
}

function makeService(
  prisma = makePrisma(),
  executor = makeExecutor(),
  checker = makePermissionChecker(),
  policy = makePolicyService(),
) {
  return new AIApprovalsService(
    prisma as never,
    executor as never,
    checker as never,
    policy as never,
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

// ── Test 6: Duplicate approval prevention ────────────────────────────────────

describe('AIApprovalsService.approve — duplicate execution prevention', () => {
  it('T13: sequential duplicate — second approve() returns result without calling executor again', async () => {
    const executor = makeExecutor();
    const prisma = makePrisma();
    const service = makeService(prisma, executor);

    // First call succeeds normally
    await service.approve('org-1', 'approval-1', 'approver-1');

    // Second call: action is now COMPLETED
    const completedAction = makeAction({ status: 'COMPLETED', result: { levels: [] } });
    (prisma.aIAction.findFirst as jest.Mock).mockResolvedValueOnce(completedAction);

    const secondResult = await service.approve('org-1', 'approval-1', 'approver-1');

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(secondResult).toMatchObject({ status: 'COMPLETED' });
  });

  it('T14: concurrent duplicate — atomic claim ensures only one caller executes', async () => {
    const executor = makeExecutor();
    const prisma = makePrisma();
    const service = makeService(prisma, executor);

    // First updateMany call wins (count=1), all subsequent callers lose (count=0)
    let claimAttempts = 0;
    (prisma.aIAction.updateMany as jest.Mock).mockImplementation(async () => {
      claimAttempts++;
      return { count: claimAttempts === 1 ? 1 : 0 };
    });

    // 3rd+ findFirst call (re-read after losing claim) returns COMPLETED
    let findCalls = 0;
    (prisma.aIAction.findFirst as jest.Mock).mockImplementation(async () => {
      findCalls++;
      return findCalls > 2
        ? makeAction({ status: 'COMPLETED', result: { data: 'done' } })
        : makeAction();
    });

    const [resultA, resultB] = await Promise.all([
      service.approve('org-1', 'approval-1', 'approver-A'),
      service.approve('org-1', 'approval-1', 'approver-B'),
    ]);

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(resultA).toMatchObject({ status: 'COMPLETED' });
    expect(resultB).toMatchObject({ status: 'COMPLETED' });
  });

  it('T15: already COMPLETED action — approve() returns result without executing', async () => {
    const completedAction = makeAction({ status: 'COMPLETED', result: { levels: [1, 2] } });
    const prisma = makePrisma(makeApproval(), completedAction);
    const executor = makeExecutor();
    const service = makeService(prisma, executor);

    const result = await service.approve('org-1', 'approval-1', 'approver-1');

    expect(executor.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });

  it('T16: FAILED action — approve() throws ConflictException without executing', async () => {
    const failedAction = makeAction({ status: 'FAILED' });
    const prisma = makePrisma(makeApproval(), failedAction);
    const executor = makeExecutor();
    const service = makeService(prisma, executor);

    await expect(service.approve('org-1', 'approval-1', 'approver-1')).rejects.toThrow(
      ConflictException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('T17: REJECTED approval — approve() throws ConflictException without executing', async () => {
    const rejectedApproval = makeApproval({ decision: 'REJECTED' });
    const prisma = makePrisma(rejectedApproval);
    const executor = makeExecutor();
    const service = makeService(prisma, executor);

    await expect(service.approve('org-1', 'approval-1', 'approver-1')).rejects.toThrow(
      ConflictException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

// ── Test 7: Current autonomy policy recheck ───────────────────────────────────

describe('AIApprovalsService.approve — current autonomy policy recheck', () => {
  it('T18: policy tightened to BLOCKED after approval was granted — tool NOT executed', async () => {
    const policy = makePolicyService(true, 'Tool is now blocked at CRITICAL risk level');
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, makePermissionChecker(), policy);

    await expect(service.approve('org-1', 'approval-1', 'approver-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('T19: tool removed from allowedTools (scope violation) — tool NOT executed', async () => {
    const policy = makePolicyService(true, 'Tool "get_inventory_levels" is not in the allowed tools list');
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, makePermissionChecker(), policy);

    await expect(service.approve('org-1', 'approval-1', 'approver-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('T20: policy still permits (QUEUED_FOR_APPROVAL outcome) — approved tool executes once, no new approval created', async () => {
    const policy = makePolicyService(false);
    const executor = makeExecutor();
    const prisma = makePrisma();
    const service = makeService(prisma, executor, makePermissionChecker(), policy);

    const result = await service.approve('org-1', 'approval-1', 'approver-1');

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'COMPLETED' });
    // No new approval record created (only the existing aIApproval.update was called)
    expect(prisma.aIApproval.update).toHaveBeenCalledTimes(1);
  });

  it('T21: evaluatePostApproval called with action userId, toolName, parameters, and orgId', async () => {
    const policy = makePolicyService(false);
    const action = makeAction({ userId: 'req-user', action: 'get_sales_summary', parameters: { period: 'monthly' } });
    const prisma = makePrisma(makeApproval(), action);
    const service = makeService(prisma, makeExecutor(), makePermissionChecker(), policy);

    await service.approve('org-1', 'approval-1', 'approver-1');

    expect(policy.evaluatePostApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'req-user',
        toolName: 'get_sales_summary',
        parameters: { period: 'monthly' },
      }),
    );
  });

  it('T22: agent-originated action (no userId) — evaluatePostApproval still called with userId=null', async () => {
    const policy = makePolicyService(false);
    const action = makeAction({ userId: null, externalAgentId: 'agent-ext-1' });
    const prisma = makePrisma(makeApproval(), action);
    const service = makeService(prisma, makeExecutor(), makePermissionChecker(), policy);

    await service.approve('org-1', 'approval-1', 'approver-1');

    expect(policy.evaluatePostApproval).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, agentId: 'agent-ext-1' }),
    );
  });

  it('T23: locationIds=[] (deny-all) is passed to executor — never collapsed to null', async () => {
    const checker = makePermissionChecker([]);
    const executor = makeExecutor();
    const service = makeService(makePrisma(), executor, checker);

    await service.approve('org-1', 'approval-1', 'approver-1');

    const [, , , locationIds] = (executor.execute as jest.Mock).mock.calls[0] as [
      unknown, unknown, unknown, string[] | null
    ];
    expect(locationIds).toEqual([]);
    expect(locationIds).not.toBeNull();
  });
});
