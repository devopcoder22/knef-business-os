import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { generateKeyPairSync } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { QueueService } from '../../common/services/queue.service';
import { encrypt } from '@knef/utils';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AppConfig } from '../../config/app.config';

const VAPID_SETTING_KEY = 'push.vapidKeys';

export interface PushSubscriptionDto {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string;
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
      const parsed = setting.value as unknown as { publicKey: string; privateKeyEncrypted: string };
      return parsed;
    }

    // Generate new VAPID key pair (EC P-256)
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });

    const publicKeyBase64 = publicKey.toString('base64url');
    const privateKeyBase64 = privateKey.toString('base64url');
    const privateKeyEncrypted = encrypt(privateKeyBase64, this.encryptionKey);

    const stored = { publicKey: publicKeyBase64, privateKeyEncrypted };

    if (setting) {
      await this.prisma.systemSetting.update({
        where: { id: setting.id },
        data: { value: stored as unknown as Parameters<typeof this.prisma.systemSetting.update>[0]['data']['value'] },
      });
    } else {
      await this.prisma.systemSetting.create({
        data: {
          id: createId(),
          organizationId,
          key: VAPID_SETTING_KEY,
          value: stored as unknown as Parameters<typeof this.prisma.systemSetting.create>[0]['data']['value'],
          isPublic: false,
        },
      });
    }

    return stored;
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

    const existing = await this.prisma.pushSubscription.findFirst({
      where: { userId, endpoint: dto.endpoint },
    });

    if (existing) {
      await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { isActive: true, userAgent: dto.userAgent ?? existing.userAgent },
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
      },
    });

    return { id: record.id };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.updateMany({
      where: { userId, endpoint },
      data: { isActive: false },
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

  // ── Queue push notification ───────────────────────────────────────────────

  async queuePush(
    userId: string,
    organizationId: string,
    payload: { title: string; body: string; url?: string; icon?: string },
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
      logId: log.id,
    });

    return { logId: log.id };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private get encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY')!;
  }
}
