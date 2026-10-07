import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { EmailSubscriptionService } from './email-subscription.service';

export type NormalizedEventType =
  | 'email.delivered'
  | 'email.bounced'
  | 'email.complained'
  | 'email.failed'
  | 'email.opened'
  | 'email.clicked'
  | 'email.unsubscribed';

export interface NormalizedEmailEvent {
  type: NormalizedEventType;
  email: string;
  messageId: string;
  timestamp: Date;
  permanent?: boolean;
  reason?: string;
  provider: 'sendgrid' | 'mailgun';
}

@Injectable()
export class ProviderWebhooksService {
  private readonly logger = new Logger(ProviderWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: EmailSubscriptionService,
  ) {}

  // ── SendGrid ─────────────────────────────────────────────────────

  verifySendgridSignature(
    payload: string,
    signature: string,
    timestamp: string,
    webhookKey: string,
  ): boolean {
    try {
      const timestampedPayload = `${timestamp}${payload}`;
      const expected = createHmac('sha256', webhookKey).update(timestampedPayload).digest('base64');
      const sigBuf = Buffer.from(signature, 'base64');
      const expBuf = Buffer.from(expected, 'base64');
      if (sigBuf.length !== expBuf.length) return false;
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  async handleSendgridEvents(
    rawPayload: string,
    signature: string,
    timestamp: string,
    organizationId: string,
    webhookKey?: string,
  ): Promise<{ processed: number }> {
    if (webhookKey && signature && timestamp) {
      if (!this.verifySendgridSignature(rawPayload, signature, timestamp, webhookKey)) {
        throw new UnauthorizedException('SendGrid webhook signature invalid');
      }
    }

    let events: unknown[];
    try {
      events = JSON.parse(rawPayload) as unknown[];
    } catch {
      return { processed: 0 };
    }

    let processed = 0;
    for (const event of events) {
      const normalized = this.normalizeSendgridEvent(event as Record<string, unknown>);
      if (normalized) {
        await this.processNormalizedEvent(normalized, organizationId);
        processed++;
      }
    }

    return { processed };
  }

  private normalizeSendgridEvent(event: Record<string, unknown>): NormalizedEmailEvent | null {
    const eventType = event.event as string;
    const email = event.email as string;
    const messageId = (event.sg_message_id as string) ?? (event['smtp-id'] as string) ?? '';
    const timestamp = new Date((event.timestamp as number) * 1000);

    const typeMap: Record<string, NormalizedEventType> = {
      delivered: 'email.delivered',
      bounce: 'email.bounced',
      blocked: 'email.bounced',
      deferred: 'email.failed',
      dropped: 'email.failed',
      spamreport: 'email.complained',
      unsubscribe: 'email.unsubscribed',
      group_unsubscribe: 'email.unsubscribed',
      open: 'email.opened',
      click: 'email.clicked',
    };

    const type = typeMap[eventType];
    if (!type || !email) return null;

    return {
      type,
      email,
      messageId,
      timestamp,
      permanent: eventType === 'bounce' || eventType === 'spamreport',
      reason: event.reason as string | undefined,
      provider: 'sendgrid',
    };
  }

  // ── Mailgun ──────────────────────────────────────────────────────

  verifyMailgunSignature(
    timestamp: string,
    token: string,
    signature: string,
    apiKey: string,
  ): boolean {
    try {
      const value = `${timestamp}${token}`;
      const expected = createHmac('sha256', apiKey).update(value).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  async handleMailgunEvent(
    payload: Record<string, unknown>,
    organizationId: string,
    apiKey?: string,
  ): Promise<{ processed: number }> {
    const signature = payload['signature'] as Record<string, string> | undefined;
    if (apiKey && signature) {
      if (!this.verifyMailgunSignature(
        signature.timestamp ?? '',
        signature.token ?? '',
        signature.signature ?? '',
        apiKey,
      )) {
        throw new UnauthorizedException('Mailgun webhook signature invalid');
      }
    }

    const eventData = payload['event-data'] as Record<string, unknown> | undefined;
    if (!eventData) return { processed: 0 };

    const normalized = this.normalizeMailgunEvent(eventData);
    if (!normalized) return { processed: 0 };

    await this.processNormalizedEvent(normalized, organizationId);
    return { processed: 1 };
  }

  private normalizeMailgunEvent(event: Record<string, unknown>): NormalizedEmailEvent | null {
    const eventType = event.event as string;
    const recipient = event.recipient as string;
    const msgHeaders = ((event.message as Record<string, unknown>)?.headers ?? {}) as Record<string, string>;
    const messageId = msgHeaders['message-id'] ?? '';
    const timestamp = new Date((event.timestamp as number) * 1000);

    const typeMap: Record<string, NormalizedEventType> = {
      delivered: 'email.delivered',
      failed: 'email.bounced',
      complained: 'email.complained',
      unsubscribed: 'email.unsubscribed',
      opened: 'email.opened',
      clicked: 'email.clicked',
    };

    const type = typeMap[eventType];
    if (!type || !recipient) return null;

    const severity = event.severity as string | undefined;
    const permanent = eventType === 'failed' && severity === 'permanent';

    return {
      type,
      email: recipient,
      messageId,
      timestamp,
      permanent: permanent || eventType === 'complained',
      reason: event.reason as string | undefined,
      provider: 'mailgun',
    };
  }

  // ── Normalized event processing ───────────────────────────────────

  private async processNormalizedEvent(event: NormalizedEmailEvent, organizationId: string): Promise<void> {
    try {
      // Find recipient record by providerMessageId or email
      const recipient = event.messageId
        ? await this.prisma.emailCampaignRecipient.findFirst({
            where: { providerMessageId: event.messageId },
            include: { campaign: { select: { organizationId: true, subscriptionList: true } } },
          })
        : null;

      if (recipient && recipient.campaign.organizationId === organizationId) {
        const updateData: Record<string, unknown> = {};

        switch (event.type) {
          case 'email.delivered':
            updateData.status = 'DELIVERED';
            updateData.deliveredAt = event.timestamp;
            break;
          case 'email.bounced':
            updateData.status = event.permanent ? 'BOUNCED' : 'DEFERRED';
            updateData.bouncedAt = event.timestamp;
            updateData.errorMessage = event.reason;
            break;
          case 'email.complained':
            updateData.status = 'COMPLAINED';
            updateData.complainedAt = event.timestamp;
            break;
          case 'email.failed':
            updateData.status = 'FAILED';
            updateData.failedAt = event.timestamp;
            updateData.errorMessage = event.reason;
            break;
          case 'email.opened':
            updateData.openedAt = event.timestamp;
            break;
          case 'email.clicked':
            updateData.clickedAt = event.timestamp;
            break;
        }

        if (Object.keys(updateData).length > 0) {
          await this.prisma.emailCampaignRecipient.update({
            where: { id: recipient.id },
            data: updateData,
          });

          // Update campaign counters
          await this.updateCampaignCounters(recipient.campaignId, event.type);
        }

        // Suppress on permanent bounce or complaint
        if (event.type === 'email.bounced' && event.permanent) {
          await this.subscriptionService.suppressAddress(
            organizationId, event.email, event.reason ?? 'hard_bounce', 'BOUNCED',
          );
        } else if (event.type === 'email.complained') {
          await this.subscriptionService.suppressAddress(
            organizationId, event.email, 'spam_complaint', 'COMPLAINED',
          );
        } else if (event.type === 'email.unsubscribed') {
          await this.subscriptionService.updateSubscription(
            organizationId, event.email,
            recipient.campaign.subscriptionList ?? 'GENERAL_MARKETING',
            'UNSUBSCRIBED', { source: 'provider_unsubscribe' },
          );
        }
      } else {
        // No recipient match — still handle global suppression
        if (event.type === 'email.bounced' && event.permanent) {
          await this.subscriptionService.suppressAddress(
            organizationId, event.email, event.reason ?? 'hard_bounce', 'BOUNCED',
          );
        } else if (event.type === 'email.complained') {
          await this.subscriptionService.suppressAddress(
            organizationId, event.email, 'spam_complaint', 'COMPLAINED',
          );
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Failed to process provider event for ${event.email}: ${String(err)}`);
    }
  }

  private async updateCampaignCounters(campaignId: string, eventType: NormalizedEventType): Promise<void> {
    const increment: Record<string, number> = {};
    if (eventType === 'email.delivered') increment.deliveredCount = 1;
    else if (eventType === 'email.bounced') increment.bounceCount = 1;
    else if (eventType === 'email.complained') increment.complainedCount = 1;
    else if (eventType === 'email.failed') increment.failedCount = 1;
    else if (eventType === 'email.opened') increment.openCount = 1;
    else if (eventType === 'email.clicked') increment.clickCount = 1;

    if (Object.keys(increment).length > 0) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: Object.fromEntries(
          Object.entries(increment).map(([k, v]) => [k, { increment: v }]),
        ),
      }).catch(() => {});
    }
  }
}
