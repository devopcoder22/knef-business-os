import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { QUEUES, JOB_TYPES, type DailyPulseDeliverJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import { EmailSenderService } from '../services/email-sender.service';
import { WebPushSenderService } from '../services/web-push-sender.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class DailyPulseProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyPulseProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: EmailSenderService,
    private readonly webPushSender: WebPushSenderService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      QUEUES.DAILY_PULSE,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 3 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Daily pulse job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job<DailyPulseDeliverJobData>): Promise<void> {
    if (job.name !== JOB_TYPES.DAILY_PULSE_DELIVER) return;
    const { organizationId, pulseDate } = job.data;

    const cfg = await (this.prisma as any).dailyPulseConfig.findFirst({
      where: { organizationId, enabled: true },
    });
    if (!cfg) {
      this.logger.warn(`Daily pulse config not found or disabled for org ${organizationId}`);
      return;
    }

    const channels: string[] = cfg.channels ?? [];
    const recipientIds: string[] = cfg.recipientIds ?? [];

    if (!channels.length || !recipientIds.length) {
      this.logger.warn(`No channels or recipients configured for org ${organizationId}`);
      return;
    }

    // Fetch user details for recipients
    const users = await this.prisma.user.findMany({
      where: { id: { in: recipientIds }, organizationId },
      select: { id: true, email: true, firstName: true },
    });

    // Generate pulse summary
    const pulse = await this.getPulseSummary(organizationId, pulseDate);

    for (const channel of channels) {
      for (const user of users) {
        const recipientRef = channel === 'EMAIL' ? user.email : user.id;
        const idempotencyKey = `${organizationId}:${pulseDate}:${channel}:${recipientRef}`;

        const delivered = await this.attemptDelivery(
          organizationId,
          pulseDate,
          channel,
          recipientRef,
          idempotencyKey,
          { id: user.id, email: user.email, name: user.firstName },
          pulse,
        );

        if (delivered) {
          this.logger.log(`Daily pulse sent to ${recipientRef} via ${channel} (org=${organizationId})`);
        }
      }
    }
  }

  private async attemptDelivery(
    organizationId: string,
    pulseDate: string,
    channel: string,
    recipientRef: string,
    idempotencyKey: string,
    user: { id: string; email: string; name: string },
    pulse: Awaited<ReturnType<typeof this.getPulseSummary>>,
  ): Promise<boolean> {
    // Idempotency check: try to create the delivery record
    const existing = await (this.prisma as any).dailyPulseDelivery.findFirst({
      where: { idempotencyKey },
    });
    if (existing && existing.status !== 'PENDING') {
      this.logger.debug(`Skipping duplicate delivery: ${idempotencyKey}`);
      return false;
    }

    const deliveryId = randomUUID();
    if (!existing) {
      await (this.prisma as any).dailyPulseDelivery.create({
        data: {
          id: deliveryId,
          organizationId,
          pulseDate: new Date(pulseDate),
          channel,
          recipientRef,
          idempotencyKey,
          status: 'PENDING',
        },
      });
    }

    try {
      if (channel === 'EMAIL') {
        await this.sendEmailPulse(organizationId, user, pulseDate, pulse);
      } else if (channel === 'WEB_PUSH') {
        await this.sendWebPushPulse(organizationId, user, pulseDate, pulse);
      } else {
        this.logger.warn(`Unsupported daily pulse channel: ${channel}`);
        await (this.prisma as any).dailyPulseDelivery.updateMany({
          where: { idempotencyKey, status: 'PENDING' },
          data: { status: 'SKIPPED', error: `Unsupported channel: ${channel}` },
        });
        return false;
      }

      await (this.prisma as any).dailyPulseDelivery.updateMany({
        where: { idempotencyKey, status: 'PENDING' },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await (this.prisma as any).dailyPulseDelivery.updateMany({
        where: { idempotencyKey, status: 'PENDING' },
        data: { status: 'FAILED', error: errorMsg },
      });
      throw err;
    }
  }

  private async sendEmailPulse(
    organizationId: string,
    user: { email: string; name: string },
    pulseDate: string,
    pulse: Awaited<ReturnType<typeof this.getPulseSummary>>,
  ): Promise<void> {
    const html = this.buildPulseHtml(pulseDate, pulse);
    await this.emailSender.sendEmail({
      organizationId,
      to: user.email,
      subject: `Daily Business Pulse — ${pulseDate}`,
      html,
      text: this.buildPulseText(pulseDate, pulse),
    });
  }

  private async sendWebPushPulse(
    organizationId: string,
    user: { id: string; name: string },
    pulseDate: string,
    pulse: Awaited<ReturnType<typeof this.getPulseSummary>>,
  ): Promise<void> {
    await this.webPushSender.sendPush({
      organizationId,
      userId: user.id,
      title: `Daily Pulse — ${pulseDate}`,
      body: `Sales: ${pulse.todaySalesFormatted} | Orders: ${pulse.todayOrders} | Low stock: ${pulse.lowStockItems}`,
      messageType: 'TRANSACTIONAL',
    });
  }

  async getPulseSummary(organizationId: string, targetDate: string) {
    const date = new Date(targetDate);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [todaySales, todayOrders, lowStockCount] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: {
          organizationId,
          createdAt: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.salesOrder.count({
        where: { organizationId, createdAt: { gte: dayStart, lte: dayEnd } },
      }),
      this.prisma.inventoryLevel.count({
        where: {
          product: { organizationId, trackInventory: true },
          quantity: { lte: 5 },
        },
      }),
    ]);

    const todaySalesAmount = Number(todaySales._sum.totalAmount ?? 0);
    return {
      todaySalesAmount,
      todaySalesFormatted: todaySalesAmount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }),
      todayOrders,
      lowStockItems: lowStockCount,
    };
  }

  private buildPulseHtml(date: string, pulse: { todaySalesFormatted: string; todayOrders: number; lowStockItems: number }): string {
    return `
      <h2>Daily Business Pulse — ${date}</h2>
      <table>
        <tr><td><strong>Sales Revenue</strong></td><td>${pulse.todaySalesFormatted}</td></tr>
        <tr><td><strong>Orders</strong></td><td>${pulse.todayOrders}</td></tr>
        <tr><td><strong>Low Stock Items</strong></td><td>${pulse.lowStockItems}</td></tr>
      </table>
    `;
  }

  private buildPulseText(date: string, pulse: { todaySalesFormatted: string; todayOrders: number; lowStockItems: number }): string {
    return `Daily Business Pulse — ${date}\nSales: ${pulse.todaySalesFormatted}\nOrders: ${pulse.todayOrders}\nLow Stock: ${pulse.lowStockItems}`;
  }
}
