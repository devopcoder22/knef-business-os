import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GoogleAdsProvider } from './providers/google-ads.provider';
import { MetaAdsProvider } from './providers/meta-ads.provider';
import { TikTokAdsProvider } from './providers/tiktok-ads.provider';
import { AdvertisingProviderFactory } from './advertising-provider.factory';
import { AdvertisingAccountService } from './advertising-account.service';
import { AdvertisingCampaignService } from './advertising-campaign.service';
import { AdvertisingMetricsService } from './advertising-metrics.service';
import { AdvertisingActionService } from './advertising-action.service';
import { AdvertisingController } from './advertising.controller';

@Module({
  imports: [IntegrationsModule],
  controllers: [AdvertisingController],
  providers: [
    PrismaService,
    AuditService,
    QueueService,
    GoogleAdsProvider,
    MetaAdsProvider,
    TikTokAdsProvider,
    AdvertisingProviderFactory,
    AdvertisingAccountService,
    AdvertisingCampaignService,
    AdvertisingMetricsService,
    AdvertisingActionService,
  ],
  exports: [AdvertisingAccountService, AdvertisingCampaignService, AdvertisingMetricsService],
})
export class AdvertisingModule {}
