import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChannelPreferenceService } from '../communications/channel-preference.service';
import { AIModule } from '../ai/ai.module';
import { MarketingCampaignService } from './marketing-campaign.service';
import { ContentDraftService } from './content-draft.service';
import { MarketingAudienceService } from './marketing-audience.service';
import { MediaAssetService } from './media-asset.service';
import { AIMarketingService } from './ai-marketing.service';
import {
  MarketingCampaignsController,
  MarketingContentController,
  MarketingCalendarController,
  MarketingAudiencesController,
  MarketingMediaController,
  MarketingDashboardController,
} from './marketing.controller';
import { AIMarketingController } from './ai-marketing.controller';

@Module({
  imports: [AIModule],
  controllers: [
    MarketingCampaignsController,
    MarketingContentController,
    MarketingCalendarController,
    MarketingAudiencesController,
    MarketingMediaController,
    MarketingDashboardController,
    AIMarketingController,
  ],
  providers: [
    PrismaService,
    AuditService,
    ChannelPreferenceService,
    MarketingCampaignService,
    ContentDraftService,
    MarketingAudienceService,
    MediaAssetService,
    AIMarketingService,
  ],
  exports: [MarketingCampaignService, ContentDraftService],
})
export class MarketingModule {}
