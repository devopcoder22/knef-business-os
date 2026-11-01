import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';

const MOCK_ORG = 'org-1';
const MOCK_KEY_ID = 'key-1';

const mockApiKey = {
  id: MOCK_KEY_ID,
  organizationId: MOCK_ORG,
  name: 'My API Key',
  prefix: 'knef_',
  scopes: ['inventory:read'],
  isActive: true,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date(),
  createdBy: 'user-1',
};

const mockPrisma = {
  user: {
    count: jest.fn(),
  },
  role: {
    count: jest.fn(),
  },
  externalAgent: {
    count: jest.fn(),
  },
  aIAction: {
    count: jest.fn(),
  },
  aPIKey: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  featureFlag: {
    count: jest.fn(),
  },
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: QueueService,
          useValue: { getAllQueueStats: jest.fn(async () => ({})) },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ── getOverviewStats ──────────────────────────────────────────

  describe('getOverviewStats', () => {
    beforeEach(() => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.role.count.mockResolvedValue(3);
      mockPrisma.externalAgent.count.mockResolvedValue(2);
      mockPrisma.aIAction.count.mockResolvedValue(5);
      mockPrisma.aPIKey.count.mockResolvedValue(4);
      mockPrisma.featureFlag.count.mockResolvedValue(6);
    });

    it('scopes all Prisma calls to organizationId', async () => {
      await service.getOverviewStats(MOCK_ORG);

      // All count calls must include organizationId
      for (const call of mockPrisma.user.count.mock.calls) {
        expect(call[0].where).toMatchObject({ organizationId: MOCK_ORG });
      }
      expect(mockPrisma.role.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: MOCK_ORG }) }),
      );
      expect(mockPrisma.externalAgent.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: MOCK_ORG }) }),
      );
      expect(mockPrisma.aIAction.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: MOCK_ORG }) }),
      );
      expect(mockPrisma.aPIKey.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: MOCK_ORG }) }),
      );
      expect(mockPrisma.featureFlag.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: MOCK_ORG }) }),
      );
    });

    it('returns aggregated stats', async () => {
      const result = await service.getOverviewStats(MOCK_ORG);
      expect(result.users.total).toBe(10);
      expect(result.roles).toBe(3);
      expect(result.agents).toBe(2);
      expect(result.pendingApprovals).toBe(5);
      expect(result.apiKeys).toBe(4);
      expect(result.activeFeatureFlags).toBe(6);
    });

    it('does not mix data from different organizations', async () => {
      // Call with two different orgs; each call should use its own org filter
      mockPrisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(99);
      mockPrisma.role.count.mockResolvedValue(0);
      mockPrisma.externalAgent.count.mockResolvedValue(0);
      mockPrisma.aIAction.count.mockResolvedValue(0);
      mockPrisma.aPIKey.count.mockResolvedValue(0);
      mockPrisma.featureFlag.count.mockResolvedValue(0);

      await service.getOverviewStats('org-a');
      await service.getOverviewStats('org-b');

      const userCountCalls = mockPrisma.user.count.mock.calls;
      // First call uses org-a, second uses org-b for active users
      expect(userCountCalls[0][0].where).toMatchObject({ organizationId: 'org-a' });
      expect(userCountCalls[2][0].where).toMatchObject({ organizationId: 'org-b' });
    });
  });

  // ── listApiKeys ───────────────────────────────────────────────

  describe('listApiKeys', () => {
    it('only returns keys for the organizationId', async () => {
      mockPrisma.aPIKey.findMany.mockResolvedValue([mockApiKey]);

      const result = await service.listApiKeys(MOCK_ORG);

      expect(mockPrisma.aPIKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: MOCK_ORG } }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(MOCK_KEY_ID);
    });
  });

  // ── revokeApiKey ──────────────────────────────────────────────

  describe('revokeApiKey', () => {
    it('throws if key not found', async () => {
      mockPrisma.aPIKey.findFirst.mockResolvedValue(null);
      await expect(service.revokeApiKey(MOCK_ORG, 'nonexistent')).rejects.toThrow();
    });

    it('throws if key belongs to a different org', async () => {
      mockPrisma.aPIKey.findFirst.mockResolvedValue(null); // findFirst with org filter returns null
      await expect(service.revokeApiKey('other-org', MOCK_KEY_ID)).rejects.toThrow();
    });

    it('updates isActive to false', async () => {
      mockPrisma.aPIKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrisma.aPIKey.update.mockResolvedValue({ ...mockApiKey, isActive: false });

      await service.revokeApiKey(MOCK_ORG, MOCK_KEY_ID);

      expect(mockPrisma.aPIKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_KEY_ID },
          data: { isActive: false },
        }),
      );
    });

    it('scopes findFirst to organizationId preventing cross-org revocation', async () => {
      mockPrisma.aPIKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrisma.aPIKey.update.mockResolvedValue({ ...mockApiKey, isActive: false });

      await service.revokeApiKey(MOCK_ORG, MOCK_KEY_ID);

      expect(mockPrisma.aPIKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_KEY_ID, organizationId: MOCK_ORG }),
        }),
      );
    });
  });
});
