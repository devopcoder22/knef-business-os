import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma, EmploymentType } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { UpdateEmployeeDto } from './dto/update-employee.dto';
import type { ListEmployeesDto } from './dto/list-employees.dto';
import type { RecordAttendanceDto } from './dto/record-attendance.dto';
import type { ListAttendanceDto } from './dto/list-attendance.dto';
import type { CreateDutyDto } from './dto/create-duty.dto';
import type { CreateDepartmentDto } from './dto/create-department.dto';
import type { UpdateDepartmentDto } from './dto/update-department.dto';

async function generateEmployeeNumber(prisma: PrismaService, organizationId: string): Promise<string> {
  const count = await prisma.employee.count({ where: { organizationId } });
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Employees ─────────────────────────────────────────────────

  async findAllEmployees(organizationId: string, query: ListEmployeesDto) {
    const { page = 1, limit = 20, departmentId, locationId, employmentType, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = { organizationId };
    if (departmentId) where.departmentId = departmentId;
    if (locationId) where.locationId = locationId;
    if (employmentType) where.employmentType = employmentType;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          department: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneEmployee(organizationId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, phone: true } },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async createEmployee(organizationId: string, dto: CreateEmployeeDto) {
    // Check user exists
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.employee.findFirst({ where: { userId: dto.userId } });
    if (existing) throw new ConflictException('User is already an employee');

    const employeeNumber = await generateEmployeeNumber(this.prisma, organizationId);

    return this.prisma.employee.create({
      data: {
        id: createId(),
        organizationId,
        userId: dto.userId,
        employeeNumber,
        departmentId: dto.departmentId,
        locationId: dto.locationId,
        jobTitle: dto.jobTitle,
        employmentType: dto.employmentType ?? EmploymentType.FULL_TIME,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        salary: dto.salary ? new Prisma.Decimal(dto.salary) : undefined,
        bankName: dto.bankName,
        bankAccount: dto.bankAccount,
        bankCode: dto.bankCode,
        emergencyName: dto.emergencyName,
        emergencyPhone: dto.emergencyPhone,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  async updateEmployee(organizationId: string, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id, organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employee.update({
      where: { id },
      data: {
        departmentId: dto.departmentId,
        locationId: dto.locationId,
        jobTitle: dto.jobTitle,
        employmentType: dto.employmentType,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        salary: dto.salary ? new Prisma.Decimal(dto.salary) : undefined,
        bankName: dto.bankName,
        bankAccount: dto.bankAccount,
        bankCode: dto.bankCode,
        emergencyName: dto.emergencyName,
        emergencyPhone: dto.emergencyPhone,
        notes: dto.notes,
        isActive: dto.isActive,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  // ── Attendance ────────────────────────────────────────────────

  async getAttendance(organizationId: string, employeeId: string, query: ListAttendanceDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const { page = 1, limit = 50, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = { employeeId };
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

  async recordAttendance(organizationId: string, employeeId: string, dto: RecordAttendanceDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const date = new Date(dto.date);
    // Upsert attendance for the day
    const existing = await this.prisma.attendance.findFirst({
      where: { employeeId, date },
    });

    let hoursWorked: Prisma.Decimal | undefined;
    if (dto.clockIn && dto.clockOut) {
      const inTime = new Date(dto.clockIn);
      const outTime = new Date(dto.clockOut);
      const diffMs = outTime.getTime() - inTime.getTime();
      const hours = diffMs / (1000 * 60 * 60);
      hoursWorked = new Prisma.Decimal(hours.toFixed(2));
    }

    if (existing) {
      return this.prisma.attendance.update({
        where: { id: existing.id },
        data: {
          clockIn: dto.clockIn ? new Date(dto.clockIn) : undefined,
          clockOut: dto.clockOut ? new Date(dto.clockOut) : undefined,
          hoursWorked,
          status: dto.status,
          notes: dto.notes,
        },
      });
    }

    return this.prisma.attendance.create({
      data: {
        id: createId(),
        employeeId,
        date,
        clockIn: dto.clockIn ? new Date(dto.clockIn) : undefined,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : undefined,
        hoursWorked,
        status: dto.status ?? 'PRESENT',
        notes: dto.notes,
      },
    });
  }

  // ── Duties ────────────────────────────────────────────────────

  async getDuties(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.staffDuty.findMany({
      where: { employeeId },
      orderBy: { startTime: 'asc' },
    });
  }

  async createDuty(organizationId: string, employeeId: string, dto: CreateDutyDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.staffDuty.create({
      data: {
        id: createId(),
        employeeId,
        title: dto.title,
        description: dto.description,
        startTime: dto.startTime ? new Date(dto.startTime) : new Date(),
        endTime: dto.endTime ? new Date(dto.endTime) : new Date(),
        locationId: dto.locationId,
        notes: dto.notes,
      },
    });
  }

  // ── Departments ───────────────────────────────────────────────

  async findAllDepartments(organizationId: string) {
    return this.prisma.department.findMany({
      where: { organizationId },
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneDepartment(organizationId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { employees: true } } },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async createDepartment(organizationId: string, dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findFirst({
      where: { organizationId, name: dto.name },
    });
    if (existing) throw new ConflictException(`Department '${dto.name}' already exists`);

    return this.prisma.department.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async updateDepartment(organizationId: string, id: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');

    return this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async deleteDepartment(organizationId: string, id: string) {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');

    const employeeCount = await this.prisma.employee.count({ where: { departmentId: id } });
    if (employeeCount > 0) throw new ConflictException('Cannot delete department with active employees');

    await this.prisma.department.delete({ where: { id } });
    return { message: 'Department deleted' };
  }

  async getDepartmentEmployees(organizationId: string, departmentId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id: departmentId, organizationId } });
    if (!dept) throw new NotFoundException('Department not found');

    return this.prisma.employee.findMany({
      where: { organizationId, departmentId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
