export interface WhatsAppSendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  language: string;
  components?: unknown[];
}

export interface WhatsAppSendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
  contextMessageId?: string;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
  status: 'accepted' | 'failed';
  errorCode?: number;
  errorMessage?: string;
}

export interface WhatsAppTemplateRecord {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: unknown;
  rejectionReason?: string;
}

export interface WhatsAppPhoneHealth {
  phoneNumberId: string;
  displayPhoneNumber: string;
  qualityRating: string;
  messagingLimit: string;
  status: string;
}

export interface IWhatsAppProvider {
  sendTemplate(params: WhatsAppSendTemplateParams): Promise<WhatsAppSendResult>;
  sendText(params: WhatsAppSendTextParams): Promise<WhatsAppSendResult>;
  listTemplates(wabaId: string, accessToken: string): Promise<WhatsAppTemplateRecord[]>;
  getPhoneHealth(phoneNumberId: string, accessToken: string): Promise<WhatsAppPhoneHealth>;
  verifyWebhookSignature(rawBody: string, signature: string, appSecret: string): boolean;
}
