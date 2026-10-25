import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type {
  IWhatsAppProvider,
  WhatsAppSendTemplateParams,
  WhatsAppSendTextParams,
  WhatsAppSendResult,
  WhatsAppTemplateRecord,
  WhatsAppPhoneHealth,
} from './whatsapp-provider.interface';

@Injectable()
export class MockWhatsAppProvider implements IWhatsAppProvider {
  async sendTemplate(_params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult> {
    return { providerMessageId: `mock-wamid-${createId()}`, status: 'accepted' };
  }

  async sendText(_params: WhatsAppSendTextParams): Promise<WhatsAppSendResult> {
    return { providerMessageId: `mock-wamid-${createId()}`, status: 'accepted' };
  }

  async listTemplates(_wabaId: string, _accessToken: string): Promise<WhatsAppTemplateRecord[]> {
    return [];
  }

  async getPhoneHealth(phoneNumberId: string): Promise<WhatsAppPhoneHealth> {
    return {
      phoneNumberId,
      displayPhoneNumber: '+234-TEST',
      qualityRating: 'GREEN',
      messagingLimit: 'TIER_1K',
      status: 'CONNECTED',
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string, _appSecret: string): boolean {
    return signature === `sha256=mock-valid-${rawBody.length}`;
  }
}
