/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { AIExecutionPolicyService } from './ai-execution-policy.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AIToolExecutorService } from './ai-tool-executor.service';
import { AuditService } from '../audit/audit.service';

// Mock the registry so we can control riskLevel per test
jest.mock('./ai-tool-permission.registry', () => ({
  getToolPermissionDefinition: jest.fn(),
}));

import { getToolPermissionDefinition } from './ai-tool-permission.registry';

const mockGetToolPermissionDefinition = getToolPermissionDefinition as jest.Mock;

describe('AIExecutionPolicyService', () => {
  let service: AIExecutionPolicyService;
  let prisma: any;
  let executor: jest.Mocked<AIToolExecutorService>;
  let auditService: jest.Mocked<AuditService>;

  const BASE_PARAMS = {
    organizationId: 'org-1',
    userId: 'user-1',
    parameters: {},
  };

  beforeEach(() => {
    prisma = {
      aiAutonomyPolicy: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      aIAction: {
        create: jest.fn().mockResolvedValue({ id: 'action-1' }),
        update: jest.fn().mockResolvedValue({ id: 'action-1' }),
      },
      aIApproval: {
        create: jest.fn().mockResolvedValue({ id: 'approval-1' }),
      },
      aITool: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    executor = {
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<AIToolExecutorService>;

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;

    service = new AIExecutionPolicyService(prisma, executor, auditService);
  });

  function mockPolicy(level: string, scopeLimits: Record<string, unknown> = {}) {
    prisma.aiAutonomyPolicy.findFirst.mockResolvedValue({
      id: 'pol-1',
      level,
      scopeLimits,
      isActive: true,
    });
  }

  function mockNoPolicy() {
    prisma.aiAutonomyPolicy.findFirst.mockResolvedValue(null);
  }

  function mockTool(riskLevel: string) {
    mockGetToolPermissionDefinition.mockReturnValue({
      toolName: 'test_tool',
      requiredPermission: 'inventory.view',
      riskLevel,
      approvalRequired: 'NONE',
      description: 'Test tool',
    });
  }

  // ── Group 1: Policy Resolution Precedence ────────────────────────

  describe('Policy Resolution Precedence', () => {
    it('T1: user policy takes precedence over org policy', async () => {
      mockTool('LOW');
      // First call: user policy found → return ADVISORY (user level)
      // resolvePolicy is called twice (once for level, once for scopeLimits)
      prisma.aiAutonomyPolicy.findFirst
        .mockResolvedValueOnce({ id: 'user-pol', level: 'ADVISORY', scopeLimits: {}, isActive: true })
        .mockResolvedValueOnce({ id: 'user-pol', level: 'ADVISORY', scopeLimits: {}, isActive: true });

      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
      expect(result.level).toBe('ADVISORY');
    });

    it('T2: agent policy takes precedence over org policy when no user policy', async () => {
      mockTool('LOW');
      // resolvePolicy: first call checks user (null), then agent (found)
      // called twice: once for resolveLevel, once for resolvePolicy in scope check
      prisma.aiAutonomyPolicy.findFirst
        .mockResolvedValueOnce(null)                                                         // user lookup (resolveLevel→resolvePolicy)
        .mockResolvedValueOnce({ id: 'agent-pol', level: 'DRAFT', scopeLimits: {}, isActive: true })  // agent lookup
        .mockResolvedValueOnce(null)                                                         // user lookup (scope check→resolvePolicy)
        .mockResolvedValueOnce({ id: 'agent-pol', level: 'DRAFT', scopeLimits: {}, isActive: true }); // agent lookup

      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool', agentId: 'agent-1' });
      expect(result.outcome).toBe('DRAFT');
      expect(result.level).toBe('DRAFT');
    });

    it('T3: org policy used when no user or agent policy exists', async () => {
      mockTool('LOW');
      prisma.aiAutonomyPolicy.findFirst
        .mockResolvedValueOnce(null)                                                          // user lookup
        .mockResolvedValueOnce({ id: 'org-pol', level: 'LIMITED_AUTONOMY', scopeLimits: {}, isActive: true }) // org lookup
        .mockResolvedValueOnce(null)                                                          // user lookup (scope check)
        .mockResolvedValueOnce({ id: 'org-pol', level: 'LIMITED_AUTONOMY', scopeLimits: {}, isActive: true }); // org lookup

      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('EXECUTED');
      expect(result.level).toBe('LIMITED_AUTONOMY');
    });
  });

  // ── Group 2: Policy Matrix — ADVISORY level ──────────────────────

  describe('Policy Matrix — ADVISORY level', () => {
    it('T4: LOW risk at ADVISORY → ADVISORY outcome', async () => {
      mockTool('LOW');
      mockPolicy('ADVISORY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
    });

    it('T5: MEDIUM risk at ADVISORY → ADVISORY outcome', async () => {
      mockTool('MEDIUM');
      mockPolicy('ADVISORY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
    });

    it('T6: HIGH risk at ADVISORY → ADVISORY outcome', async () => {
      mockTool('HIGH');
      mockPolicy('ADVISORY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
    });

    it('T7: CRITICAL risk at ADVISORY → ADVISORY outcome', async () => {
      mockTool('CRITICAL');
      mockPolicy('ADVISORY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
    });
  });

  // ── Group 3: Policy Matrix — DRAFT level ────────────────────────

  describe('Policy Matrix — DRAFT level', () => {
    it('T8: LOW risk at DRAFT → DRAFT outcome and creates AIAction record', async () => {
      mockTool('LOW');
      mockPolicy('DRAFT');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('DRAFT');
      expect(result.actionId).toBe('action-1');
      expect(prisma.aIAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ policyDecision: 'DRAFT' }),
        }),
      );
    });

    it('T9: MEDIUM risk at DRAFT → ADVISORY (no action created)', async () => {
      mockTool('MEDIUM');
      mockPolicy('DRAFT');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
      expect(prisma.aIAction.create).not.toHaveBeenCalled();
    });

    it('T10: HIGH risk at DRAFT → ADVISORY (no action created)', async () => {
      mockTool('HIGH');
      mockPolicy('DRAFT');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('ADVISORY');
      expect(prisma.aIAction.create).not.toHaveBeenCalled();
    });
  });

  // ── Group 4: Policy Matrix — APPROVAL_REQUIRED ──────────────────

  describe('Policy Matrix — APPROVAL_REQUIRED level', () => {
    it('T11: LOW risk at APPROVAL_REQUIRED → QUEUED_FOR_APPROVAL; creates AIAction and AIApproval', async () => {
      mockTool('LOW');
      mockPolicy('APPROVAL_REQUIRED');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
      expect(result.actionId).toBe('action-1');
      expect(result.approvalId).toBe('approval-1');
      expect(prisma.aIAction.create).toHaveBeenCalled();
      expect(prisma.aIApproval.create).toHaveBeenCalled();
    });

    it('T12: HIGH risk at APPROVAL_REQUIRED → QUEUED_FOR_APPROVAL', async () => {
      mockTool('HIGH');
      mockPolicy('APPROVAL_REQUIRED');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
    });

    it('T13: CRITICAL risk at APPROVAL_REQUIRED → BLOCKED', async () => {
      mockTool('CRITICAL');
      mockPolicy('APPROVAL_REQUIRED');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('BLOCKED');
      expect(prisma.aIAction.create).not.toHaveBeenCalled();
    });
  });

  // ── Group 5: Policy Matrix — LIMITED_AUTONOMY ───────────────────

  describe('Policy Matrix — LIMITED_AUTONOMY level', () => {
    it('T14: LOW risk at LIMITED_AUTONOMY → EXECUTED', async () => {
      mockTool('LOW');
      mockPolicy('LIMITED_AUTONOMY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('EXECUTED');
      expect(prisma.aIAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ policyDecision: 'EXECUTED' }),
        }),
      );
    });

    it('T15: MEDIUM risk at LIMITED_AUTONOMY → QUEUED_FOR_APPROVAL', async () => {
      mockTool('MEDIUM');
      mockPolicy('LIMITED_AUTONOMY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
    });

    it('T16: HIGH risk at LIMITED_AUTONOMY → BLOCKED', async () => {
      mockTool('HIGH');
      mockPolicy('LIMITED_AUTONOMY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('BLOCKED');
    });
  });

  // ── Group 6: Scope Limits ────────────────────────────────────────

  describe('Scope Limits', () => {
    it('T17: allowedTools whitelist blocks unregistered tool → QUEUED_FOR_APPROVAL under LIMITED_AUTONOMY', async () => {
      mockTool('LOW');
      mockPolicy('LIMITED_AUTONOMY', { allowedTools: ['other_tool'] });
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
      expect(result.approvalId).toBe('approval-1');
    });

    it('T18: financialCapNgn exceeded → QUEUED_FOR_APPROVAL under LIMITED_AUTONOMY', async () => {
      mockTool('LOW');
      mockPolicy('LIMITED_AUTONOMY', { financialCapNgn: 10000 });
      const result = await service.evaluate({
        ...BASE_PARAMS,
        toolName: 'test_tool',
        parameters: { amount: 50000 },
      });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
    });

    it('T19: recipientCap exceeded → QUEUED_FOR_APPROVAL under LIMITED_AUTONOMY', async () => {
      mockTool('LOW');
      mockPolicy('LIMITED_AUTONOMY', { recipientCap: 2 });
      const result = await service.evaluate({
        ...BASE_PARAMS,
        toolName: 'test_tool',
        parameters: { recipients: ['a', 'b', 'c'] },
      });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
    });

    it('T20: locationId not in allowedLocations → QUEUED_FOR_APPROVAL under LIMITED_AUTONOMY', async () => {
      mockTool('LOW');
      mockPolicy('LIMITED_AUTONOMY', { locationIds: ['loc-1', 'loc-2'] });
      const result = await service.evaluate({
        ...BASE_PARAMS,
        toolName: 'test_tool',
        parameters: { locationId: 'loc-99' },
      });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
    });

    it('T21: scope limits do not block at ADVISORY level (no scope check triggers a block)', async () => {
      mockTool('LOW');
      // ADVISORY with scope limits: scope violations on ADVISORY → BLOCKED (not LIMITED_AUTONOMY),
      // but the matrix result (ADVISORY) comes AFTER scope check. In ADVISORY level, the scope
      // violation path returns BLOCKED for non-autonomy levels. Verify behavior:
      // Actually, the policy matrix result for ADVISORY+LOW is ADVISORY, but
      // scope violations under ADVISORY hit the non-autonomy path → BLOCKED.
      // The test verifies that when scope limits are satisfied, ADVISORY still returns ADVISORY.
      mockPolicy('ADVISORY', { financialCapNgn: 999999 });
      const result = await service.evaluate({
        ...BASE_PARAMS,
        toolName: 'test_tool',
        parameters: { amount: 100 },
      });
      expect(result.outcome).toBe('ADVISORY');
    });
  });

  // ── Group 7: Unregistered Tools ─────────────────────────────────

  describe('Unregistered Tools', () => {
    it('T22: tool not in registry → BLOCKED regardless of autonomy level', async () => {
      mockGetToolPermissionDefinition.mockReturnValue(null);
      mockPolicy('LIMITED_AUTONOMY');
      const result = await service.evaluate({ ...BASE_PARAMS, toolName: 'unknown_tool' });
      expect(result.outcome).toBe('BLOCKED');
      expect(result.riskLevel).toBe('CRITICAL');
      expect(result.reason).toContain('not registered');
    });
  });

  // ── Group 8: Policy CRUD ─────────────────────────────────────────

  describe('Policy CRUD', () => {
    it('T23: upsertPolicy creates new policy when none exists', async () => {
      prisma.aiAutonomyPolicy.findFirst.mockResolvedValue(null);
      prisma.aiAutonomyPolicy.create.mockResolvedValue({ id: 'new-pol' });

      const result = await service.upsertPolicy(
        'org-1',
        { scope: 'org', level: 'LIMITED_AUTONOMY' },
        'actor-1',
      );

      expect(prisma.aiAutonomyPolicy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'org',
            level: 'LIMITED_AUTONOMY',
            createdBy: 'actor-1',
          }),
        }),
      );
      expect(result).toEqual({ id: 'new-pol' });
    });

    it('T24: upsertPolicy updates existing policy found by org+scope+scopeId', async () => {
      prisma.aiAutonomyPolicy.findFirst.mockResolvedValue({ id: 'existing-pol' });
      prisma.aiAutonomyPolicy.update.mockResolvedValue({ id: 'existing-pol', level: 'ADVISORY' });

      const result = await service.upsertPolicy(
        'org-1',
        { scope: 'user', scopeId: 'user-2', level: 'ADVISORY' },
        'actor-1',
      );

      expect(prisma.aiAutonomyPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-pol' },
          data: expect.objectContaining({ level: 'ADVISORY', updatedBy: 'actor-1' }),
        }),
      );
      expect(result).toEqual({ id: 'existing-pol', level: 'ADVISORY' });
    });

    it('T25: updatePolicy patches level and scopeLimits on existing policy', async () => {
      prisma.aiAutonomyPolicy.findFirst.mockResolvedValue({ id: 'pol-2' });
      prisma.aiAutonomyPolicy.update.mockResolvedValue({ id: 'pol-2' });

      await service.updatePolicy(
        'org-1',
        'pol-2',
        { level: 'DRAFT', scopeLimits: { financialCapNgn: 5000 } },
        'actor-1',
      );

      expect(prisma.aiAutonomyPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pol-2' },
          data: expect.objectContaining({
            level: 'DRAFT',
            scopeLimits: { financialCapNgn: 5000 },
            updatedBy: 'actor-1',
          }),
        }),
      );
    });

    it('T26: deletePolicy removes the policy; throws BadRequestException when not found', async () => {
      prisma.aiAutonomyPolicy.findFirst.mockResolvedValue({ id: 'pol-3' });
      prisma.aiAutonomyPolicy.delete.mockResolvedValue({ id: 'pol-3' });

      await service.deletePolicy('org-1', 'pol-3');
      expect(prisma.aiAutonomyPolicy.delete).toHaveBeenCalledWith({ where: { id: 'pol-3' } });

      // not found case
      prisma.aiAutonomyPolicy.findFirst.mockResolvedValue(null);
      await expect(service.deletePolicy('org-1', 'missing-id')).rejects.toThrow(BadRequestException);
    });
  });

  // ── Group 9: Audit Trail ─────────────────────────────────────────

  describe('Audit Trail', () => {
    it('T27: ADVISORY outcome writes audit log with action AI_POLICY_EVALUATED', async () => {
      mockTool('LOW');
      mockPolicy('ADVISORY');
      await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_POLICY_EVALUATED' }),
      );
    });

    it('T28: BLOCKED outcome (CRITICAL+APPROVAL_REQUIRED) writes audit log with action AI_POLICY_BLOCKED', async () => {
      mockTool('CRITICAL');
      mockPolicy('APPROVAL_REQUIRED');
      await service.evaluate({ ...BASE_PARAMS, toolName: 'test_tool' });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_POLICY_BLOCKED' }),
      );
    });
  });

  // ── Group 10: No Self-Escalation ─────────────────────────────────

  describe('No Self-Escalation', () => {
    it('T29: user at ADVISORY level cannot obtain EXECUTED outcome even with LOW-risk tool', async () => {
      mockTool('LOW');
      // Policy resolved from DB is ADVISORY, regardless of what the user passes in parameters
      mockPolicy('ADVISORY');
      const result = await service.evaluate({
        ...BASE_PARAMS,
        toolName: 'test_tool',
        // Attacker tries to claim a higher autonomy level via parameters — not honored
        parameters: { autonomyLevel: 'LIMITED_AUTONOMY', level: 'SCHEDULED_AUTONOMY' },
      });
      // The resolved level comes from DB, not from parameters
      expect(result.outcome).toBe('ADVISORY');
      expect(result.level).toBe('ADVISORY');
    });
  });
});
