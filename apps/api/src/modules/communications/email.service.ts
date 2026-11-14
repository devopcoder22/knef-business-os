import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { decrypt } from '@knef/utils';
import type { AppConfig } from '../../config/app.config';
// @ts-ignore
import nodemailer from 'nodemailer';

export interface SendEmailParams {
  providerId?: string;
  organizationId: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      let provider;
      if (params.providerId) {
        provider = await this.prisma.emailProvider.findFirst({
          where: { id: params.providerId, organizationId: params.organizationId, isActive: true },
        });
        if (!provider) throw new NotFoundException('Email provider not found');
      } else {
        provider = await this.prisma.emailProvider.findFirst({
          where: { organizationId: params.organizationId, isDefault: true, isActive: true },
        });
        if (!provider) {
          return { success: false, error: 'No default email provider configured' };
        }
      }

      const encryptionKey = this.config.get<string>('ENCRYPTION_KEY')!;
      const toAddresses = Array.isArray(params.to) ? params.to : [params.to];
      const fromAddress = params.from ?? `${provider.fromName} <${provider.fromEmail}>`;

      if (provider.type === 'smtp') {
        return await this.sendViaSMTP(provider, encryptionKey, toAddresses, fromAddress, params);
      } else if (provider.type === 'sendgrid') {
        return await this.sendViaSendgrid(provider, encryptionKey, toAddresses, fromAddress, params);
      } else if (provider.type === 'mailgun') {
        return await this.sendViaMailgun(provider, encryptionKey, toAddresses, fromAddress, params);
      } else if (provider.type === 'brevo') {
        return await this.sendViaBrevo(provider, encryptionKey, toAddresses, fromAddress, params);
      }

