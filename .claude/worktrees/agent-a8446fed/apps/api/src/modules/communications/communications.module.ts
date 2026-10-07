import { Module } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhooksService } from './webhooks.service';
import {
  EmailProvidersController,
  TemplatesController,
  CampaignsController,
  NotificationsController,
  TelegramController,
  WebhooksController,
} from './communications.controller';

@Module({
  providers: [
    CommunicationsService,
    EmailService,
    NotificationsService,
    TelegramService,
    WebhooksService,
  ],
  controllers: [
    EmailProvidersController,
    TemplatesController,
    CampaignsController,
    NotificationsController,
    TelegramController,
    WebhooksController,
  ],
  exports: [
    EmailService,
    NotificationsService,
    TelegramService,
    WebhooksService,
  ],
})
export class CommunicationsModule {}
