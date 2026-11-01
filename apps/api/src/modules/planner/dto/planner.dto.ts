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
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PlanTypeDto {
  PERSONAL = 'PERSONAL',
  BUSINESS = 'BUSINESS',
  PROJECT = 'PROJECT',
  CAMPAIGN = 'CAMPAIGN',
  OPERATIONAL = 'OPERATIONAL',
  STRATEGIC = 'STRATEGIC',
}

export enum PlanStatusDto {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ enum: PlanTypeDto })
  @IsOptional()
  @IsEnum(PlanTypeDto)
  type?: PlanTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ enum: PlanStatusDto })
  @IsOptional()
  @IsEnum(PlanStatusDto)
  status?: PlanStatusDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class ListPlansDto {
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

  @ApiPropertyOptional({ enum: PlanStatusDto })
  @IsOptional()
  @IsEnum(PlanStatusDto)
  status?: PlanStatusDto;

  @ApiPropertyOptional({ enum: PlanTypeDto })
  @IsOptional()
  @IsEnum(PlanTypeDto)
  type?: PlanTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class GeneratePlanDto {
  @ApiProperty({ description: 'Natural language planning instruction' })
  @IsString()
  instruction!: string;

  @ApiPropertyOptional({ description: 'Additional context' })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goalId?: string;

  @ApiPropertyOptional({ enum: PlanTypeDto })
  @IsOptional()
  @IsEnum(PlanTypeDto)
  type?: PlanTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ description: 'Include business data in context' })
  @IsOptional()
  @IsBoolean()
  includeBusinessContext?: boolean;
}

export class ApprovePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectPlanDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class ExecutePlanDto {
  @ApiPropertyOptional({ description: 'Specific step IDs to execute (all if omitted)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stepIds?: string[];
}

export class AskPlannerDto {
  @ApiProperty()
  @IsString()
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;
}

export class DailyPlanDto {
  @ApiPropertyOptional({ description: 'Date override (ISO, defaults to today)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeCalendar?: boolean;
}

export class WeeklyPlanDto {
  @ApiPropertyOptional({ description: 'ISO date of Monday (defaults to current week)' })
  @IsOptional()
  @IsDateString()
  weekStart?: string;
}

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: PlanTypeDto })
  @IsOptional()
  @IsEnum(PlanTypeDto)
  type?: PlanTypeDto;

  @ApiProperty()
  @IsObject()
  structure!: Record<string, unknown>;
}
