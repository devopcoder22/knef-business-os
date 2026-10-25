import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WhatsAppOrderService } from './whatsapp-order.service';
import {
  ConfigureWhatsAppDto,
  SetOrderEventMappingDto,
  SendSupportReplyDto,
  ListTemplatesDto,
  ListConversationsDto,
  ListHistoryDto,
} from './dto/whatsapp.dto';

@Controller('communications/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly configService: WhatsAppConfigService,
    private readonly templateService: WhatsAppTemplateService,
    private readonly messageService: WhatsAppMessageService,
    private readonly conversationService: WhatsAppConversationService,
    private readonly orderService: WhatsAppOrderService,
  ) {}

  // ── Config ──────────────────────────────────────────────────────────────────

  @Get('config')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP)
  getConfig(@CurrentUser() user: AuthUser) {
    return this.configService.getConfig(user.organizationId);
  }

  @Post('config')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_MANAGE)
  configure(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfigureWhatsAppDto,
  ) {
    return this.configService.configure(user.organizationId, user.id, dto);
  }

  @Post('config/health-check')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async healthCheck(@CurrentUser() user: AuthUser) {
    await this.configService.performHealthCheck(user.organizationId);
  }

  @Delete('config')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() user: AuthUser) {
    return this.configService.disconnect(user.organizationId, user.id);
  }

  // ── Templates ────────────────────────────────────────────────────────────────

  @Get('templates')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_TEMPLATES)
  listTemplates(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTemplatesDto,
  ) {
    return this.templateService.listTemplates(user.organizationId, query.status);
  }

  @Post('templates/sync')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_TEMPLATES)
  syncTemplates(@CurrentUser() user: AuthUser) {
    return this.templateService.syncTemplates(user.organizationId, user.id);
  }

  // ── Order Event Mappings ─────────────────────────────────────────────────────

  @Get('order-event-mappings')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_MANAGE)
  listOrderMappings(@CurrentUser() user: AuthUser) {
    return this.orderService.listOrderEventMappings(user.organizationId);
  }

  @Put('order-event-mappings')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_MANAGE)
  setOrderMapping(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetOrderEventMappingDto,
  ) {
    return this.orderService.setOrderEventMapping(
      user.organizationId,
      user.id,
      dto.orderEvent,
      dto.templateId,
      dto.isActive,
    );
  }

  // ── Conversations ────────────────────────────────────────────────────────────

  @Get('conversations')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_SUPPORT)
  listConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: ListConversationsDto,
  ) {
    return this.conversationService.listConversations(user.organizationId, query);
  }

  @Get('conversations/:id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_SUPPORT)
  getConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.conversationService.getConversation(user.organizationId, id);
  }

  @Post('conversations/:id/reply')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP_SUPPORT)
  sendReply(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: SendSupportReplyDto,
  ) {
    return this.messageService.sendSupportReply(
      user.organizationId,
      user.id,
      conversationId,
      dto.body,
    );
  }

  // ── History ──────────────────────────────────────────────────────────────────

  @Get('history')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WHATSAPP)
  listHistory(
    @CurrentUser() user: AuthUser,
    @Query() query: ListHistoryDto,
  ) {
    return this.messageService.listHistory(user.organizationId, query);
  }
}
