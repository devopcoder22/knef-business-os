import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ClockInDto } from './dto/clock-in.dto';
import type { ClockOutDto } from './dto/clock-out.dto';
import type { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import type { ListOrgAttendanceDto } from './dto/list-org-attendance.dto';
import type { ListAttendanceDto } from './dto/list-attendance.dto';

function detectSource(userAgent?: string): string {
  if (!userAgent) return 'WEB';
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'MOBILE_WEB';
  }
  return 'WEB';
}

function getWorkDateForOrg(timezone: string): Date {
  const now = new Date();
  // Get date string in org timezone as YYYY-MM-DD
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  return new Date(dateStr + 'T00:00:00.000Z');
}

function calcHoursWorked(clockIn: Date, clockOut: Date): Prisma.Decimal {
  const diffMs = clockOut.getTime() - clockIn.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  return new Prisma.Decimal(Math.max(0, hours).toFixed(2));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async getOrgTimezone(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone ?? 'Africa/Lagos';
  }

  // ── Self-service ─────────────────────────────────────────────

  async clockIn(userId: string, orgId: string, dto: ClockInDto) {
    // 1. Look up active employee for this user in this org
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId: orgId, isActive: true },
    });
    if (!employee) {
      throw new ForbiddenException('No active employee record found for this user');
    }

    // 2. Validate locationId if provided
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, organizationId: orgId },
      });
      if (!location) throw new NotFoundException('Location not found');
    }

    // 3. Get work date in org timezone
    const timezone = await this.getOrgTimezone(orgId);
    const workDate = getWorkDateForOrg(timezone);

    // 4. Idempotency check outside transaction
    const existingOutside = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: workDate,
        clockIn: { not: null },
        clockOut: null,
      },
    });
    if (existingOutside) return existingOutside;

    // 5. Use serializable transaction to prevent race conditions
    const record = await this.prisma.$transaction(
      async (tx) => {
        // Re-check inside transaction
        const existing = await tx.attendance.findFirst({
          where: {
            employeeId: employee.id,
            date: workDate,
            clockIn: { not: null },
            clockOut: null,
          },
        });
        if (existing) return existing;

        // Check if there's any record for today (e.g., previously clocked out)
        const todayRecord = await tx.attendance.findFirst({
          where: { employeeId: employee.id, date: workDate },
        });

        const source = detectSource(dto.userAgent);
        const now = new Date();

        if (todayRecord) {
          // Update existing record with new clock-in
          return tx.attendance.update({
            where: { id: todayRecord.id },
            data: {
              clockIn: now,
              clockOut: null,
              clockInSource: source,
              status: 'PRESENT',
            },
          });
        }

        return tx.attendance.create({
          data: {
            id: createId(),
            employeeId: employee.id,
            organizationId: orgId,
            locationId: dto.locationId ?? null,
            date: workDate,
            clockIn: now,
            clockInSource: source,
            status: 'PRESENT',
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return record;
  }

  async clockOut(userId: string, orgId: string, dto: ClockOutDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId: orgId, isActive: true },
    });
    if (!employee) {
      throw new ForbiddenException('No active employee record found for this user');
    }

    const timezone = await this.getOrgTimezone(orgId);
    const workDate = getWorkDateForOrg(timezone);

    const activeRecord = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: workDate,
        clockIn: { not: null },
        clockOut: null,
      },
    });
    if (!activeRecord) {
      throw new BadRequestException('No active clock-in found');
    }

    const now = new Date();
    const hoursWorked = activeRecord.clockIn
      ? calcHoursWorked(activeRecord.clockIn, now)
      : undefined;

    return this.prisma.attendance.update({
      where: { id: activeRecord.id },
      data: {
        clockOut: now,
        clockOutSource: 'WEB',
        hoursWorked,
        notes: dto.notes ?? activeRecord.notes,
      },
    });
  }

  async getMyStatus(userId: string, orgId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId: orgId },
    });
    if (!employee) return { isClockedIn: false };

    const timezone = await this.getOrgTimezone(orgId);
    const workDate = getWorkDateForOrg(timezone);

    const record = await this.prisma.attendance.findFirst({
      where: { employeeId: employee.id, date: workDate },
    });

    if (!record) return { isClockedIn: false, workDate };

    return {
      isClockedIn: record.clockIn !== null && record.clockOut === null,
      recordId: record.id,
      clockInAt: record.clockIn,
      clockOutAt: record.clockOut,
      workDate,
    };
  }

  async getMyHistory(userId: string, orgId: string, query: ListAttendanceDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee record not found');

    const { page = 1, limit = 50, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = { employeeId: employee.id };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({ where, skip, take: limit, orderBy: { date: 'desc' } }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Admin ─────────────────────────────────────────────────────

  async adminListAttendance(orgId: string, query: ListOrgAttendanceDto) {
    const { page = 1, limit = 50, dateFrom, dateTo, employeeId, locationId, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = { organizationId: orgId };
    if (employeeId) where.employeeId = employeeId;
    if (locationId) where.locationId = locationId;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              jobTitle: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          location: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async adminGetTodayOverview(orgId: string) {
    const timezone = await this.getOrgTimezone(orgId);
    const workDate = getWorkDateForOrg(timezone);

    // Count active employees in org
    const totalEmployees = await this.prisma.employee.count({
      where: { organizationId: orgId, isActive: true },
    });

    const todayRecords = await this.prisma.attendance.findMany({
      where: { organizationId: orgId, date: workDate },
      select: { clockIn: true, clockOut: true },
    });

    const clockedIn = todayRecords.filter((r) => r.clockIn !== null && r.clockOut === null).length;
    const clockedOut = todayRecords.filter((r) => r.clockIn !== null && r.clockOut !== null).length;
    const noRecord = totalEmployees - todayRecords.length;

    return {
      date: workDate,
      totalEmployees,
      clockedIn,
      clockedOut,
      noRecord: Math.max(0, noRecord),
    };
  }

  async adminGetOne(orgId: string, attendanceId: string) {
    const record = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, organizationId: orgId },
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            jobTitle: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        location: { select: { id: true, name: true } },
        correctedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!record) throw new NotFoundException('Attendance record not found');
    return record;
  }

  async adminCorrect(
    adminUserId: string,
    orgId: string,
    attendanceId: string,
    dto: CorrectAttendanceDto,
  ) {
    const record = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, organizationId: orgId },
    });
    if (!record) throw new NotFoundException('Attendance record not found');

    // Capture old values for audit
    const oldValues = {
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      status: record.status,
      notes: record.notes,
    };

    const newClockIn = dto.clockIn ? new Date(dto.clockIn) : record.clockIn;
    const newClockOut = dto.clockOut ? new Date(dto.clockOut) : record.clockOut;

    let hoursWorked = record.hoursWorked;
    if (newClockIn && newClockOut) {
      hoursWorked = calcHoursWorked(newClockIn, newClockOut);
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        clockIn: newClockIn,
        clockOut: newClockOut,
        hoursWorked,
        status: dto.status ?? 'CORRECTED',
        notes: dto.notes !== undefined ? dto.notes : record.notes,
        correctionReason: dto.correctionReason,
        correctedById: adminUserId,
        correctedAt: new Date(),
      },
    });

    await this.auditService.log({
      organizationId: orgId,
      userId: adminUserId,
      action: 'ATTENDANCE_CORRECTED',
      entity: 'Attendance',
      entityId: attendanceId,
      oldValues,
      newValues: {
        clockIn: updated.clockIn,
        clockOut: updated.clockOut,
        status: updated.status,
        notes: updated.notes,
        correctionReason: dto.correctionReason,
      },
    });

    return updated;
  }
}
