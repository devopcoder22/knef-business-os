import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt, normalizeToE164 } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

interface TermiiResponse {
  message_id?: string;
  message?: string;
  code?: string;
}

// Termii error codes that indicate a permanent failure (do not retry)
const TERMII_PERMANENT_ERRORS = new Set([
  'invalid_phone_number',
  'phone_number_not_verified',
  'sender_not_approved',
  'insufficient_balance',
  'blacklisted',
]);

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);
  private readonly termiiBaseUrl = 'https://v3.api.termii.com/api/sms/send';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  private get deliveryEnabled(): boolean {
    return this.config.get<string>('SMS_DELIVERY_ENABLED') === 'true';
  }

  async sendSms(params: {
    organizationId: string;
    to: string;
    message: string;
    providerId?: string;
    senderId?: string;
    logId?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Delivery safety flag
    if (!this.deliveryEnabled) {
      this.logger.log(`[MOCK] SMS delivery disabled — skipping send to ${params.to} (org=${params.organizationId})`);
      await this.updateLog(params.logId, 'sent', 'mock-disabled');
      return { success: true, messageId: 'mock-disabled' };
    }

    // Idempotency: skip if same business event already sent successfully
    if (params.idempotencyKey) {
      const existing = await this.prisma.communicationLog.findFirst({
        where: { organizationId: params.organizationId, idempotencyKey: params.idempotencyKey, status: 'sent' },
        select: { id: true, providerMessageId: true },
      });
      if (existing) {
        this.logger.log(`SMS idempotency hit — skipping duplicate (key=${params.idempotencyKey})`);
        return { success: true, messageId: existing.providerMessageId ?? undefined };
      }
    }

    const provider = await this.resolveProvider(params.organizationId, params.providerId);
    if (!provider) {
      const err = 'No SMS provider configured';
      await this.updateLog(params.logId, 'failed', undefined, err);
      return { success: false, error: err };
    }

    const to = normalizeToE164(params.to);
    if (!to) {
      const err = `Cannot normalize phone number: ${params.to}`;
      await this.updateLog(params.logId, 'failed', undefined, err);
      return { success: false, error: err };
    }
    const senderIdRaw = params.senderId ?? provider.senderId;
    const senderId = senderIdRaw !== null && senderIdRaw !== undefined ? senderIdRaw : 'KNEF';

    try {
      const result = await this.dispatchViaProvider(provider.providerName, provider.apiKey, to, params.message, senderId);
      await this.updateLog(params.logId, result.success ? 'sent' : 'failed', result.messageId, result.error);
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
    let res: Response;
    try {
      res = await fetch(this.termiiBaseUrl, {
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
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error('Termii API timeout');
      }
      throw err;
    }

    const data = (await res.json()) as TermiiResponse;

    if (!res.ok || data.code === 'err') {
      const errMsg = data.message ?? `Termii error: ${res.status}`;
      // Permanent error codes → return failure without throwing (no retry)
      if (data.code && TERMII_PERMANENT_ERRORS.has(data.code)) {
        return { success: false, error: errMsg };
      }
      // 4xx permanent → return failure
      if (res.status >= 400 && res.status < 500) {
        return { success: false, error: errMsg };
      }
      // 5xx transient → throw so BullMQ retries
      throw new Error(errMsg);
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
      // Fallback: check typed config for Termii credentials
      const envKey = this.config.get('TERMII_API_KEY');
      if (envKey) {
        return { providerName: 'termii', apiKey: envKey, senderId: this.config.get('TERMII_SENDER_ID') ?? null };
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
