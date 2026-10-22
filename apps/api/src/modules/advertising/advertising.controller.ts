import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import { AdvertisingAccountService } from './advertising-account.service';
import { AdvertisingCampaignService } from './advertising-campaign.service';
import { AdvertisingMetricsService } from './advertising-metrics.service';
import { AdvertisingActionService } from './advertising-action.service';
import { QueueService } from '../../common/services/queue.service';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
} from 'class-validator';

class LinkAccountDto {
  @IsString() connectionId!: string;
  @IsString() provider!: string;
  @IsString() providerAccountId!: string;
  @IsString() displayName!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() timezone?: string;
}

class UpdateAccountDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() displayName?: string;
}

class CreateActionDto {
  @IsString() provider!: string;
  @IsString() advertisingAccountId!: string;
  @IsOptional() @IsString() campaignId?: string;
  @IsString() actionType!: string;
  @IsObject() requestPayload!: Record<string, unknown>;
  @IsOptional() @IsObject() previousValue?: Record<string, unknown>;
  @IsOptional() @IsObject() proposedValue?: Record<string, unknown>;
}

interface AuthUser {
  userId: string;
  sub: string;
  organizationId: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('advertising')
export class AdvertisingController {
  constructor(
    private readonly accountService: AdvertisingAccountService,
    private readonly campaignService: AdvertisingCampaignService,
    private readonly metricsService: AdvertisingMetricsService,
    private readonly actionService: AdvertisingActionService,
    private readonly queueService: QueueService,
  ) {}

  // ── Accounts ─────────────────────────────────────────────────────────────────

  @Permissions(PERMISSIONS.ADVERTISING.VIEW)
  @Get('accounts')
  listAccounts(@Req() req: { user: AuthUser }) {
    return this.accountService.listAccounts(req.user.organizationId);
  }

  @Permissions(PERMISSIONS.ADVERTISING.MANAGE_ACCOUNTS)
  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  linkAccount(@Req() req: { user: AuthUser }, @Body() dto: LinkAccountDto) {
    const userId = req.user.userId ?? req.user.sub;
    return this.accountService.linkAccount(req.user.organizationId, userId, dto);
  }

  @Permissions(PERMISSIONS.ADVERTISING.VIEW)
  @Get('accounts/:id')
  getAccount(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.accountService.getAccount(req.user.organizationId, id);
  }

  @Permissions(PERMISSIONS.ADVERTISING.MANAGE_ACCOUNTS)
  @Patch('accounts/:id')
  updateAccount(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.updateAccount(req.user.organizationId, id, dto);
  }

  @Permissions(PERMISSIONS.ADVERTISING.MANAGE_ACCOUNTS)
  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAccount(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const userId = req.user.userId ?? req.user.sub;
    return this.accountService.removeAccount(req.user.organizationId, id, userId);
  }

  @Permissions(PERMISSIONS.ADVERTISING.MANAGE_ACCOUNTS)
  @Post('accounts/:id/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerSync(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.accountService.triggerSync(req.user.organizationId, id, this.queueService);
  }

  // ── Campaigns ────────────────────────────────────────────────────────────────

  @Permissions(PERMISSIONS.ADVERTISING.VIEW)
  @Get('campaigns')
  listCampaigns(
    @Req() req: { user: AuthUser },
    @Query('accountId') accountId?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.campaignService.listCampaigns(req.user.organizationId, {
      accountId,
      provider,
      status,
      skip: skip !== undefined ? parseInt(skip, 10) : undefined,
      take: take !== undefined ? parseInt(take, 10) : undefined,
    });
  }

  @Permissions(PERMISSIONS.ADVERTISING.VIEW)
  @Get('campaigns/:id')
  getCampaign(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.campaignService.getCampaign(req.user.organizationId, id);
  }

  // ── Metrics ──────────────────────────────────────────────────────────────────

  @Permissions(PERMISSIONS.ADVERTISING.VIEW_ANALYTICS)
  @Get('metrics/summary')
  getMetricsSummary(
    @Req() req: { user: AuthUser },
    @Query('provider') provider?: string,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.metricsService.querySummary(req.user.organizationId, {
      provider,
      accountId,
      from: from ?? new Date(Date.now() - 30 * 86400000).toISOString(),
      to: to ?? new Date().toISOString(),
    });
  }

  @Permissions(PERMISSIONS.ADVERTISING.VIEW_ANALYTICS)
  @Get('metrics')
  getMetricsTimeSeries(
    @Req() req: { user: AuthUser },
    @Query('provider') provider?: string,
    @Query('accountId') accountId?: string,
    @Query('campaignId') campaignId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'date' | 'campaign' | 'account',
  ) {
    return this.metricsService.queryTimeSeries(req.user.organizationId, {
      provider,
      accountId,
      campaignId,
      from: from ?? new Date(Date.now() - 30 * 86400000).toISOString(),
      to: to ?? new Date().toISOString(),
      groupBy: groupBy ?? 'date',
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  @Permissions(PERMISSIONS.ADVERTISING.VIEW)
  @Get('actions')
  listActions(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.actionService.listActions(req.user.organizationId, {
      status,
      provider,
      skip: skip !== undefined ? parseInt(skip, 10) : undefined,
      take: take !== undefined ? parseInt(take, 10) : undefined,
    });
  }

  @Permissions(PERMISSIONS.ADVERTISING.REQUEST_ACTION)
  @Post('actions')
  @HttpCode(HttpStatus.CREATED)
  createAction(@Req() req: { user: AuthUser }, @Body() dto: CreateActionDto) {
    const userId = req.user.userId ?? req.user.sub;
    return this.actionService.createAction(req.user.organizationId, userId, dto);
  }

  @Permissions(PERMISSIONS.ADVERTISING.APPROVE_ACTION)
  @Post('actions/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveAction(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const userId = req.user.userId ?? req.user.sub;
    return this.actionService.approveAction(
      req.user.organizationId,
      userId,
      id,
      this.queueService,
    );
  }

  @Permissions(PERMISSIONS.ADVERTISING.REQUEST_ACTION)
  @Post('actions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelAction(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    const userId = req.user.userId ?? req.user.sub;
    return this.actionService.cancelAction(req.user.organizationId, id, userId);
  }
}
