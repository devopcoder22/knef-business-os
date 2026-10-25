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
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommunicationsService } from './communications.service';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhooksService } from './webhooks.service';
import { EmailService } from './email.service';
import { EmailSubscriptionService } from './email-subscription.service';
import { ProviderWebhooksService } from './provider-webhooks.service';
import { SmsService } from './sms.service';
import { WebPushService } from './web-push.service';
import { ChannelPreferenceService } from './channel-preference.service';
import { TelegramLinkingService } from '../telegram-bot/telegram-linking.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
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
  ApproveCampaignDto,
  RejectCampaignDto,
  UpdateSubscriptionDto,
  UpdatePreferencesDto,
  UpsertTelegramConfigDto,
  UpdateTelegramSettingsDto,
  UpdateUserTelegramPrefsDto,
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
  test(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { email?: string }) {
    return this.commsService.testEmailProvider(user.organizationId, id, body?.email ?? user.email);
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
    return this.commsService.createCampaign(user.organizationId, user.id, dto);
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
    return this.commsService.updateCampaign(user.organizationId, id, user.id, dto);
  }

  @Post(':id/submit')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Submit campaign for review/approval' })
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.submitCampaignForReview(user.organizationId, id, user.id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS_APPROVE)
  @ApiOperation({ summary: 'Approve campaign' })
  @HttpCode(HttpStatus.OK)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveCampaignDto) {
    return this.commsService.approveCampaign(user.organizationId, id, user.id, dto.note);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS_APPROVE)
  @ApiOperation({ summary: 'Reject campaign back to DRAFT' })
  @HttpCode(HttpStatus.OK)
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectCampaignDto) {
    return this.commsService.rejectCampaign(user.organizationId, id, user.id, dto.reason);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Cancel campaign' })
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.cancelCampaign(user.organizationId, id, user.id);
  }

  @Get(':id/compliance')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Run pre-send compliance checks' })
  compliance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.getCampaignCompliance(user.organizationId, id);
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
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS_SEND)
  @ApiOperation({ summary: 'Schedule campaign' })
  @HttpCode(HttpStatus.OK)
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.commsService.scheduleCampaign(user.organizationId, id, user.id, dto.scheduledAt);
  }

  @Post(':id/send')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS_SEND)
  @ApiOperation({ summary: 'Send campaign immediately' })
  @HttpCode(HttpStatus.OK)
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.sendCampaign(user.organizationId, id, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.CAMPAIGNS)
  @ApiOperation({ summary: 'Delete draft campaign' })
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commsService.deleteCampaign(user.organizationId, id);
  }
}

// ── Subscriptions (admin) ────────────────────────────────────────

@ApiTags('email-subscriptions')
@ApiBearerAuth('JWT')
@Controller('email-subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionService: EmailSubscriptionService) {}

  @Get()
  @Permissions(PERMISSIONS.COMMUNICATIONS.SUBSCRIPTIONS)
  @ApiOperation({ summary: 'List email subscriptions / suppression' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('email') email?: string,
    @Query('list') list?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.subscriptionService.listSubscriptions(user.organizationId, { email, list, status, page, limit });
  }

  @Patch(':email')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SUBSCRIPTIONS)
  @ApiOperation({ summary: 'Update subscription status for an email address' })
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser() user: AuthUser,
    @Param('email') email: string,
    @Query('list') list = 'GENERAL_MARKETING',
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionService.updateSubscription(
      user.organizationId, decodeURIComponent(email), list,
      dto.status, { reason: dto.reason, userId: user.id },
    );
  }
}

// ── Public Unsubscribe (no auth) ─────────────────────────────────

@ApiTags('email-preferences')
@Controller('email')
export class PublicEmailController {
  constructor(private readonly subscriptionService: EmailSubscriptionService) {}

  @Public()
  @Get('preferences/:token')
  @ApiOperation({ summary: 'Get email preferences (public, token-authenticated)' })
  getPreferences(@Param('token') token: string) {
    return this.subscriptionService.getPreferences(token);
  }

  @Public()
  @Post('preferences/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update email preferences (public, token-authenticated)' })
  updatePreferences(@Param('token') token: string, @Body() dto: UpdatePreferencesDto) {
    return this.subscriptionService.updatePreferences(token, dto.preferences);
  }

  @Public()
  @Post('unsubscribe/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsubscribe from a list (public, token-authenticated)' })
  unsubscribe(@Param('token') token: string, @Query('list') list?: string) {
    return this.subscriptionService.unsubscribeByToken(token, list);
  }
}

// ── Provider Webhooks (public, signature-verified) ───────────────

@ApiTags('provider-webhooks')
@Controller('provider-webhooks')
export class ProviderWebhooksController {
  constructor(private readonly providerWebhooksService: ProviderWebhooksService) {}

