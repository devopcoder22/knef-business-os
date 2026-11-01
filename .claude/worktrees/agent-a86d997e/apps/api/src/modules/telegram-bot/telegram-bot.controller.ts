import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import { LocationScopeService } from '../../common/services/location-scope.service';
import { PermissionsService } from '../permissions/permissions.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLinkingService } from './telegram-linking.service';
import { TelegramCommandService } from './telegram-command.service';
import { TelegramAssistantService } from './telegram-assistant.service';
import { PERMISSIONS } from '@knef/constants';
import { decrypt } from '@knef/utils';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';

interface TelegramMessage {
  message_id: number;
  from?: { id: number; username?: string; first_name?: string };
  chat?: { id: number; type: string };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const DENIED_MSG = '🚫 You do not have permission to use this command. Contact your administrator.';

@ApiTags('telegram-bot')
@Controller('telegram-bot')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    private readonly botService: TelegramBotService,
    private readonly linkingService: TelegramLinkingService,
    private readonly commandService: TelegramCommandService,
    private readonly assistantService: TelegramAssistantService,
    private readonly permissionsService: PermissionsService,
    private readonly locationScope: LocationScopeService,
  ) {}

  @Public()
  @Post('webhook/:orgId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telegram webhook endpoint (receives updates)' })
  async handleWebhook(
    @Param('orgId') orgId: string,
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string,
  ): Promise<void> {
    const telegramConfig = await this.prisma.telegramConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (!telegramConfig || !telegramConfig.isActive) return;

    const cfg = telegramConfig as typeof telegramConfig & { webhookSecret?: string | null };
    if (cfg.webhookSecret) {
      if (secretHeader !== cfg.webhookSecret) {
        this.logger.warn(`Invalid webhook secret for org ${orgId}`);
        return;
      }
    }

    const encKey = this.config.get<string>('ENCRYPTION_KEY')!;
    const botToken = decrypt(telegramConfig.botTokenEncrypted, encKey);

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query, orgId, botToken);
      return;
    }

    if (!update.message) return;
    await this.handleMessage(update.message, orgId, botToken);
  }

  private async handleMessage(
    message: TelegramMessage,
    orgId: string,
    botToken: string,
  ): Promise<void> {
    const text = message.text?.trim() ?? '';
    const from = message.from;
    const chatId = message.chat?.id?.toString();

    if (!from || !chatId || !text) return;

    const telegramId = from.id.toString();
    const telegramUsername = from.username;

    // /link requires no prior account — handle before the auth gate
    if (text.startsWith('/link')) {
      const parts = text.split(/\s+/);
      const code = parts[1]?.trim();
      await this.handleLinkCommand(code, telegramId, telegramUsername, chatId, botToken);
      return;
    }

    // All other commands require a linked, verified account
    const linkedUser = await this.linkingService.getLinkedUser(orgId, telegramId);

    if (!linkedUser) {
      await this.botService.sendMessage(
        botToken,
        chatId,
        '🔗 Your Telegram account is not linked to KNEF Business OS.\n\n' +
        'Ask your administrator to generate a link code from the Communications → Telegram settings page, ' +
        'then send: <code>/link YOUR_CODE</code>',
      );
      return;
    }

    const userId = (linkedUser as { userId: string }).userId;

    // Resolve effective permissions and location scope once — all subsequent command gates use this.
    // This mirrors the permission check in TelegramAssistantService and the AI tool registry.
    let effective: Set<string>;
    let locationIds: string[] | null;
    try {
      const [permResult, resolvedLocationIds] = await Promise.all([
        this.permissionsService.getResolvedPermissions(orgId, userId),
        this.locationScope.getUserLocationIds(userId),
      ]);
      effective = new Set<string>(permResult.data.effective);
      locationIds = resolvedLocationIds;
    } catch {
      this.logger.error(`Failed to resolve permissions for userId=${userId} orgId=${orgId}`);
      await this.botService.sendMessage(botToken, chatId, '⚠️ Unable to verify your permissions. Please try again.');
      return;
    }

    const can = {
      sales: effective.has(PERMISSIONS.SALES.VIEW) || effective.has(PERMISSIONS.REPORTS.VIEW),
      inventory: effective.has(PERMISSIONS.INVENTORY.VIEW),
      finance: effective.has(PERMISSIONS.FINANCE.VIEW),
      tasks: effective.has(PERMISSIONS.TASKS.VIEW),
      orders: effective.has(PERMISSIONS.SALES.VIEW) || effective.has(PERMISSIONS.PURCHASING.VIEW),
      goals: effective.has(PERMISSIONS.GOALS.VIEW),
    };

    if (text === '/help' || text === '/start') {
      const result = this.commandService.getHelpText();
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/sales') {
      if (!can.sales) {
        await this.botService.sendMessage(botToken, chatId, DENIED_MSG);
        return;
      }
      const result = await this.commandService.handleSales(orgId, locationIds);
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/inventory') {
      if (!can.inventory) {
        await this.botService.sendMessage(botToken, chatId, DENIED_MSG);
        return;
      }
      const result = await this.commandService.handleInventory(orgId, locationIds);
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/profit') {
      if (!can.finance) {
        await this.botService.sendMessage(botToken, chatId, DENIED_MSG);
        return;
      }
      const result = await this.commandService.handleProfit(orgId);
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/tasks') {
      if (!can.tasks) {
        await this.botService.sendMessage(botToken, chatId, DENIED_MSG);
        return;
      }
      const result = await this.commandService.handleTasks(orgId, userId);
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/orders') {
      if (!can.orders) {
        await this.botService.sendMessage(botToken, chatId, DENIED_MSG);
        return;
      }
      const result = await this.commandService.handleOrders(orgId);
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/targets') {
      if (!can.goals) {
        await this.botService.sendMessage(botToken, chatId, DENIED_MSG);
        return;
      }
      const result = await this.commandService.handleTargets(orgId);
      await this.botService.sendMessage(botToken, chatId, result.text);
      return;
    }

    if (text === '/daily') {
      await this.botService.sendMessage(botToken, chatId, '⏳ Generating your daily digest...');
      const reply = await this.buildPermissionAwareDigest(orgId, userId, can, locationIds);
      await this.botService.sendMessage(botToken, chatId, reply);
      return;
    }

    // Natural language fallback — TelegramAssistantService enforces its own permission gate
    if (!text.startsWith('/')) {
      const reply = await this.assistantService.handleNaturalLanguage(orgId, userId, text);
      await this.botService.sendMessage(botToken, chatId, reply);
      return;
    }

    await this.botService.sendMessage(botToken, chatId, 'Unknown command. Send /help for available commands.');
  }

  private async buildPermissionAwareDigest(
    orgId: string,
    userId: string,
    can: Record<string, boolean>,
    locationIds: string[] | null,
  ): Promise<string> {
    const fetches: Array<Promise<{ text: string } | null>> = [
      can.sales ? this.commandService.handleSales(orgId, locationIds) : Promise.resolve(null),
      can.inventory ? this.commandService.handleInventory(orgId, locationIds) : Promise.resolve(null),
      can.finance ? this.commandService.handleProfit(orgId) : Promise.resolve(null),
      can.tasks ? this.commandService.handleTasks(orgId, userId) : Promise.resolve(null),
      can.orders ? this.commandService.handleOrders(orgId) : Promise.resolve(null),
    ];

    const settled = await Promise.allSettled(fetches);
    const sections = settled
      .filter((r): r is PromiseFulfilledResult<{ text: string }> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value.text);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    if (sections.length === 0) {
      return `📋 <b>Daily Digest — ${dateStr}</b>\n\nYou don't have permission to view any business data sections.`;
    }

    return `📋 <b>Daily Digest — ${dateStr}</b>\n\n${sections.join('\n\n─────────────────\n\n')}`;
  }

  private async handleLinkCommand(
    code: string | undefined,
    telegramId: string,
    telegramUsername: string | undefined,
    chatId: string,
    botToken: string,
  ): Promise<void> {
    if (!code) {
      await this.botService.sendMessage(
        botToken,
        chatId,
        '❌ Please provide your link code.\n\nUsage: <code>/link 123456</code>',
      );
      return;
    }

    const payload = await this.linkingService.consumeLinkCode(code);

    if (!payload) {
      await this.botService.sendMessage(
        botToken,
        chatId,
        '❌ Invalid or expired link code. Please generate a new one from the settings page.',
      );
      return;
    }

    try {
      await this.linkingService.linkAccount(payload, telegramId, telegramUsername, chatId);
      await this.botService.sendMessage(
        botToken,
        chatId,
        '✅ <b>Account linked successfully!</b>\n\n' +
        'Your Telegram account is now connected to KNEF Business OS.\n\n' +
        'Send /help to see available commands.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Linking failed';
      await this.botService.sendMessage(botToken, chatId, `❌ ${msg}`);
    }
  }

  private async handleCallbackQuery(
    query: TelegramCallbackQuery,
    orgId: string,
    botToken: string,
  ): Promise<void> {
    await this.botService.answerCallbackQuery(botToken, query.id, 'Processing...');
    this.logger.debug(`Callback query received: orgId=${orgId} data=${query.data}`);
  }
}
