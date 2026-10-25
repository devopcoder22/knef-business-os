import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { createId } from '@paralleldrive/cuid2';
import {
  QUEUES,
  JOB_TYPES,
  type NotificationJobData,
  type SmsSendJobData,
  type PushSendJobData,
  type WhatsAppSendJobData,
} from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import { SmsSenderService } from '../services/sms-sender.service';
import { WhatsAppSenderService } from '../services/whatsapp-sender.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsSender: SmsSenderService,
    private readonly whatsAppSender: WhatsAppSenderService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.NOTIFICATIONS,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 10 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Notification job ${job?.id} (${job?.name}) failed: ${err.message}`),
    );

    this.logger.log('Notifications processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_TYPES.SEND_NOTIFICATION:
        await this.createNotification(job.data as NotificationJobData);
        break;
      case JOB_TYPES.SEND_SMS:
        await this.sendSms(job.data as SmsSendJobData);
        break;
      case JOB_TYPES.SEND_PUSH:
        await this.sendPush(job.data as PushSendJobData);
        break;
      case JOB_TYPES.SEND_WHATSAPP:
        await this.whatsAppSender.sendWhatsApp(job.data as WhatsAppSendJobData);
        break;
      default:
        this.logger.warn(`Unknown notification job type: ${job.name}`);
    }
  }

  private async createNotification(data: NotificationJobData): Promise<void> {
    await this.prisma.notification.create({
      data: {
        id: createId(),
        organizationId: data.organizationId,
        userId: data.userId,
        title: data.title,
        body: data.message,
        type: 'INFO',
        data: {
          entityId: data.entityId,
          entityType: data.entityType,
          ...data.metadata,
        },
        isRead: false,
      },
    });
  }

  private async sendSms(data: SmsSendJobData): Promise<void> {
    this.logger.log(`Sending SMS to ${data.to} (org=${data.organizationId})`);
    await this.smsSender.sendSms({
      organizationId: data.organizationId,
      to: data.to,
      message: data.message,
      providerId: data.providerId,
      senderId: data.senderId,
      logId: data.logId,
    });
  }

  private async sendPush(data: PushSendJobData): Promise<void> {
    this.logger.log(`Sending web push to user ${data.userId} (org=${data.organizationId})`);

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: data.userId, organizationId: data.organizationId, isActive: true },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No active push subscriptions for user ${data.userId}`);
      await this.updatePushLog(data.logId, 'failed', 'No active subscriptions');
      return;
    }

    // Build notification payload for the browser
    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      url: data.url ?? '/',
      icon: data.icon ?? '/icon-192.png',
    });

    let sentCount = 0;
    for (const sub of subscriptions) {
      try {
        await this.dispatchWebPush(sub.endpoint, sub.p256dhKey, sub.authKey, payload);
        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
        sentCount++;
      } catch (err) {
        this.logger.warn(`Push dispatch failed for subscription ${sub.id}: ${err}`);
        // Mark as inactive on 410 Gone (browser unsubscribed)
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410) {
          await this.prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
        }
      }
    }

    const status = sentCount > 0 ? 'sent' : 'failed';
    await this.updatePushLog(data.logId, status, sentCount === 0 ? 'All push endpoints failed' : undefined);
  }

  // Minimal VAPID-less push dispatch (full VAPID encryption is complex without web-push lib)
  // This sends to the endpoint with a basic payload — for production use the web-push npm package
  private async dispatchWebPush(
    endpoint: string,
    _p256dhKey: string,
    _authKey: string,
    payload: string,
  ): Promise<void> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400',
      },
      body: payload,
    });

    if (!res.ok) {
      const err = new Error(`Push endpoint returned ${res.status}`) as Error & { statusCode: number };
      err.statusCode = res.status;
      throw err;
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
