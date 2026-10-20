import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ChannelPreferenceService, type CommunicationChannel } from '../communications/channel-preference.service';

@Injectable()
export class MarketingAudienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelPreference: ChannelPreferenceService,
  ) {}

  async listSegments(organizationId: string) {
    return this.prisma.customerSegment.findMany({
      where: { organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getSegment(organizationId: string, segmentId: string) {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { id: segmentId, organizationId },
      include: { _count: { select: { members: true } } },
    });
    if (!segment) throw new NotFoundException('Audience segment not found');
    return segment;
  }

  async estimateReach(organizationId: string, segmentId: string, channel: CommunicationChannel): Promise<{ total: number; consented: number }> {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { id: segmentId, organizationId },
      include: { members: { include: { customer: { select: { id: true, email: true, phone: true } } } } },
    });
    if (!segment) throw new NotFoundException('Audience segment not found');

    const total = segment.members.length;
    let consented = 0;

    for (const member of segment.members) {
      const customer = member.customer as { id: string; email: string | null; phone: string | null };
      const identifier = customer.email ? { email: customer.email } : { userId: customer.id };
      const result = await this.channelPreference.checkConsent(
        organizationId,
        identifier,
        channel,
        'MARKETING',
      );
      if (result.allowed) consented++;
    }

    return { total, consented };
  }

  async resolveAudienceIds(organizationId: string, segmentId: string, channel: CommunicationChannel): Promise<string[]> {
    const segment = await this.prisma.customerSegment.findFirst({
      where: { id: segmentId, organizationId },
      include: { members: { include: { customer: { select: { id: true, email: true } } } } },
    });
    if (!segment) throw new NotFoundException('Audience segment not found');

    const allowed: string[] = [];

    for (const member of segment.members) {
      const customer = member.customer as { id: string; email: string | null };
      const identifier = customer.email ? { email: customer.email } : { userId: customer.id };
      const result = await this.channelPreference.checkConsent(
        organizationId,
        identifier,
        channel,
        'MARKETING',
      );
      if (result.allowed) allowed.push(customer.id);
    }

    return allowed;
  }
}
