import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';

const MOCK_ORG = 'org-1';
const MOCK_ROLE_ID = 'role-1';
const MOCK_ACTOR_ID = 'user-admin-1';

const mockRole = {
  id: MOCK_ROLE_ID,
  organizationId: MOCK_ORG,
  name: 'MANAGER',
  description: 'Manager role',
  isSystem: false,
  isActive: true,
  permissions: [{ permission: 'users:read' }, { permission: 'roles:read' }],
  _count: { userRoles: 2 },
};

const systemRole = { ...mockRole, id: 'role-system', name: 'SUPER_ADMIN', isSystem: true };

const mockPrisma = {
  role: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  rolePermission: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  userRole: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = { del: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  // ── findAll ───────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all roles for org', async () => {
      mockPrisma.role.findMany.mockResolvedValue([mockRole]);
      const result = await service.findAll(MOCK_ORG);
      expect(result).toHaveLength(1);
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: MOCK_ORG } }),
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns role when found', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      const result = await service.findOne(MOCK_ORG, MOCK_ROLE_ID);
      expect(result.id).toBe(MOCK_ROLE_ID);
    });

    it('throws NotFoundException for non-existent role', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(service.findOne(MOCK_ORG, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ────────────────────────────────────────────────────

  describe('create', () => {
    it('throws ConflictException if role name exists', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      await expect(service.create(MOCK_ORG, { name: 'Manager' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates role with permissions and calls auditService.log with ROLE_CREATED', async () => {
      const createdRole = { ...mockRole, id: 'role-new', name: 'ANALYST' };
      mockPrisma.role.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) =>
        fn({
          role: { create: jest.fn().mockResolvedValue(createdRole) },
          rolePermission: { createMany: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.create(MOCK_ORG, {
        name: 'Analyst',
        permissions: ['users:read'],
      });

      expect(result.id).toBe('role-new');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_CREATED' }),
      );
    });
  });

  // ── update ────────────────────────────────────────────────────

  describe('update', () => {
    it('calls auditService.log with ROLE_UPDATED including old and new permissions', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(mockRole) // findOne inside update (1st call)
        .mockResolvedValueOnce(mockRole); // findOne returned at the end (2nd call)

      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) =>
        fn({
          role: { update: jest.fn().mockResolvedValue({}) },
          rolePermission: {
            deleteMany: jest.fn().mockResolvedValue({}),
            createMany: jest.fn().mockResolvedValue({}),
          },
          userRole: { findMany: jest.fn().mockResolvedValue([]) },
        }),
      );

      await service.update(MOCK_ORG, MOCK_ROLE_ID, {
        description: 'Updated description',
        permissions: ['users:write'],
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_UPDATED',
          oldValues: expect.objectContaining({ permissions: expect.any(Array) }),
          newValues: expect.objectContaining({ permissions: expect.any(Array) }),
        }),
      );
    });
  });

  // ── clone ─────────────────────────────────────────────────────

  describe('clone', () => {
    it('throws ConflictException if target name exists', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(mockRole) // source found
        .mockResolvedValueOnce(mockRole); // duplicate name found
      await expect(service.clone(MOCK_ORG, MOCK_ROLE_ID, 'Manager')).rejects.toThrow(
        ConflictException,
      );
    });

    it('clones permissions and calls auditService.log with ROLE_CLONED', async () => {
      const clonedRole = { ...mockRole, id: 'role-clone', name: 'MANAGER_COPY' };
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(mockRole) // source found
        .mockResolvedValueOnce(null); // no duplicate

      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) =>
        fn({
          role: { create: jest.fn().mockResolvedValue(clonedRole) },
          rolePermission: { createMany: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.clone(MOCK_ORG, MOCK_ROLE_ID, 'Manager Copy');
      expect(result.id).toBe('role-clone');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_CLONED' }),
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws ForbiddenException for system roles', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(systemRole);
      await expect(service.remove(MOCK_ORG, systemRole.id)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if users assigned', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.userRole.count.mockResolvedValue(3);
      await expect(service.remove(MOCK_ORG, MOCK_ROLE_ID)).rejects.toThrow(ConflictException);
    });

    it('calls auditService.log with ROLE_DELETED', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.userRole.count.mockResolvedValue(0);
      mockPrisma.role.delete.mockResolvedValue({});
      await service.remove(MOCK_ORG, MOCK_ROLE_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_DELETED' }),
      );
    });
  });

  // ── addPermissions ────────────────────────────────────────────

  describe('addPermissions', () => {
    beforeEach(() => {
      // findOne is called twice: once inside addPermissions, once for the return value
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.rolePermission.createMany.mockResolvedValue({});
      mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'user-x' }]);
      mockRedis.del.mockResolvedValue(undefined);
    });

    it('adds permissions', async () => {
      await service.addPermissions(MOCK_ORG, MOCK_ROLE_ID, ['inventory:read']);
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ permission: 'inventory:read', roleId: MOCK_ROLE_ID }),
          ]),
        }),
      );
    });

    it('calls auditService.log with ROLE_PERMISSIONS_ADDED', async () => {
      await service.addPermissions(MOCK_ORG, MOCK_ROLE_ID, ['inventory:read']);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_PERMISSIONS_ADDED' }),
      );
    });

    it('invalidates cache for users with this role', async () => {
      await service.addPermissions(MOCK_ORG, MOCK_ROLE_ID, ['inventory:read']);
      expect(mockRedis.del).toHaveBeenCalledWith('perms:user-x');
    });
  });

  // ── removePermissions ─────────────────────────────────────────

  describe('removePermissions', () => {
    beforeEach(() => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.rolePermission.deleteMany.mockResolvedValue({});
      mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'user-y' }]);
      mockRedis.del.mockResolvedValue(undefined);
    });

    it('removes permissions', async () => {
      await service.removePermissions(MOCK_ORG, MOCK_ROLE_ID, ['users:read']);
      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ roleId: MOCK_ROLE_ID }),
        }),
      );
    });

    it('calls auditService.log with ROLE_PERMISSIONS_REMOVED', async () => {
      await service.removePermissions(MOCK_ORG, MOCK_ROLE_ID, ['users:read']);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_PERMISSIONS_REMOVED' }),
      );
    });

    it('invalidates cache for users with this role', async () => {
      await service.removePermissions(MOCK_ORG, MOCK_ROLE_ID, ['users:read']);
      expect(mockRedis.del).toHaveBeenCalledWith('perms:user-y');
    });
  });

  // ── deactivate ────────────────────────────────────────────────

  describe('deactivate', () => {
    it('throws ForbiddenException for system roles', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(systemRole);
      await expect(service.deactivate(MOCK_ORG, systemRole.id, MOCK_ACTOR_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('updates isActive to false', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue({ ...mockRole, isActive: false });
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      await service.deactivate(MOCK_ORG, MOCK_ROLE_ID, MOCK_ACTOR_ID);
      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('calls auditService.log with ROLE_DEACTIVATED', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue({});
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      await service.deactivate(MOCK_ORG, MOCK_ROLE_ID, MOCK_ACTOR_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_DEACTIVATED' }),
      );
    });

    it('invalidates cache', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue({});
      mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'user-z' }]);
      mockRedis.del.mockResolvedValue(undefined);
      await service.deactivate(MOCK_ORG, MOCK_ROLE_ID, MOCK_ACTOR_ID);
      expect(mockRedis.del).toHaveBeenCalledWith('perms:user-z');
    });
  });

  // ── activate ──────────────────────────────────────────────────

  describe('activate', () => {
    it('updates isActive to true', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue({ ...mockRole, isActive: true });
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      await service.activate(MOCK_ORG, MOCK_ROLE_ID, MOCK_ACTOR_ID);
      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
    });

    it('calls auditService.log with ROLE_ACTIVATED', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue({});
      mockPrisma.userRole.findMany.mockResolvedValue([]);
      await service.activate(MOCK_ORG, MOCK_ROLE_ID, MOCK_ACTOR_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_ACTIVATED' }),
      );
    });

    it('invalidates cache', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(mockRole);
      mockPrisma.role.update.mockResolvedValue({});
      mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'user-w' }]);
      mockRedis.del.mockResolvedValue(undefined);
      await service.activate(MOCK_ORG, MOCK_ROLE_ID, MOCK_ACTOR_ID);
      expect(mockRedis.del).toHaveBeenCalledWith('perms:user-w');
    });
  });
});
