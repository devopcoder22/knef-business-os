import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  IWhatsAppProvider,
  WhatsAppSendTemplateParams,
  WhatsAppSendTextParams,
  WhatsAppSendResult,
  WhatsAppTemplateRecord,
  WhatsAppPhoneHealth,
} from './whatsapp-provider.interface';

const GRAPH_API_VERSION = 'v23.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

@Injectable()
export class MetaWhatsAppProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MetaWhatsAppProvider.name);

  async sendTemplate(params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult> {
    const url = `${BASE_URL}/${params.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.language },
        components: params.components ?? [],
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { code: number; message: string };
    };

    if (!res.ok || data.error) {
      return {
        providerMessageId: '',
        status: 'failed',
        errorCode: data.error?.code,
        errorMessage: data.error?.message,
      };
    }

    return {
      providerMessageId: data.messages?.[0]?.id ?? '',
      status: 'accepted',
    };
  }

  async sendText(params: WhatsAppSendTextParams): Promise<WhatsAppSendResult> {
    const url = `${BASE_URL}/${params.phoneNumberId}/messages`;
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: { body: params.body, preview_url: false },
    };
    if (params.contextMessageId) {
      body.context = { message_id: params.contextMessageId };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: { code: number; message: string };
    };

    if (!res.ok || data.error) {
      return {
        providerMessageId: '',
        status: 'failed',
        errorCode: data.error?.code,
        errorMessage: data.error?.message,
      };
    }

    return {
      providerMessageId: data.messages?.[0]?.id ?? '',
      status: 'accepted',
    };
  }

  async listTemplates(wabaId: string, accessToken: string): Promise<WhatsAppTemplateRecord[]> {
    const url = `${BASE_URL}/${wabaId}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: WhatsAppTemplateRecord[] };
    return (data.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      status: t.status,
      components: t.components,
      rejectionReason: (t as unknown as { rejected_reason?: string }).rejected_reason,
    }));
  }

  async getPhoneHealth(phoneNumberId: string, accessToken: string): Promise<WhatsAppPhoneHealth> {
    const url = `${BASE_URL}/${phoneNumberId}?fields=id,display_phone_number,quality_rating,messaging_limit_tier,verified_name,status`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return {
        phoneNumberId,
        displayPhoneNumber: '',
        qualityRating: 'UNKNOWN',
        messagingLimit: 'UNKNOWN',
        status: 'UNKNOWN',
      };
    }
    const data = (await res.json()) as {
      display_phone_number?: string;
      quality_rating?: string;
      messaging_limit_tier?: string;
      status?: string;
    };
    return {
      phoneNumberId,
      displayPhoneNumber: data.display_phone_number ?? '',
      qualityRating: data.quality_rating ?? 'UNKNOWN',
      messagingLimit: data.messaging_limit_tier ?? 'UNKNOWN',
      status: data.status ?? 'UNKNOWN',
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string, appSecret: string): boolean {
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
