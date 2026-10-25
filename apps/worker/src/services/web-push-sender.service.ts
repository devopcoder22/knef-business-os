import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { decrypt } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';
import type { PushSendJobData } from '@knef/constants';

// HTTP status codes that mean the subscription is permanently gone
const GONE_STATUS_CODES = new Set([404, 410]);
// Transient codes that should trigger BullMQ retry
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
// Maximum failure count before we stop trying a subscription
const MAX_FAILURE_COUNT = 5;

@Injectable()
export class WebPushSenderService {
  private readonly logger = new Logger(WebPushSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  private get deliveryEnabled(): boolean {
    return this.config.get<string>('WEB_PUSH_DELIVERY_ENABLED') === 'true';
  }

  private get vapidSubject(): string {
    return this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:support@knef.app';
  }

  private get encKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async sendPush(data: PushSendJobData): Promise<void> {
    this.logger.log(`Web push dispatch for user ${data.userId} (org=${data.organizationId})`);

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        isActive: true,
        failureCount: { lt: MAX_FAILURE_COUNT },
      },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No active push subscriptions for user ${data.userId}`);
      await this.updatePushLog(data.logId, 'failed', 'No active subscriptions');
      return;
    }

    if (!this.deliveryEnabled) {
      this.logger.log(`[MOCK] Web Push delivery disabled — skipping ${subscriptions.length} subscription(s)`);
      await this.updatePushLog(data.logId, 'sent');
      return;
    }

    const vapidKeys = await this.resolveVapidKeys(data.organizationId);
    if (!vapidKeys) {
      this.logger.warn(`No VAPID keys configured for org ${data.organizationId}`);
      await this.updatePushLog(data.logId, 'failed', 'VAPID keys not configured');
      return;
    }

    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      icon: data.icon ?? '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? `knef-${data.organizationId}`,
      url: data.url ?? '/',
    });

    let sentCount = 0;
    let lastError: string | undefined;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          payload,
          {
            vapidDetails: {
              subject: this.vapidSubject,
              publicKey: vapidKeys.publicKey,
              privateKey: vapidKeys.privateKey,
            },
            TTL: 86400,
            urgency: 'normal',
          },
        );

        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date(), failureCount: 0 },
        });
        sentCount++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Push dispatch failed for subscription ${sub.id} (status=${statusCode}): ${errMsg}`);
        lastError = errMsg;

        if (statusCode !== undefined && GONE_STATUS_CODES.has(statusCode)) {
          // Subscription is permanently invalid — deactivate it
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false, revokedAt: new Date(), failureCount: { increment: 1 } },
          }).catch(() => {});
        } else if (statusCode !== undefined && RETRY_STATUS_CODES.has(statusCode)) {
          // Transient — increment failure count and rethrow so BullMQ retries
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { failureCount: { increment: 1 } },
          }).catch(() => {});
          throw new Error(`Push transient error ${statusCode}: ${errMsg}`);
        } else {
          // Unknown/permanent error — increment failure count, do not retry
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { failureCount: { increment: 1 } },
          }).catch(() => {});
        }
      }
    }

    const logStatus = sentCount > 0 ? 'sent' : 'failed';
    await this.updatePushLog(data.logId, logStatus, sentCount === 0 ? lastError : undefined);
  }

  private async resolveVapidKeys(
    organizationId: string,
  ): Promise<{ publicKey: string; privateKey: string } | null> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { organizationId, key: 'push.vapidKeys' },
      select: { value: true },
    });

    if (!setting?.value) return null;

    let stored: { publicKey?: string; privateKeyEncrypted?: string; format?: string };
    try {
      stored = JSON.parse(setting.value as string) as typeof stored;
    } catch {
      return null;
    }

    if (!stored.publicKey || !stored.privateKeyEncrypted) return null;

    // Validate key format: proper VAPID public key is ~87 chars (65-byte EC point base64url)
    // Keys from old DER-encoded generation are ~122+ chars — treat as invalid
    if (stored.publicKey.length > 100) {
      this.logger.warn(`VAPID public key for org ${organizationId} appears to be in wrong format — re-generation needed`);
      return null;
    }

    try {
      const privateKey = decrypt(stored.privateKeyEncrypted, this.encKey);
      return { publicKey: stored.publicKey, privateKey };
    } catch {
      this.logger.error(`Failed to decrypt VAPID private key for org ${organizationId}`);
      return null;
    }
  }

  private async updatePushLog(logId: string | undefined, status: string, errorMessage?: string): Promise<void> {
    if (!logId) return;
    try {
      await this.prisma.communicationLog.update({
        where: { id: logId },
        data: {
          status,
          errorMessage: errorMessage ?? null,
          sentAt: status === 'sent' ? new Date() : undefined,
          failedAt: status === 'failed' ? new Date() : undefined,
          attemptCount: { increment: 1 },
        },
      });
    } catch {
      // Non-critical
    }
  }
}
