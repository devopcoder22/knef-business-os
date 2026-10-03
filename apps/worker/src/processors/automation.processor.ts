import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, Queue, UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import { createId } from '@paralleldrive/cuid2';
import {
  QUEUES,
  JOB_TYPES,
  type AutomationExecuteJobData,
  type TransactionalEmailJobData,
  type NotificationJobData,
  type GenerateReportJobData,
} from '@knef/constants';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';
import { decrypt } from '@knef/utils';
import type { WorkerConfig } from '../config/worker.config';

@Injectable()
export class AutomationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationProcessor.name);
  private worker!: Worker;
  private connection!: Redis;
  private emailQueue!: Queue;
  private notificationsQueue!: Queue;
  private reportsQueue!: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.emailQueue = new Queue(QUEUES.EMAIL, { connection: this.connection });
    this.notificationsQueue = new Queue(QUEUES.NOTIFICATIONS, { connection: this.connection });
    this.reportsQueue = new Queue(QUEUES.REPORTS, { connection: this.connection });

    this.worker = new Worker(
      QUEUES.AUTOMATION,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.warn(`Automation job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log('Automation processor started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.emailQueue.close();
    await this.notificationsQueue.close();
    await this.reportsQueue.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name !== JOB_TYPES.AUTOMATION_EXECUTE) return;
    await this.executeAction(job.data as AutomationExecuteJobData);
  }

  private async executeAction(data: AutomationExecuteJobData): Promise<void> {
    const { executionId, organizationId, actionType, actionParams } = data;

    // Mark as running
    await this.prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', attempt: { increment: 1 } },
    });

    try {
      let resultMetadata: Record<string, unknown> = {};

      switch (actionType) {
        case 'SEND_NOTIFICATION':
          resultMetadata = await this.doSendNotification(organizationId, actionParams);
          break;

        case 'SEND_EMAIL':
          resultMetadata = await this.doSendEmail(organizationId, actionParams);
          break;

        case 'SEND_TELEGRAM':
          resultMetadata = await this.doSendTelegram(organizationId, actionParams);
          break;

        case 'CREATE_TASK':
          resultMetadata = await this.doCreateTask(organizationId, actionParams);
          break;

        case 'GENERATE_REPORT':
          resultMetadata = await this.doGenerateReport(organizationId, actionParams);
          break;

        case 'REQUEST_AI_ANALYSIS':
          resultMetadata = await this.doRequestAiAnalysis(organizationId, actionParams);
          break;

        default:
          throw new UnrecoverableError(`Unknown action type: ${actionType}`);
      }

      await this.prisma.automationExecution.update({
        where: { id: executionId },
        data: { status: 'SUCCESS', completedAt: new Date(), resultMetadata: resultMetadata as never },
      });
    } catch (err) {
      const isUnrecoverable = err instanceof UnrecoverableError;
      const message = (err as Error).message;

      await this.prisma.automationExecution.update({
        where: { id: executionId },
        data: {
          status: isUnrecoverable ? 'FAILED' : 'RETRYING',
          errorMessage: message,
          failureCategory: isUnrecoverable ? 'PERMANENT' : 'TRANSIENT',
        },
      });

      throw err;
    }
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  private async doSendNotification(
    organizationId: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const userId = params['userId'] as string | undefined;
    if (!userId) {
      // Broadcast to org is not yet supported via notification table — log and skip gracefully
      this.logger.warn(`SEND_NOTIFICATION: no userId — skipping broadcast (org=${organizationId})`);
      return { skipped: true, reason: 'no userId for broadcast' };
    }

    const jobData: NotificationJobData = {
      organizationId,
      userId,
      title: String(params['title'] ?? ''),
      message: String(params['message'] ?? ''),
      type: String(params['type'] ?? 'INFO'),
    };

    await this.notificationsQueue.add(JOB_TYPES.SEND_NOTIFICATION, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    return { queued: true };
  }

  private async doSendEmail(
    organizationId: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const to = params['to'];
    const subject = String(params['subject'] ?? '');
    const body = String(params['body'] ?? '');

    if (!to || !subject || !body) {
      throw new UnrecoverableError('SEND_EMAIL: missing required params (to, subject, body)');
    }

    const jobData: TransactionalEmailJobData = {
      organizationId,
      to: to as string | string[],
      subject,
      html: body,
      text: body.replace(/<[^>]+>/g, ''),
      providerId: params['providerId'] as string | undefined,
    };

    await this.emailQueue.add(JOB_TYPES.SEND_TRANSACTIONAL_EMAIL, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    return { queued: true, to };
  }

  private async doSendTelegram(
    organizationId: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const message = String(params['message'] ?? '');
    if (!message) {
      throw new UnrecoverableError('SEND_TELEGRAM: missing required param (message)');
    }

    const config = await this.prisma.telegramConfig.findUnique({
      where: { organizationId },
    });

    if (!config || !config.isActive) {
      this.logger.warn(`SEND_TELEGRAM: no active Telegram config for org=${organizationId}`);
      return { skipped: true, reason: 'no active telegram config' };
    }

    if (!config.chatId) {
      this.logger.warn(`SEND_TELEGRAM: no chatId configured for org=${organizationId}`);
      return { skipped: true, reason: 'no chatId configured' };
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY')!;
    const botToken = decrypt(config.botTokenEncrypted, encryptionKey);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text: message, parse_mode: 'HTML' }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Telegram API error: ${errText}`);
    }

    return { sent: true, chatId: config.chatId };
  }

  private async doCreateTask(
    organizationId: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const title = String(params['title'] ?? '');
    if (!title) {
      throw new UnrecoverableError('CREATE_TASK: missing required param (title)');
    }

    // Find any active user in this org to satisfy FK constraint on creatorId
    const orgUser = await this.prisma.user.findFirst({
      where: { organizationId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!orgUser) {
      throw new UnrecoverableError(`CREATE_TASK: no active user found for org=${organizationId}`);
    }

    const priorityParam = String(params['priority'] ?? 'MEDIUM').toUpperCase() as TaskPriority;
    const validPriority = Object.values(TaskPriority).includes(priorityParam)
      ? priorityParam
      : TaskPriority.MEDIUM;

    const task = await this.prisma.task.create({
      data: {
        id: createId(),
        organizationId,
        title,
        description: params['description'] as string | undefined,
        status: TaskStatus.TODO,
        priority: validPriority,
        assigneeId: params['assigneeId'] as string | undefined,
        creatorId: orgUser.id,
        dueDate: params['dueDate'] ? new Date(String(params['dueDate'])) : undefined,
        tags: [],
      },
      select: { id: true, title: true },
    });

    return { taskId: task.id, title: task.title };
  }

  private async doGenerateReport(
    organizationId: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const reportType = String(params['reportType'] ?? '');
    if (!reportType) {
      throw new UnrecoverableError('GENERATE_REPORT: missing required param (reportType)');
    }

    const jobData: GenerateReportJobData = {
      organizationId,
      reportType,
      params: params as Record<string, unknown>,
      requestedBy: String(params['requestedBy'] ?? 'automation'),
    };

    await this.reportsQueue.add(JOB_TYPES.GENERATE_REPORT, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    });

    return { queued: true, reportType };
  }

  private async doRequestAiAnalysis(
    organizationId: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const prompt = String(params['prompt'] ?? '');
    if (!prompt) {
      throw new UnrecoverableError('REQUEST_AI_ANALYSIS: missing required param (prompt)');
    }

    // Find a suitable AI scheduled agent or use agentId from params
    const agentId = params['agentId'] as string | undefined;
    if (!agentId) {
      this.logger.warn(`REQUEST_AI_ANALYSIS: no agentId — skipping (org=${organizationId})`);
      return { skipped: true, reason: 'no agentId specified' };
    }

    // Verify agent belongs to the organization
    const agent = await this.prisma.aIScheduledAgent.findFirst({
      where: { id: agentId, organizationId },
      select: { id: true },
    });

    if (!agent) {
      throw new UnrecoverableError(`REQUEST_AI_ANALYSIS: agent ${agentId} not found for org=${organizationId}`);
    }

    await this.prisma.aIScheduledAgent.update({
      where: { id: agentId },
      data: { nextRunAt: new Date() },
    });

    return { triggered: true, agentId };
  }
}
