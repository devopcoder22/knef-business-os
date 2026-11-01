import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { SerializedUnitStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateSerializedUnitDto } from './dto/create-serialized-unit.dto';
import type { ListSerializedUnitsDto } from './dto/list-serialized-units.dto';

@Injectable()
export class SerializedUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(organizationId: string, query: ListSerializedUnitsDto) {
    const { page = 1, limit = 20, status, productId, locationId, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (status) where['status'] = status;
    if (productId) where['productId'] = productId;
    if (locationId) where['locationId'] = locationId;
    if (search) {
      where['OR'] = [
        { imei1: { contains: search } },
        { imei2: { contains: search } },
        { serialNumber: { contains: search } },
      ];
    }

    const [units, total] = await Promise.all([
      this.prisma.serializedUnit.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serializedUnit.count({ where }),
    ]);

    return {
      data: units,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const unit = await this.prisma.serializedUnit.findFirst({
      where: { id, organizationId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });
    if (!unit) throw new NotFoundException('Serialized unit not found');
    return unit;
  }

  async lookup(organizationId: string, identifier: string) {
    const unit = await this.prisma.serializedUnit.findFirst({
      where: {
        organizationId,
        OR: [
          { imei1: identifier },
          { imei2: identifier },
          { serialNumber: identifier },
        ],
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found for identifier: ' + identifier);
    return unit;
  }

  async create(
    organizationId: string,
    dto: CreateSerializedUnitDto,
    userId: string,
  ) {
    await this.validateImeiUniqueness(organizationId, dto.imei1, dto.imei2);

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const unit = await this.prisma.serializedUnit.create({
      data: {
        id: createId(),
        organizationId,
        productId: dto.productId,
        variantId: dto.variantId,
        imei1: dto.imei1,
        imei2: dto.imei2,
        serialNumber: dto.serialNumber,
        locationId: dto.locationId,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
        notes: dto.notes,
        status: SerializedUnitStatus.IN_STOCK,
      },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'SERIALIZED_UNIT_CREATED',
      entity: 'SerializedUnit',
      entityId: unit.id,
      newValues: { imei1: unit.imei1, productId: unit.productId },
    });

    return unit;
  }

  async bulkCreate(
    organizationId: string,
    dtos: CreateSerializedUnitDto[],
    userId: string,
  ) {
    const results = [];
    const errors: Array<{ index: number; imei1: string; error: string }> = [];

    for (let i = 0; i < dtos.length; i++) {
      try {
        const unit = await this.create(organizationId, dtos[i], userId);
        results.push(unit);
      } catch (err: any) {
        errors.push({ index: i, imei1: dtos[i].imei1, error: err.message });
      }
    }

    return { created: results.length, errors, results };
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: SerializedUnitStatus,
    notes: string | undefined,
    userId: string,
  ) {
    const unit = await this.prisma.serializedUnit.findFirst({
      where: { id, organizationId },
    });
    if (!unit) throw new NotFoundException('Serialized unit not found');

    const updated = await this.prisma.serializedUnit.update({
      where: { id },
      data: { status, notes: notes ?? unit.notes },
    });

    await this.auditService.log({
      organizationId,
      userId,
      action: 'SERIALIZED_UNIT_STATUS_CHANGED',
      entity: 'SerializedUnit',
      entityId: id,
      oldValues: { status: unit.status },
      newValues: { status, notes },
    });

    return updated;
  }

  async findByProduct(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.serializedUnit.findMany({
      where: { organizationId, productId },
      include: {
        variant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByLocation(organizationId: string, locationId: string) {
    return this.prisma.serializedUnit.findMany({
      where: { organizationId, locationId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStatusSummary(organizationId: string, productId: string) {
    const counts = await this.prisma.serializedUnit.groupBy({
      by: ['status'],
      where: { organizationId, productId },
      _count: { id: true },
    });

    const summary: Record<string, number> = {};
    counts.forEach((c) => {
      summary[c.status] = c._count.id;
    });
    return summary;
  }

  private async validateImeiUniqueness(
    organizationId: string,
    imei1: string,
    imei2?: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.serializedUnit.findFirst({
      where: {
        organizationId,
        OR: [{ imei1 }, ...(imei2 ? [{ imei1: imei2 }, { imei2 }] : [{ imei2: imei1 }])],
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException(
        `IMEI ${existing.imei1 === imei1 || existing.imei2 === imei1 ? imei1 : imei2} is already registered.`,
      );
    }
  }
}
