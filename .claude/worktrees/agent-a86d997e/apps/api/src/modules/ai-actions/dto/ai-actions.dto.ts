import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEnum,
  IsArray,
  IsNumber,
  IsPositive,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── AI Tools ─────────────────────────────────────────────────────

export class CreateAIToolDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpdateAIToolDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class ExecuteToolDto {
  @ApiProperty()
  @IsObject()
  parameters!: Record<string, unknown>;
}

export class ListActionsDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  limit?: number;
}

// ── AI Approvals ─────────────────────────────────────────────────

export class ApproveActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectActionDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class ListApprovalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  limit?: number;
}

// ── Scheduled Agents ─────────────────────────────────────────────

export class CreateScheduledAgentDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  taskType!: string;

  @ApiProperty()
  @IsObject()
  parameters!: Record<string, unknown>;

  @ApiProperty()
  @IsString()
  cronExpression!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateScheduledAgentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ToggleAgentDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

// ── Autonomy Policies ─────────────────────────────────────────────

export class ScopeLimitsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  financialCapNgn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  recipientCap?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locationIds?: string[];

  @ApiPropertyOptional({ description: 'HH:MM 24-hour format' })
  @IsOptional()
  @IsString()
  timeWindowStart?: string;

  @ApiPropertyOptional({ description: 'HH:MM 24-hour format' })
  @IsOptional()
  @IsString()
  timeWindowEnd?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[];
}

export class CreateAutonomyPolicyDto {
  @ApiProperty({ enum: ['org', 'user', 'agent'] })
  @IsString()
  scope!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiProperty({ enum: ['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'] })
  @IsString()
  level!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ScopeLimitsDto)
  scopeLimits?: ScopeLimitsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAutonomyPolicyDto {
  @ApiPropertyOptional({ enum: ['ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY'] })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ScopeLimitsDto)
  scopeLimits?: ScopeLimitsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EvaluatePolicyDto {
  @ApiProperty()
  @IsString()
  toolName!: string;

  @ApiProperty()
  @IsObject()
  parameters!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;
}
