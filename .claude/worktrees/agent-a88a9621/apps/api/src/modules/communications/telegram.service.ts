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

      if (!telegramConfig || !telegramConfig.isActive) {
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
}