  @Public()
  @Post('sendgrid/:organizationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive SendGrid delivery events' })
  async sendgrid(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown[],
    @Headers('X-Twilio-Email-Event-Webhook-Signature') signature: string,
    @Headers('X-Twilio-Email-Event-Webhook-Timestamp') timestamp: string,
  ) {
    const rawPayload = JSON.stringify(body);
    return this.providerWebhooksService.handleSendgridEvents(
      rawPayload, signature, timestamp, organizationId,
    );
  }

  @Public()
  @Post('mailgun/:organizationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Mailgun delivery events' })
  async mailgun(
    @Param('organizationId') organizationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.providerWebhooksService.handleMailgunEvent(body, organizationId);
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
    private readonly linkingService: TelegramLinkingService,
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
  testConfig(@CurrentUser() user: AuthUser) {
    return this.telegramService.testMessage(user.organizationId);
  }

  @Post('generate-link-code')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a 6-digit code to link a Telegram account' })
  async generateLinkCode(@CurrentUser() user: AuthUser) {
    const code = await this.linkingService.generateLinkCode(user.id, user.organizationId);
    return { code, expiresInSeconds: 600 };
  }

  @Get('linked-users')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @ApiOperation({ summary: 'List linked Telegram users' })
  async listLinkedUsers(@CurrentUser() user: AuthUser) {
    return this.linkingService.getLinkedUsers(user.organizationId);
  }

  @Delete('linked-users/:userId')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink a user\'s Telegram account' })
  async unlinkUser(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    await this.linkingService.unlinkAccount(user.organizationId, userId);
    return { success: true };
  }

  @Patch('linked-users/:userId/preferences')
  @Permissions(PERMISSIONS.COMMUNICATIONS.TELEGRAM)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update per-user Telegram notification preferences' })
  async updateUserPrefs(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserTelegramPrefsDto,
  ) {
    await this.linkingService.updateUserPreferences(user.organizationId, userId, dto);
    return { success: true };
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

// ── SMS Providers ─────────────────────────────────────────────────

@ApiTags('communications-sms')
@ApiBearerAuth('JWT')
@Controller('communications/sms')
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {}

  @Get('providers')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @ApiOperation({ summary: 'List SMS providers' })
  listProviders(@CurrentUser() user: AuthUser) {
    return this.smsService.listProviders(user.organizationId);
  }

  @Post('providers')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @ApiOperation({ summary: 'Add an SMS provider' })
  createProvider(
    @CurrentUser() user: AuthUser,
    @Body() dto: { name: string; provider: string; apiKey: string; senderId?: string; isDefault?: boolean },
  ) {
    return this.smsService.createProvider(user.organizationId, user.id, dto);
  }

  @Patch('providers/:id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @ApiOperation({ summary: 'Update an SMS provider' })
  updateProvider(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { name?: string; apiKey?: string; senderId?: string; isDefault?: boolean; isActive?: boolean },
  ) {
    return this.smsService.updateProvider(user.organizationId, user.id, id, dto);
  }

  @Delete('providers/:id')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an SMS provider' })
  deleteProvider(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.smsService.deleteProvider(user.organizationId, user.id, id);
  }

  @Post('send')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Queue a transactional SMS' })
  send(
    @CurrentUser() user: AuthUser,
    @Body() dto: { to: string; message: string; providerId?: string },
  ) {
    return this.smsService.queueSms({
      organizationId: user.organizationId,
      to: dto.to,
      message: dto.message,
      messageType: 'TRANSACTIONAL',
      providerId: dto.providerId,
    });
  }

  @Post('test')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test SMS' })
  test(
    @CurrentUser() user: AuthUser,
    @Body() dto: { phone: string; providerId?: string },
  ) {
    return this.smsService.queueSms({
      organizationId: user.organizationId,
      to: dto.phone,
      message: 'This is a test SMS from KNEF Business OS. Your SMS integration is working correctly.',
      messageType: 'TRANSACTIONAL',
      providerId: dto.providerId,
    });
  }
}

// ── Channel Preferences ───────────────────────────────────────────

@ApiTags('communications-preferences')
@ApiBearerAuth('JWT')
@Controller('communications/preferences')
export class ChannelPreferencesController {
  constructor(private readonly preferenceService: ChannelPreferenceService) {}

  @Get()
  @ApiOperation({ summary: 'Get my channel communication preferences' })
  getMyPreferences(@CurrentUser() user: AuthUser) {
    return this.preferenceService.getPreferences(user.organizationId, user.id);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a channel communication preference' })
  updatePreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: { channel: string; messageType: string; status: string },
  ) {
    return this.preferenceService.upsertPreference(
      user.organizationId,
      {
        userId: user.id,
        channel: dto.channel as Parameters<typeof this.preferenceService.upsertPreference>[1]['channel'],
        messageType: dto.messageType as Parameters<typeof this.preferenceService.upsertPreference>[1]['messageType'],
        status: dto.status as Parameters<typeof this.preferenceService.upsertPreference>[1]['status'],
        source: 'web',
      },
      user.id,
    );
  }
}

// ── Web Push ──────────────────────────────────────────────────────

@ApiTags('communications-push')
@ApiBearerAuth('JWT')
@Controller('communications/push')
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for browser push subscription' })
  getVapidKey(@CurrentUser() user: AuthUser) {
    return this.webPush.getVapidPublicKey(user.organizationId);
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a browser push subscription' })
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: { endpoint: string; p256dhKey: string; authKey: string; userAgent?: string },
  ) {
    return this.webPush.subscribe(user.id, user.organizationId, dto);
  }

  @Delete('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a push subscription endpoint' })
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: { endpoint: string }) {
    return this.webPush.unsubscribe(user.id, dto.endpoint);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List my active push subscriptions' })
  listSubscriptions(@CurrentUser() user: AuthUser) {
    return this.webPush.listSubscriptions(user.id, user.organizationId);
  }

  @Get('subscription-count')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @ApiOperation({ summary: 'Get org push subscription counts (admin)' })
  subscriptionCount(@CurrentUser() user: AuthUser) {
    return this.webPush.listOrgSubscriptions(user.organizationId);
  }

  @Post('test')
  @Permissions(PERMISSIONS.COMMUNICATIONS.SMS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test push notification to a user (admin)' })
  testPush(
    @CurrentUser() user: AuthUser,
    @Body() dto: { userId: string; title?: string; body?: string },
  ) {
    return this.webPush.queuePush(dto.userId, user.organizationId, {
      title: dto.title ?? 'Test Notification',
      body: dto.body ?? 'This is a test push notification from KNEF.',
      url: '/',
    });
  }
}
