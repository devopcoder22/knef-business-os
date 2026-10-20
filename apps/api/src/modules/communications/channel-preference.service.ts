import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

export type CommunicationChannel = 'EMAIL' | 'SMS' | 'TELEGRAM' | 'WHATSAPP' | 'WEB_PUSH' | 'IN_APP';
export type MessageType = 'MARKETING' | 'TRANSACTIONAL' | 'ALL';
export type PreferenceStatus = 'subscribed' | 'unsubscribed' | 'suppressed';

export interface UpsertPreferenceDto {
  userId?: string;
  email?: string;
  phone?: string;
  channel: CommunicationChannel;
  messageType: MessageType;
  status: PreferenceStatus;
  source?: string;
}

export interface ConsentCheckResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class ChannelPreferenceService {
  private readonly logger = new Logger(ChannelPreferenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Get preferences ───────────────────────────────────────────────────────

  async getPreferences(organizationId: string, userId: string) {
    return this.prisma.channelPreference.findMany({
      where: { organizationId, userId },
      select: {
        id: true,
        channel: true,
        messageType: true,
        status: true,
        consentAt: true,
        unsubscribedAt: true,
        source: true,
        updatedAt: true,
      },
      orderBy: [{ channel: 'asc' }, { messageType: 'asc' }],
    });
  }

  async getPreferencesByEmail(organizationId: string, email: string) {
    return this.prisma.channelPreference.findMany({
      where: { organizationId, email },
      select: {
        id: true,
        channel: true,
        messageType: true,
        status: true,
        consentAt: true,
        unsubscribedAt: true,
      },
    });
  }

  // ── Upsert preference ─────────────────────────────────────────────────────

  async upsertPreference(
    organizationId: string,
    dto: UpsertPreferenceDto,
    actorUserId?: string,
  ) {
    const now = new Date();
    const isSubscribing = dto.status === 'subscribed';
    const isUnsubscribing = dto.status === 'unsubscribed';

    const where = dto.userId
      ? { organizationId, userId: dto.userId, channel: dto.channel, messageType: dto.messageType }
      : dto.email
        ? { organizationId, email: dto.email, channel: dto.channel, messageType: dto.messageType }
        : null;

    if (!where) {
      this.logger.warn('upsertPreference called without userId or email');
      return;
    }

    const existing = await this.prisma.channelPreference.findFirst({ where });

    if (existing) {
      await this.prisma.channelPreference.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          source: dto.source ?? existing.source,
          consentAt: isSubscribing && !existing.consentAt ? now : existing.consentAt,
          unsubscribedAt: isUnsubscribing ? now : null,
        },
      });
    } else {
      await this.prisma.channelPreference.create({
        data: {
          id: createId(),
          organizationId,
          userId: dto.userId ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          channel: dto.channel,
          messageType: dto.messageType,
          status: dto.status,
          source: dto.source ?? 'api',
          consentAt: isSubscribing ? now : null,
          unsubscribedAt: isUnsubscribing ? now : null,
        },
      });
    }

    if (actorUserId) {
      await this.audit.log({
        organizationId,
        userId: actorUserId,
        action: 'CHANNEL_PREFERENCE_UPDATED',
        entity: 'ChannelPreference',
        metadata: { channel: dto.channel, messageType: dto.messageType, status: dto.status },
      });
    }
  }

  // ── Suppress ──────────────────────────────────────────────────────────────

  async suppress(
    organizationId: string,
    identifier: { userId?: string; email?: string; phone?: string },
    channel: CommunicationChannel,
    reason: string,
  ) {
    const where = identifier.userId
      ? { organizationId, userId: identifier.userId, channel }
      : identifier.email
        ? { organizationId, email: identifier.email, channel }
        : identifier.phone
          ? { organizationId, phone: identifier.phone, channel }
          : null;

    if (!where) return;

    const existing = await this.prisma.channelPreference.findMany({ where });

    for (const pref of existing) {
      await this.prisma.channelPreference.update({
        where: { id: pref.id },
        data: {
          status: 'suppressed',
          metadata: { ...(pref.metadata as object | null ?? {}), suppressionReason: reason },
        },
      });
    }

    if (existing.length === 0) {
      // Create suppressed record for channels not yet in the preference table
      for (const type of ['MARKETING', 'ALL'] as MessageType[]) {
        await this.prisma.channelPreference.create({
          data: {
            id: createId(),
            organizationId,
            userId: identifier.userId ?? null,
            email: identifier.email ?? null,
            phone: identifier.phone ?? null,
            channel,
            messageType: type,
            status: 'suppressed',
            source: 'system',
            metadata: { suppressionReason: reason },
          },
        });
      }
    }
  }

  // ── Consent check ─────────────────────────────────────────────────────────

  async checkConsent(
    organizationId: string,
    identifier: { userId?: string; email?: string; phone?: string },
    channel: CommunicationChannel,
    messageType: MessageType,
  ): Promise<ConsentCheckResult> {
    // TRANSACTIONAL messages bypass marketing opt-outs
    if (messageType === 'TRANSACTIONAL') {
      const suppressed = await this.isGloballySuppressed(organizationId, identifier, channel);
      if (suppressed) {
        return { allowed: false, reason: 'Channel suppressed for this recipient' };
      }
      return { allowed: true };
    }

    // MARKETING: must be subscribed and not suppressed
    const prefs = await this.prisma.channelPreference.findMany({
      where: {
        organizationId,
        channel,
        OR: [
          ...(identifier.userId ? [{ userId: identifier.userId }] : []),
          ...(identifier.email ? [{ email: identifier.email }] : []),
          ...(identifier.phone ? [{ phone: identifier.phone }] : []),
        ],
      },
    });

    if (prefs.length === 0) {
      // No preference record = default allow (opt-in not required for existing contacts)
      // But log that no explicit consent exists
      return { allowed: true };
    }

    const matchingType = prefs.find(
      (p) => p.messageType === messageType || p.messageType === 'ALL',
    );

    if (!matchingType) {
      return { allowed: true };
    }

    if (matchingType.status === 'suppressed') {
      return { allowed: false, reason: 'Suppressed' };
    }

    if (matchingType.status === 'unsubscribed') {
      return { allowed: false, reason: 'Unsubscribed' };
    }

    return { allowed: true };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async isGloballySuppressed(
    organizationId: string,
    identifier: { userId?: string; email?: string; phone?: string },
    channel: CommunicationChannel,
  ): Promise<boolean> {
    const suppressed = await this.prisma.channelPreference.findFirst({
      where: {
        organizationId,
        channel,
        status: 'suppressed',
        OR: [
          ...(identifier.userId ? [{ userId: identifier.userId }] : []),
          ...(identifier.email ? [{ email: identifier.email }] : []),
          ...(identifier.phone ? [{ phone: identifier.phone }] : []),
        ],
      },
    });
    return !!suppressed;
  }
}
