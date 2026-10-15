import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/services/prisma.service';
import { decrypt } from '@knef/utils';
import type { AppConfig } from '../../config/app.config';

@Injectable()
export class TelegramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async sendMessage(organizationId: string, message: string): Promise<boolean> {
    try {
      const telegramConfig = await this.prisma.telegramConfig.findUnique({
        where: { organizationId },
      });

      if (!telegramConfig || !telegramConfig.isActive || !telegramConfig.chatId) {
        return false;
      }

      const encryptionKey = this.config.get<string>('ENCRYPTION_KEY')!;
      const botToken = decrypt(telegramConfig.botTokenEncrypted, encryptionKey);

      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramConfig.chatId,
            text: message,
            parse_mode: 'HTML',
          }),
        },
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  async testMessage(organizationId: string): Promise<{ success: boolean; message: string }> {
    const telegramConfig = await this.prisma.telegramConfig.findUnique({
      where: { organizationId },
    });

    if (!telegramConfig) {
      return { success: false, message: 'Telegram is not configured yet.' };
    }
    if (!telegramConfig.isActive) {
      return { success: false, message: 'Telegram integration is currently inactive.' };
    }
    if (!telegramConfig.chatId) {
      return {
        success: false,
        message: 'No Channel Chat ID configured. Click Reconfigure, add a Chat ID (e.g. -100123456789), then try again.',
      };
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY')!;
    const botToken = decrypt(telegramConfig.botTokenEncrypted, encryptionKey);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramConfig.chatId,
            text: '<b>KNEF Business OS</b> — Test message sent successfully! ✅',
            parse_mode: 'HTML',
          }),
        },
      );

      if (res.ok) {
        return { success: true, message: 'Test message sent successfully!' };
      }

      const body = await res.json().catch(() => ({})) as { description?: string };
      const detail = body.description ?? `HTTP ${res.status}`;
      return { success: false, message: `Telegram API error: ${detail}` };
    } catch {
      return { success: false, message: 'Network error: could not reach Telegram API. Check server connectivity.' };
    }
  }
}
