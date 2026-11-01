import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUES, JOB_TYPES, type DailyPulseDeliverJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class DailyPulseScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyPulseScheduler.name);
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
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUES.DAILY_PULSE, { connection: this.connection });

    // Poll every 60 seconds to find orgs whose delivery time has arrived
    this.timer = setInterval(() => void this.poll(), 60_000);
    void this.poll();
    this.logger.log('Daily pulse scheduler started');
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
      await this.dispatchReadyOrgs();
    } catch (err: unknown) {
      this.logger.error(`Daily pulse scheduler error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  async dispatchReadyOrgs(): Promise<void> {
    const configs = await (this.prisma as any).dailyPulseConfig.findMany({
      where: { enabled: true },
    });

    if (!configs.length) return;

    for (const cfg of configs) {
      try {
        await this.maybeEnqueue(cfg);
      } catch (err: unknown) {
        this.logger.error(`Error dispatching daily pulse for org ${cfg.organizationId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async maybeEnqueue(cfg: {
    organizationId: string;
    deliveryTime: string;
    timezone: string;
  }): Promise<void> {
    const [targetHour, targetMinute] = cfg.deliveryTime.split(':').map(Number);

    // Get current time in org's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: cfg.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const getValue = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

    const localHour = parseInt(getValue('hour'), 10);
    const localMinute = parseInt(getValue('minute'), 10);
    const localDate = `${getValue('year')}-${getValue('month')}-${getValue('day')}`;

    if (localHour !== targetHour || localMinute !== targetMinute) return;

    // Check if already dispatched for today
    const existingKey = `${cfg.organizationId}:${localDate}:SCHEDULED`;
    const alreadyDispatched = await (this.prisma as any).dailyPulseDelivery.findFirst({
      where: { idempotencyKey: existingKey },
    });
    if (alreadyDispatched) return;

    // Mark as dispatched (prevents duplicate enqueue within same minute)
    await (this.prisma as any).dailyPulseDelivery.create({
      data: {
        id: require('crypto').randomUUID(),
        organizationId: cfg.organizationId,
        pulseDate: new Date(localDate),
        channel: 'SCHEDULER',
        recipientRef: 'system',
        idempotencyKey: existingKey,
        status: 'DISPATCHED',
      },
    });

    const jobData: DailyPulseDeliverJobData = {
      organizationId: cfg.organizationId,
      pulseDate: localDate,
    };

    await this.queue.add(JOB_TYPES.DAILY_PULSE_DELIVER, jobData, {
      jobId: existingKey,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    });

    this.logger.log(`Enqueued daily pulse for org ${cfg.organizationId} date=${localDate}`);
  }
}
