import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

export const CAMPAIGN_OBJECTIVES = [
  'PRODUCT_LAUNCH',
  'PROMOTION',
  'CLEARANCE',
  'AWARENESS',
  'CUSTOMER_RETENTION',
  'ABANDONED_CART_RECOVERY',
  'SEASONAL_PROMOTION',
  'NEW_ARRIVAL',
  'EVENT',
  'RE_ENGAGEMENT',
  'GENERIC',
] as const;

export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export interface CreateCampaignDto {
  name: string;
  description?: string;
  objective?: CampaignObjective;
  channels?: string[];
  startDate?: string;
  endDate?: string;
  budgetMetadata?: Record<string, unknown>;
  notes?: string;
  targetSegmentId?: string;
}

export interface UpdateCampaignDto {
  name?: string;
  description?: string;
  objective?: CampaignObjective;
  channels?: string[];
  startDate?: string | null;
  endDate?: string | null;
  budgetMetadata?: Record<string, unknown> | null;
  notes?: string | null;
  targetSegmentId?: string | null;
}

type CampaignStatus =
  | 'DRAFT'
  | 'REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

@Injectable()
export class MarketingCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    query: { status?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { organizationId };
    if (query.status) where['status'] = query.status;

    const [items, total] = await Promise.all([
      this.prisma.marketingCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          targetSegment: { select: { id: true, name: true } },
          _count: { select: { contentDrafts: true } },
        },
      }),
      this.prisma.marketingCampaign.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getById(organizationId: string, id: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, organizationId },
      include: {
        targetSegment: { select: { id: true, name: true } },
        contentDrafts: {
          select: { id: true, title: true, status: true, targetChannel: true, scheduledAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { contentDrafts: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Marketing campaign not found');
    return campaign;
  }

  async create(organizationId: string, dto: CreateCampaignDto, userId: string) {
    this.validateDateRange(dto.startDate, dto.endDate);

    const campaign = await this.prisma.marketingCampaign.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        description: dto.description ?? null,
        objective: dto.objective ?? 'GENERIC',
        channels: dto.channels ?? [],
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        budgetMetadata: (dto.budgetMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        notes: dto.notes ?? null,
        targetSegmentId: dto.targetSegmentId ?? null,
        createdById: userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_CREATED',
      entity: 'MarketingCampaign',
      entityId: campaign.id,
      metadata: { name: campaign.name, objective: campaign.objective },
    });

    return campaign;
  }

  async update(organizationId: string, id: string, dto: UpdateCampaignDto, userId: string) {
    const campaign = await this.assertExists(organizationId, id);

    if (!['DRAFT', 'REVIEW', 'PAUSED'].includes(campaign.status as string)) {
      throw new BadRequestException('Only DRAFT, REVIEW, or PAUSED campaigns can be edited');
    }

    this.validateDateRange(
      dto.startDate !== undefined ? (dto.startDate ?? undefined) : campaign.startDate?.toISOString(),
      dto.endDate !== undefined ? (dto.endDate ?? undefined) : campaign.endDate?.toISOString(),
    );

    const data: Prisma.MarketingCampaignUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.objective !== undefined) data.objective = dto.objective;
    if (dto.channels !== undefined) data.channels = dto.channels;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.budgetMetadata !== undefined) {
      data.budgetMetadata = (dto.budgetMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.targetSegmentId !== undefined) {
      data.targetSegment = dto.targetSegmentId
        ? { connect: { id: dto.targetSegmentId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.marketingCampaign.update({ where: { id }, data });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_UPDATED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async submitForReview(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);
    this.assertStatus(campaign.status as CampaignStatus, ['DRAFT']);

    const updated = await this.transition(id, 'REVIEW');

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_SUBMITTED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async approve(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);
    this.assertStatus(campaign.status as CampaignStatus, ['REVIEW']);

    const updated = await this.prisma.marketingCampaign.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_APPROVED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async reject(organizationId: string, id: string, userId: string, reason?: string) {
    const campaign = await this.assertExists(organizationId, id);
    this.assertStatus(campaign.status as CampaignStatus, ['REVIEW']);

    const updated = await this.transition(id, 'DRAFT');

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_REJECTED',
      entity: 'MarketingCampaign',
      entityId: id,
      metadata: { reason },
    });

    return updated;
  }

  async activate(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);
    this.assertStatus(campaign.status as CampaignStatus, ['APPROVED', 'PAUSED']);

    const updated = await this.transition(id, 'ACTIVE');

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_ACTIVATED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async pause(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);
    this.assertStatus(campaign.status as CampaignStatus, ['ACTIVE']);

    const updated = await this.transition(id, 'PAUSED');

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_PAUSED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async complete(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);
    this.assertStatus(campaign.status as CampaignStatus, ['ACTIVE']);

    const updated = await this.transition(id, 'COMPLETED');

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_COMPLETED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async cancel(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);

    if ((campaign.status as string) === 'CANCELLED') {
      throw new BadRequestException('Campaign is already cancelled');
    }

    const updated = await this.transition(id, 'CANCELLED');

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_CANCELLED',
      entity: 'MarketingCampaign',
      entityId: id,
    });

    return updated;
  }

  async duplicate(organizationId: string, id: string, userId: string) {
    const campaign = await this.assertExists(organizationId, id);

    const copy = await this.prisma.marketingCampaign.create({
      data: {
        id: createId(),
        organizationId,
        name: `${campaign.name} (copy)`,
        description: campaign.description,
        objective: campaign.objective,
        channels: campaign.channels,
        budgetMetadata: (campaign.budgetMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        notes: campaign.notes,
        targetSegmentId: campaign.targetSegmentId,
        createdById: userId,
      },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'MARKETING_CAMPAIGN_DUPLICATED',
      entity: 'MarketingCampaign',
      entityId: copy.id,
      metadata: { sourceId: id },
    });

    return copy;
  }

  async getDashboardSummary(organizationId: string) {
    const [active, draft, scheduled, review] = await Promise.all([
      this.prisma.marketingCampaign.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.marketingCampaign.count({ where: { organizationId, status: 'DRAFT' } }),
      this.prisma.marketingCampaign.count({ where: { organizationId, status: 'SCHEDULED' } }),
      this.prisma.marketingCampaign.count({ where: { organizationId, status: 'REVIEW' } }),
    ]);
    return { active, draft, scheduled, awaitingReview: review };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async assertExists(organizationId: string, id: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, organizationId },
    });
    if (!campaign) throw new NotFoundException('Marketing campaign not found');
    return campaign;
  }

  private assertStatus(current: CampaignStatus, allowed: CampaignStatus[]) {
    if (!allowed.includes(current)) {
      throw new BadRequestException(
        `Campaign must be in ${allowed.join(' or ')} status (current: ${current})`,
      );
    }
  }

  private transition(id: string, status: CampaignStatus) {
    return this.prisma.marketingCampaign.update({ where: { id }, data: { status } });
  }

  private validateDateRange(startDate?: string, endDate?: string) {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('End date must be after start date');
    }
  }
}
