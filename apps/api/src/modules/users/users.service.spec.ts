import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/services/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditService } from '../audit/audit.service';

const MOCK_ORG = 'org-1';
const MOCK_USER_ID = 'user-1';
const MOCK_ROLE_ID = 'role-1';

const mockUser = {
  id: MOCK_USER_ID,
  organizationId: MOCK_ORG,
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  isActive: true,
  passwordHash: 'hashed',
};

const mockUserRole = {
  id: 'ur-1',
  userId: MOCK_USER_ID,
  roleId: MOCK_ROLE_ID,
  locationId: null,
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  role: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  userRole: {
    findFirst: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  refreshToken: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = { del: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── findAll ───────────────────────────────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);
    });

    it('queries with organizationId filter', async () => {
      await service.findAll(MOCK_ORG, {});
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: MOCK_ORG }) }),
      );
    });

    it('applies search filter when search provided', async () => {
      await service.findAll(MOCK_ORG, { search: 'alice' });
      const call = mockPrisma.user.findMany.mock.calls[0][0];
      expect(call.where).toHaveProperty('OR');
    });

    it('applies roleId filter when roleId provided', async () => {
      await service.findAll(MOCK_ORG, { roleId: MOCK_ROLE_ID });
      const call = mockPrisma.user.findMany.mock.calls[0][0];
      expect(call.where).toHaveProperty('roles', { some: { roleId: MOCK_ROLE_ID } });
    });

    it('returns paginated data', async () => {
      const result = await service.findAll(MOCK_ORG, {});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ── findOne ───────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns user when found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.findOne(MOCK_ORG, MOCK_USER_ID);
      expect(result).toEqual(mockUser);
    });

    it('throws NotFoundException when not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findOne(MOCK_ORG, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── invite ────────────────────────────────────────────────────

  describe('invite', () => {
    const invitedBy = { id: 'admin-1', organizationId: MOCK_ORG } as any;
    const dto = {
      email: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Jones',
      roleIds: [MOCK_ROLE_ID],
    };

    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      await expect(service.invite(MOCK_ORG, invitedBy, dto)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if role not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findMany.mockResolvedValue([]); // no matching roles
      await expect(service.invite(MOCK_ORG, invitedBy, dto)).rejects.toThrow(NotFoundException);
    });

    it('creates user with hashed password and returns tempPassword', async () => {
      const newUser = { ...mockUser, id: 'user-new', email: dto.email };
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findMany.mockResolvedValue([{ id: MOCK_ROLE_ID }]);
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          userRole: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      const result = await service.invite(MOCK_ORG, invitedBy, dto);
      expect(result.tempPassword).toBeDefined();
      expect(typeof result.tempPassword).toBe('string');
      expect(result.passwordHash).toBeUndefined();
    });

    it('calls auditService.log with USER_INVITED action', async () => {
      const newUser = { ...mockUser, id: 'user-new', email: dto.email };
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findMany.mockResolvedValue([{ id: MOCK_ROLE_ID }]);
      mockPrisma.$transaction.mockImplementation((fn: (tx: any) => Promise<any>) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(newUser) },
          userRole: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await service.invite(MOCK_ORG, invitedBy, dto);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_INVITED' }),
      );
    });
  });

  // ── toggleActive ──────────────────────────────────────────────

  describe('toggleActive', () => {
    const requestingUser = { id: 'admin-1', organizationId: MOCK_ORG } as any;

    it('throws ForbiddenException if user deactivates themselves', async () => {
      const selfUser = { ...requestingUser };
      await expect(
        service.toggleActive(MOCK_ORG, selfUser.id, false, selfUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.toggleActive(MOCK_ORG, MOCK_USER_ID, false, requestingUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('calls auditService.log with USER_ACTIVATED action', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, isActive: true });
      await service.toggleActive(MOCK_ORG, MOCK_USER_ID, true, requestingUser);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ACTIVATED' }),
      );
    });

    it('calls auditService.log with USER_DEACTIVATED action', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.toggleActive(MOCK_ORG, MOCK_USER_ID, false, requestingUser);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_DEACTIVATED' }),
      );
    });

    it('invalidates Redis cache on deactivate', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.toggleActive(MOCK_ORG, MOCK_USER_ID, false, requestingUser);
      expect(mockRedis.del).toHaveBeenCalledWith(`perms:${MOCK_USER_ID}`);
    });

    it('deletes refresh tokens on deactivate', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.toggleActive(MOCK_ORG, MOCK_USER_ID, false, requestingUser);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: MOCK_USER_ID } }),
      );
    });
  });

  // ── assignRole ────────────────────────────────────────────────

  describe('assignRole', () => {
    it('throws NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.role.findFirst.mockResolvedValue({ id: MOCK_ROLE_ID });
      await expect(service.assignRole(MOCK_ORG, MOCK_USER_ID, MOCK_ROLE_ID, null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException if role not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findFirst.mockResolvedValue(null);
      await expect(service.assignRole(MOCK_ORG, MOCK_USER_ID, MOCK_ROLE_ID, null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls auditService.log with USER_ROLE_ASSIGNED', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findFirst.mockResolvedValue({ id: MOCK_ROLE_ID });
      mockPrisma.userRole.upsert = jest.fn().mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.assignRole(MOCK_ORG, MOCK_USER_ID, MOCK_ROLE_ID, null);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ROLE_ASSIGNED' }),
      );
    });

    it('invalidates Redis cache', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.role.findFirst.mockResolvedValue({ id: MOCK_ROLE_ID });
      mockPrisma.userRole.upsert = jest.fn().mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.assignRole(MOCK_ORG, MOCK_USER_ID, MOCK_ROLE_ID, null);
      expect(mockRedis.del).toHaveBeenCalledWith(`perms:${MOCK_USER_ID}`);
    });
  });

  // ── removeRole ────────────────────────────────────────────────

  describe('removeRole', () => {
    it('throws NotFoundException if userRole not found', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue(null);
      await expect(service.removeRole(MOCK_ORG, MOCK_USER_ID, 'ur-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls auditService.log with USER_ROLE_REMOVED', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue(mockUserRole);
      mockPrisma.userRole.delete.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.removeRole(MOCK_ORG, MOCK_USER_ID, 'ur-1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ROLE_REMOVED' }),
      );
    });

    it('invalidates Redis cache', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue(mockUserRole);
      mockPrisma.userRole.delete.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      await service.removeRole(MOCK_ORG, MOCK_USER_ID, 'ur-1');
      expect(mockRedis.del).toHaveBeenCalledWith(`perms:${MOCK_USER_ID}`);
    });
  });
});
