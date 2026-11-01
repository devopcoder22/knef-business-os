import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type { CreateLocationDto } from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId: string) {
    return this.prisma.location.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: true, inventoryLevels: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { users: true, inventoryLevels: true } },
      },
    });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  async create(organizationId: string, dto: CreateLocationDto) {
    const existing = await this.prisma.location.findFirst({
      where: { organizationId, code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Location with code '${dto.code}' already exists`);
    }

    return this.prisma.location.create({
      data: {
        id: createId(),
        organizationId,
        ...dto,
        code: dto.code.toUpperCase(),
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateLocationDto) {
    await this.findOne(organizationId, id);

    if (dto.code) {
      const conflict = await this.prisma.location.findFirst({
        where: { organizationId, code: dto.code.toUpperCase(), NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Location code '${dto.code}' is already in use`);
      }
    }

    return this.prisma.location.update({
      where: { id },
      data: { ...dto, ...(dto.code && { code: dto.code.toUpperCase() }) },
    });
  }

  async setActive(organizationId: string, id: string, isActive: boolean) {
    await this.findOne(organizationId, id);
    return this.prisma.location.update({
      where: { id },
      data: { isActive },
    });
  }
}
