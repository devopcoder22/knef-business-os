import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { decrypt } from '@knef/utils';
import { QUEUES, JOB_TYPES, type ScheduledAgentJobData } from '@knef/constants';
import { PrismaService } from '../services/prisma.service';
import type { WorkerConfig } from '../config/worker.config';
import type { AIScheduledAgent } from '@prisma/client';

interface AnthropicMessageResponse {
  content: Array<{ text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};

function buildAgentPrompt(agent: AIScheduledAgent): string {
  const params = agent.parameters as Record<string, unknown>;
  const prompts: Record<string, string> = {
    inventory_check: `You are an inventory management assistant. Check inventory levels and identify products that need reordering. Parameters: ${JSON.stringify(params)}`,
    sales_summary: `You are a sales analyst. Summarize recent sales performance and highlight key trends. Parameters: ${JSON.stringify(params)}`,
    expense_review: `You are a finance assistant. Review pending expenses and identify any that may need attention. Parameters: ${JSON.stringify(params)}`,
    customer_followup: `You are a CRM assistant. Identify customers who may need follow-up based on their purchase history. Parameters: ${JSON.stringify(params)}`,
  };
  return (
    prompts[agent.taskType as string] ??
    `Execute task: ${String(agent.taskType)}. Parameters: ${JSON.stringify(params)}`
  );
}

@Injectable()
export class AIAgentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AIAgentProcessor.name);
  private worker!: Worker;
  private connection!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const concurrency = this.config.get<number>('AI_AGENT_CONCURRENCY', 2);

    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.worker = new Worker(
      QUEUES.AI_AGENT,
      async (job: Job) => this.process(job),
      { connection: this.connection, concurrency },
    );

    this.worker.on('completed', (job) =>
      this.logger.log(`AI agent job ${job.id} completed`),
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`AI agent job ${job?.id} failed: ${err.message}`),
    );

    this.logger.log(`AI agent processor started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.connection.quit();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === JOB_TYPES.RUN_SCHEDULED_AGENT) {
      await this.runScheduledAgent(job.data as ScheduledAgentJobData);
    }
  }

  private async runScheduledAgent(data: ScheduledAgentJobData): Promise<void> {
    const agent = await this.prisma.aIScheduledAgent.findFirst({
      where: { id: data.agentId, organizationId: data.organizationId, isActive: true },
    });

    if (!agent) {
      this.logger.warn(`Agent ${data.agentId} not found or inactive — skipping`);
      return;
    }

    // Resolve AI provider + route for this org/task
    const [provider, route] = await Promise.all([
      this.prisma.aIProvider.findFirst({
        where: { organizationId: data.organizationId, isActive: true, isDefault: true },
      }),
      this.prisma.aIProviderRoute.findFirst({
        where: {
          provider: { organizationId: data.organizationId, isActive: true },
          taskType: agent.taskType,
          isActive: true,
        },
      }),
    ]);

    if (!provider) {
      await this.markAgentResult(agent.id, 'FAILED: No active AI provider configured');
      throw new Error('No active AI provider configured');
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY')!;
    const apiKey = decrypt(provider.apiKeyEncrypted, encryptionKey);
    const model = route?.model ?? DEFAULT_MODELS[provider.provider] ?? 'gpt-4o-mini';
    const prompt = buildAgentPrompt(agent);
    const start = Date.now();

    try {
      let content: string;

      if (provider.provider === 'anthropic') {
        content = await this.callAnthropic(apiKey, model, prompt);
      } else if (provider.provider === 'openai') {
        content = await this.callOpenAI(apiKey, model, prompt, provider.baseUrl ?? undefined);
      } else {
        throw new Error(`Provider type '${provider.provider}' not supported in worker`);
      }

      const latencyMs = Date.now() - start;

      await this.prisma.aIUsageLog.create({
        data: {
          organizationId: data.organizationId,
          providerId: provider.id,
          taskType: agent.taskType,
          model,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
        },
      }).catch(() => {});

      await this.markAgentResult(agent.id, 'SUCCESS');

      this.logger.log(
        `Agent ${agent.name} (${agent.id}) completed in ${latencyMs}ms — ${content.slice(0, 80)}...`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markAgentResult(agent.id, `FAILED: ${message.slice(0, 200)}`);
      throw err;
    }
  }

  private async markAgentResult(agentId: string, status: string): Promise<void> {
    await this.prisma.aIScheduledAgent.update({
      where: { id: agentId },
      data: {
        lastRunAt: new Date(),
        lastStatus: status,
      },
    });
  }

  private async callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    return data.content[0]?.text ?? '';
  }

  private async callOpenAI(apiKey: string, model: string, prompt: string, baseUrl?: string): Promise<string> {
    const url = `${baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as OpenAIChatResponse;
    return data.choices[0]?.message.content ?? '';
  }
}
