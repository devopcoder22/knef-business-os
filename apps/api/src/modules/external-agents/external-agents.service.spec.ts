import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ExternalAgentsService } from './external-agents.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const MOCK_ORG = 'org-test-1';
const MOCK_USER = 'user-test-1';
const MOCK_AGENT_ID = 'agent-test-1';
const MOCK_KEY_ID = 'key-test-1';

const mockAgent = {
  id: MOCK_AGENT_ID,
  organizationId: MOCK_ORG,
  name: 'Test Agent',
  description: 'Test agent description',
  ownerId: MOCK_USER,
  status: 'ACTIVE',
  scopes: ['inventory:read', 'sales:read'],
  allowedTools: ['get_inventory_levels', 'get_sales_summary'],
  autonomyLevel: 'APPROVAL_REQUIRED',
  rateLimitPerMinute: 60,
  apiKeyId: MOCK_KEY_ID,
  metadata: null,
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const prismaMock = {
  externalAgent: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  aPIKey: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const auditMock = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('ExternalAgentsService', () => {
  let service: ExternalAgentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalAgentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<ExternalAgentsService>(ExternalAgentsService);
  });

  describe('listAgents', () => {
    it('returns agents for org', async () => {
      prismaMock.externalAgent.findMany.mockResolvedValue([mockAgent]);
      const result = await service.listAgents(MOCK_ORG);
      expect(result.data).toHaveLength(1);
      expect(prismaMock.externalAgent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: MOCK_ORG } }),
      );
    });
  });

  describe('getAgent', () => {
    it('returns agent when found', async () => {
      prismaMock.externalAgent.findFirst.mockResolvedValue(mockAgent);
      const result = await service.getAgent(MOCK_ORG, MOCK_AGENT_ID);
      expect(result.id).toBe(MOCK_AGENT_ID);
    });

    it('throws NotFoundException when agent not found', async () => {
      prismaMock.externalAgent.findFirst.mockResolvedValue(null);
      await expect(service.getAgent(MOCK_ORG, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAgent', () => {
    it('creates agent with valid tools', async () => {
      prismaMock.externalAgent.findFirst.mockResolvedValue(null); // no duplicate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => Promise<readonly [unknown, unknown]>) =>
        fn({
          aPIKey: { create: jest.fn().mockResolvedValue({ id: MOCK_KEY_ID, scopes: [] }) },
          externalAgent: { create: jest.fn().mockResolvedValue(mockAgent) },
        }),
      );

      const result = await service.createAgent(
        MOCK_ORG,
        {
          name: 'Test Agent',
          scopes: ['inventory:read'],
          allowedTools: ['get_inventory_levels'],
        },
        MOCK_USER,
      );

      expect(result.agent).toBeDefined();
      expect(result.rawApiKey).toBeDefined();
      expect(result.rawApiKey).toMatch(/^knef_agent_/);
    });

    it('throws ConflictException if agent name already exists', async () => {
      prismaMock.externalAgent.findFirst.mockResolvedValue(mockAgent);
      await expect(
        service.createAgent(MOCK_ORG, { name: 'Test Agent' }, MOCK_USER),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for non-exposed tool', async () => {
      prismaMock.externalAgent.findFirst.mockResolvedValue(null);
      await expect(
        service.createAgent(
          MOCK_ORG,
          { name: 'Bad Agent', allowedTools: ['create_purchase_order'] },
          MOCK_USER,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rotateApiKey', () => {
    it('revokes old key and creates new one', async () => {
      prismaMock.externalAgent.findFirst.mockResolvedValue(mockAgent);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => Promise<string>) => {
        return fn({
          aPIKey: {
            update: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({ id: 'new-key-id' }),
          },
          externalAgent: { update: jest.fn().mockResolvedValue({}) },
        });
      });

      const result = await service.rotateApiKey(MOCK_ORG, MOCK_AGENT_ID, MOCK_USER);
      expect(result.rawApiKey).toMatch(/^knef_agent_/);
    });
  });
});
