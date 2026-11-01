import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateDepartmentDto } from './dto/create-department.dto';
import type { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.department.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async findOne(organizationId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { employees: true } } },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(organizationId: string, dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findFirst({
      where: { organizationId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException(`Department '${dto.name}' already exists`);
    }

    return this.prisma.department.create({
      data: { id: createId(), organizationId, ...dto },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateDepartmentDto) {
    await this.findOne(organizationId, id);

    if (dto.name) {
      const conflict = await this.prisma.department.findFirst({
        where: {
          organizationId,
          name: { equals: dto.name, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (conflict) throw new ConflictException(`Department '${dto.name}' already exists`);
    }

    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.department.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
