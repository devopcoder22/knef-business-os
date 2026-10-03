import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_TRIGGER_STRINGS } from '../automation-trigger.registry';
import { VALID_ACTION_TYPES } from '../automation-action.registry';

export class CreateAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([...VALID_TRIGGER_STRINGS], { message: 'trigger is not a recognized automation trigger' })
  trigger!: string;

  @IsOptional()
  @IsArray()
  conditions?: unknown[];

  @IsOptional()
  @IsArray()
  actions?: unknown[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class UpdateAutomationRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn([...VALID_TRIGGER_STRINGS], { message: 'trigger is not a recognized automation trigger' })
  trigger?: string;

  @IsOptional()
  @IsArray()
  conditions?: unknown[];

  @IsOptional()
  @IsArray()
  actions?: unknown[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class ListAutomationRulesDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class ListExecutionsDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  ruleId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  eventType?: string;
}

export class SimulateRuleDto {
  @IsArray()
  payload!: Record<string, unknown>;
}

export class ValidActionTypesDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([...VALID_ACTION_TYPES], { message: 'type is not a recognized action type' })
  type!: string;

  @IsOptional()
  params?: Record<string, unknown>;
}
