import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLinkingService } from './telegram-linking.service';
import { TelegramCommandService } from './telegram-command.service';
import { TelegramAssistantService } from './telegram-assistant.service';
import { TelegramBotController } from './telegram-bot.controller';

@Module({
  imports: [AIModule, PermissionsModule],
  providers: [
    TelegramBotService,
    TelegramLinkingService,
    TelegramCommandService,
    TelegramAssistantService,
  ],
  controllers: [TelegramBotController],
  exports: [TelegramBotService, TelegramLinkingService],
})
export class TelegramBotModule {}
