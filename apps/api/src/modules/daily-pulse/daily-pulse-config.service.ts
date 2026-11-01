import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';

export interface DailyPulseConfigDto {
  enabled: boolean;
  deliveryTime: string;   // "HH:MM" in org local time
  timezone: string;       // IANA timezone, e.g. "Africa/Lagos"
  channels: string[];     // ["EMAIL", "WEB_PUSH"]
  recipientIds: string[]; // user IDs to deliver to
}

@Injectable()
export class DailyPulseConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(organizationId: string) {
    return (this.prisma as any).dailyPulseConfig.findFirst({ where: { organizationId } });
  }

  async upsertConfig(organizationId: string, dto: DailyPulseConfigDto) {
    const existing = await (this.prisma as any).dailyPulseConfig.findFirst({ where: { organizationId } });
    if (existing) {
      return (this.prisma as any).dailyPulseConfig.update({
        where: { id: existing.id },
        data: {
          enabled: dto.enabled,
          deliveryTime: dto.deliveryTime,
          timezone: dto.timezone,
          channels: dto.channels,
          recipientIds: dto.recipientIds,
          updatedAt: new Date(),
        },
      });
    }
    return (this.prisma as any).dailyPulseConfig.create({
      data: {
        id: createId(),
        organizationId,
        enabled: dto.enabled,
        deliveryTime: dto.deliveryTime,
        timezone: dto.timezone,
        channels: dto.channels,
        recipientIds: dto.recipientIds,
      },
    });
  }

  async listDeliveries(organizationId: string, date?: string) {
    const where: Record<string, unknown> = { organizationId };
    if (date) where['pulseDate'] = new Date(date);
    return (this.prisma as any).dailyPulseDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
