import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChannelPreferenceService } from '../communications/channel-preference.service';
import { MarketingCampaignService } from './marketing-campaign.service';
import { ContentDraftService } from './content-draft.service';
import { MarketingAudienceService } from './marketing-audience.service';
import { MediaAssetService } from './media-asset.service';
import {
  MarketingCampaignsController,
  MarketingContentController,
  MarketingCalendarController,
  MarketingAudiencesController,
  MarketingMediaController,
  MarketingDashboardController,
} from './marketing.controller';

@Module({
  controllers: [
    MarketingCampaignsController,
    MarketingContentController,
    MarketingCalendarController,
    MarketingAudiencesController,
    MarketingMediaController,
    MarketingDashboardController,
  ],
  providers: [
    PrismaService,
    AuditService,
    ChannelPreferenceService,
    MarketingCampaignService,
    ContentDraftService,
    MarketingAudienceService,
    MediaAssetService,
  ],
  exports: [MarketingCampaignService, ContentDraftService],
})
export class MarketingModule {}
