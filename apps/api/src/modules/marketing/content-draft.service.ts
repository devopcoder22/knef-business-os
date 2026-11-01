import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

export const VALID_CHANNELS = [
  'EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'WEB_PUSH', 'SOCIAL',
  'STOREFRONT', 'IN_APP',
] as const;

export const VALID_PLATFORMS = [
  'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SNAPCHAT', 'WHATSAPP', 'SMS',
  'EMAIL', 'WEB_PUSH', 'STOREFRONT', 'TELEGRAM',
] as const;

type DraftStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface CreateDraftDto {
  campaignId?: string;
  title: string;
  body?: string;
  callToAction?: string;
  destinationUrl?: string;
  targetChannel?: string;
  scheduledAt?: string;
  timezone?: string;
}

export interface UpdateDraftDto {
  title?: string;
  body?: string;
  callToAction?: string;
  destinationUrl?: string;
  targetChannel?: string;
  timezone?: string;
}

export interface ScheduleDraftDto {
  scheduledAt: string;
  timezone?: string;
  targetAccountIds: string[]; // required, min 1 account
}

export interface CreateVariantDto {
  platform: string;
  body?: string;
  callToAction?: string;
  mediaAssetIds?: string[];
}

export interface UpdateVariantDto {
  body?: string;
  callToAction?: string;
  mediaAssetIds?: string[];
}

@Injectable()
export class ContentDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    query: { campaignId?: string; status?: string; channel?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { organizationId };
    if (query.campaignId) where['campaignId'] = query.campaignId;
    if (query.status) where['status'] = query.status;
    if (query.channel) where['targetChannel'] = query.channel;

