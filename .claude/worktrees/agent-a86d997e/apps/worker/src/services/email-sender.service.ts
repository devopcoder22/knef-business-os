import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { decrypt } from '@knef/utils';
import type { WorkerConfig } from '../config/worker.config';
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
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY')!;
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      let provider;
      if (params.providerId) {
        provider = await this.prisma.emailProvider.findFirst({
          where: { id: params.providerId, organizationId: params.organizationId, isActive: true },
        });
        if (!provider) return { success: false, error: 'Email provider not found' };
      } else {
        provider = await this.prisma.emailProvider.findFirst({
          where: { organizationId: params.organizationId, isDefault: true, isActive: true },
        });
        if (!provider) return { success: false, error: 'No default email provider configured' };
      }

      const toAddresses = Array.isArray(params.to) ? params.to : [params.to];
      const fromAddress = params.from ?? `${provider.fromName} <${provider.fromEmail}>`;

      if (provider.type === 'smtp') {
        return await this.sendViaSMTP(provider, toAddresses, fromAddress, params);
      } else if (provider.type === 'sendgrid') {
        return await this.sendViaSendgrid(provider, toAddresses, fromAddress, params);
      } else if (provider.type === 'mailgun') {
        return await this.sendViaMailgun(provider, toAddresses, fromAddress, params);
      }

      return { success: false, error: `Unsupported provider type: ${provider.type}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Email send failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private async sendViaSMTP(
    provider: { host: string | null; port: number | null; secure: boolean | null; username: string | null; passwordEncrypted: string | null },
    to: string[],
    from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      const password = provider.passwordEncrypted
        ? decrypt(provider.passwordEncrypted, this.encryptionKey)
        : undefined;

      const transporter = nodemailer.createTransport({
        host: provider.host ?? 'localhost',
        port: provider.port ?? 587,
        secure: provider.secure ?? false,
        auth: provider.username ? { user: provider.username, pass: password } : undefined,
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
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendViaSendgrid(
    provider: { apiKeyEncrypted: string | null },
    to: string[],
    from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      if (!provider.apiKeyEncrypted) return { success: false, error: 'SendGrid API key not configured' };
      const apiKey = decrypt(provider.apiKeyEncrypted, this.encryptionKey);

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
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `SendGrid error ${response.status}: ${errorText}` };
      }

      return { success: true, messageId: response.headers.get('X-Message-Id') ?? `sg-${Date.now()}` };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendViaMailgun(
    provider: { host: string | null; apiKeyEncrypted: string | null },
    to: string[],
    from: string,
    params: SendEmailParams,
  ): Promise<SendEmailResult> {
    try {
      if (!provider.apiKeyEncrypted) return { success: false, error: 'Mailgun API key not configured' };
      const apiKey = decrypt(provider.apiKeyEncrypted, this.encryptionKey);
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
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
