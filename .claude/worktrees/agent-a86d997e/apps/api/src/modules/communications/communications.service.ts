import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { createHash, randomBytes } from 'crypto';
import { CampaignStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { EmailService } from './email.service';
import { AuditService } from '../audit/audit.service';
import { EmailSubscriptionService } from './email-subscription.service';
import { EmailComplianceService } from './email-compliance.service';
import { QueueService } from '../../common/services/queue.service';
import { encrypt } from '@knef/utils';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOB_TYPES, type CampaignEmailJobData } from '@knef/constants';
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
    private readonly audit: AuditService,
    private readonly subscriptionService: EmailSubscriptionService,
    private readonly complianceService: EmailComplianceService,
    private readonly queue: QueueService,
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

  async createCampaign(organizationId: string, userId: string, dto: CreateCampaignDto) {
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        id: createId(),
        organizationId,
        providerId: dto.providerId ?? null,
        name: dto.name,
        subject: dto.subject,
        previewText: dto.previewText ?? null,
        fromEmail: dto.fromEmail ?? null,
        fromName: dto.fromName ?? null,
        replyTo: dto.replyTo ?? null,
        htmlContent: dto.htmlContent ?? null,
        textContent: dto.textContent ?? null,
        campaignType: dto.campaignType ?? 'MARKETING',
        subscriptionList: dto.subscriptionList ?? 'GENERAL_MARKETING',
        status: CampaignStatus.DRAFT,
        createdById: userId,
        totalRecipients: 0,
        sentCount: 0,
        openCount: 0,
        clickCount: 0,
        bounceCount: 0,
      },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_CREATED',
      entity: 'EmailCampaign', entityId: campaign.id,
      metadata: { name: dto.name, campaignType: dto.campaignType ?? 'MARKETING' },
    }).catch(() => {});

    return campaign;
  }

  async getCampaign(organizationId: string, id: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id, organizationId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async updateCampaign(organizationId: string, id: string, userId: string, dto: UpdateCampaignDto) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== 'REVIEW' as CampaignStatus) {
      throw new BadRequestException('Only DRAFT or REVIEW campaigns can be updated');
    }

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.previewText !== undefined && { previewText: dto.previewText }),
        ...(dto.fromEmail !== undefined && { fromEmail: dto.fromEmail }),
        ...(dto.fromName !== undefined && { fromName: dto.fromName }),
        ...(dto.replyTo !== undefined && { replyTo: dto.replyTo }),
        ...(dto.htmlContent !== undefined && { htmlContent: dto.htmlContent }),
        ...(dto.textContent !== undefined && { textContent: dto.textContent }),
        ...(dto.providerId !== undefined && { providerId: dto.providerId }),
        ...(dto.subscriptionList !== undefined && { subscriptionList: dto.subscriptionList }),
      },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_UPDATED',
      entity: 'EmailCampaign', entityId: id,
    }).catch(() => {});

    return updated;
  }

  async submitCampaignForReview(organizationId: string, id: string, userId: string) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT campaigns can be submitted for review');
    }
    if (!campaign.subject || !campaign.htmlContent) {
      throw new BadRequestException('Campaign must have subject and content before review');
    }
    const recipientCount = await this.prisma.emailCampaignRecipient.count({ where: { campaignId: id } });
    if (recipientCount === 0) {
      throw new BadRequestException('Campaign must have recipients before review');
    }

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: 'REVIEW' as CampaignStatus },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_SUBMITTED_FOR_REVIEW',
      entity: 'EmailCampaign', entityId: id,
    }).catch(() => {});

    return updated;
  }

  async approveCampaign(organizationId: string, id: string, userId: string, note?: string) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== ('REVIEW' as CampaignStatus)) {
      throw new BadRequestException('Only campaigns in REVIEW status can be approved');
    }

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: 'APPROVED' as CampaignStatus,
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_APPROVED',
      entity: 'EmailCampaign', entityId: id,
      metadata: { note },
    }).catch(() => {});

    return updated;
  }

  async rejectCampaign(organizationId: string, id: string, userId: string, reason: string) {
    const campaign = await this.getCampaign(organizationId, id);
    if (campaign.status !== ('REVIEW' as CampaignStatus)) {
      throw new BadRequestException('Only campaigns in REVIEW status can be rejected');
    }

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: CampaignStatus.DRAFT, reviewedBy: userId, reviewedAt: new Date() },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_REJECTED',
      entity: 'EmailCampaign', entityId: id,
      metadata: { reason },
    }).catch(() => {});

    return updated;
  }

  async cancelCampaign(organizationId: string, id: string, userId: string) {
    const campaign = await this.getCampaign(organizationId, id);
    const cancellable: string[] = [
      CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, 'REVIEW', 'APPROVED',
    ];
    if (!cancellable.includes(campaign.status as string)) {
      throw new BadRequestException('Campaign cannot be cancelled in its current status');
    }

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: CampaignStatus.CANCELLED },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_CANCELLED',
      entity: 'EmailCampaign', entityId: id,
    }).catch(() => {});

    return updated;
  }

  async getCampaignCompliance(organizationId: string, id: string) {
    return this.complianceService.runChecks(organizationId, id);
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

  async scheduleCampaign(organizationId: string, id: string, userId: string, scheduledAt: string) {
    const campaign = await this.getCampaign(organizationId, id);
    const schedulable: string[] = [CampaignStatus.DRAFT, 'APPROVED'];
    if (!schedulable.includes(campaign.status as string)) {
      throw new BadRequestException('Only DRAFT or APPROVED campaigns can be scheduled');
    }

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: { status: CampaignStatus.SCHEDULED, scheduledAt: new Date(scheduledAt) },
    });

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_SCHEDULED',
      entity: 'EmailCampaign', entityId: id,
      metadata: { scheduledAt },
    }).catch(() => {});

    return updated;
  }

  async sendCampaign(organizationId: string, id: string, userId: string) {
    const campaign = await this.getCampaign(organizationId, id);
    const sendable: string[] = [
      CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, 'APPROVED',
    ];
    if (!sendable.includes(campaign.status as string)) {
      throw new BadRequestException('Campaign cannot be sent in current status');
    }

    const isMarketing = campaign.campaignType !== 'TRANSACTIONAL';

    // Re-check compliance before send
    if (isMarketing) {
      const compliance = await this.complianceService.runChecks(organizationId, id);
      if (!compliance.allPassed) {
        const failed = compliance.checks.filter((c) => !c.passed).map((c) => c.label).join(', ');
        throw new BadRequestException(`Campaign failed compliance checks: ${failed}`);
      }
    }

    const allRecipients = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId: id, status: 'PENDING' },
    });

    // Filter suppressed at send time
    let eligibleRecipients = allRecipients;
    let suppressedCount = 0;
    if (isMarketing) {
      const filterResult = await this.subscriptionService.filterEligibleRecipients(
        allRecipients.map((r) => r.email),
        organizationId,
        campaign.subscriptionList ?? 'GENERAL_MARKETING',
      );
      const eligibleSet = new Set(filterResult.eligible);
      eligibleRecipients = allRecipients.filter((r) => eligibleSet.has(r.email));
      suppressedCount = filterResult.suppressed.length;

      const suppressedIds = allRecipients
        .filter((r) => !eligibleSet.has(r.email))
        .map((r) => r.id);
      if (suppressedIds.length > 0) {
        await this.prisma.emailCampaignRecipient.updateMany({
          where: { id: { in: suppressedIds } },
          data: { status: 'SUPPRESSED' },
        });
      }
    }

    // Build per-recipient email jobs
    const fromAddress = campaign.fromEmail
      ? campaign.fromName
        ? `${campaign.fromName} <${campaign.fromEmail}>`
        : campaign.fromEmail
      : undefined;

    const jobs: CampaignEmailJobData[] = eligibleRecipients.map((recipient) => {
      const unsubUrl = this.subscriptionService.generateUnsubscribeToken(
        recipient.email, organizationId, campaign.subscriptionList ?? 'GENERAL_MARKETING',
      );
      const html = (campaign.htmlContent ?? `<p>${campaign.subject}</p>`)
        .replace('{{unsubscribe_url}}', `/unsubscribe/${unsubUrl}`)
        .replace('{{preview_text}}', campaign.previewText ?? '');
      return {
        campaignId: id,
        recipientId: recipient.id,
        organizationId,
        to: recipient.email,
        subject: campaign.subject,
        html,
        text: campaign.textContent ?? campaign.subject,
        from: fromAddress,
        providerId: campaign.providerId ?? undefined,
      };
    });

    // Mark campaign SENDING and record expected counts before enqueuing
    const updatedCampaign = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: CampaignStatus.SENDING,
        eligibleCount: eligibleRecipients.length,
        suppressedCount,
      },
    });

    // Enqueue all recipient jobs atomically
    await this.queue.enqueueBulk(
      QUEUES.EMAIL,
      JOB_TYPES.SEND_CAMPAIGN_EMAIL,
      jobs,
    );

    await this.audit.log({
      organizationId, userId, action: 'CAMPAIGN_SENT',
      entity: 'EmailCampaign', entityId: id,
      metadata: {
        queued: eligibleRecipients.length,
        suppressedCount,
        totalRecipients: allRecipients.length,
      },
    }).catch(() => {});

    return updatedCampaign;
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
