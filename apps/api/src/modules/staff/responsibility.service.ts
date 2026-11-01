import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateResponsibilityDto } from './dto/create-responsibility.dto';
import type { UpdateResponsibilityDto } from './dto/update-responsibility.dto';

@Injectable()
export class ResponsibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string, orgId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee record not found');

    return this.prisma.employeeResponsibility.findMany({
      where: { employeeId: employee.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByEmployee(orgId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.employeeResponsibility.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(adminUserId: string, orgId: string, dto: CreateResponsibilityDto) {
    // Validate employee belongs to org
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: orgId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    // Validate locationId if provided
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, organizationId: orgId },
      });
      if (!location) throw new NotFoundException('Location not found');
    }

    return this.prisma.employeeResponsibility.create({
      data: {
        id: createId(),
        organizationId: orgId,
        employeeId: dto.employeeId,
        title: dto.title,
        description: dto.description ?? null,
        category: dto.category ?? null,
        priority: dto.priority ?? 'MEDIUM',
        locationId: dto.locationId ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        createdById: adminUserId,
        isActive: true,
      },
    });
  }

  async update(orgId: string, responsibilityId: string, dto: UpdateResponsibilityDto) {
    const responsibility = await this.prisma.employeeResponsibility.findFirst({
      where: { id: responsibilityId, organizationId: orgId },
    });
    if (!responsibility) throw new NotFoundException('Responsibility not found');

    return this.prisma.employeeResponsibility.update({
      where: { id: responsibilityId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
      },
    });
  }

  async deactivate(orgId: string, responsibilityId: string) {
    const responsibility = await this.prisma.employeeResponsibility.findFirst({
      where: { id: responsibilityId, organizationId: orgId },
    });
    if (!responsibility) throw new NotFoundException('Responsibility not found');

    return this.prisma.employeeResponsibility.update({
      where: { id: responsibilityId },
      data: { isActive: false },
    });
  }
}
