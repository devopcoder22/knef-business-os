import { Module } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { EmailService } from './email.service';
import { EmailSubscriptionService } from './email-subscription.service';
import { EmailComplianceService } from './email-compliance.service';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhooksService } from './webhooks.service';
import { AuditModule } from '../audit/audit.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import {
  EmailProvidersController,
  TemplatesController,
  CampaignsController,
  SubscriptionsController,
  PublicEmailController,
  ProviderWebhooksController,
  NotificationsController,
  TelegramController,
  WebhooksController,
} from './communications.controller';

@Module({
  imports: [AuditModule, TelegramBotModule],
  providers: [
    CommunicationsService,
    EmailService,
    EmailSubscriptionService,
    EmailComplianceService,
    ProviderWebhooksService,
    NotificationsService,
    TelegramService,
    WebhooksService,
  ],
  controllers: [
    EmailProvidersController,
    TemplatesController,
    CampaignsController,
    SubscriptionsController,
    PublicEmailController,
    ProviderWebhooksController,
    NotificationsController,
    TelegramController,
    WebhooksController,
  ],
  exports: [
    EmailService,
    EmailSubscriptionService,
    NotificationsService,
    TelegramService,
    WebhooksService,
  ],
})
export class CommunicationsModule {}
