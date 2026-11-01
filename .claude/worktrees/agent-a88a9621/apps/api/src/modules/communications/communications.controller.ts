import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommunicationsService } from './communications.service';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhooksService } from './webhooks.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import {
  CreateEmailProviderDto,
  UpdateEmailProviderDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  PreviewTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  AddRecipientsDto,
  ScheduleCampaignDto,
  UpsertTelegramConfigDto,
  UpdateTelegramSettingsDto,
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
  ListNotificationsDto,
} from './dto/communications.dto';

// ── Email Providers ──────────────────────────────────────────────

@ApiTags('email-providers')
@ApiBearerAuth('JWT')
@Controller('email-providers')
export class EmailProvidersController {
  constructor(private readonly commsService: CommunicationsService) {}

  @Get()
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'List email providers' })
  list(@CurrentUser() user: AuthUser) {
    return this.commsService.listEmailProviders(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'Create email provider' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailProviderDto) {
    return this.commsService.createEmailProvider(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'Get email provider detail' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.getEmailProvider(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'Update email provider' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailProviderDto,
  ) {
    return this.commsService.updateEmailProvider(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'Delete (deactivate) email provider' })
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.deleteEmailProvider(user.organizationId, id);
  }

  @Post(':id/set-default')
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'Set as default email provider' })
  @HttpCode(HttpStatus.OK)
  setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.setDefaultEmailProvider(user.organizationId, id);
  }

  @Post(':id/test')
  @Permissions(PERMISSIONS.COMMUNICATIONS.EMAIL_PROVIDERS)
  @ApiOperation({ summary: 'Test email provider' })
  @HttpCode(HttpStatus.OK)
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.testEmailProvider(user.organizationId, id, user.email);
  }
}

// ── Communication Templates ──────────────────────────────────────

@ApiTags('communication-templates')
@ApiBearerAuth('JWT')
@Controller('communication-templates')
export class TemplatesController {
  constructor(private readonly commsService: CommunicationsService) {}

  @Get()
  @Permissions(PERMISSIONS.COMMUNICATIONS.TEMPLATES)
  @ApiOperation({ summary: 'List templates' })
  list(@CurrentUser() user: AuthUser) {
    return this.commsService.listTemplates(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.COMMUNICATIONS.TEMPLATES)
  @ApiOperation({ summary: 'Create template' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.commsService.createTemplate(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TEMPLATES)
  @ApiOperation({ summary: 'Get template' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.getTemplate(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TEMPLATES)
  @ApiOperation({ summary: 'Update template' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.commsService.updateTemplate(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TEMPLATES)
  @ApiOperation({ summary: 'Delete template' })
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.deleteTemplate(user.organizationId, id);
  }

  @Post(':id/preview')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TEMPLATES)
  @ApiOperation({ summary: 'Preview template with variables' })
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PreviewTemplateDto,
  ) {
    return this.commsService.previewTemplate(user.organizationId, id, dto.variables);
  }
}

// ── Email Campaigns ──────────────────────────────────────────────

@ApiTags('email-campaigns')
@ApiBearerAuth('JWT')
@Controller('email-campaigns')
export class CampaignsController {
  constructor(private readonly commsService: CommunicationsService) {}

  @Get()
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'List campaigns' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.commsService.listCampaigns(user.organizationId, { status, page, limit });
  }

  @Post()
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Create draft campaign' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) {
    return this.commsService.createCampaign(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Get campaign detail' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.getCampaign(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Update draft campaign' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.commsService.updateCampaign(user.organizationId, id, dto);
  }

  @Post(':id/recipients')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Add recipients to campaign' })
  @HttpCode(HttpStatus.OK)
  addRecipients(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddRecipientsDto,
  ) {
    return this.commsService.addRecipients(user.organizationId, id, dto);
  }

  @Get(':id/recipients')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'List campaign recipients' })
  listRecipients(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.commsService.listRecipients(user.organizationId, id, page, limit);
  }

  @Post(':id/schedule')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Schedule campaign' })
  @HttpCode(HttpStatus.OK)
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.commsService.scheduleCampaign(user.organizationId, id, dto.scheduledAt);
  }