      return { success: false, error: `Unsupported provider type: ${provider.type}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private async sendViaSMTP(
    provider: { host: string | null; port: number | null; secure: boolean | null; username: string | null; passwordEncrypted: string | null },
    encryptionKey: string,
    to: string[],
    from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      const password = provider.passwordEncrypted
        ? decrypt(provider.passwordEncrypted, encryptionKey)
        : undefined;

      const transporter = nodemailer.createTransport({
        host: provider.host ?? 'localhost',
        port: provider.port ?? 587,
        secure: provider.secure ?? false,
        auth: provider.username
          ? { user: provider.username, pass: password }
          : undefined,
      });

      const info = await transporter.sendMail({
        from,
        to: to.join(', '),
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      return { success: true, messageId: info.messageId as string };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private async sendViaSendgrid(
    provider: { apiKeyEncrypted: string | null },
    encryptionKey: string,
    to: string[],
    from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      if (!provider.apiKeyEncrypted) {
        return { success: false, error: 'SendGrid API key not configured' };
      }
      const apiKey = decrypt(provider.apiKeyEncrypted, encryptionKey);

      const body = {
        personalizations: [{ to: to.map((email) => ({ email })) }],
        from: { email: from },
        subject: params.subject,
        content: [
          { type: 'text/html', value: params.html },
          ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
        ],
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `SendGrid error ${response.status}: ${errorText}` };
      }

      const messageId = response.headers.get('X-Message-Id') ?? `sg-${Date.now()}`;
      return { success: true, messageId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private async sendViaBrevo(
    provider: { apiKeyEncrypted: string | null; fromEmail: string; fromName: string },
    encryptionKey: string,
    to: string[],
    _from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      if (!provider.apiKeyEncrypted) {
        return { success: false, error: 'Brevo API key not configured' };
      }
      const apiKey = decrypt(provider.apiKeyEncrypted, encryptionKey);

      const body = {
        sender: { name: provider.fromName, email: provider.fromEmail },
        to: to.map((email) => ({ email })),
        subject: params.subject,
        htmlContent: params.html,
        ...(params.text ? { textContent: params.text } : {}),
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Brevo error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as { messageId?: string };
      return { success: true, messageId: data.messageId ?? `brevo-${Date.now()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /** Settings may hold an encrypted value or (legacy) plaintext — try decrypt, fall back to raw. */
  private decryptSetting(value: string): string {
    try {
      return decrypt(value, this.config.get<string>('ENCRYPTION_KEY')!);
    } catch {
      return value;
    }
  }

  /**
   * Sends a transactional SMS immediately via the org's active provider (sms.provider: termii | brevo).
   */
  async sendSms(organizationId: string, to: string, message: string): Promise<SendEmailResult> {
    try {
      const rows = await this.prisma.systemSetting.findMany({
        where: {
          organizationId,
          key: { in: ['sms.provider', 'sms.apiKey', 'sms.senderId', 'sms.baseUrl', 'sms.brevoApiKey', 'sms.brevoSenderId'] },
        },
        select: { key: true, value: true },
      });
      const s = Object.fromEntries(rows.map((r) => [r.key, r.value?.trim() ?? '']));

      if (s['sms.provider'] === 'brevo') {
        return await this.sendSmsViaBrevo(to, message, s['sms.brevoApiKey'], s['sms.brevoSenderId'] || s['sms.senderId']);
      }

      const apiKey = s['sms.apiKey'] ? this.decryptSetting(s['sms.apiKey']) : this.config.get('TERMII_API_KEY');
      const senderId = s['sms.senderId'] || 'OE Alert';
      const baseUrl = (s['sms.baseUrl'] || 'https://v4.api.termii.com').replace(/\/+$/, '');

      if (!apiKey) {
        this.logger.warn('SMS: TERMII_API_KEY not set');
        return { success: false, error: 'SMS not configured — set TERMII_API_KEY or configure in SMS Providers settings' };
      }

      // Normalize phone to Termii format: 0XXXXXXXXXX → 2348XXXXXXXXX (no + prefix)
      let recipient = to.replace(/[\s\-()]/g, '');
      if (recipient.startsWith('+')) {
        recipient = recipient.slice(1);
      } else if (/^0\d{10}$/.test(recipient)) {
        recipient = `234${recipient.slice(1)}`;
      } else if (/^\d{10}$/.test(recipient)) {
        recipient = `234${recipient}`;
      }

      const body = {
        api_key: apiKey,
        to: recipient,
        from: senderId,
        sms: message,
        type: 'plain',
        // 'dnd' route delivers transactional messages (OTP) to DND-activated Nigerian numbers;
        // 'generic' silently fails for them.
        channel: 'dnd',
      };

      this.logger.log(`SMS: sending to ${recipient} via Termii (sender=${senderId})`);

      const response = await fetch(`${baseUrl}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();

      if (!response.ok) {
        this.logger.error(`SMS: Termii error ${response.status}: ${responseText}`);
        return { success: false, error: `Termii SMS error ${response.status}: ${responseText}` };
      }

      this.logger.log(`SMS: sent successfully to ${recipient}`);
      const data = JSON.parse(responseText) as { message_id?: string; message?: string };
      return { success: true, messageId: data.message_id ?? `termii-sms-${Date.now()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMS: unexpected error: ${message}`);
      return { success: false, error: message };
    }
  }

  private async sendSmsViaBrevo(
    to: string,
    message: string,
    encryptedOrRawKey: string | undefined,
    sender: string | undefined,
  ): Promise<SendEmailResult> {
    if (!encryptedOrRawKey) {
      return { success: false, error: 'SMS not configured — set the Brevo API key in SMS Providers settings' };
    }
    if (!sender) {
      return { success: false, error: 'SMS not configured — set the Brevo sender name in SMS Providers settings' };
    }
    const apiKey = this.decryptSetting(encryptedOrRawKey);

    // Brevo expects international format without '+', e.g. 2348012345678
    let recipient = to.replace(/[\s\-()]/g, '');
    if (recipient.startsWith('+')) recipient = recipient.slice(1);
    else if (/^0\d{10}$/.test(recipient)) recipient = `234${recipient.slice(1)}`;
    else if (/^\d{10}$/.test(recipient)) recipient = `234${recipient}`;

    this.logger.log(`SMS: sending to ${recipient} via Brevo (sender=${sender})`);
    const response = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ sender: sender.slice(0, 11), recipient, content: message, type: 'transactional' }),
      signal: AbortSignal.timeout(15000),
    });
    const responseText = await response.text();
    if (!response.ok) {
      this.logger.error(`SMS: Brevo error ${response.status}: ${responseText}`);
      return { success: false, error: `Brevo SMS error ${response.status}: ${responseText}` };
    }
    this.logger.log(`SMS: Brevo accepted message to ${recipient}`);
    const data = JSON.parse(responseText) as { reference?: string; messageId?: number };
    return { success: true, messageId: data.reference ?? String(data.messageId ?? `brevo-sms-${Date.now()}`) };
  }

  private async sendViaMailgun(
    provider: { host: string | null; apiKeyEncrypted: string | null },
    encryptionKey: string,
    to: string[],
    from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      if (!provider.apiKeyEncrypted) {
        return { success: false, error: 'Mailgun API key not configured' };
      }
      const apiKey = decrypt(provider.apiKeyEncrypted, encryptionKey);
      // host is used as the mailgun domain
      const domain = provider.host ?? 'mg.example.com';

      const formData = new URLSearchParams();
      to.forEach((email) => formData.append('to', email));
      formData.append('from', from);
      formData.append('subject', params.subject);
      formData.append('html', params.html);
      if (params.text) formData.append('text', params.text);

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Mailgun error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as { id?: string };
      return { success: true, messageId: data.id ?? `mg-${Date.now()}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
