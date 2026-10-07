import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { createHash, randomBytes } from 'crypto';
import { CampaignStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { EmailService } from './email.service';
import { encrypt } from '@knef/utils';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import type {
  CreateEmailProviderDto,
  UpdateEmailProviderDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  AddRecipientsDto,
  UpsertTelegramConfigDto,
  UpdateTelegramSettingsDto,
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
} from './dto/communications.dto';

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  private get encryptionKey(): string {
    return this.config.get<string>('ENCRYPTION_KEY')!;
  }

  // ── Email Providers ──────────────────────────────────────────────

  async listEmailProviders(organizationId: string) {
    return this.prisma.emailProvider.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromEmail: true,
        fromName: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createEmailProvider(organizationId: string, dto: CreateEmailProviderDto) {
    const passwordEncrypted = dto.password
      ? encrypt(dto.password, this.encryptionKey)
      : null;
    const apiKeyEncrypted = dto.apiKey
      ? encrypt(dto.apiKey, this.encryptionKey)
      : null;

    if (dto.isDefault) {
      await this.prisma.emailProvider.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });
    }

    const provider = await this.prisma.emailProvider.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        type: dto.type,
        host: dto.host ?? null,
        port: dto.port ?? null,
        secure: dto.secure ?? false,
        username: dto.username ?? null,
        passwordEncrypted,
        apiKeyEncrypted,
        fromEmail: dto.fromEmail,
        fromName: dto.fromName,
        isDefault: dto.isDefault ?? false,
        isActive: true,
      },
    });

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      host: provider.host,
      port: provider.port,
      secure: provider.secure,
      username: provider.username,
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      isDefault: provider.isDefault,
      isActive: provider.isActive,
    };
  }

  async getEmailProvider(organizationId: string, id: string) {
    const provider = await this.prisma.emailProvider.findFirst({
      where: { id, organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromEmail: true,
        fromName: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!provider) throw new NotFoundException('Email provider not found');
    return provider;
  }

  async updateEmailProvider(organizationId: string, id: string, dto: UpdateEmailProviderDto) {
    const existing = await this.prisma.emailProvider.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!existing) throw new NotFoundException('Email provider not found');

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.host !== undefined) updateData.host = dto.host;
    if (dto.port !== undefined) updateData.port = dto.port;
    if (dto.secure !== undefined) updateData.secure = dto.secure;
    if (dto.username !== undefined) updateData.username = dto.username;
    if (dto.fromEmail !== undefined) updateData.fromEmail = dto.fromEmail;
    if (dto.fromName !== undefined) updateData.fromName = dto.fromName;
    if (dto.password !== undefined) {
      updateData.passwordEncrypted = encrypt(dto.password, this.encryptionKey);
    }
    if (dto.apiKey !== undefined) {
      updateData.apiKeyEncrypted = encrypt(dto.apiKey, this.encryptionKey);
    }

    const provider = await this.prisma.emailProvider.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        fromEmail: true,
        fromName: true,
        isDefault: true,
        isActive: true,
      },
    });
    return provider;
  }

  async deleteEmailProvider(organizationId: string, id: string) {
    const existing = await this.prisma.emailProvider.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Email provider not found');

    await this.prisma.emailProvider.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  async setDefaultEmailProvider(organizationId: string, id: string) {
    const existing = await this.prisma.emailProvider.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!existing) throw new NotFoundException('Email provider not found');

    await this.prisma.emailProvider.updateMany({
      where: { organizationId },
      data: { isDefault: false },
    });

    await this.prisma.emailProvider.update({
      where: { id },
      data: { isDefault: true },
    });

    return { success: true };
  }

  async testEmailProvider(organizationId: string, id: string, userEmail: string) {
    const provider = await this.prisma.emailProvider.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!provider) throw new NotFoundException('Email provider not found');

    const result = await this.emailService.sendEmail({
      providerId: id,
      organizationId,
      to: userEmail,
      subject: 'KNEF Email Provider Test',
      html: '<h1>Test Email</h1><p>Your email provider is configured correctly!</p>',
      text: 'Test Email: Your email provider is configured correctly!',
    });

    return result;
  }

  // ── Communication Templates ──────────────────────────────────────

  async listTemplates(organizationId: string) {
    return this.prisma.communicationTemplate.findMany({
      where: { organizationId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createTemplate(organizationId: string, dto: CreateTemplateDto) {
    return this.prisma.communicationTemplate.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        type: dto.type,
        subject: dto.subject ?? null,
        body: dto.body,
        variables: dto.variables ?? {},
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getTemplate(organizationId: string, id: string) {
    const template = await this.prisma.communicationTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async updateTemplate(organizationId: string, id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.communicationTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    return this.prisma.communicationTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.variables !== undefined && { variables: dto.variables }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteTemplate(organizationId: string, id: string) {
    const existing = await this.prisma.communicationTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Template not found');
    await this.prisma.communicationTemplate.delete({ where: { id } });
    return { success: true };
  }

  async previewTemplate(organizationId: string, id: string, variables: Record<string, string>) {
    const template = await this.getTemplate(organizationId, id);

    const replace = (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
    };

    return {
      subject: template.subject ? replace(template.subject) : null,
      body: replace(template.body),
    };
  }

  // ── Email Campaigns ──────────────────────────────────────────────

  async listCampaigns(organizationId: string, options: { status?: string; page?: number; limit?: number }) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId };
    if (options.status) where.status = options.status;

    const [data, total] = await Promise.all([
      this.prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.emailCampaign.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async createCampaign(organizationId: string, dto: CreateCampaignDto) {
    return this.prisma.emailCampaign.create({
      data: {
        id: createId(),
        organizationId,
        providerId: dto.providerId ?? null,
        name: dto.name,
        subject: dto.subject,
        fromEmail: dto.fromEmail ?? null,
        fromName: dto.fromName ?? null,
        htmlContent: dto.htmlContent ?? null,
        textContent: dto.textContent ?? null,
        status: CampaignStatus.DRAFT,
        totalRecipients: 0,
        sentCount: 0,
        openCount: 0,
        clickCount: 0,
        bounceCount: 0,
      },
    });
  }

  async getCampaign(organizationId: string, id: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id, organizationId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async updateCampaign(organizationId: string, id: string, dto: UpdateCampaignDto) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT campaigns can be updated');
    }

    return this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.fromEmail !== undefined && { fromEmail: dto.fromEmail }),
        ...(dto.fromName !== undefined && { fromName: dto.fromName }),
        ...(dto.htmlContent !== undefined && { htmlContent: dto.htmlContent }),
        ...(dto.textContent !== undefined && { textContent: dto.textContent }),
        ...(dto.providerId !== undefined && { providerId: dto.providerId }),
      },
    });
  }

  async addRecipients(organizationId: string, campaignId: string, dto: AddRecipientsDto) {
    const campaign = await this.getCampaign(organizationId, campaignId);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Can only add recipients to DRAFT campaigns');
    }

    let emails: string[] = [];

    if (dto.emails && dto.emails.length > 0) {
      emails = dto.emails;
    } else if (dto.segmentId) {
      const members = await this.prisma.customerSegmentMember.findMany({
        where: { segmentId: dto.segmentId },
        include: { customer: { select: { email: true } } },
      });
      emails = members
        .map((m) => m.customer.email)
        .filter((e): e is string => e !== null && e !== undefined && e.length > 0);
    }

    if (emails.length === 0) {
      return { added: 0 };
    }

    // Upsert recipients (avoid duplicates)
    const existingRecipients = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId },
      select: { email: true },
    });
    const existingEmails = new Set(existingRecipients.map((r) => r.email));
    const newEmails = emails.filter((e) => !existingEmails.has(e));

    if (newEmails.length > 0) {
      await this.prisma.emailCampaignRecipient.createMany({
        data: newEmails.map((email) => ({
          id: createId(),
          campaignId,
          email,
          name: null,
          status: 'PENDING',
        })),
      });
    }

    const total = await this.prisma.emailCampaignRecipient.count({ where: { campaignId } });
    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { totalRecipients: total },
    });

    return { added: newEmails.length, total };
  }

  async listRecipients(organizationId: string, campaignId: string, page = 1, limit = 50) {
    await this.getCampaign(organizationId, campaignId);

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.emailCampaignRecipient.findMany({
        where: { campaignId },
        orderBy: { email: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.emailCampaignRecipient.count({ where: { campaignId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async scheduleCampaign(organizationId: string, id: string, scheduledAt: string) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT campaigns can be scheduled');
    }

    return this.prisma.emailCampaign.update({
      where: { id },
      data: { status: CampaignStatus.SCHEDULED, scheduledAt: new Date(scheduledAt) },
    });
  }

  async sendCampaign(organizationId: string, id: string) {
    const campaign = await this.getCampaign(organizationId, id);
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign cannot be sent in current status');
    }

    await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: CampaignStatus.SENDING },
    });

    const recipients = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId: id, status: 'PENDING' },
    });

    let sentCount = 0;

    for (const recipient of recipients) {
      const result = await this.emailService.sendEmail({
        providerId: campaign.providerId ?? undefined,
        organizationId,
        to: recipient.email,
        subject: campaign.subject,
        html: campaign.htmlContent ?? `<p>${campaign.subject}</p>`,
        text: campaign.textContent ?? campaign.subject,
        from: campaign.fromEmail
          ? campaign.fromName
            ? `${campaign.fromName} <${campaign.fromEmail}>`
            : campaign.fromEmail
          : undefined,
      });

      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: result.success ? 'SENT' : 'BOUNCED',
          sentAt: result.success ? new Date() : null,
          bouncedAt: result.success ? null : new Date(),
        },
      });

      if (result.success) sentCount++;
    }

    return this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: CampaignStatus.SENT,
        sentAt: new Date(),
        sentCount,
      },
    });
  }

  async deleteCampaign(organizationId: string, id: string) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT campaigns can be deleted');
    }

    await this.prisma.emailCampaignRecipient.deleteMany({ where: { campaignId: id } });
    await this.prisma.emailCampaign.delete({ where: { id } });
    return { success: true };
  }

  // ── Telegram ─────────────────────────────────────────────────────

  async getTelegramConfig(organizationId: string) {
    const config = await this.prisma.telegramConfig.findUnique({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        chatId: true,
        username: true,
        isActive: true,
        notifyOrders: true,
        notifyInventory: true,
        notifyFinance: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return config;
  }

  async upsertTelegramConfig(organizationId: string, dto: UpsertTelegramConfigDto) {
    const botTokenEncrypted = encrypt(dto.botToken, this.encryptionKey);

    const config = await this.prisma.telegramConfig.upsert({
      where: { organizationId },
      create: {
        id: createId(),
        organizationId,
        botTokenEncrypted,
        chatId: dto.chatId,
        username: dto.username ?? null,
        isActive: dto.isActive ?? true,
        notifyOrders: dto.notifyOrders ?? true,
        notifyInventory: dto.notifyInventory ?? true,
        notifyFinance: dto.notifyFinance ?? true,
      },
      update: {
        botTokenEncrypted,
        chatId: dto.chatId,
        username: dto.username ?? null,
        isActive: dto.isActive ?? true,
        notifyOrders: dto.notifyOrders ?? true,
        notifyInventory: dto.notifyInventory ?? true,
        notifyFinance: dto.notifyFinance ?? true,
      },
      select: {
        id: true,
        organizationId: true,
        chatId: true,
        username: true,
        isActive: true,
        notifyOrders: true,
        notifyInventory: true,
        notifyFinance: true,
      },
    });
    return config;
  }

  async updateTelegramSettings(organizationId: string, dto: UpdateTelegramSettingsDto) {
    const existing = await this.prisma.telegramConfig.findUnique({
      where: { organizationId },
    });
    if (!existing) throw new NotFoundException('Telegram config not found');

    return this.prisma.telegramConfig.update({
      where: { organizationId },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notifyOrders !== undefined && { notifyOrders: dto.notifyOrders }),
        ...(dto.notifyInventory !== undefined && { notifyInventory: dto.notifyInventory }),
        ...(dto.notifyFinance !== undefined && { notifyFinance: dto.notifyFinance }),
      },
      select: {
        id: true,
        chatId: true,
        username: true,
        isActive: true,
        notifyOrders: true,
        notifyInventory: true,
        notifyFinance: true,
      },
    });
  }

  // ── Webhooks ─────────────────────────────────────────────────────

  async listWebhookEndpoints(organizationId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWebhookEndpoint(organizationId: string, dto: CreateWebhookEndpointDto) {
    const secret = randomBytes(32).toString('hex');
    const secretHash = createHash('sha256').update(secret).digest('hex');

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        id: createId(),
        organizationId,
        url: dto.url,
        name: dto.name,
        events: dto.events,
        secretHash,
        isActive: true,
        failureCount: 0,
      },
    });

    return { ...endpoint, secret };
  }

  async updateWebhookEndpoint(organizationId: string, id: string, dto: UpdateWebhookEndpointDto) {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, organizationId, isActive: true },
    });
    if (!existing) throw new NotFoundException('Webhook endpoint not found');

    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.events !== undefined && { events: dto.events }),
      },
    });
  }

  async deleteWebhookEndpoint(organizationId: string, id: string) {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Webhook endpoint not found');

    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  async listWebhookDeliveries(organizationId: string, endpointId: string, page = 1, limit = 50) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where: { endpointId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.webhookDelivery.count({ where: { endpointId } }),
    ]);

    return { data, meta: { total, page, limit } };
  }
}
