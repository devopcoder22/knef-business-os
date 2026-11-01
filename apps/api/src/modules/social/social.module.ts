import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SocialAccountService } from './social-account.service';
import { PublicationService } from './publication.service';
import { SsrfGuardService } from './ssrf-guard.service';
import { MediaValidatorService } from './media-validator.service';
import { FacebookPagePublisher } from './publishers/facebook-page.publisher';
import { InstagramPublisher } from './publishers/instagram.publisher';
import { TikTokPublisher } from './publishers/tiktok.publisher';
import { SnapchatPublisher } from './publishers/snapchat.publisher';
import { SocialPublishingController } from './social-publishing.controller';
import { SocialWebhookController } from './social-webhook.controller';

@Module({
  imports: [ConfigModule, IntegrationsModule],
  controllers: [SocialPublishingController, SocialWebhookController],
  providers: [
    PrismaService,
    AuditService,
    QueueService,
    SsrfGuardService,
    MediaValidatorService,
    FacebookPagePublisher,
    InstagramPublisher,
    TikTokPublisher,
    SnapchatPublisher,
    SocialAccountService,
    PublicationService,
  ],
  exports: [PublicationService, SocialAccountService],
})
export class SocialModule {}
