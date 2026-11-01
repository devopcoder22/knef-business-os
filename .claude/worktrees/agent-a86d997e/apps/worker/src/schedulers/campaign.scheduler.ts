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
      take: 20,
    });

    if (campaigns.length === 0) return;

    this.logger.log(`Found ${campaigns.length} campaign(s) ready to dispatch`);

    for (const campaign of campaigns) {
      try {
        await this.dispatchCampaign(campaign.id, campaign.organizationId);
      } catch (err: unknown) {
        this.logger.error(
          `Failed to dispatch campaign ${campaign.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async dispatchCampaign(campaignId: string, organizationId: string): Promise<void> {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, organizationId, status: 'SCHEDULED' },
    });

    if (!campaign) return;

    const recipients = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId, status: 'PENDING' },
    });

    if (recipients.length === 0) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'SENT', sentAt: new Date(), sentCount: 0 },
      });
      return;
    }

    const fromAddress = campaign.fromEmail
      ? campaign.fromName
        ? `${campaign.fromName} <${campaign.fromEmail}>`
        : campaign.fromEmail
      : undefined;

    const jobs: CampaignEmailJobData[] = recipients.map((r) => ({
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
      data: { status: 'SENDING', eligibleCount: recipients.length },
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
      `Campaign ${campaignId} dispatched: ${jobs.length} recipients queued`,
    );
  }
}
