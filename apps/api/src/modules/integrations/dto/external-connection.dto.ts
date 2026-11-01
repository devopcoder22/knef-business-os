import { IsString, IsOptional, IsIn, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_PROVIDERS } from '../providers/external-provider.factory';

export class InitiateOAuthDto {
  @ApiProperty({ example: 'google', description: 'Provider identifier' })
  @IsString()
  @IsIn([...SUPPORTED_PROVIDERS])
  provider!: string;

  @ApiPropertyOptional({ description: 'Additional OAuth scopes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalScopes?: string[];

  @ApiPropertyOptional({ description: 'Provider-specific param (e.g. shopDomain for Shopify)' })
  @IsOptional()
  @IsString()
  shopDomain?: string;
}

export class DisconnectConnectionDto {
  @ApiPropertyOptional({ description: 'Also revoke the token at the provider' })
  @IsOptional()
  revokeAtProvider?: boolean;
}
