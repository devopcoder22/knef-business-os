import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AdvertisingActionSubmitJobData } from '@knef/constants';

/**
 * Action types that are HIGH_RISK and always require approval before submission.
 * This enforcement lives in the service layer and cannot be bypassed — even by AI agents.
 */
const HIGH_RISK_ACTIONS = [
  'CAMPAIGN_ENABLE',
  'CAMPAIGN_CREATE',
  'BUDGET_INCREASE',
  'BID_CHANGE',
  'AD_ENABLE',
] as const;

export interface CreateActionDto {
  provider: string;
  advertisingAccountId: string;
  campaignId?: string;
  actionType: string;
  requestPayload: Record<string, unknown>;
  previousValue?: Record<string, unknown>;
  proposedValue?: Record<string, unknown>;
}

export interface ListActionsQuery {
  status?: string;
  provider?: string;
  skip?: number;
  take?: number;
}

@Injectable()
export class AdvertisingActionService {
  private readonly logger = new Logger(AdvertisingActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listActions(organizationId: string, query: ListActionsQuery = {}) {
    const { status, provider, skip = 0, take = 50 } = query;
    return this.prisma.advertisingAction.findMany({
      where: {
        organizationId,
        ...(status ? { status } : {}),
        ...(provider ? { provider } : {}),
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAction(
    organizationId: string,
    requestedById: string,
    dto: CreateActionDto,
  ) {
    // Verify account belongs to org
    const account = await this.prisma.advertisingAccount.findFirst({
      where: { id: dto.advertisingAccountId, organizationId },
    });
    if (!account) {
      throw new NotFoundException('Advertising account not found or does not belong to this organization.');
    }

    // HIGH_RISK actions always require approval — enforced in service layer, never bypassed
    const isHighRisk = HIGH_RISK_ACTIONS.includes(dto.actionType as (typeof HIGH_RISK_ACTIONS)[number]);
    const status = isHighRisk ? 'APPROVAL_REQUIRED' : 'DRAFT';

    const action = await this.prisma.advertisingAction.create({
      data: {
        organizationId,
        provider: dto.provider,
        advertisingAccountId: dto.advertisingAccountId,
        campaignId: dto.campaignId,
        actionType: dto.actionType,
        status,
        requestPayload: dto.requestPayload as object,
        previousValue: (dto.previousValue as object) ?? null,
        proposedValue: (dto.proposedValue as object) ?? null,
        requestedById,
      },
    });

    await this.audit.log({
      organizationId,
      userId: requestedById,
      action: 'ADVERTISING_ACTION_CREATED',
      entity: 'AdvertisingAction',
      entityId: action.id,
      metadata: {
        actionType: dto.actionType,
        provider: dto.provider,
        status,
        isHighRisk,
      },
    });

    this.logger.log(
      `Created advertising action ${action.id} (${dto.actionType}, status=${status}, org=${organizationId})`,
    );

    return action;
  }

  async approveAction(
    organizationId: string,
    approvedById: string,
    actionId: string,
    queueService: QueueService,
  ) {
    const action = await this.prisma.advertisingAction.findFirst({
      where: { id: actionId, organizationId },
    });
    if (!action) throw new NotFoundException('Advertising action not found.');

    // Approver cannot be the same as the requester
    if (action.requestedById === approvedById) {
      throw new ForbiddenException(
        'The approver cannot be the same user who requested this action.',
      );
    }

    if (action.status !== 'APPROVAL_REQUIRED') {
      throw new BadRequestException(
        `Action is in status ${action.status} and cannot be approved.`,
      );
    }

    const updated = await this.prisma.advertisingAction.update({
      where: { id: actionId },
      data: {
        status: 'APPROVED',
        approvedById,
      },
    });

    // Enqueue submission
    const jobData: AdvertisingActionSubmitJobData = {
      organizationId,
      actionId,
    };
    await queueService.enqueue(QUEUES.ADVERTISING, JOB_TYPES.ADVERTISING_ACTION_SUBMIT, jobData);

    await this.audit.log({
      organizationId,
      userId: approvedById,
      action: 'ADVERTISING_ACTION_APPROVED',
      entity: 'AdvertisingAction',
      entityId: actionId,
      metadata: {
        actionType: action.actionType,
        provider: action.provider,
        previousRequestedById: action.requestedById,
      },
    });

    this.logger.log(`Approved advertising action ${actionId} by user ${approvedById}`);

    return updated;
  }

  async cancelAction(organizationId: string, actionId: string, userId: string) {
    const action = await this.prisma.advertisingAction.findFirst({
      where: { id: actionId, organizationId },
    });
    if (!action) throw new NotFoundException('Advertising action not found.');

    if (['APPLIED', 'CANCELLED', 'REJECTED'].includes(action.status)) {
      throw new BadRequestException(`Action in status ${action.status} cannot be cancelled.`);
    }

    const updated = await this.prisma.advertisingAction.update({
      where: { id: actionId },
      data: { status: 'CANCELLED' },
    });

    await this.audit.log({
      organizationId,
      userId,
      action: 'ADVERTISING_ACTION_CANCELLED',
      entity: 'AdvertisingAction',
      entityId: actionId,
      metadata: { actionType: action.actionType, provider: action.provider },
    });

    return updated;
  }

  /**
   * submitAction — called by the background worker.
   * IMPORTANT: action data is always re-read from DB — the job payload (actionId only)
   * is never trusted for mutation values. This prevents payload tampering.
   */
  async submitAction(actionId: string) {
    // Re-read action from DB — do not trust job payload for mutation values
    const action = await this.prisma.advertisingAction.findUnique({
      where: { id: actionId },
    });
    if (!action) {
      this.logger.warn(`submitAction: action ${actionId} not found in DB`);
      return;
    }

    await this.prisma.advertisingAction.update({
      where: { id: actionId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    // All advertising providers are FOUNDATION ONLY — no live API calls
    const errorMessage =
      `Provider ${action.provider} is not yet active (foundation-only). ` +
      'This action will be retried once provider integration is live.';

    await this.prisma.advertisingAction.update({
      where: { id: actionId },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });

    this.logger.warn(
      `submitAction: action ${actionId} (${action.actionType}, ${action.provider}) ` +
      `failed — provider is foundation-only`,
    );
  }
}
