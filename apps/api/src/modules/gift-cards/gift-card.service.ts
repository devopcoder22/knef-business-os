import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { CreateGiftCardDto, RedeemGiftCardDto } from './dto/gift-card.dto';

@Injectable()
export class GiftCardService {
  private readonly logger = new Logger(GiftCardService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    const hex = crypto.randomBytes(6).toString('hex').toUpperCase();
    // Format: GC-XXXX-XXXX-XXXX  (12 hex chars split into 3 groups of 4)
    return `GC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
  }

  async create(orgId: string, userId: string, dto: CreateGiftCardDto) {
    // Ensure code is unique within org, retry up to 5 times
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateCode();
      const exists = await this.prisma.giftCard.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: candidate } },
        select: { id: true },
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new BadRequestException('Failed to generate a unique gift card code. Please try again.');
    }

    const amount = new Prisma.Decimal(dto.amount);

    const card = await this.prisma.giftCard.create({
      data: {
        organizationId: orgId,
        code,
        initialAmount: amount,
        remainingAmount: amount,
        isActive: true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        issuedToEmail: dto.issuedToEmail ?? null,
        note: dto.note ?? null,
        createdBy: userId,
      },
      include: { redemptions: true },
    });

    this.logger.log(`Gift card ${code} created by ${userId} for org ${orgId}`);
    return card;
  }

  async list(orgId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.giftCard.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { redemptions: true } },
        },
      }),
      this.prisma.giftCard.count({ where: { organizationId: orgId } }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(orgId: string, id: string) {
    const card = await this.prisma.giftCard.findFirst({
      where: { id, organizationId: orgId },
      include: {
        redemptions: { orderBy: { redeemedAt: 'desc' } },
        _count: { select: { redemptions: true } },
      },
    });
    if (!card) {
      throw new NotFoundException('Gift card not found');
    }
    return card;
  }

  async findByCode(orgId: string, code: string) {
    const card = await this.prisma.giftCard.findUnique({
      where: { organizationId_code: { organizationId: orgId, code } },
      include: {
        redemptions: { orderBy: { redeemedAt: 'desc' } },
      },
    });
    if (!card) {
      throw new NotFoundException('Gift card not found');
    }
    return card;
  }

  async validate(orgId: string, code: string): Promise<{
    valid: boolean;
    remainingAmount: Prisma.Decimal;
    giftCard: Awaited<ReturnType<typeof this.findByCode>>;
  }> {
    const card = await this.findByCode(orgId, code);

    if (!card.isActive) {
      throw new BadRequestException('Gift card is not active');
    }
    if (card.expiresAt && card.expiresAt < new Date()) {
      throw new BadRequestException('Gift card has expired');
    }
    if (card.remainingAmount.lte(0)) {
      throw new BadRequestException('Gift card has no remaining balance');
    }

    return {
      valid: true,
      remainingAmount: card.remainingAmount,
      giftCard: card,
    };
  }

  async redeem(orgId: string, dto: RedeemGiftCardDto): Promise<{ redeemedAmount: Prisma.Decimal }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const card = await tx.giftCard.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: dto.code } },
      });

      if (!card) {
        throw new NotFoundException('Gift card not found');
      }
      if (!card.isActive) {
        throw new BadRequestException('Gift card is not active');
      }
      if (card.expiresAt && card.expiresAt < new Date()) {
        throw new BadRequestException('Gift card has expired');
      }
      if (card.remainingAmount.lte(0)) {
        throw new BadRequestException('Gift card has no remaining balance');
      }

      // Partial redemption: cap at remaining balance
      const requested = new Prisma.Decimal(dto.amount);
      const actual = requested.gt(card.remainingAmount) ? card.remainingAmount : requested;

      const updatedCard = await tx.giftCard.update({
        where: { id: card.id },
        data: { remainingAmount: card.remainingAmount.minus(actual) },
      });

      await tx.giftCardRedemption.create({
        data: {
          giftCardId: card.id,
          orderId: dto.orderId ?? null,
          amount: actual,
        },
      });

      this.logger.log(
        `Gift card ${dto.code} redeemed ₦${actual} (remaining: ₦${updatedCard.remainingAmount})`,
      );

      return { redeemedAmount: actual };
    });

    return result;
  }

  async deactivate(orgId: string, userId: string, id: string) {
    const card = await this.prisma.giftCard.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!card) {
      throw new NotFoundException('Gift card not found');
    }

    const updated = await this.prisma.giftCard.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`Gift card ${card.code} deactivated by ${userId}`);
    return updated;
  }
}
