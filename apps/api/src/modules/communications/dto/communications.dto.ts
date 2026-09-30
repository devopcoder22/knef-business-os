import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEnum,
  IsDateString,
  IsObject,
  IsUrl,
} from 'class-validator';

// ── Email Provider DTOs ──────────────────────────────────────────

export class CreateEmailProviderDto {
  @IsString()
  name!: string;

  @IsEnum(['smtp', 'sendgrid', 'mailgun'])
  type!: 'smtp' | 'sendgrid' | 'mailgun';

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsEmail()
  fromEmail!: string;

  @IsString()
  fromName!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateEmailProviderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  fromName?: string;
}

// ── Communication Template DTOs ──────────────────────────────────

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PreviewTemplateDto {
  @IsObject()
  variables!: Record<string, string>;
}

// ── Campaign DTOs ────────────────────────────────────────────────

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsOptional()
  @IsString()
  htmlContent?: string;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsEnum(['MARKETING', 'NEWSLETTER', 'TRANSACTIONAL'])
  campaignType?: 'MARKETING' | 'NEWSLETTER' | 'TRANSACTIONAL';

  @IsOptional()
  @IsEnum(['GENERAL_MARKETING', 'NEWSLETTERS', 'PROMOTIONS', 'PRODUCT_UPDATES'])
  subscriptionList?: 'GENERAL_MARKETING' | 'NEWSLETTERS' | 'PROMOTIONS' | 'PRODUCT_UPDATES';
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  previewText?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsOptional()
  @IsString()
  htmlContent?: string;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsEnum(['GENERAL_MARKETING', 'NEWSLETTERS', 'PROMOTIONS', 'PRODUCT_UPDATES'])
  subscriptionList?: string;
}

export class ApproveCampaignDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectCampaignDto {
  @IsString()
  reason!: string;
}

export class UpdateSubscriptionDto {
  @IsEnum(['SUBSCRIBED', 'UNSUBSCRIBED', 'SUPPRESSED'])
  status!: 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'SUPPRESSED';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdatePreferencesDto {
  @IsObject()
  preferences!: Record<string, boolean>;
}

export class ProviderWebhookDto {
  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class AddRecipientsDto {
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  emails?: string[];

  @IsOptional()
  @IsString()
  segmentId?: string;
}

export class ScheduleCampaignDto {
  @IsDateString()
  scheduledAt!: string;
}

export class ListCampaignsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

// ── Telegram DTOs ────────────────────────────────────────────────

export class UpsertTelegramConfigDto {
  @IsString()
  botToken!: string;

  @IsString()
  chatId!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOrders?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyFinance?: boolean;
}

export class UpdateTelegramSettingsDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOrders?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyFinance?: boolean;
}

// ── Webhook DTOs ─────────────────────────────────────────────────

export class CreateWebhookEndpointDto {
  @IsUrl()
  url!: string;

  @IsString()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];
}

export class UpdateWebhookEndpointDto {
  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}

// ── Notification DTOs ────────────────────────────────────────────

export class ListNotificationsDto {
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
