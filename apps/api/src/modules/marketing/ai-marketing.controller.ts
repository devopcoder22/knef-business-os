import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { AIMarketingService } from './ai-marketing.service';
import type {
  CampaignIdeasDto,
  GenerateDraftDto,
  GenerateVariantDto,
  RewriteDto,
  ToneDto,
  CalendarDto,
  InterpolateDto,
} from './ai-marketing.service';

@ApiTags('marketing-ai')
@ApiBearerAuth('JWT')
@Controller('marketing/ai')
export class AIMarketingController {
  constructor(private readonly aiMarketing: AIMarketingService) {}

  // ── Campaign ideas ──────────────────────────────────────────────────────────

  @Post('campaign-ideas')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.MANAGE)
  @ApiOperation({ summary: 'Generate AI marketing campaign ideas' })
  @HttpCode(HttpStatus.OK)
  generateCampaignIdeas(
    @CurrentUser() user: AuthUser,
    @Body() body: CampaignIdeasDto,
  ) {
    return this.aiMarketing.generateCampaignIdeas(user.organizationId, user.id, body);
  }

  // ── Content draft generation ────────────────────────────────────────────────

  @Post('content/:id/generate')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_CREATE)
  @ApiOperation({ summary: 'AI-generate body for a content draft' })
  @HttpCode(HttpStatus.OK)
  generateDraftContent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: GenerateDraftDto,
  ) {
    return this.aiMarketing.generateDraftContent(user.organizationId, user.id, id, body);
  }

  // ── Rewrite ─────────────────────────────────────────────────────────────────

  @Post('content/:id/rewrite')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'AI-rewrite draft body (suggestion only — original preserved)' })
  @HttpCode(HttpStatus.OK)
  rewriteContent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RewriteDto,
  ) {
    return this.aiMarketing.rewriteContent(user.organizationId, user.id, id, body);
  }

  // ── Shorten ─────────────────────────────────────────────────────────────────

  @Post('content/:id/shorten')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'AI-shorten draft body (suggestion only)' })
  @HttpCode(HttpStatus.OK)
  shortenContent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.aiMarketing.shortenContent(user.organizationId, user.id, id);
  }

  // ── Expand ──────────────────────────────────────────────────────────────────

  @Post('content/:id/expand')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'AI-expand draft body (suggestion only)' })
  @HttpCode(HttpStatus.OK)
  expandContent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { instruction?: string },
  ) {
    return this.aiMarketing.expandContent(user.organizationId, user.id, id, body);
  }

  // ── Tone ────────────────────────────────────────────────────────────────────

  @Post('content/:id/tone')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'AI change tone of draft body (suggestion only)' })
  @HttpCode(HttpStatus.OK)
  changeTone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ToneDto,
  ) {
    return this.aiMarketing.changeTone(user.organizationId, user.id, id, body);
  }

  // ── CTA generation ──────────────────────────────────────────────────────────

  @Post('content/:id/cta')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'AI-generate call-to-action options for a draft' })
  @HttpCode(HttpStatus.OK)
  generateCta(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { context?: string },
  ) {
    return this.aiMarketing.generateCta(user.organizationId, user.id, id, body);
  }

  // ── Hashtags ────────────────────────────────────────────────────────────────

  @Post('content/:id/hashtags')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_EDIT)
  @ApiOperation({ summary: 'AI-generate hashtags for a draft' })
  @HttpCode(HttpStatus.OK)
  generateHashtags(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { count?: number },
  ) {
    return this.aiMarketing.generateHashtags(user.organizationId, user.id, id, body);
  }

  // ── Platform variant ────────────────────────────────────────────────────────

  @Post('content/:id/variants')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.CONTENT_CREATE)
  @ApiOperation({ summary: 'AI-generate a platform-specific content variant' })
  @HttpCode(HttpStatus.OK)
  generateVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: GenerateVariantDto,
  ) {
    return this.aiMarketing.generateVariant(user.organizationId, user.id, id, body);
  }

  // ── Content calendar ────────────────────────────────────────────────────────

  @Post('campaigns/:id/calendar')
  @Permissions(PERMISSIONS.AI.ACCESS, PERMISSIONS.MARKETING.MANAGE)
  @ApiOperation({ summary: 'AI-suggest a content calendar for a campaign (not auto-scheduled)' })
  @HttpCode(HttpStatus.OK)
  generateContentCalendar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CalendarDto,
  ) {
    return this.aiMarketing.generateContentCalendar(user.organizationId, user.id, id, body);
  }

  // ── Safe template interpolation ─────────────────────────────────────────────

  @Post('interpolate')
  @Permissions(PERMISSIONS.MARKETING.CONTENT_CREATE)
  @ApiOperation({ summary: 'Safely interpolate allowlisted template variables' })
  @HttpCode(HttpStatus.OK)
  interpolateTemplate(
    @CurrentUser() _user: AuthUser,
    @Body() body: InterpolateDto,
  ) {
    return this.aiMarketing.interpolateTemplate(body);
  }
}
