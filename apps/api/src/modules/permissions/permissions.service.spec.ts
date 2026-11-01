import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';

// Mock the constants module — PermissionsService imports PERMISSIONS and ALL_PERMISSIONS
jest.mock('@knef/constants', () => ({
  PERMISSIONS: {},
  ALL_PERMISSIONS: ['users:read', 'roles:read', 'inventory:read'],
}));

const MOCK_ORG = 'org-1';
const MOCK_USER_ID = 'user-1';
const MOCK_GRANTED_BY = 'admin-1';

const mockUser = { id: MOCK_USER_ID, organizationId: MOCK_ORG };

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
  userRole: {
    findMany: jest.fn(),
  },
  userPermissionOverride: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockRedis = { del: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  // ── getResolvedPermissions ────────────────────────────────────

  describe('getResolvedPermissions', () => {
    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.getResolvedPermissions(MOCK_ORG, MOCK_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('correctly merges role perms + granted overrides + denied overrides into effective', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      // User has MANAGER role with users:read + roles:read
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          role: {
            name: 'MANAGER',
            permissions: [{ permission: 'users:read' }, { permission: 'roles:read' }],
          },
        },
      ]);

      // Override: grant inventory:read, deny users:read
      mockPrisma.userPermissionOverride.findMany.mockResolvedValue([
        { permission: 'inventory:read', granted: true },
        { permission: 'users:read', granted: false },
      ]);

      const result = await service.getResolvedPermissions(MOCK_ORG, MOCK_USER_ID);
      const { effective, fromRoles, grantedOverrides, deniedOverrides } = result.data;

      expect(fromRoles).toContain('users:read');
      expect(fromRoles).toContain('roles:read');

      expect(grantedOverrides).toContain('inventory:read');
      expect(deniedOverrides).toContain('users:read');

      // Effective: roles:read + inventory:read (users:read denied)
      expect(effective).toContain('roles:read');
      expect(effective).toContain('inventory:read');
      expect(effective).not.toContain('users:read');
    });
  });

  // ── setOverride ───────────────────────────────────────────────

  describe('setOverride', () => {
    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.setOverride(MOCK_ORG, MOCK_USER_ID, { permission: 'users:read', granted: true }, MOCK_GRANTED_BY),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts override', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
      mockPrisma.userPermissionOverride.upsert.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.setOverride(
        MOCK_ORG,
        MOCK_USER_ID,
        { permission: 'inventory:read', granted: true },
        MOCK_GRANTED_BY,
      );

      expect(mockPrisma.userPermissionOverride.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_permission: { userId: MOCK_USER_ID, permission: 'inventory:read' },
          }),
        }),
      );
    });

    it('calls auditService.log with PERMISSION_OVERRIDE_SET', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
      mockPrisma.userPermissionOverride.upsert.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.setOverride(
        MOCK_ORG,
        MOCK_USER_ID,
        { permission: 'inventory:read', granted: true },
        MOCK_GRANTED_BY,
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERMISSION_OVERRIDE_SET' }),
      );
    });

    it('includes oldValues in audit log if override already existed', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue({
        permission: 'inventory:read',
        granted: false,
      });
      mockPrisma.userPermissionOverride.upsert.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.setOverride(
        MOCK_ORG,
        MOCK_USER_ID,
        { permission: 'inventory:read', granted: true },
        MOCK_GRANTED_BY,
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: expect.objectContaining({ granted: false }),
        }),
      );
    });

    it('invalidates cache', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
      mockPrisma.userPermissionOverride.upsert.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.setOverride(
        MOCK_ORG,
        MOCK_USER_ID,
        { permission: 'roles:read', granted: true },
        MOCK_GRANTED_BY,
      );

      expect(mockRedis.del).toHaveBeenCalledWith(`perms:${MOCK_USER_ID}`);
    });
  });

  // ── removeOverride ────────────────────────────────────────────

  describe('removeOverride', () => {
    it('throws NotFoundException when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.removeOverride(MOCK_ORG, MOCK_USER_ID, 'users:read'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes override', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
      mockPrisma.userPermissionOverride.deleteMany.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.removeOverride(MOCK_ORG, MOCK_USER_ID, 'users:read');

      expect(mockPrisma.userPermissionOverride.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: MOCK_USER_ID, permission: 'users:read' }),
        }),
      );
    });

    it('calls auditService.log with PERMISSION_OVERRIDE_REMOVED and oldValues when override existed', async () => {
      const existingOverride = { permission: 'users:read', granted: true };
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(existingOverride);
      mockPrisma.userPermissionOverride.deleteMany.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.removeOverride(MOCK_ORG, MOCK_USER_ID, 'users:read');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERMISSION_OVERRIDE_REMOVED',
          oldValues: expect.objectContaining({ permission: 'users:read', granted: true }),
        }),
      );
    });

    it('does not call auditService.log when override did not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.userPermissionOverride.findUnique.mockResolvedValue(null);
      mockPrisma.userPermissionOverride.deleteMany.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);

      await service.removeOverride(MOCK_ORG, MOCK_USER_ID, 'users:read');

      expect(mockAudit.log).not.toHaveBeenCalled();
    });
  });
});
