import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class RecipientEligibilityService {
  private readonly logger = new Logger(RecipientEligibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns whether a recipient may receive a message on the given channel+type.
   * For MARKETING: blocked if ChannelPreference.status is 'unsubscribed' or 'suppressed'.
   * For TRANSACTIONAL: always allowed (marketing opt-out does not block transactional).
   */
  async canSend(params: {
    organizationId: string;
    channel: string;
    messageType: 'MARKETING' | 'TRANSACTIONAL';
    phone?: string;
    email?: string;
    userId?: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    if (params.messageType !== 'MARKETING') {
      return { allowed: true };
    }

    const where: Record<string, unknown> = {
      organizationId: params.organizationId,
      channel: params.channel,
    };

    // Build the recipient identifier conditions
    const identifierConditions: Array<Record<string, unknown>> = [];
    if (params.phone) identifierConditions.push({ phone: params.phone });
    if (params.email) identifierConditions.push({ email: params.email });
    if (params.userId) identifierConditions.push({ userId: params.userId });

    if (identifierConditions.length === 0) {
      return { allowed: true };
    }

    // Check for MARKETING-specific preference or ALL-channel preference
    const pref = await this.prisma.channelPreference.findFirst({
      where: {
        ...where,
        messageType: { in: ['MARKETING', 'ALL'] },
        OR: identifierConditions,
      },
      select: { status: true },
    });

    if (pref && (pref.status === 'unsubscribed' || pref.status === 'suppressed')) {
      this.logger.log(
        `[ELIGIBILITY] BLOCKED marketing ${params.channel} — status=${pref.status} (org=${params.organizationId})`,
      );
      return { allowed: false, reason: `Marketing preference: ${pref.status}` };
    }

    return { allowed: true };
  }
}
