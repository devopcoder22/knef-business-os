import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AIProvidersService } from './ai-providers.service';
import type { Prisma } from '@prisma/client';

export interface CompletionMessage {
  role: string;
  content: string;
}

export interface CompletionParams {
  organizationId: string;
  userId?: string;
  taskType: string;
  messages: CompletionMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  providerId?: string;
  conversationId?: string;
}

export interface CompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  costUsd: number;
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

interface AnthropicMessageResponse {
  content: Array<{ text: string }>;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

interface GeminiResponse {
  candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates: Record<string, { in: number; out: number }> = {
    'gpt-4o': { in: 0.0000025, out: 0.00001 },
    'gpt-4o-mini': { in: 0.00000015, out: 0.0000006 },
    'claude-opus-4-7': { in: 0.000015, out: 0.000075 },
    'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 },
    'claude-haiku-4-5-20251001': { in: 0.00000025, out: 0.00000125 },
    'gemini-1.5-pro': { in: 0.00000125, out: 0.000005 },
    'gemini-1.5-flash': { in: 0.000000075, out: 0.0000003 },
  };
  const r = rates[model] ?? { in: 0.000001, out: 0.000002 };
  return promptTokens * r.in + completionTokens * r.out;
}

@Injectable()
export class AICompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProviders: AIProvidersService,
  ) {}

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const {
      organizationId,
      userId,
      taskType,
      messages,
      systemPrompt,
      maxTokens,
      temperature,
      providerId,
      conversationId,
    } = params;

    // Resolve provider
    let provider: Awaited<ReturnType<typeof this.aiProviders.getDefaultProvider>>;
    let resolvedModel: string | null = null;
    let resolvedMaxTokens: number | null = null;
    let resolvedTemperature: number | null = null;

    if (providerId) {
      provider = await this.prisma.aIProvider.findFirst({
        where: { id: providerId, organizationId, isActive: true },
      });
    } else {
      const match = await this.aiProviders.findProviderByTaskType(organizationId, taskType);
      if (match) {
        provider = match.provider;
        if (match.route) {
          resolvedModel = match.route.model;
          resolvedMaxTokens = match.route.maxTokens !== null ? Number(match.route.maxTokens) : null;
          resolvedTemperature = match.route.temperature !== null ? Number(match.route.temperature) : null;
        }
      } else {
        provider = null;
      }
    }

    if (!provider) {
      throw new ServiceUnavailableException('AI provider not configured');
    }

    const apiKey = await this.aiProviders.getDecryptedKey(organizationId, provider.id);

    const start = Date.now();
    let result: CompletionResult;

    try {
      if (provider.provider === 'openai') {
        result = await this.callOpenAI({
          apiKey,
          model: resolvedModel ?? 'gpt-4o-mini',
          messages,
          systemPrompt,
          maxTokens: maxTokens ?? resolvedMaxTokens ?? 2048,
          temperature: temperature ?? resolvedTemperature ?? 0.7,
          baseUrl: provider.baseUrl ?? undefined,
          start,
        });
      } else if (provider.provider === 'anthropic') {
        result = await this.callAnthropic({
          apiKey,
          model: resolvedModel ?? 'claude-haiku-4-5-20251001',
          messages,
          systemPrompt,
          maxTokens: maxTokens ?? resolvedMaxTokens ?? 2048,
          start,
        });
      } else if (provider.provider === 'gemini') {
        result = await this.callGemini({
          apiKey,
          model: resolvedModel ?? 'gemini-1.5-flash',
          messages,
          systemPrompt,
          maxTokens: maxTokens ?? resolvedMaxTokens ?? 2048,
          start,
        });
      } else {
        throw new ServiceUnavailableException(`Provider type '${provider.provider}' not yet supported`);
      }
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableException) throw err;
      const message = err instanceof Error ? err.message : 'LLM call failed';
      throw new ServiceUnavailableException(message);
    }

    // Log usage
    const costUsd = result.costUsd;
    await this.prisma.aIUsageLog.create({
      data: {
        id: createId(),
        organizationId,
        providerId: provider.id,
        userId: userId ?? null,
        model: result.model,
        taskType,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        costUsd,
        latencyMs: result.latencyMs,
      },
    });

    // Update budget spent
    const budget = await this.prisma.aIBudget.findFirst({
      where: { organizationId, isActive: true },
    });
    if (budget) {
      const currentSpent = Number(budget.spentUsd);
      await this.prisma.aIBudget.update({
        where: { id: budget.id },
        data: { spentUsd: currentSpent + costUsd },
      });
    }

    return result;
  }

  private async callOpenAI(opts: {
    apiKey: string;
    model: string;
    messages: CompletionMessage[];
    systemPrompt?: string;
    maxTokens: number;
    temperature: number;
    baseUrl?: string;
    start: number;
  }): Promise<CompletionResult> {
    const { apiKey, model, messages, systemPrompt, maxTokens, temperature, baseUrl, start } = opts;
    const baseEndpoint = baseUrl ?? 'https://api.openai.com';
    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch(`${baseEndpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages: allMessages, max_tokens: maxTokens, temperature }),
    });

    if (!res.ok) {
      const body = await res.json() as { error?: { message?: string } };
      throw new ServiceUnavailableException(body.error?.message ?? `OpenAI error: ${res.status}`);
    }

    const data = await res.json() as OpenAIChatResponse;
    const latencyMs = Date.now() - start;
    const promptTokens = data.usage.prompt_tokens;
    const completionTokens = data.usage.completion_tokens;
    const totalTokens = data.usage.total_tokens;

    return {
      content: data.choices[0].message.content,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      costUsd: estimateCost(model, promptTokens, completionTokens),
    };
  }

  private async callAnthropic(opts: {
    apiKey: string;
    model: string;
    messages: CompletionMessage[];
    systemPrompt?: string;
    maxTokens: number;
    start: number;
  }): Promise<CompletionResult> {
    const { apiKey, model, messages, systemPrompt, maxTokens, start } = opts;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json() as { error?: { message?: string } };
      throw new ServiceUnavailableException(errBody.error?.message ?? `Anthropic error: ${res.status}`);
    }

    const data = await res.json() as AnthropicMessageResponse;
    const latencyMs = Date.now() - start;
    const promptTokens = data.usage.input_tokens;
    const completionTokens = data.usage.output_tokens;
    const totalTokens = promptTokens + completionTokens;

    return {
      content: data.content[0]?.text ?? '',
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      costUsd: estimateCost(model, promptTokens, completionTokens),
    };
  }

  private async callGemini(opts: {
    apiKey: string;
    model: string;
    messages: CompletionMessage[];
    systemPrompt?: string;
    maxTokens: number;
    start: number;
  }): Promise<CompletionResult> {
    const { apiKey, model, messages, systemPrompt, maxTokens, start } = opts;

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }));

    const bodyObj: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (systemPrompt) {
      bodyObj.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      },
    );

    if (!res.ok) {
      const errBody = await res.json() as { error?: { message?: string } };
      throw new ServiceUnavailableException(errBody.error?.message ?? `Gemini error: ${res.status}`);
    }

    const data = await res.json() as GeminiResponse;
    const latencyMs = Date.now() - start;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = data.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;

    return {
      content: text,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs,
      costUsd: estimateCost(model, promptTokens, completionTokens),
    };
  }

  async generateEmbedding(orgId: string, text: string): Promise<number[] | null> {
    try {
      const match = await this.aiProviders.findProviderByTaskType(orgId, 'embedding');
      let provider = match?.provider ?? null;

      // Fallback: find any OpenAI provider
      if (!provider || provider.provider !== 'openai') {
        provider = await this.prisma.aIProvider.findFirst({
          where: { organizationId: orgId, provider: 'openai', isActive: true },
        });
      }

      if (!provider) return null;

      const apiKey = await this.aiProviders.getDecryptedKey(orgId, provider.id);
      const baseUrl = provider.baseUrl ?? 'https://api.openai.com';

      const res = await fetch(`${baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
      });

      if (!res.ok) return null;

      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data[0]?.embedding ?? null;
    } catch {
      return null;
    }
  }
}
