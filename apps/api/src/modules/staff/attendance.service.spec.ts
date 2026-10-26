import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

// ── Mock Prisma ────────────────────────────────────────────────
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  employee: { findFirst: jest.fn(), count: jest.fn() },
  location: { findFirst: jest.fn() },
  attendance: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

// ── Fixtures ───────────────────────────────────────────────────
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_A = 'user-a';
const ADMIN_USER = 'admin-user';
const EMP_A = 'emp-a';

const mockOrg = { timezone: 'Africa/Lagos' };
const mockEmployee = { id: EMP_A, userId: USER_A, organizationId: ORG_A, isActive: true };
const mockLocation = { id: 'loc-1', organizationId: ORG_A };

function makeRecord(overrides = {}) {
  return {
    id: 'att-1',
    employeeId: EMP_A,
    organizationId: ORG_A,
    date: new Date('2026-10-26T00:00:00.000Z'),
    clockIn: new Date('2026-10-26T08:00:00.000Z'),
    clockOut: null,
    hoursWorked: null,
    status: 'PRESENT',
    notes: null,
    clockInSource: 'WEB',
    clockOutSource: null,
    correctionReason: null,
    correctedById: null,
    correctedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AttendanceService', () => {
  let service: AttendanceService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);

    // Default happy-path mocks
    mockPrisma.organization.findUnique.mockResolvedValue(mockOrg);
    mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
    mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
    mockPrisma.attendance.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
      fn(mockPrisma as unknown as typeof mockPrisma),
    );
  });

  // ── clockIn ──────────────────────────────────────────────────

  describe('clockIn', () => {
    it('creates a record with server time (no client timestamp accepted)', async () => {
      const created = makeRecord();
      mockPrisma.attendance.create.mockResolvedValue(created);
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      const result = await service.clockIn(USER_A, ORG_A, {});

      expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(1);
      const createArg = mockPrisma.attendance.create.mock.calls[0][0].data;
      // clockIn must be a Date set by the server, not from client input
      expect(createArg.clockIn).toBeInstanceOf(Date);
      // organizationId must be set
      expect(createArg.organizationId).toBe(ORG_A);
      expect(result).toEqual(created);
    });

    it('returns existing record (idempotent) when already clocked in', async () => {
      const existing = makeRecord();
      // First findFirst (outside tx) returns existing
      mockPrisma.attendance.findFirst.mockResolvedValueOnce(existing);

      const result = await service.clockIn(USER_A, ORG_A, {});

      expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('throws ForbiddenException for inactive employee', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(USER_A, ORG_A, {})).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for invalid locationId', async () => {
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(USER_A, ORG_A, { locationId: 'bad-loc' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects employee from another org', async () => {
      // Employee does not belong to ORG_B
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.clockIn(USER_A, ORG_B, {})).rejects.toThrow(ForbiddenException);
    });

    it('uses server time, not client-provided timestamp', async () => {
      const before = Date.now();
      const created = makeRecord({ clockIn: new Date() });
      mockPrisma.attendance.create.mockResolvedValue(created);

      await service.clockIn(USER_A, ORG_A, {});

      const createArg = mockPrisma.attendance.create.mock.calls[0][0].data;
      const afterMs = Date.now();
      expect(createArg.clockIn.getTime()).toBeGreaterThanOrEqual(before);
      expect(createArg.clockIn.getTime()).toBeLessThanOrEqual(afterMs);
    });
  });

  // ── clockOut ─────────────────────────────────────────────────

  describe('clockOut', () => {
    it('sets clockOut with server time', async () => {
      const activeRecord = makeRecord();
      mockPrisma.attendance.findFirst.mockResolvedValue(activeRecord);
      const updated = makeRecord({ clockOut: new Date() });
      mockPrisma.attendance.update.mockResolvedValue(updated);

      const result = await service.clockOut(USER_A, ORG_A, {});

      expect(mockPrisma.attendance.update).toHaveBeenCalledTimes(1);
      const updateArg = mockPrisma.attendance.update.mock.calls[0][0].data;
      expect(updateArg.clockOut).toBeInstanceOf(Date);
      expect(result).toEqual(updated);
    });

    it('throws BadRequestException when no active clock-in found', async () => {
      // employee found but no active attendance
      mockPrisma.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(service.clockOut(USER_A, ORG_A, {})).rejects.toThrow(BadRequestException);
    });

    it('rejects clock-out for employee not belonging to org', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.clockOut('other-user', ORG_A, {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ── adminCorrect ─────────────────────────────────────────────

  describe('adminCorrect', () => {
    const existingRecord = makeRecord({
      organizationId: ORG_A,
      clockIn: new Date('2026-10-26T08:00:00Z'),
      clockOut: new Date('2026-10-26T17:00:00Z'),
      hoursWorked: 9,
    });

    it('updates record and logs audit on valid correction', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(existingRecord);
      const corrected = makeRecord({ status: 'CORRECTED', correctionReason: 'Typo fix' });
      mockPrisma.attendance.update.mockResolvedValue(corrected);

      const dto = {
        correctionReason: 'Typo fix',
        clockIn: '2026-10-26T08:05:00.000Z',
        clockOut: '2026-10-26T17:00:00.000Z',
      };

      const result = await service.adminCorrect(ADMIN_USER, ORG_A, 'att-1', dto);

      expect(mockPrisma.attendance.update).toHaveBeenCalledTimes(1);
      const updateArg = mockPrisma.attendance.update.mock.calls[0][0].data;
      expect(updateArg.correctionReason).toBe('Typo fix');
      expect(updateArg.correctedById).toBe(ADMIN_USER);
      expect(updateArg.correctedAt).toBeInstanceOf(Date);
      expect(mockAuditService.log).toHaveBeenCalledTimes(1);
      expect(result).toEqual(corrected);
    });

    it('uses status CORRECTED when no explicit status provided', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(existingRecord);
      mockPrisma.attendance.update.mockResolvedValue(makeRecord({ status: 'CORRECTED' }));

      await service.adminCorrect(ADMIN_USER, ORG_A, 'att-1', {
        correctionReason: 'Adjust hours',
      });

      const updateArg = mockPrisma.attendance.update.mock.calls[0][0].data;
      expect(updateArg.status).toBe('CORRECTED');
    });

    it('throws NotFoundException for record in different org', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      await expect(
        service.adminCorrect(ADMIN_USER, ORG_B, 'att-1', { correctionReason: 'fix' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
