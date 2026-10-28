import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';

type CycleCountStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CreateCycleCountDto {
  locationId: string;
  frequency: string;
  categoryId?: string;
  scheduledAt: string;
  notes?: string;
}

export interface UpdateCycleCountItemDto {
  cycleCountItemId: string;
  countedQty: number;
}

@Injectable()
export class CycleCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: { page?: number; limit?: number; status?: string; locationId?: string },
  ) {
    const { page = 1, limit = 20, status, locationId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (status) where['status'] = status;
    if (locationId) where['locationId'] = locationId;

    const [counts, total] = await Promise.all([
      (this.prisma as any).cycleCount.findMany({
        where,
        skip,
        take: limit,
        include: {
          location: { select: { id: true, name: true, code: true } },
          _count: { select: { items: true } },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      (this.prisma as any).cycleCount.count({ where }),
    ]);

    return {
      data: counts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const count = await (this.prisma as any).cycleCount.findFirst({
      where: { id, organizationId },
      include: {
        location: { select: { id: true, name: true, code: true } },
        items: true,
      },
    });
    if (!count) throw new NotFoundException('Cycle count not found');
    return count;
  }

  async create(organizationId: string, dto: CreateCycleCountDto, userId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, organizationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    const reference = await this.generateReference(organizationId);

    return (this.prisma as any).cycleCount.create({
      data: {
        id: createId(),
        organizationId,
        locationId: dto.locationId,
        reference,
        frequency: dto.frequency,
        categoryId: dto.categoryId,
        scheduledAt: new Date(dto.scheduledAt),
        createdBy: userId,
        notes: dto.notes,
      },
    });
  }

  async start(organizationId: string, id: string) {
    const cycleCount = await (this.prisma as any).cycleCount.findFirst({
      where: { id, organizationId },
    });
    if (!cycleCount) throw new NotFoundException('Cycle count not found');
    if (cycleCount.status !== 'SCHEDULED') {
      throw new BadRequestException('Only SCHEDULED cycle counts can be started');
    }

    // Snapshot inventory for scope
    const levelWhere: Record<string, unknown> = {
      locationId: cycleCount.locationId,
      product: { organizationId },
    };
    if (cycleCount.categoryId) {
      levelWhere['product'] = { organizationId, categoryId: cycleCount.categoryId };
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: levelWhere,
      include: { product: { select: { id: true } } },
    });

    await (this.prisma as any).cycleCountItem.createMany({
      data: levels.map((level) => ({
        id: createId(),
        cycleCountId: cycleCount.id,
        productId: level.productId,
        variantId: level.variantId,
        systemQty: level.quantity,
      })),
    });

    return (this.prisma as any).cycleCount.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
  }

  async submitItems(
    organizationId: string,
    id: string,
    items: UpdateCycleCountItemDto[],
  ) {
    const cycleCount = await (this.prisma as any).cycleCount.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!cycleCount) throw new NotFoundException('Cycle count not found');
    if (cycleCount.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Only IN_PROGRESS cycle counts can be updated');
    }

    for (const item of items) {
      const existing = cycleCount.items.find((i: any) => i.id === item.cycleCountItemId);
      if (!existing) continue;
      const variance = item.countedQty - Number(existing.systemQty);
      await (this.prisma as any).cycleCountItem.update({
        where: { id: item.cycleCountItemId },
        data: {
          countedQty: item.countedQty,
          variance,
          countedAt: new Date(),
        },
      });
    }

    return (this.prisma as any).cycleCount.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async cancel(organizationId: string, id: string) {
    const cycleCount = await (this.prisma as any).cycleCount.findFirst({
      where: { id, organizationId },
    });
    if (!cycleCount) throw new NotFoundException('Cycle count not found');
    if (cycleCount.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed cycle count');
    }

    return (this.prisma as any).cycleCount.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  private async generateReference(organizationId: string): Promise<string> {
    const count = await (this.prisma as any).cycleCount.count({ where: { organizationId } });
    const seq = String(count + 1).padStart(5, '0');
    return `CC${seq}`;
  }
}
