import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsIn,
} from 'class-validator';

export class ConfigureWhatsAppDto {
  @IsString() @IsNotEmpty() phoneNumberId!: string;
  @IsString() @IsNotEmpty() businessAccountId!: string;
  @IsString() @IsNotEmpty() accessToken!: string;
  @IsString() @IsOptional() appSecret?: string;
  @IsString() @IsOptional() webhookVerifyToken?: string;
  @IsString() @IsOptional() @MaxLength(50) displayPhoneNumber?: string;
  @IsString() @IsOptional() @MaxLength(200) businessAccountName?: string;
}

export class SetOrderEventMappingDto {
  @IsString() @IsNotEmpty() @IsIn([
    'ORDER_RECEIVED','PAYMENT_CONFIRMED','ORDER_CONFIRMED','ORDER_PROCESSING',
    'ORDER_READY','ORDER_DISPATCHED','ORDER_COMPLETED','ORDER_CANCELLED',
  ]) orderEvent!: string;
  @IsString() @IsNotEmpty() templateId!: string;
  @IsBoolean() isActive!: boolean;
}

export class SendSupportReplyDto {
  @IsString() @IsNotEmpty() @MaxLength(4096) body!: string;
}

export class ListTemplatesDto {
  @IsString() @IsOptional() status?: string;
}

export class ListConversationsDto {
  @IsString() @IsOptional() status?: string;
}

export class ListHistoryDto {
  @IsString() @IsOptional() conversationId?: string;
  @IsString() @IsOptional() direction?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() fromDate?: string;
  @IsString() @IsOptional() toDate?: string;
}
