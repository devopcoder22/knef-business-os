import { Module } from '@nestjs/common';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WhatsAppOrderService } from './whatsapp-order.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';
import { MockWhatsAppProvider } from './providers/mock-whatsapp.provider';
import { AuditModule } from '../audit/audit.module';
import { ChannelPreferenceService } from '../communications/channel-preference.service';

@Module({
  imports: [AuditModule],
  providers: [
    WhatsAppConfigService,
    WhatsAppTemplateService,
    WhatsAppMessageService,
    WhatsAppConversationService,
    WhatsAppOrderService,
    MetaWhatsAppProvider,
    MockWhatsAppProvider,
    ChannelPreferenceService,
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  exports: [WhatsAppConfigService, WhatsAppMessageService, WhatsAppOrderService],
})
export class WhatsAppModule {}
