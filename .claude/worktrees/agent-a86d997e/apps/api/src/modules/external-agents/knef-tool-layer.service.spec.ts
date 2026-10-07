import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { KnefToolLayerService } from './knef-tool-layer.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AIExecutionPolicyService } from '../ai-actions/ai-execution-policy.service';
import { AIToolExecutorService } from '../ai-actions/ai-tool-executor.service';
import type { ExternalAgent } from '@prisma/client';

const MOCK_ORG = 'org-1';
const MOCK_AGENT_ID = 'agent-1';

const mockAgent: ExternalAgent = {
  id: MOCK_AGENT_ID,
  organizationId: MOCK_ORG,
  name: 'Test Agent',
  description: null,
  ownerId: 'user-1',
  status: 'ACTIVE',
  scopes: ['inventory:read', 'sales:read', 'tasks:read', 'tasks:write'],
  allowedTools: [],
  autonomyLevel: 'APPROVAL_REQUIRED',
  rateLimitPerMinute: 60,
  apiKeyId: 'key-1',
  metadata: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const executedDecision = {
  outcome: 'EXECUTED' as const,
  level: 'LIMITED_AUTONOMY' as const,
  riskLevel: 'LOW' as const,
  actionId: 'action-1',
  result: { count: 5 },
};

const approvalDecision = {
  outcome: 'QUEUED_FOR_APPROVAL' as const,
  level: 'APPROVAL_REQUIRED' as const,
  riskLevel: 'HIGH' as const,
  actionId: 'action-2',
  approvalId: 'approval-1',
  expiresAt: new Date(),
};

const blockedDecision = {
  outcome: 'BLOCKED' as const,
  level: 'ADVISORY' as const,
  riskLevel: 'CRITICAL' as const,
  reason: 'Blocked by policy',
};

const policyServiceMock = {
  evaluate: jest.fn(),
};

const executorMock = {
  execute: jest.fn(),
};

const prismaMock = {
  aIAction: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  aITool: {
    findFirst: jest.fn(),
  },
};

const auditMock = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('KnefToolLayerService', () => {
  let service: KnefToolLayerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.aIAction.findFirst.mockResolvedValue(null);
    prismaMock.aIAction.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnefToolLayerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: AIExecutionPolicyService, useValue: policyServiceMock },
        { provide: AIToolExecutorService, useValue: executorMock },
      ],
    }).compile();

    service = module.get<KnefToolLayerService>(KnefToolLayerService);
  });

  // ── Authentication / Identity ──────────────────────────────────

  describe('invalid tool', () => {
    it('throws BadRequestException for unknown tool', async () => {
      await expect(
        service.execute({
          toolName: 'does_not_exist',
          parameters: {},
          organizationId: MOCK_ORG,
          externalAgent: mockAgent,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── External Exposure ─────────────────────────────────────────

  describe('external exposure', () => {
    it('throws ForbiddenException for NOT_EXPOSED tool', async () => {
      await expect(
        service.execute({
          toolName: 'create_purchase_order',
          parameters: { supplierId: 's1', locationId: 'l1', items: [] },
          organizationId: MOCK_ORG,
          externalAgent: mockAgent,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows NOT_EXPOSED tool for internal (no agent) calls', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        userId: 'user-1',
      });
      expect(result.outcome).toBe('EXECUTED');
    });
  });

  // ── Scope Validation ──────────────────────────────────────────

  describe('scope validation', () => {
    it('throws ForbiddenException when agent lacks required scope', async () => {
      const agentWithoutScope = { ...mockAgent, scopes: ['finance:read'] };
      await expect(
        service.execute({
          toolName: 'get_inventory_levels',
          parameters: {},
          organizationId: MOCK_ORG,
          externalAgent: agentWithoutScope,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows execution when agent has required scope', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      expect(result.outcome).toBe('EXECUTED');
    });
  });

  // ── Agent Tool Allowlist ───────────────────────────────────────

  describe('agent tool allowlist', () => {
    it('denies tool not in allowedTools', async () => {
      const restrictedAgent = {
        ...mockAgent,
        allowedTools: ['get_financial_summary'],
      };
      await expect(
        service.execute({
          toolName: 'get_inventory_levels',
          parameters: {},
          organizationId: MOCK_ORG,
          externalAgent: restrictedAgent,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows tool in allowedTools', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const allowedAgent = {
        ...mockAgent,
        allowedTools: ['get_inventory_levels'],
      };
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: allowedAgent,
      });
      expect(result.outcome).toBe('EXECUTED');
    });

    it('allows any exposed tool when allowedTools is empty', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: { ...mockAgent, allowedTools: [] },
      });
      expect(result.outcome).toBe('EXECUTED');
    });
  });

  // ── Suspended Agent ────────────────────────────────────────────

  describe('suspended agent', () => {
    it('throws UnauthorizedException for suspended agent', async () => {
      const suspended = { ...mockAgent, status: 'SUSPENDED' };
      await expect(
        service.execute({
          toolName: 'get_inventory_levels',
          parameters: {},
          organizationId: MOCK_ORG,
          externalAgent: suspended,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Argument Validation ────────────────────────────────────────

  describe('argument validation', () => {
    it('rejects missing required arguments', async () => {
      await expect(
        service.execute({
          toolName: 'create_task',
          parameters: {},
          organizationId: MOCK_ORG,
          externalAgent: { ...mockAgent, scopes: ['tasks:write'] },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid enum value', async () => {
      await expect(
        service.execute({
          toolName: 'get_tasks',
          parameters: { status: 'INVALID_STATUS' },
          organizationId: MOCK_ORG,
          externalAgent: mockAgent,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('strips unknown parameters', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {
          productId: 'p1',
          arbitraryField: 'should_be_stripped',
          sql: 'SELECT * FROM users',
        },
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      const callArgs = policyServiceMock.evaluate.mock.calls[0][0];
      expect(callArgs.parameters).not.toHaveProperty('arbitraryField');
      expect(callArgs.parameters).not.toHaveProperty('sql');
    });
  });

  // ── Organization Isolation ─────────────────────────────────────

  describe('organization isolation', () => {
    it('strips caller-supplied organizationId from parameters', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      await service.execute({
        toolName: 'get_inventory_levels',
        parameters: { organizationId: 'evil-org' },
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      const callArgs = policyServiceMock.evaluate.mock.calls[0][0];
      expect(callArgs.parameters).not.toHaveProperty('organizationId');
    });
  });

  // ── Autonomy Policy ────────────────────────────────────────────

  describe('autonomy policy', () => {
    it('returns EXECUTED when policy allows', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      expect(result.outcome).toBe('EXECUTED');
      expect(result.result).toEqual({ count: 5 });
    });

    it('returns QUEUED_FOR_APPROVAL when approval required', async () => {
      policyServiceMock.evaluate.mockResolvedValue(approvalDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      expect(result.outcome).toBe('QUEUED_FOR_APPROVAL');
      expect(result.approvalId).toBe('approval-1');
    });

    it('returns BLOCKED when policy blocks', async () => {
      policyServiceMock.evaluate.mockResolvedValue(blockedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      expect(result.outcome).toBe('BLOCKED');
    });
  });

  // ── Idempotency ────────────────────────────────────────────────

  describe('idempotency', () => {
    it('returns cached result for duplicate idempotency key', async () => {
      prismaMock.aIAction.findFirst.mockResolvedValue({
        id: 'action-existing',
        status: 'COMPLETED',
        requestId: 'idem-key-1',
        action: 'create_task',
        result: { task: { id: 't1', title: 'Existing' } },
      });

      const result = await service.execute({
        toolName: 'create_task',
        parameters: { title: 'New Task' },
        organizationId: MOCK_ORG,
        externalAgent: { ...mockAgent, scopes: ['tasks:write'] },
        idempotencyKey: 'idem-key-1',
      });

      expect(result.outcome).toBe('EXECUTED');
      expect(result.reason).toContain('Idempotent');
      expect(policyServiceMock.evaluate).not.toHaveBeenCalled();
    });
  });

  // ── Result Filtering ───────────────────────────────────────────

  describe('result filtering', () => {
    it('strips sensitive keys from results returned to external agents', async () => {
      policyServiceMock.evaluate.mockResolvedValue({
        ...executedDecision,
        result: {
          user: {
            id: 'u1',
            email: 'test@example.com',
            password: 'secret',
            passwordHash: 'hashedvalue',
            token: 'bearer-token',
          },
        },
      });

      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });

      const filtered = result.result as Record<string, unknown>;
      expect((filtered['user'] as Record<string, unknown>)['id']).toBe('u1');
      expect((filtered['user'] as Record<string, unknown>)['password']).toBeUndefined();
      expect((filtered['user'] as Record<string, unknown>)['passwordHash']).toBeUndefined();
      expect((filtered['user'] as Record<string, unknown>)['token']).toBeUndefined();
    });
  });

  // ── Arbitrary SQL / Code rejection ────────────────────────────

  describe('security', () => {
    it('does not accept SQL in parameters (stripped by schema validation)', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      await service.execute({
        toolName: 'get_inventory_levels',
        parameters: { sql: 'DROP TABLE users;' },
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      const callArgs = policyServiceMock.evaluate.mock.calls[0][0];
      expect(callArgs.parameters).not.toHaveProperty('sql');
    });
  });

  // ── Request ID tracing ─────────────────────────────────────────

  describe('request tracing', () => {
    it('returns a requestId in all results', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
        requestId: 'custom-req-id',
      });
      expect(result.requestId).toBe('custom-req-id');
    });

    it('generates a requestId when not provided', async () => {
      policyServiceMock.evaluate.mockResolvedValue(executedDecision);
      const result = await service.execute({
        toolName: 'get_inventory_levels',
        parameters: {},
        organizationId: MOCK_ORG,
        externalAgent: mockAgent,
      });
      expect(result.requestId).toBeDefined();
      expect(typeof result.requestId).toBe('string');
    });
  });
});
