import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

interface TermiiResponse {
  message_id?: string;
  message?: string;
  code?: string;
}

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);
  private readonly termiiBaseUrl = 'https://v3.api.termii.com/api/sms/send';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  async sendSms(params: {
    organizationId: string;
    to: string;
    message: string;
    providerId?: string;
    senderId?: string;
    logId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const provider = await this.resolveProvider(params.organizationId, params.providerId);
    if (!provider) {
      const err = 'No SMS provider configured';
      await this.updateLog(params.logId, 'failed', undefined, err);
      return { success: false, error: err };
    }

    const to = this.normalizePhone(params.to);
    const senderId = params.senderId ?? provider.senderId ?? 'KNEF';

    try {
      const result = await this.dispatchViaProvider(provider.providerName, provider.apiKey, to, params.message, senderId);
      await this.updateLog(params.logId, 'sent', result.messageId);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMS send failed for ${to}: ${msg}`);
      await this.updateLog(params.logId, 'failed', undefined, msg);
      return { success: false, error: msg };
    }
  }

  private async dispatchViaProvider(
    providerName: string,
    apiKey: string,
    to: string,
    message: string,
    senderId: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    switch (providerName) {
      case 'termii':
        return this.sendViaTermii(apiKey, to, message, senderId);
      default:
        return { success: false, error: `Unsupported SMS provider: ${providerName}` };
    }
  }

  private async sendViaTermii(
    apiKey: string,
    to: string,
    message: string,
    from: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const res = await fetch(this.termiiBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from,
        sms: message,
        type: 'plain',
        api_key: apiKey,
        channel: 'generic',
      }),
    });

    const data = (await res.json()) as TermiiResponse;

    if (!res.ok || data.code === 'err') {
      return { success: false, error: data.message ?? `Termii error: ${res.status}` };
    }

    return { success: true, messageId: data.message_id };
  }

  private async resolveProvider(
    organizationId: string,
    providerId?: string,
  ): Promise<{ providerName: string; apiKey: string; senderId: string | null } | null> {
    const record = providerId
      ? await this.prisma.smsProvider.findFirst({ where: { id: providerId, organizationId } })
      : await this.prisma.smsProvider.findFirst({
          where: { organizationId, isDefault: true, isActive: true },
        });

    if (!record) {
      // Fallback: check process.env for legacy Termii config
      const envKey = process.env['TERMII_API_KEY'];
      if (envKey) {
        return { providerName: 'termii', apiKey: envKey, senderId: process.env['TERMII_SENDER_ID'] ?? null };
      }
      return null;
    }

    try {
      const encKey = this.config.getOrThrow<string>('ENCRYPTION_KEY');
      const apiKey = decrypt(record.apiKeyEncrypted, encKey);
      return { providerName: record.provider, apiKey, senderId: record.senderId };
    } catch {
      this.logger.error(`Failed to decrypt SMS provider key for ${record.id}`);
      return null;
    }
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      return `234${digits.slice(1)}`;
    }
    return digits;
  }

  private async updateLog(
    logId: string | undefined,
    status: string,
    providerMessageId?: string,
    errorMessage?: string,
  ): Promise<void> {
    if (!logId) return;
    try {
      await this.prisma.communicationLog.update({
        where: { id: logId },
        data: {
          status,
          providerMessageId: providerMessageId ?? null,
          errorMessage: errorMessage ?? null,
          sentAt: status === 'sent' ? new Date() : undefined,
          failedAt: status === 'failed' ? new Date() : undefined,
          attemptCount: { increment: 1 },
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to update communication log ${logId}: ${e}`);
    }
  }
}
