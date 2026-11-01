import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserFeatureFlagsService } from './user-feature-flags.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const MOCK_ORG = 'org-1';
const MOCK_USER_ID = 'user-1';
const MOCK_UPDATED_BY = 'admin-1';
const MOCK_FLAG_KEY = 'new-dashboard';

const mockUser = { id: MOCK_USER_ID, organizationId: MOCK_ORG };

const mockOrgFlag = {
  organizationId: MOCK_ORG,
  key: MOCK_FLAG_KEY,
  name: 'New Dashboard',
  description: 'Enables the new dashboard UI',
  isEnabled: true,
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
  featureFlag: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  userFeatureFlag: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('UserFeatureFlagsService', () => {
  let service: UserFeatureFlagsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserFeatureFlagsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<UserFeatureFlagsService>(UserFeatureFlagsService);
  });

  // ── getUserFlags ──────────────────────────────────────────────

  describe('getUserFlags', () => {
    it('throws NotFoundException when user not in org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getUserFlags(MOCK_ORG, MOCK_USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns user flag overrides', async () => {
      const flags = [{ userId: MOCK_USER_ID, featureKey: MOCK_FLAG_KEY, state: 'ENABLED' }];
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userFeatureFlag.findMany.mockResolvedValue(flags);

      const result = await service.getUserFlags(MOCK_ORG, MOCK_USER_ID);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].featureKey).toBe(MOCK_FLAG_KEY);
    });
  });

  // ── getEffectiveFlags ─────────────────────────────────────────

  describe('getEffectiveFlags', () => {
    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
    });

    it('returns merged org flags with user overrides', async () => {
      mockPrisma.featureFlag.findMany.mockResolvedValue([mockOrgFlag]);
      mockPrisma.userFeatureFlag.findMany.mockResolvedValue([]);

      const result = await service.getEffectiveFlags(MOCK_ORG, MOCK_USER_ID);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].key).toBe(MOCK_FLAG_KEY);
    });

    it('user ENABLED overrides org disabled flag', async () => {
      const disabledOrgFlag = { ...mockOrgFlag, isEnabled: false };
      mockPrisma.featureFlag.findMany.mockResolvedValue([disabledOrgFlag]);
      mockPrisma.userFeatureFlag.findMany.mockResolvedValue([
        { featureKey: MOCK_FLAG_KEY, state: 'ENABLED' },
      ]);

      const result = await service.getEffectiveFlags(MOCK_ORG, MOCK_USER_ID);
      expect(result.data[0].effective).toBe(true);
    });

    it('user DISABLED overrides org enabled flag', async () => {
      mockPrisma.featureFlag.findMany.mockResolvedValue([mockOrgFlag]); // isEnabled: true
      mockPrisma.userFeatureFlag.findMany.mockResolvedValue([
        { featureKey: MOCK_FLAG_KEY, state: 'DISABLED' },
      ]);

      const result = await service.getEffectiveFlags(MOCK_ORG, MOCK_USER_ID);
      expect(result.data[0].effective).toBe(false);
    });

    it('INHERIT uses org setting', async () => {
      mockPrisma.featureFlag.findMany.mockResolvedValue([mockOrgFlag]); // isEnabled: true
      mockPrisma.userFeatureFlag.findMany.mockResolvedValue([
        { featureKey: MOCK_FLAG_KEY, state: 'INHERIT' },
      ]);

      const result = await service.getEffectiveFlags(MOCK_ORG, MOCK_USER_ID);
      // INHERIT falls through to org setting (true)
      expect(result.data[0].effective).toBe(true);
    });
  });

  // ── setUserFlag ───────────────────────────────────────────────

  describe('setUserFlag', () => {
    it('throws BadRequestException for invalid state', async () => {
      await expect(
        service.setUserFlag(MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, 'INVALID', MOCK_UPDATED_BY),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when user not in org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.setUserFlag(MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, 'ENABLED', MOCK_UPDATED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when flag not found in org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);
      await expect(
        service.setUserFlag(MOCK_ORG, MOCK_USER_ID, 'nonexistent-flag', 'ENABLED', MOCK_UPDATED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts with ENABLED state', async () => {
      const upsertedRecord = { userId: MOCK_USER_ID, featureKey: MOCK_FLAG_KEY, state: 'ENABLED' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockOrgFlag);
      mockPrisma.userFeatureFlag.findUnique.mockResolvedValue(null);
      mockPrisma.userFeatureFlag.upsert.mockResolvedValue(upsertedRecord);

      const result = await service.setUserFlag(
        MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, 'ENABLED', MOCK_UPDATED_BY,
      );
      expect(mockPrisma.userFeatureFlag.upsert).toHaveBeenCalled();
      expect(result.data).toEqual(upsertedRecord);
    });

    it('upserts with DISABLED state', async () => {
      const upsertedRecord = { userId: MOCK_USER_ID, featureKey: MOCK_FLAG_KEY, state: 'DISABLED' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockOrgFlag);
      mockPrisma.userFeatureFlag.findUnique.mockResolvedValue(null);
      mockPrisma.userFeatureFlag.upsert.mockResolvedValue(upsertedRecord);

      const result = await service.setUserFlag(
        MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, 'DISABLED', MOCK_UPDATED_BY,
      );
      expect(result.data).toEqual(upsertedRecord);
    });

    it('deletes existing override when state is INHERIT', async () => {
      const existingRecord = { userId: MOCK_USER_ID, featureKey: MOCK_FLAG_KEY, state: 'ENABLED' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockOrgFlag);
      mockPrisma.userFeatureFlag.findUnique.mockResolvedValue(existingRecord);
      mockPrisma.userFeatureFlag.delete.mockResolvedValue({});

      const result = await service.setUserFlag(
        MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, 'INHERIT', MOCK_UPDATED_BY,
      );
      expect(mockPrisma.userFeatureFlag.delete).toHaveBeenCalled();
      expect(result.data).toEqual({ featureKey: MOCK_FLAG_KEY, state: 'INHERIT' });
    });

    it('calls auditService.log', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(mockOrgFlag);
      mockPrisma.userFeatureFlag.findUnique.mockResolvedValue(null);
      mockPrisma.userFeatureFlag.upsert.mockResolvedValue({
        userId: MOCK_USER_ID, featureKey: MOCK_FLAG_KEY, state: 'ENABLED',
      });

      await service.setUserFlag(MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, 'ENABLED', MOCK_UPDATED_BY);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_FEATURE_FLAG_SET' }),
      );
    });

    it('maintains org isolation — user must be in org', async () => {
      // Simulates a user from a different org
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.setUserFlag('other-org', MOCK_USER_ID, MOCK_FLAG_KEY, 'ENABLED', MOCK_UPDATED_BY),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── removeUserFlag ────────────────────────────────────────────

  describe('removeUserFlag', () => {
    it('throws NotFoundException when user not in org', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.removeUserFlag(MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, MOCK_UPDATED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('removes existing override and logs audit event', async () => {
      const existing = { userId: MOCK_USER_ID, featureKey: MOCK_FLAG_KEY, state: 'ENABLED' };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userFeatureFlag.findUnique.mockResolvedValue(existing);
      mockPrisma.userFeatureFlag.delete.mockResolvedValue({});

      await service.removeUserFlag(MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, MOCK_UPDATED_BY);

      expect(mockPrisma.userFeatureFlag.delete).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_FEATURE_FLAG_RESET' }),
      );
    });

    it('is a no-op (no delete, no audit) if override did not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userFeatureFlag.findUnique.mockResolvedValue(null);

      const result = await service.removeUserFlag(
        MOCK_ORG, MOCK_USER_ID, MOCK_FLAG_KEY, MOCK_UPDATED_BY,
      );

      expect(mockPrisma.userFeatureFlag.delete).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
      expect(result.data.message).toContain('inherit');
    });
  });
});
