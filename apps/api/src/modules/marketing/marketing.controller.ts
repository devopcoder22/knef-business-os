import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MarketingCampaignService } from './marketing-campaign.service';
import { ContentDraftService } from './content-draft.service';
import { MarketingAudienceService } from './marketing-audience.service';
import { MediaAssetService } from './media-asset.service';
import type { CommunicationChannel } from '../communications/channel-preference.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

// ── Campaigns ─────────────────────────────────────────────────────────────────

@ApiTags('marketing')
@ApiBearerAuth('JWT')
@Controller('marketing/campaigns')
export class MarketingCampaignsController {
  constructor(private readonly campaigns: MarketingCampaignService) {}

  @Get()
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'List marketing campaigns' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.campaigns.list(user.organizationId, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('summary')
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'Marketing dashboard summary' })
  summary(@CurrentUser() user: AuthUser) {
    return this.campaigns.getDashboardSummary(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @ApiOperation({ summary: 'Create a marketing campaign' })
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.campaigns.create(user.organizationId, body as never, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'Get a marketing campaign by ID' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.getById(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @ApiOperation({ summary: 'Update a marketing campaign' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.campaigns.update(user.organizationId, id, body as never, user.id);
  }

  @Post(':id/submit-review')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit campaign for review' })
  submitForReview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.submitForReview(user.organizationId, id, user.id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.MARKETING.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a campaign' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.approve(user.organizationId, id, user.id);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.MARKETING.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a campaign (returns to DRAFT)' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.campaigns.reject(user.organizationId, id, user.id, reason);
  }

  @Post(':id/activate')
  @Permissions(PERMISSIONS.MARKETING.PUBLISH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a campaign' })
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.activate(user.organizationId, id, user.id);
  }

  @Post(':id/pause')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an active campaign' })
  pause(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.pause(user.organizationId, id, user.id);
  }

  @Post(':id/complete')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark campaign as completed' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.complete(user.organizationId, id, user.id);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a campaign' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.cancel(user.organizationId, id, user.id);
  }

  @Post(':id/duplicate')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @ApiOperation({ summary: 'Duplicate a campaign' })
  duplicate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.duplicate(user.organizationId, id, user.id);
  }
}

// ── Content Drafts ────────────────────────────────────────────────────────────

@ApiTags('marketing')
@ApiBearerAuth('JWT')
@Controller('marketing/content')
export class MarketingContentController {
  constructor(private readonly drafts: ContentDraftService) {}

  @Get()
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'List content drafts' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.drafts.list(user.organizationId, {
      campaignId,
      status,
      channel,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post()
  @Permissions(PERMISSIONS.MARKETING.CONTENT_CREATE)
  @ApiOperation({ summary: 'Create a content draft' })
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.drafts.create(user.organizationId, body as never, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'Get a content draft with variants' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.getById(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'Update a content draft' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.drafts.update(user.organizationId, id, body as never, user.id);
  }

  @Post(':id/submit-review')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit draft for review' })
  submitForReview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.submitForReview(user.organizationId, id, user.id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.MARKETING.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a draft' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.approve(user.organizationId, id, user.id);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.MARKETING.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a draft (returns to DRAFT)' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.reject(user.organizationId, id, user.id);
  }

  @Post(':id/schedule')
  @Permissions(PERMISSIONS.MARKETING.PUBLISH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule an approved draft' })
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.drafts.schedule(user.organizationId, id, body as never, user.id);
  }

  @Post(':id/cancel-schedule')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled draft' })
  cancelSchedule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.cancelSchedule(user.organizationId, id, user.id);
  }

  @Post(':id/archive')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a draft' })
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.archive(user.organizationId, id, user.id);
  }

  @Get(':id/variants')
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'List variants for a draft' })
  listVariants(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drafts.listVariants(user.organizationId, id);
  }

  @Post(':id/variants')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'Create a platform variant for a draft' })
  createVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.drafts.createVariant(user.organizationId, id, body as never, user.id);
  }

  @Patch(':id/variants/:variantId')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'Update a platform variant' })
  updateVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.drafts.updateVariant(user.organizationId, id, variantId, body as never, user.id);
  }

  @Delete(':id/variants/:variantId')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a platform variant' })
  deleteVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.drafts.deleteVariant(user.organizationId, id, variantId, user.id);
  }
}

// ── Content Calendar ──────────────────────────────────────────────────────────

@ApiTags('marketing')
@ApiBearerAuth('JWT')
@Controller('marketing/calendar')
export class MarketingCalendarController {
  constructor(private readonly drafts: ContentDraftService) {}

  @Get()
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'Get content calendar (scheduled drafts in date range)' })
  getCalendar(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.drafts.getCalendar(user.organizationId, { from, to });
  }
}

// ── Audiences ─────────────────────────────────────────────────────────────────

@ApiTags('marketing')
@ApiBearerAuth('JWT')
@Controller('marketing/audiences')
export class MarketingAudiencesController {
  constructor(private readonly audience: MarketingAudienceService) {}

  @Get()
  @Permissions(PERMISSIONS.MARKETING.AUDIENCE_VIEW)
  @ApiOperation({ summary: 'List audience segments' })
  listSegments(@CurrentUser() user: AuthUser) {
    return this.audience.listSegments(user.organizationId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.MARKETING.AUDIENCE_VIEW)
  @ApiOperation({ summary: 'Get a segment' })
  getSegment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.audience.getSegment(user.organizationId, id);
  }

  @Get(':id/reach')
  @Permissions(PERMISSIONS.MARKETING.AUDIENCE_VIEW)
  @ApiOperation({ summary: 'Estimate consented reach for a segment on a channel' })
  estimateReach(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('channel') channel: string,
  ) {
    return this.audience.estimateReach(user.organizationId, id, (channel ?? 'EMAIL') as CommunicationChannel);
  }
}

// ── Media Assets ──────────────────────────────────────────────────────────────

@ApiTags('marketing')
@ApiBearerAuth('JWT')
@Controller('marketing/media')
export class MarketingMediaController {
  constructor(private readonly media: MediaAssetService) {}

  @Get()
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'List media assets' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.media.list(user.organizationId, {
      category,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post()
  @Permissions(PERMISSIONS.MARKETING.CONTENT_CREATE)
  @ApiOperation({ summary: 'Register an uploaded media asset' })
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.media.create(user.organizationId, body as never, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'Get a media asset' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.getById(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'Update media asset metadata' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.media.update(user.organizationId, id, body as never);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.MARKETING.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete (soft) a media asset' })
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.delete(user.organizationId, id);
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

@ApiTags('marketing')
@ApiBearerAuth('JWT')
@Controller('marketing/dashboard')
export class MarketingDashboardController {
  constructor(
    private readonly campaigns: MarketingCampaignService,
    private readonly drafts: ContentDraftService,
    private readonly audience: MarketingAudienceService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.MARKETING.VIEW)
  @ApiOperation({ summary: 'Get marketing dashboard summary' })
  async getSummary(@CurrentUser() user: AuthUser) {
    const [campaignStats, contentStats, audienceCount] = await Promise.all([
      this.campaigns.getDashboardSummary(user.organizationId),
      this.drafts.getDashboardSummary(user.organizationId),
      this.audience.listSegments(user.organizationId).then((segs) => segs.length),
    ]);

    return { campaigns: campaignStats, content: contentStats, audienceSegments: audienceCount };
  }
}