    const [items, total] = await Promise.all([
      this.prisma.contentDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          campaign: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
        },
      }),
      this.prisma.contentDraft.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getById(organizationId: string, id: string) {
    const draft = await this.prisma.contentDraft.findFirst({
      where: { id, organizationId },
      include: {
        campaign: { select: { id: true, name: true } },
        variants: { orderBy: { platform: 'asc' } },
      },
    });
    if (!draft) throw new NotFoundException('Content draft not found');
    return draft;
  }

  async create(organizationId: string, dto: CreateDraftDto, userId: string) {
    if (dto.targetChannel && !VALID_CHANNELS.includes(dto.targetChannel as typeof VALID_CHANNELS[number])) {
      throw new BadRequestException(`Invalid channel: ${dto.targetChannel}`);
    }

    if (dto.campaignId) {
      const campaign = await this.prisma.marketingCampaign.findFirst({
        where: { id: dto.campaignId, organizationId },
      });
      if (!campaign) throw new NotFoundException('Marketing campaign not found');
    }

    const draft = await this.prisma.contentDraft.create({
      data: {
        id: createId(),
        organizationId,
        campaignId: dto.campaignId ?? null,
        title: dto.title,
        body: dto.body ?? null,
        callToAction: dto.callToAction ?? null,
        destinationUrl: dto.destinationUrl ?? null,
        targetChannel: dto.targetChannel ?? 'SOCIAL',
        ownerId: userId,
        timezone: dto.timezone ?? 'UTC',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: 'DRAFT',
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_CREATED',
      entity: 'ContentDraft',
      entityId: draft.id,
      metadata: { title: draft.title, targetChannel: draft.targetChannel },
    });

    return draft;
  }

  async update(organizationId: string, id: string, dto: UpdateDraftDto, userId: string) {
    const draft = await this.assertExists(organizationId, id);
    this.assertEditable(draft.status as DraftStatus);

    if (dto.targetChannel && !VALID_CHANNELS.includes(dto.targetChannel as typeof VALID_CHANNELS[number])) {
      throw new BadRequestException(`Invalid channel: ${dto.targetChannel}`);
    }

    const updated = await this.prisma.contentDraft.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.callToAction !== undefined && { callToAction: dto.callToAction }),
        ...(dto.destinationUrl !== undefined && { destinationUrl: dto.destinationUrl }),
        ...(dto.targetChannel !== undefined && { targetChannel: dto.targetChannel }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_UPDATED',
      entity: 'ContentDraft',
      entityId: id,
    });

    return updated;
  }

  async submitForReview(organizationId: string, id: string, userId: string) {
    const draft = await this.assertExists(organizationId, id);
    this.assertStatus(draft.status as DraftStatus, ['DRAFT']);

    const updated = await this.prisma.contentDraft.update({
      where: { id },
      data: { status: 'REVIEW' },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_SUBMITTED',
      entity: 'ContentDraft',
      entityId: id,
    });

    return updated;
  }

  async approve(organizationId: string, id: string, userId: string) {
    const draft = await this.assertExists(organizationId, id);
    this.assertStatus(draft.status as DraftStatus, ['REVIEW']);

    const updated = await this.prisma.contentDraft.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_APPROVED',
      entity: 'ContentDraft',
      entityId: id,
    });

    return updated;
  }

  async reject(organizationId: string, id: string, userId: string) {
    const draft = await this.assertExists(organizationId, id);
    this.assertStatus(draft.status as DraftStatus, ['REVIEW']);

    const updated = await this.prisma.contentDraft.update({
      where: { id },
      data: { status: 'DRAFT' },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_REJECTED',
      entity: 'ContentDraft',
      entityId: id,
    });

    return updated;
  }

  async schedule(organizationId: string, id: string, dto: ScheduleDraftDto, userId: string) {
    const draft = await this.assertExists(organizationId, id);
    this.assertStatus(draft.status as DraftStatus, ['APPROVED']);

    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }

    const rawIds: unknown = dto.targetAccountIds;
    if (!Array.isArray(rawIds) || (rawIds as unknown[]).length === 0) {
      throw new BadRequestException('At least one target social account must be selected');
    }
    const targetAccountIds = rawIds as string[];

    // Validate all target accounts belong to this org and are active
    const accounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: targetAccountIds }, organizationId, isActive: true },
      include: {
        connection: { select: { status: true } },
      },
    });

    if (accounts.length !== targetAccountIds.length) {
      const foundIds = new Set(accounts.map((a) => a.id));
      const missing = targetAccountIds.filter((aid) => !foundIds.has(aid));
      throw new BadRequestException(
        `Social account(s) not found or inactive: ${missing.join(', ')}`,
      );
    }

    // Fetch available variants for this draft
    const variants = await this.prisma.contentVariant.findMany({
      where: { draftId: id },
      select: { id: true, platform: true },
    });
    const variantByPlatform = new Map(variants.map((v) => [v.platform, v.id]));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Remove old targets (clean slate on re-schedule)
      await tx.socialPublicationTarget.deleteMany({ where: { draftId: id } });

      // Create new targets
      const now = new Date();
      await tx.socialPublicationTarget.createMany({
        data: accounts.map((account) => ({
          id: createId(),
          organizationId,
          draftId: id,
          socialAccountId: account.id,
          provider: account.provider,
          variantId: variantByPlatform.get(account.provider) ?? null,
          isCancelled: false,
          createdBy: userId,
          createdAt: now,
        })),
      });

      return tx.contentDraft.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          scheduledAt,
          timezone: dto.timezone ?? draft.timezone,
        },
      });
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_SCHEDULED',
      entity: 'ContentDraft',
      entityId: id,
      metadata: {
        scheduledAt: dto.scheduledAt,
        targetAccountIds,
        targetCount: targetAccountIds.length,
      },
    });

    return updated;
  }

  async cancelSchedule(organizationId: string, id: string, userId: string) {
    const draft = await this.assertExists(organizationId, id);
    this.assertStatus(draft.status as DraftStatus, ['SCHEDULED']);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.socialPublicationTarget.updateMany({
        where: { draftId: id, isCancelled: false },
        data: { isCancelled: true },
      });
      return tx.contentDraft.update({
        where: { id },
        data: { status: 'APPROVED', scheduledAt: null },
      });
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_SCHEDULE_CANCELLED',
      entity: 'ContentDraft',
      entityId: id,
    });

    return updated;
  }

  async getPublicationTargets(organizationId: string, draftId: string) {
    await this.assertExists(organizationId, draftId);
    return this.prisma.socialPublicationTarget.findMany({
      where: { draftId, organizationId, isCancelled: false },
      include: {
        socialAccount: {
          select: {
            id: true,
            provider: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            approvalStatus: true,
            capabilities: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async archive(organizationId: string, id: string, userId: string) {
    await this.assertExists(organizationId, id);

    const updated = await this.prisma.contentDraft.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_DRAFT_ARCHIVED',
      entity: 'ContentDraft',
      entityId: id,
    });

    return updated;
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(organizationId: string, draftId: string) {
    await this.assertExists(organizationId, draftId);
    return this.prisma.contentVariant.findMany({
      where: { draftId },
      orderBy: { platform: 'asc' },
    });
  }

  async createVariant(organizationId: string, draftId: string, dto: CreateVariantDto, userId: string) {
    await this.assertExists(organizationId, draftId);

    if (!VALID_PLATFORMS.includes(dto.platform as typeof VALID_PLATFORMS[number])) {
      throw new BadRequestException(`Invalid platform: ${dto.platform}`);
    }

    const existing = await this.prisma.contentVariant.findFirst({
      where: { draftId, platform: dto.platform },
    });
    if (existing) {
      throw new BadRequestException(`Variant for platform ${dto.platform} already exists`);
    }

    const variant = await this.prisma.contentVariant.create({
      data: {
        id: createId(),
        draftId,
        platform: dto.platform,
        body: dto.body ?? null,
        callToAction: dto.callToAction ?? null,
        mediaAssetIds: dto.mediaAssetIds ?? [],
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_VARIANT_CREATED',
      entity: 'ContentVariant',
      entityId: variant.id,
      metadata: { draftId, platform: dto.platform },
    });

    return variant;
  }

  async updateVariant(
    organizationId: string,
    draftId: string,
    variantId: string,
    dto: UpdateVariantDto,
    userId: string,
  ) {
    await this.assertExists(organizationId, draftId);

    const variant = await this.prisma.contentVariant.findFirst({
      where: { id: variantId, draftId },
    });
    if (!variant) throw new NotFoundException('Content variant not found');

    const updated = await this.prisma.contentVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.callToAction !== undefined && { callToAction: dto.callToAction }),
        ...(dto.mediaAssetIds !== undefined && { mediaAssetIds: dto.mediaAssetIds }),
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_VARIANT_UPDATED',
      entity: 'ContentVariant',
      entityId: variantId,
    });

    return updated;
  }

  async deleteVariant(organizationId: string, draftId: string, variantId: string, userId: string) {
    await this.assertExists(organizationId, draftId);

    const variant = await this.prisma.contentVariant.findFirst({
      where: { id: variantId, draftId },
    });
    if (!variant) throw new NotFoundException('Content variant not found');

    await this.prisma.contentVariant.delete({ where: { id: variantId } });

    await this.audit.log({
      organizationId,
      userId,
      action: 'CONTENT_VARIANT_DELETED',
      entity: 'ContentVariant',
      entityId: variantId,
    });
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  async getCalendar(organizationId: string, query: { from?: string; to?: string } = {}) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.contentDraft.findMany({
      where: {
        organizationId,
        scheduledAt: { gte: from, lte: to },
        status: { in: ['SCHEDULED', 'PUBLISHED'] },
      },
      include: {
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  // ── Dashboard summary ─────────────────────────────────────────────────────

  async getDashboardSummary(organizationId: string) {
    const [drafts, awaitingApproval, scheduled, upcoming] = await Promise.all([
      this.prisma.contentDraft.count({ where: { organizationId, status: 'DRAFT' } }),
      this.prisma.contentDraft.count({ where: { organizationId, status: 'REVIEW' } }),
      this.prisma.contentDraft.count({ where: { organizationId, status: 'SCHEDULED' } }),
      this.prisma.contentDraft.count({
        where: {
          organizationId,
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return { drafts, awaitingApproval, scheduled, upcomingInWeek: upcoming };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async assertExists(organizationId: string, id: string) {
    const draft = await this.prisma.contentDraft.findFirst({
      where: { id, organizationId },
    });
    if (!draft) throw new NotFoundException('Content draft not found');
    return draft;
  }

  private assertStatus(current: DraftStatus, allowed: DraftStatus[]) {
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `Draft must be in ${allowed.join(' or ')} status (current: ${current})`,
      );
    }
  }

  private assertEditable(status: DraftStatus) {
    if (!['DRAFT', 'REVIEW'].includes(status)) {
      throw new BadRequestException('Only DRAFT or REVIEW content can be edited');
    }
  }
}
