import { IsString, IsOptional, IsArray, IsInt, IsEnum, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateExternalAgentDto {
  @ApiProperty({ description: 'Agent name (unique within organization)' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Agent description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'API scopes granted to this agent' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ description: 'Tool names this agent is allowed to invoke' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[];

  @ApiPropertyOptional({
    enum: ['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'],
    default: 'APPROVAL_REQUIRED',
  })
  @IsOptional()
  @IsEnum(['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'])
  autonomyLevel?: string;

  @ApiPropertyOptional({ description: 'Max requests per minute', default: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  @Type(() => Number)
  rateLimitPerMinute?: number;
}

export class UpdateExternalAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[];

  @ApiPropertyOptional({
    enum: ['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'],
  })
  @IsOptional()
  @IsEnum(['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'])
  autonomyLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  @Type(() => Number)
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'REVOKED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'SUSPENDED', 'REVOKED'])
  status?: string;

  @ApiPropertyOptional({ description: 'Enable/disable the agent' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ExecuteToolDto {
  @ApiProperty({ description: 'Tool arguments matching the tool input schema' })
  parameters!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Client-supplied idempotency key for write operations' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
