import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { WorkerConfig } from '../config/worker.config';
import { PrismaService } from './prisma.service';
import { decrypt } from '@knef/utils';
import type { WhatsAppSendJobData } from '@knef/constants';

const GRAPH_API_VERSION = 'v23.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

@Injectable()
export class WhatsAppSenderService {
  private readonly logger = new Logger(WhatsAppSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  private get deliveryEnabled(): boolean {
    return process.env['WHATSAPP_DELIVERY_ENABLED'] === 'true';
  }

  private get encKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async sendWhatsApp(data: WhatsAppSendJobData): Promise<void> {
    if (!this.deliveryEnabled) {
      this.logger.log(`[MOCK] WhatsApp delivery disabled — skipping send to ${data.to} (org=${data.organizationId})`);
      if (data.messageId) {
        await this.updateMessageStatus(data.messageId, 'SUBMITTED').catch(() => {});
      }
      return;
    }

    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId: data.organizationId },
    });
    if (!cfg || !cfg.isActive) {
      this.logger.warn(`WhatsApp not configured for org ${data.organizationId}`);
      if (data.messageId) await this.updateMessageStatus(data.messageId, 'FAILED', 'WhatsApp not configured').catch(() => {});
      return;
    }

    const accessToken = decrypt(cfg.accessTokenEncrypted, this.encKey);
    const url = `${BASE_URL}/${cfg.phoneNumberId}/messages`;

    let body: Record<string, unknown>;
    if (data.templateName) {
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: data.to,
        type: 'template',
        template: {
          name: data.templateName,
          language: { code: data.templateLanguage ?? 'en_US' },
          components: data.templateComponents ?? [],
        },
      };
    } else {
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: data.to,
        type: 'text',
        text: { body: data.message ?? '', preview_url: false },
      };
      if (data.contextMessageId) {
        body.context = { message_id: data.contextMessageId };
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const responseData = (await res.json()) as {
        messages?: { id: string }[];
        error?: { code: number; message: string };
      };

      if (!res.ok || responseData.error) {
        const code = responseData.error?.code;
        const msg = responseData.error?.message ?? `HTTP ${res.status}`;
        this.logger.warn(`WhatsApp send failed (org=${data.organizationId}, code=${code}): ${msg}`);

        // Permanent failures — do not retry
        const permanent = [131050, 131026, 132001, 131031, 130429];
        if (code && permanent.includes(code)) {
          if (data.messageId) await this.updateMessageStatus(data.messageId, 'FAILED', msg, code).catch(() => {});
          return;
        }
        // Transient — throw so BullMQ retries
        throw new Error(`WhatsApp API error ${code}: ${msg}`);
      }

      const providerMessageId = responseData.messages?.[0]?.id;
      this.logger.log(`WhatsApp sent to ${data.to} (org=${data.organizationId}, wamid=${providerMessageId})`);

      if (data.messageId) {
        await this.prisma.whatsAppMessage.update({
          where: { id: data.messageId },
          data: {
            status: 'SENT',
            providerMessageId: providerMessageId ?? null,
            sentAt: new Date(),
          },
        }).catch(() => {});
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error('WhatsApp API timeout');
      }
      throw err;
    }
  }

  private async updateMessageStatus(
    messageId: string,
    status: string,
    errorMessage?: string,
    errorCode?: number,
  ): Promise<void> {
    await this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status,
        ...(errorMessage ? { errorMessage } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(status === 'FAILED' ? { failedAt: new Date() } : {}),
      },
    });
  }
}
