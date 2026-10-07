import { IsString, IsArray, IsOptional, IsIn } from 'class-validator';
import { ALL_API_SCOPES } from '@knef/constants';
import type { ApiScope } from '@knef/constants';

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_API_SCOPES, { each: true, message: 'Each scope must be a valid API scope' })
  scopes!: ApiScope[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
