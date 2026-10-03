import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type CampaignEmailJobData, type TransactionalEmailJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import { EmailSenderService } from '../services/email-sender.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class EmailProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: EmailSenderService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const concurrency = this.config.get<number>('EMAIL_CONCURRENCY', 5);

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.EMAIL,
      async (job: Job) => this.process(job),
      {
        connection: this.connection,
        concurrency,
      },
    );

    this.worker.on('completed', (job) =>
      this.logger.debug(`Job ${job.id} (${job.name}) completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Job ${job?.id} (${job?.name}) failed: ${err.message}`),
    );

    this.logger.log(`Email processor started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.SEND_CAMPAIGN_EMAIL) {
      await this.processCampaignEmail(job.data as CampaignEmailJobData);
    } else if (job.name === JOB_TYPES.SEND_TRANSACTIONAL_EMAIL) {
      await this.processTransactionalEmail(job.data as TransactionalEmailJobData);
    }
  }

  private async processCampaignEmail(data: CampaignEmailJobData): Promise<void> {
    const result = await this.emailSender.sendEmail({
      providerId: data.providerId,
      organizationId: data.organizationId,
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      from: data.from,
    });

    // Update recipient record
    await this.prisma.emailCampaignRecipient.update({
      where: { id: data.recipientId },
      data: {
        status: result.success ? 'SENT' : 'FAILED',
        sentAt: result.success ? new Date() : null,
        failedAt: result.success ? null : new Date(),
        errorMessage: result.success ? null : (result.error ?? null),
        providerMessageId: result.messageId ?? null,
      },
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Email send failed');
    }

    // Check if all recipients for this campaign are done — finalize if so
    await this.tryFinalizeCampaign(data.campaignId, data.organizationId);
  }

  private async processTransactionalEmail(data: TransactionalEmailJobData): Promise<void> {
    const result = await this.emailSender.sendEmail(data);
    if (!result.success) {
      throw new Error(result.error ?? 'Transactional email send failed');
    }
  }

  private async tryFinalizeCampaign(campaignId: string, organizationId: string): Promise<void> {
    const pendingCount = await this.prisma.emailCampaignRecipient.count({
      where: { campaignId, status: 'PENDING' },
    });

    if (pendingCount > 0) return;

    const [sentCount, bouncedCount] = await Promise.all([
      this.prisma.emailCampaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
      this.prisma.emailCampaignRecipient.count({ where: { campaignId, status: 'FAILED' } }),
    ]);

    await this.prisma.emailCampaign.updateMany({
      where: { id: campaignId, organizationId, status: 'SENDING' },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentCount,
        bounceCount: bouncedCount,
      },
    });

    this.logger.log(
      `Campaign ${campaignId} finalized: ${sentCount} sent, ${bouncedCount} failed`,
    );
  }
}
