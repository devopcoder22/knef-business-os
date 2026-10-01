import { Injectable, Logger } from '@nestjs/common';

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown';
  inlineKeyboard?: InlineKeyboardButton[][];
}

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<boolean> {
    try {
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: options.parseMode ?? 'HTML',
      };
      if (options.inlineKeyboard) {
        body.reply_markup = { inline_keyboard: options.inlineKeyboard };
      }
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`Telegram sendMessage failed: ${err}`);
      }
      return res.ok;
    } catch (err) {
      this.logger.error('Telegram sendMessage error', err);
      return false;
    }
  }

  async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text?: string,
  ): Promise<void> {
    try {
      await fetch(
        `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
        },
      );
    } catch {
      // Non-critical
    }
  }

  async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: secretToken,
            allowed_updates: ['message', 'callback_query'],
          }),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}
