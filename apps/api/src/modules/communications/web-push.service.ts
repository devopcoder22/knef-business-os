import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import webpush from 'web-push';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';
import { encrypt, decrypt } from '@knef/utils';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AppConfig } from '../../config/app.config';

const VAPID_SETTING_KEY = 'push.vapidKeys';

export interface PushSubscriptionDto {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string;
}

interface StoredVapidKeys {
  publicKey: string;
  privateKeyEncrypted: string;
  format: 'v2';
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  // ── VAPID key management ──────────────────────────────────────────────────

  async getVapidPublicKey(organizationId: string): Promise<{ publicKey: string }> {
    const keys = await this.getOrGenerateVapidKeys(organizationId);
    return { publicKey: keys.publicKey };
  }

  private async getOrGenerateVapidKeys(
    organizationId: string,
  ): Promise<{ publicKey: string; privateKeyEncrypted: string }> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { organizationId, key: VAPID_SETTING_KEY },
    });

    if (setting?.value) {
      try {
        const stored = JSON.parse(setting.value) as StoredVapidKeys;
        // Only trust keys generated with the current format (v2 = proper EC point encoding)
        if (stored.format === 'v2' && stored.publicKey && stored.publicKey.length <= 100) {
          return { publicKey: stored.publicKey, privateKeyEncrypted: stored.privateKeyEncrypted };
        }
      } catch {
        // Malformed JSON — regenerate
      }
      // Old format or malformed — regenerate below and update
    }

    // Generate proper VAPID key pair using web-push library
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    const privateKeyEncrypted = encrypt(privateKey, this.encryptionKey);
    const stored: StoredVapidKeys = { publicKey, privateKeyEncrypted, format: 'v2' };
    const storedJson = JSON.stringify(stored);

    if (setting) {
      await this.prisma.systemSetting.update({
        where: { id: setting.id },
        data: { value: storedJson },
      });
    } else {
      await this.prisma.systemSetting.create({
        data: {
          id: createId(),
          organizationId,
          key: VAPID_SETTING_KEY,
          value: storedJson,
          isPublic: false,
        },
      });
    }

    return { publicKey, privateKeyEncrypted };
  }

  // ── Subscription management ───────────────────────────────────────────────

  async subscribe(
    userId: string,
    organizationId: string,
    dto: PushSubscriptionDto,
  ): Promise<{ id: string }> {
    if (!dto.endpoint || !dto.p256dhKey || !dto.authKey) {
      throw new BadRequestException('Invalid push subscription: endpoint, p256dhKey, and authKey are required');
    }

    // Validate endpoint is https (required for Web Push)
    if (!dto.endpoint.startsWith('https://')) {
      throw new BadRequestException('Push subscription endpoint must use HTTPS');
    }

    const existing = await this.prisma.pushSubscription.findFirst({
      where: { userId, endpoint: dto.endpoint },
    });

    if (existing) {
      await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          p256dhKey: dto.p256dhKey,
          authKey: dto.authKey,
          userAgent: dto.userAgent ?? existing.userAgent,
          failureCount: 0,
          revokedAt: null,
        },
      });
      return { id: existing.id };
    }

    const record = await this.prisma.pushSubscription.create({
      data: {
        id: createId(),
        organizationId,
        userId,
        endpoint: dto.endpoint,
        p256dhKey: dto.p256dhKey,
        authKey: dto.authKey,
        userAgent: dto.userAgent ?? null,
        isActive: true,
        failureCount: 0,
      },
    });

    return { id: record.id };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.updateMany({
      where: { userId, endpoint },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  async revokeSubscription(userId: string, organizationId: string, subscriptionId: string): Promise<void> {
    const sub = await this.prisma.pushSubscription.findFirst({
      where: { id: subscriptionId, organizationId },
    });
    if (!sub) return;
    // IDOR: only owner or admin can revoke
    if (sub.userId !== userId) {
      throw new ForbiddenException('Cannot revoke another user\'s subscription');
    }
    await this.prisma.pushSubscription.update({
      where: { id: subscriptionId },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  async listSubscriptions(userId: string, organizationId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId, organizationId, isActive: true },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async listOrgSubscriptions(organizationId: string) {
    const [active, expired] = await Promise.all([
      this.prisma.pushSubscription.count({ where: { organizationId, isActive: true } }),
      this.prisma.pushSubscription.count({ where: { organizationId, isActive: false } }),
    ]);
    return { active, expired };
  }

  // ── Queue push notification ───────────────────────────────────────────────

  async queuePush(
    userId: string,
    organizationId: string,
    payload: { title: string; body: string; url?: string; icon?: string; tag?: string; idempotencyKey?: string },
  ): Promise<{ logId: string }> {
    const hasSubscriptions = await this.prisma.pushSubscription.count({
      where: { userId, organizationId, isActive: true },
    });

    if (hasSubscriptions === 0) {
      this.logger.debug(`No active push subscriptions for user ${userId}`);
      return { logId: '' };
    }

    const log = await this.prisma.communicationLog.create({
      data: {
        id: createId(),
        organizationId,
        userId,
        channel: 'WEB_PUSH',
        messageType: 'TRANSACTIONAL',
        recipient: userId,
        subject: payload.title,
        status: 'queued',
      },
    });

    await this.queue.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_PUSH, {
      organizationId,
      userId,
      title: payload.title,
      body: payload.body,
      url: payload.url,
      icon: payload.icon,
      tag: payload.tag,
      logId: log.id,
      idempotencyKey: payload.idempotencyKey,
    });

    return { logId: log.id };
  }

  // ── Decrypt VAPID private key (for test-send in admin) ───────────────────

  async getDecryptedVapidKeys(organizationId: string): Promise<{ publicKey: string; privateKey: string } | null> {
    const keys = await this.getOrGenerateVapidKeys(organizationId);
    try {
      const privateKey = decrypt(keys.privateKeyEncrypted, this.encryptionKey);
      return { publicKey: keys.publicKey, privateKey };
    } catch {
      return null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private get encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY')!;
  }
}
