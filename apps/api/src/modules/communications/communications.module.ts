import { Module } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { EmailService } from './email.service';
import { EmailSubscriptionService } from './email-subscription.service';
import { EmailComplianceService } from './email-compliance.service';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhooksService } from './webhooks.service';
import { SmsService } from './sms.service';
import { WebPushService } from './web-push.service';
import { ChannelPreferenceService } from './channel-preference.service';
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
  SmsController,
  ChannelPreferencesController,
  WebPushController,
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
    SmsService,
    WebPushService,
    ChannelPreferenceService,
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
    SmsController,
    ChannelPreferencesController,
    WebPushController,
  ],
  exports: [
    EmailService,
    EmailSubscriptionService,
    NotificationsService,
    TelegramService,
    WebhooksService,
    SmsService,
    ChannelPreferenceService,
    WebPushService,
  ],
})
export class CommunicationsModule {}