  @Post(':id/send')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Send campaign immediately' })
  @HttpCode(HttpStatus.OK)
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.sendCampaign(user.organizationId, id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Delete draft campaign' })
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.deleteCampaign(user.organizationId, id);
  }
}

// ── Notifications ────────────────────────────────────────────────

@ApiTags('notifications')
@ApiBearerAuth('JWT')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List user notifications' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationsService.findUserNotifications(
      user.organizationId,
      user.id,
      {
        isRead: query.isRead,
        type: query.type,
        page: query.page,
        limit: query.limit,
      },
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnreadCount(user.organizationId, user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.organizationId, user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.organizationId, user.id);
  }
}

// ── Telegram ─────────────────────────────────────────────────────

@ApiTags('telegram')
@ApiBearerAuth('JWT')
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly commsService: CommunicationsService,
    private readonly telegramService: TelegramService,
  ) {}

  @Get('config')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @ApiOperation({ summary: 'Get Telegram config' })
  getConfig(@CurrentUser() user: AuthUser) {
    return this.commsService.getTelegramConfig(user.organizationId);
  }

  @Post('config')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @ApiOperation({ summary: 'Create or update Telegram config' })
  upsertConfig(@CurrentUser() user: AuthUser, @Body() dto: UpsertTelegramConfigDto) {
    return this.commsService.upsertTelegramConfig(user.organizationId, dto);
  }

  @Patch('config')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @ApiOperation({ summary: 'Update Telegram notification settings' })
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateTelegramSettingsDto) {
    return this.commsService.updateTelegramSettings(user.organizationId, dto);
  }

  @Post('config/test')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @ApiOperation({ summary: 'Send test Telegram message' })
  @HttpCode(HttpStatus.OK)
  async testConfig(@CurrentUser() user: AuthUser) {
    const success = await this.telegramService.sendMessage(
      user.organizationId,
      '<b>KNEF Business OS</b> — Test message. Telegram is configured correctly!',
    );
    return { success, message: success ? 'Test message sent' : 'Failed to send test message' };
  }
}

// ── Webhooks ─────────────────────────────────────────────────────

@ApiTags('webhooks')
@ApiBearerAuth('JWT')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly commsService: CommunicationsService,
    private readonly webhooksService: WebhooksService,
  ) {}

  @Get('endpoints')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WEBHOOKS)
  @ApiOperation({ summary: 'List webhook endpoints' })
  listEndpoints(@CurrentUser() user: AuthUser) {
    return this.commsService.listWebhookEndpoints(user.organizationId);
  }

  @Post('endpoints')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WEBHOOKS)
  @ApiOperation({ summary: 'Create webhook endpoint' })
  createEndpoint(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookEndpointDto) {
    return this.commsService.createWebhookEndpoint(user.organizationId, dto);
  }

  @Patch('endpoints/:id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WEBHOOKS)
  @ApiOperation({ summary: 'Update webhook endpoint' })
  updateEndpoint(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.commsService.updateWebhookEndpoint(user.organizationId, id, dto);
  }

  @Delete('endpoints/:id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WEBHOOKS)
  @ApiOperation({ summary: 'Delete webhook endpoint' })
  @HttpCode(HttpStatus.OK)
  deleteEndpoint(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.deleteWebhookEndpoint(user.organizationId, id);
  }

  @Get('endpoints/:id/deliveries')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WEBHOOKS)
  @ApiOperation({ summary: 'List webhook deliveries for endpoint' })
  listDeliveries(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.commsService.listWebhookDeliveries(user.organizationId, id, page, limit);
  }

  @Post('endpoints/:id/test')
  @Permissions(PERMISSIONS.COMMUNICATIONS.WEBHOOKS)
  @ApiOperation({ summary: 'Send test ping to webhook endpoint' })
  @HttpCode(HttpStatus.OK)
  testEndpoint(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.webhooksService.deliver({
      organizationId: user.organizationId,
      event: 'ping',
      payload: { event: 'ping', timestamp: new Date().toISOString(), endpointId: id },
    });
  }
}
