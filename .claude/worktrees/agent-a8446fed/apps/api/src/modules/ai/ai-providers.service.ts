import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { ConfigService } from '@nestjs/config';
import { encrypt, decrypt } from '@knef/utils';
import type { AppConfig } from '../../config/app.config';
import type {
  CreateAIProviderDto,
  UpdateAIProviderDto,
  CreateAIProviderRouteDto,
  UpdateAIProviderRouteDto,
} from './dto/ai.dto';

@Injectable()
export class AIProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY')!;
  }

  async getDefaultProvider(orgId: string) {
    return this.prisma.aIProvider.findFirst({
      where: { organizationId: orgId, isDefault: true, isActive: true },
    });
  }

  async listProviders(orgId: string) {
    const providers = await this.prisma.aIProvider.findMany({
      where: { organizationId: orgId },
      include: { routes: { where: { isActive: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return providers.map((p) => ({
      ...p,
      apiKeyEncrypted: undefined,
    }));
  }

  async getProvider(orgId: string, id: string) {
    const provider = await this.prisma.aIProvider.findFirst({
      where: { id, organizationId: orgId },
      include: { routes: true },
    });
    if (!provider) throw new NotFoundException('AI provider not found');
    return { ...provider, apiKeyEncrypted: undefined };
  }

  async createProvider(orgId: string, dto: CreateAIProviderDto) {
    const apiKeyEncrypted = encrypt(dto.apiKey, this.encryptionKey);

    if (dto.isDefault) {
      await this.prisma.aIProvider.updateMany({
        where: { organizationId: orgId },
        data: { isDefault: false },
      });
    }

    const provider = await this.prisma.aIProvider.create({
      data: {
        id: createId(),
        organizationId: orgId,
        name: dto.name,
        provider: dto.provider,
        apiKeyEncrypted,
        baseUrl: dto.baseUrl ?? null,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
      },
    });

    return { ...provider, apiKeyEncrypted: undefined };
  }

  async updateProvider(orgId: string, id: string, dto: UpdateAIProviderDto) {
    const existing = await this.prisma.aIProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('AI provider not found');

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.baseUrl !== undefined) updateData.baseUrl = dto.baseUrl;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.apiKey !== undefined) {
      updateData.apiKeyEncrypted = encrypt(dto.apiKey, this.encryptionKey);
    }

    const provider = await this.prisma.aIProvider.update({
      where: { id },
      data: updateData,
    });
    return { ...provider, apiKeyEncrypted: undefined };
  }

  async deleteProvider(orgId: string, id: string): Promise<void> {
    const existing = await this.prisma.aIProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('AI provider not found');
    await this.prisma.aIProvider.delete({ where: { id } });
  }

  async setDefault(orgId: string, id: string): Promise<void> {
    const existing = await this.prisma.aIProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('AI provider not found');

    await this.prisma.aIProvider.updateMany({
      where: { organizationId: orgId },
      data: { isDefault: false },
    });
    await this.prisma.aIProvider.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async getDecryptedKey(orgId: string, providerId: string): Promise<string> {
    const provider = await this.prisma.aIProvider.findFirst({
      where: { id: providerId, organizationId: orgId, isActive: true },
    });
    if (!provider) throw new NotFoundException('AI provider not found');
    return decrypt(provider.apiKeyEncrypted, this.encryptionKey);
  }

  async testProvider(orgId: string, id: string): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    const provider = await this.prisma.aIProvider.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!provider) throw new NotFoundException('AI provider not found');

    const apiKey = decrypt(provider.apiKeyEncrypted, this.encryptionKey);
    const start = Date.now();

    try {
      if (provider.provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const body = await res.json() as { error?: { message?: string } };
          return { success: false, latencyMs, error: body.error?.message ?? 'Unknown error' };
        }
        return { success: true, latencyMs };
      }

      if (provider.provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
        });
        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const body = await res.json() as { error?: { message?: string } };
          return { success: false, latencyMs, error: body.error?.message ?? 'Unknown error' };
        }
        return { success: true, latencyMs };
      }

      if (provider.provider === 'gemini') {
        const model = 'gemini-1.5-flash';
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] }),
          },
        );
        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const body = await res.json() as { error?: { message?: string } };
          return { success: false, latencyMs, error: body.error?.message ?? 'Unknown error' };
        }
        return { success: true, latencyMs };
      }

      return { success: false, latencyMs: Date.now() - start, error: 'Provider type not supported for testing' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      return { success: false, latencyMs: Date.now() - start, error: message };
    }
  }

  // ── Routes ───────────────────────────────────────────────────────

  async listRoutes(orgId: string, providerId: string) {
    await this.getProvider(orgId, providerId);
    return this.prisma.aIProviderRoute.findMany({
      where: { providerId },
      orderBy: [{ priority: 'asc' }, { taskType: 'asc' }],
    });
  }

  async createRoute(orgId: string, providerId: string, dto: CreateAIProviderRouteDto) {
    await this.getProvider(orgId, providerId);
    return this.prisma.aIProviderRoute.create({
      data: {
        id: createId(),
        providerId,
        taskType: dto.taskType,
        model: dto.model,
        priority: dto.priority ?? 0,
        maxTokens: dto.maxTokens ?? null,
        temperature: dto.temperature ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateRoute(orgId: string, providerId: string, routeId: string, dto: UpdateAIProviderRouteDto) {
    await this.getProvider(orgId, providerId);
    const route = await this.prisma.aIProviderRoute.findFirst({
      where: { id: routeId, providerId },
    });
    if (!route) throw new NotFoundException('Route not found');

    return this.prisma.aIProviderRoute.update({
      where: { id: routeId },
      data: {
        ...(dto.taskType !== undefined && { taskType: dto.taskType }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.maxTokens !== undefined && { maxTokens: dto.maxTokens }),
        ...(dto.temperature !== undefined && { temperature: dto.temperature }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteRoute(orgId: string, providerId: string, routeId: string): Promise<void> {
    await this.getProvider(orgId, providerId);
    const route = await this.prisma.aIProviderRoute.findFirst({
      where: { id: routeId, providerId },
    });
    if (!route) throw new NotFoundException('Route not found');
    await this.prisma.aIProviderRoute.delete({ where: { id: routeId } });
  }

  // ── Internal helper for routing ──────────────────────────────────

  async findProviderByTaskType(orgId: string, taskType: string) {
    const route = await this.prisma.aIProviderRoute.findFirst({
      where: {
        provider: { organizationId: orgId, isActive: true },
        taskType,
        isActive: true,
      },
      include: { provider: true },
      orderBy: { priority: 'asc' },
    });
    if (route) return { provider: route.provider, route };

    const defaultProvider = await this.getDefaultProvider(orgId);
    if (!defaultProvider) return null;
    return { provider: defaultProvider, route: null };
  }
}
