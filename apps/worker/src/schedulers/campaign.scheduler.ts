import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type CampaignEmailJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class CampaignScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignScheduler.name);
  private timer!: ReturnType<typeof setInterval>;
  private queue!: Queue;
  private connection!: Redis;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const intervalMs = this.config.get<number>('CAMPAIGN_POLL_INTERVAL_MS', 60_000);

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUES.EMAIL, { connection: this.connection });

    // Run immediately on startup, then on interval
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);

    this.logger.log(`Campaign scheduler started (interval=${intervalMs}ms)`);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.queue.close();
    await this.connection.quit();
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.dispatchScheduledCampaigns();
    } catch (err: unknown) {
      this.logger.error(
        `Campaign scheduler poll error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async dispatchScheduledCampaigns(): Promise<void> {
    const now = new Date();

    const campaigns = await this.prisma.emailCampaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      select: {
        id: true,
        organizationId: true,
        campaignType: true,
        subscriptionList: true,
      },
      take: 20,
    });

    if (campaigns.length === 0) return;

    this.logger.log(`Found ${campaigns.length} campaign(s) ready to dispatch`);

    for (const campaign of campaigns) {
      try {
        await this.dispatchCampaign(
          campaign.id,
          campaign.organizationId,
          campaign.campaignType,
          campaign.subscriptionList,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to dispatch campaign ${campaign.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async dispatchCampaign(
    campaignId: string,
    organizationId: string,
    campaignType: string,
    subscriptionList: string,
  ): Promise<void> {
    // Atomic claim: only proceeds if status is still SCHEDULED
    const claimed = await this.prisma.emailCampaign.updateMany({
      where: { id: campaignId, organizationId, status: 'SCHEDULED' },
      data: { status: 'SENDING' },
    });
    if (claimed.count === 0) {
      this.logger.debug(`Campaign ${campaignId} already claimed — skipping`);
      return;
    }

    const recipients = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
    });

    if (recipients.length === 0) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'SENT', sentAt: new Date(), sentCount: 0, eligibleCount: 0, suppressedCount: 0 },
      });
      return;
    }

    // Suppression filtering (same as manual send path)
    const isMarketing = campaignType !== 'TRANSACTIONAL';
    let eligibleRecipients = recipients;
    let suppressedIds: string[] = [];

    if (isMarketing) {
      const allEmails = recipients.map((r) => r.email.toLowerCase().trim());
      const suppressedRecords = await this.prisma.emailSubscription.findMany({
        where: {
          organizationId,
          email: { in: allEmails },
          subscriptionList,
          status: { in: ['UNSUBSCRIBED', 'SUPPRESSED', 'BOUNCED', 'COMPLAINED'] },
        },
        select: { email: true },
      });
      const suppressedEmails = new Set(suppressedRecords.map((r) => r.email.toLowerCase()));

      eligibleRecipients = recipients.filter((r) => !suppressedEmails.has(r.email.toLowerCase()));
      suppressedIds = recipients
        .filter((r) => suppressedEmails.has(r.email.toLowerCase()))
        .map((r) => r.id);
    }

    // Mark suppressed recipients
    if (suppressedIds.length > 0) {
      await this.prisma.emailCampaignRecipient.updateMany({
        where: { id: { in: suppressedIds } },
        data: { status: 'SUPPRESSED' },
      });
    }

    if (eligibleRecipients.length === 0) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          eligibleCount: 0,
          suppressedCount: suppressedIds.length,
          sentCount: 0,
        },
      });
      return;
    }

    // Fetch the campaign content fields
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { subject: true, htmlContent: true, textContent: true, fromEmail: true, fromName: true, providerId: true },
    });

    if (!campaign) return;

    const fromAddress = campaign.fromEmail
      ? campaign.fromName
        ? `${campaign.fromName} <${campaign.fromEmail}>`
        : campaign.fromEmail
      : undefined;

    const jobs: CampaignEmailJobData[] = eligibleRecipients.map((r) => ({
      campaignId,
      recipientId: r.id,
      organizationId,
      to: r.email,
      subject: campaign.subject,
      html: campaign.htmlContent ?? `<p>${campaign.subject}</p>`,
      text: campaign.textContent ?? campaign.subject,
      from: fromAddress,
      providerId: campaign.providerId ?? undefined,
    }));

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        eligibleCount: eligibleRecipients.length,
        suppressedCount: suppressedIds.length,
      },
    });

    const bulkJobs = jobs.map((data) => ({
      name: JOB_TYPES.SEND_CAMPAIGN_EMAIL,
      data,
      opts: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5_000 },
      },
    }));

    await this.queue.addBulk(bulkJobs);

    this.logger.log(
      `Campaign ${campaignId} dispatched: ${jobs.length} eligible, ${suppressedIds.length} suppressed`,
    );
  }
}
