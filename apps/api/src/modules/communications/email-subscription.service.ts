import { Injectable, BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../../config/app.config';

export const SUBSCRIPTION_LISTS = [
  'GENERAL_MARKETING',
  'NEWSLETTERS',
  'PROMOTIONS',
  'PRODUCT_UPDATES',
] as const;
export type SubscriptionList = (typeof SUBSCRIPTION_LISTS)[number];

export const SUBSCRIPTION_STATUSES = [
  'SUBSCRIBED',
  'UNSUBSCRIBED',
  'SUPPRESSED',
  'BOUNCED',
  'COMPLAINED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface UnsubscribeTokenPayload {
  email: string;
  organizationId: string;
  list: string;
}

export interface FilterResult {
  eligible: string[];
  suppressed: string[];
  total: number;
}

@Injectable()
export class EmailSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  private get secret(): string {
    const unsubKey = this.config.get('UNSUBSCRIBE_SECRET' as keyof AppConfig) as string | undefined;
    return unsubKey ?? this.config.get<string>('ENCRYPTION_KEY' as keyof AppConfig) ?? 'fallback-secret';
  }

  // ── Token ────────────────────────────────────────────────────────

  generateUnsubscribeToken(email: string, organizationId: string, list: string): string {
    const payload = Buffer.from(JSON.stringify({ email, organizationId, list })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }

  verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
    try {
      const dotIdx = token.lastIndexOf('.');
      if (dotIdx < 0) return null;
      const payload = token.slice(0, dotIdx);
      const sig = token.slice(dotIdx + 1);
      const expected = createHmac('sha256', this.secret).update(payload).digest('hex');
      if (sig.length !== expected.length) return null;
      if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
      return JSON.parse(Buffer.from(payload, 'base64url').toString()) as UnsubscribeTokenPayload;
    } catch {
      return null;
    }
  }

  // ── Eligibility ──────────────────────────────────────────────────

  async isEligibleForMarketing(email: string, organizationId: string, list: string): Promise<boolean> {
    const sub = await this.prisma.emailSubscription.findUnique({
      where: { organizationId_email_subscriptionList: { organizationId, email, subscriptionList: list } },
    });
    if (!sub) return true; // unknown = eligible (opt-in assumed until unsubscribed)
    return sub.status === 'SUBSCRIBED';
  }

  async filterEligibleRecipients(emails: string[], organizationId: string, list: string): Promise<FilterResult> {
    const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
    if (uniqueEmails.length === 0) return { eligible: [], suppressed: [], total: 0 };

    const suppressedRecords = await this.prisma.emailSubscription.findMany({
      where: {
        organizationId,
        email: { in: uniqueEmails },
        subscriptionList: list,
        status: { in: ['UNSUBSCRIBED', 'SUPPRESSED', 'BOUNCED', 'COMPLAINED'] },
      },
      select: { email: true },
    });

    const suppressedSet = new Set(suppressedRecords.map((r) => r.email.toLowerCase()));
    const eligible = uniqueEmails.filter((e) => !suppressedSet.has(e));
    const suppressed = uniqueEmails.filter((e) => suppressedSet.has(e));

    return { eligible, suppressed, total: uniqueEmails.length };
  }

  // ── Subscription management ──────────────────────────────────────

  async updateSubscription(
    organizationId: string,
    email: string,
    list: string,
    status: SubscriptionStatus,
    opts?: { source?: string; reason?: string; customerId?: string; userId?: string },
  ): Promise<void> {
    const now = new Date();
    const normalizedEmail = email.toLowerCase().trim();

    const data: Record<string, unknown> = {
      status,
      updatedAt: now,
      ...(opts?.source && { source: opts.source }),
    };

    if (status === 'UNSUBSCRIBED') {
      data.unsubscribedAt = now;
    } else if (status === 'SUPPRESSED' || status === 'BOUNCED' || status === 'COMPLAINED') {
      data.suppressedAt = now;
      if (opts?.reason) data.suppressionReason = opts.reason;
    } else if (status === 'SUBSCRIBED') {
      data.consentAt = data.consentAt ?? now;
    }

    await this.prisma.emailSubscription.upsert({
      where: { organizationId_email_subscriptionList: { organizationId, email: normalizedEmail, subscriptionList: list } },
      create: {
        id: createId(),
        organizationId,
        email: normalizedEmail,
        subscriptionList: list,
        customerId: opts?.customerId ?? null,
        status,
        source: opts?.source ?? null,
        consentAt: status === 'SUBSCRIBED' ? now : null,
        unsubscribedAt: status === 'UNSUBSCRIBED' ? now : null,
        suppressedAt: ['SUPPRESSED', 'BOUNCED', 'COMPLAINED'].includes(status) ? now : null,
        suppressionReason: opts?.reason ?? null,
        updatedAt: now,
      },
      update: data,
    });

    await this.audit.log({
      organizationId,
      userId: opts?.userId,
      action: `EMAIL_SUBSCRIPTION_${status}`,
      entity: 'EmailSubscription',
      metadata: { email: normalizedEmail, list, reason: opts?.reason },
    }).catch(() => {});
  }

  async suppressAddress(
    organizationId: string,
    email: string,
    reason: string,
    status: 'BOUNCED' | 'COMPLAINED' | 'SUPPRESSED' = 'SUPPRESSED',
  ): Promise<void> {
    for (const list of SUBSCRIPTION_LISTS) {
      await this.updateSubscription(organizationId, email, list, status, { reason });
    }
  }

  // ── Preferences ──────────────────────────────────────────────────

  async getPreferences(token: string): Promise<{ email: string; subscriptions: Record<string, string> }> {
    const payload = this.verifyUnsubscribeToken(token);
    if (!payload) throw new BadRequestException('Invalid or tampered unsubscribe token');

    const { email, organizationId } = payload;

    const records = await this.prisma.emailSubscription.findMany({
      where: { organizationId, email: email.toLowerCase().trim() },
      select: { subscriptionList: true, status: true },
    });

    const subscriptions: Record<string, string> = {};
    for (const list of SUBSCRIPTION_LISTS) {
      const found = records.find((r) => r.subscriptionList === list);
      subscriptions[list] = found?.status ?? 'SUBSCRIBED';
    }

    return { email, subscriptions };
  }

  async updatePreferences(
    token: string,
    preferences: Record<string, boolean>,
  ): Promise<{ email: string; updated: number }> {
    const payload = this.verifyUnsubscribeToken(token);
    if (!payload) throw new BadRequestException('Invalid or tampered unsubscribe token');

    const { email, organizationId } = payload;
    let updated = 0;

    for (const [list, subscribed] of Object.entries(preferences)) {
      if (!SUBSCRIPTION_LISTS.includes(list as SubscriptionList)) continue;
      const status: SubscriptionStatus = subscribed ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
      await this.updateSubscription(organizationId, email, list, status, { source: 'preferences_page' });
      updated++;
    }

    return { email, updated };
  }

  async unsubscribeByToken(token: string, list?: string): Promise<{ email: string; list: string }> {
    const payload = this.verifyUnsubscribeToken(token);
    if (!payload) throw new BadRequestException('Invalid or tampered unsubscribe token');

    const targetList = list ?? payload.list;
    await this.updateSubscription(payload.organizationId, payload.email, targetList, 'UNSUBSCRIBED', {
      source: 'unsubscribe_link',
    });

    return { email: payload.email, list: targetList };
  }

  // ── Admin listing ────────────────────────────────────────────────

  async listSubscriptions(
    organizationId: string,
    opts: { email?: string; list?: string; status?: string; page?: number; limit?: number },
  ) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (opts.email) where.email = opts.email.toLowerCase().trim();
    if (opts.list) where.subscriptionList = opts.list;
    if (opts.status) where.status = opts.status;

    const [data, total] = await Promise.all([
      this.prisma.emailSubscription.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: limit }),
      this.prisma.emailSubscription.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }
}
