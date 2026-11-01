import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ResponsibilityService } from './responsibility.service';
import { PrismaService } from '../../common/services/prisma.service';

// ── Mock Prisma ────────────────────────────────────────────────
const mockPrisma = {
  employee: { findFirst: jest.fn() },
  location: { findFirst: jest.fn() },
  employeeResponsibility: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

// ── Fixtures ───────────────────────────────────────────────────
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_A = 'user-a';
const ADMIN_USER = 'admin-user';
const EMP_A = 'emp-a';

const mockEmployee = { id: EMP_A, userId: USER_A, organizationId: ORG_A, isActive: true };
const mockLocation = { id: 'loc-1', organizationId: ORG_A };

function makeResponsibility(overrides = {}) {
  return {
    id: 'resp-1',
    organizationId: ORG_A,
    employeeId: EMP_A,
    title: 'Manage inventory',
    description: null,
    category: null,
    priority: 'MEDIUM',
    locationId: null,
    isActive: true,
    startDate: null,
    endDate: null,
    createdById: ADMIN_USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ResponsibilityService', () => {
  let service: ResponsibilityService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResponsibilityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ResponsibilityService>(ResponsibilityService);

    // Default happy-path mocks
    mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
    mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
    mockPrisma.employeeResponsibility.findFirst.mockResolvedValue(null);
  });

  // ── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('creates responsibility with correct data', async () => {
      const created = makeResponsibility();
      mockPrisma.employeeResponsibility.create.mockResolvedValue(created);

      const result = await service.create(ADMIN_USER, ORG_A, {
        employeeId: EMP_A,
        title: 'Manage inventory',
      });

      expect(mockPrisma.employeeResponsibility.create).toHaveBeenCalledTimes(1);
      const createArg = mockPrisma.employeeResponsibility.create.mock.calls[0][0].data;
      expect(createArg.organizationId).toBe(ORG_A);
      expect(createArg.employeeId).toBe(EMP_A);
      expect(createArg.createdById).toBe(ADMIN_USER);
      expect(result).toEqual(created);
    });

    it('throws NotFoundException when employee not in org', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ADMIN_USER, ORG_A, { employeeId: 'bad-emp', title: 'Task' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for invalid locationId', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ADMIN_USER, ORG_A, {
          employeeId: EMP_A,
          title: 'Task',
          locationId: 'bad-loc',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── findMine ─────────────────────────────────────────────────

  describe('findMine', () => {
    it('returns only employee\'s own active responsibilities', async () => {
      const responsibilities = [makeResponsibility(), makeResponsibility({ id: 'resp-2' })];
      mockPrisma.employeeResponsibility.findMany.mockResolvedValue(responsibilities);

      const result = await service.findMine(USER_A, ORG_A);

      expect(mockPrisma.employeeResponsibility.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: EMP_A, isActive: true },
        }),
      );
      expect(result).toEqual(responsibilities);
    });

    it('throws NotFoundException when user has no employee record', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.findMine(USER_A, ORG_A)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByEmployee ───────────────────────────────────────────

  describe('findByEmployee', () => {
    it('admin can view any employee responsibilities in same org', async () => {
      const responsibilities = [makeResponsibility()];
      mockPrisma.employeeResponsibility.findMany.mockResolvedValue(responsibilities);

      const result = await service.findByEmployee(ORG_A, EMP_A);

      expect(mockPrisma.employeeResponsibility.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: EMP_A } }),
      );
      expect(result).toEqual(responsibilities);
    });

    it('throws NotFoundException for employee not in org', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.findByEmployee(ORG_B, EMP_A)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('updates allowed fields', async () => {
      const existing = makeResponsibility();
      mockPrisma.employeeResponsibility.findFirst.mockResolvedValue(existing);
      const updated = makeResponsibility({ title: 'Updated title' });
      mockPrisma.employeeResponsibility.update.mockResolvedValue(updated);

      const result = await service.update(ORG_A, 'resp-1', { title: 'Updated title' });

      expect(mockPrisma.employeeResponsibility.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException for responsibility in another org', async () => {
      mockPrisma.employeeResponsibility.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_B, 'resp-1', { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── deactivate ───────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      const existing = makeResponsibility();
      mockPrisma.employeeResponsibility.findFirst.mockResolvedValue(existing);
      const deactivated = makeResponsibility({ isActive: false });
      mockPrisma.employeeResponsibility.update.mockResolvedValue(deactivated);

      const result = await service.deactivate(ORG_A, 'resp-1');

      const updateArg = mockPrisma.employeeResponsibility.update.mock.calls[0][0].data;
      expect(updateArg.isActive).toBe(false);
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException for responsibility not in org', async () => {
      mockPrisma.employeeResponsibility.findFirst.mockResolvedValue(null);

      await expect(service.deactivate(ORG_B, 'resp-1')).rejects.toThrow(NotFoundException);
    });
  });
});
