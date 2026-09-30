import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
