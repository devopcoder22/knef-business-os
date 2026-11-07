import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DiscountType } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import type {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
  ValidateDiscountDto,
  MarkUsedDto,
} from './dto/discount.dto';

@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, dto: CreateDiscountCodeDto) {
    const code = dto.code.toUpperCase().trim();

    const existing = await this.prisma.discountCode.findUnique({
      where: { organizationId_code: { organizationId: orgId, code } },
    });
    if (existing) {
      throw new ConflictException(`Discount code "${code}" already exists`);
    }

    if (dto.type === DiscountType.PERCENTAGE && dto.value > 100) {
      throw new BadRequestException('Percentage discount value cannot exceed 100');
    }

    return this.prisma.discountCode.create({
      data: {
        id: createId(),
        organizationId: orgId,
        code,
        type: dto.type,
        value: dto.value,
        minOrderAmount: dto.minOrderAmount ?? null,
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        description: dto.description ?? null,
        createdBy: userId,
      },
    });
  }

  async list(
    orgId: string,
    filters: { isActive?: boolean; limit?: number; offset?: number } = {},
  ) {
    const { isActive, limit = 50, offset = 0 } = filters;

    const where = {
      organizationId: orgId,
      ...(isActive !== undefined ? { isActive } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.discountCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { usages: true } },
        },
      }),
      this.prisma.discountCode.count({ where }),
    ]);

    return {
      data: data.map((d) => ({
        ...d,
        value: Number(d.value),
        minOrderAmount: d.minOrderAmount ? Number(d.minOrderAmount) : null,
        usageCount: d._count.usages,
      })),
      total,
      limit,
      offset,
    };
  }

  async findById(orgId: string, id: string) {
    const code = await this.prisma.discountCode.findFirst({
      where: { id, organizationId: orgId },
      include: {
        usages: {
          orderBy: { usedAt: 'desc' },
          take: 20,
        },
        _count: { select: { usages: true } },
      },
    });
    if (!code) throw new NotFoundException('Discount code not found');
    return {
      ...code,
      value: Number(code.value),
      minOrderAmount: code.minOrderAmount ? Number(code.minOrderAmount) : null,
      usageCount: code._count.usages,
      usages: code.usages.map((u) => ({
        ...u,
        discountAmount: Number(u.discountAmount),
      })),
    };
  }

  async findByCode(orgId: string, code: string) {
    const result = await this.prisma.discountCode.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: code.toUpperCase().trim() } },
    });
    if (!result) throw new NotFoundException('Discount code not found');
    return result;
  }

  async validate(
    orgId: string,
    code: string,
    orderAmount: number,
    customerEmail?: string,
  ): Promise<{ valid: boolean; discountAmount: number; discountCode: object }> {
    const normalizedCode = code.toUpperCase().trim();
    const discount = await this.prisma.discountCode.findUnique({
      where: { organizationId_code: { organizationId: orgId, code: normalizedCode } },
    });

    if (!discount) {
      throw new BadRequestException('Invalid discount code');
    }

    if (!discount.isActive) {
      throw new BadRequestException('This discount code is inactive');
    }

    if (discount.expiresAt && discount.expiresAt < new Date()) {
      throw new BadRequestException('This discount code has expired');
    }

    if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
      throw new BadRequestException('This discount code has reached its usage limit');
    }

    const minOrder = discount.minOrderAmount ? Number(discount.minOrderAmount) : null;
    if (minOrder !== null && orderAmount < minOrder) {
      throw new BadRequestException(
        `A minimum order amount of ₦${minOrder.toLocaleString()} is required to use this code`,
      );
    }

    const value = Number(discount.value);
    let discountAmount: number;
    if (discount.type === DiscountType.PERCENTAGE) {
      discountAmount = Math.min((orderAmount * value) / 100, orderAmount);
    } else {
      discountAmount = Math.min(value, orderAmount);
    }

    discountAmount = Math.round(discountAmount * 100) / 100;

    return {
      valid: true,
      discountAmount,
      discountCode: {
        id: discount.id,
        code: discount.code,
        type: discount.type,
        value,
        description: discount.description,
      },
    };
  }

  async markUsed(
    orgId: string,
    codeId: string,
    dto: MarkUsedDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const discount = await tx.discountCode.findFirst({
        where: { id: codeId, organizationId: orgId },
      });
      if (!discount) throw new NotFoundException('Discount code not found');

      await tx.discountCode.update({
        where: { id: codeId },
        data: { usedCount: { increment: 1 } },
      });

      return tx.discountCodeUsage.create({
        data: {
          id: createId(),
          discountCodeId: codeId,
          orderId: dto.orderId ?? null,
          customerEmail: dto.customerEmail,
          discountAmount: dto.discountAmount,
        },
      });
    });
  }

  async update(orgId: string, _userId: string, id: string, dto: UpdateDiscountCodeDto) {
    const existing = await this.prisma.discountCode.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Discount code not found');

    return this.prisma.discountCode.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.minOrderAmount !== undefined ? { minOrderAmount: dto.minOrderAmount } : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  async delete(orgId: string, _userId: string, id: string) {
    const existing = await this.prisma.discountCode.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Discount code not found');

    await this.prisma.discountCode.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Discount code deactivated' };
  }
}
