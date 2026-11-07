import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsPositive,
  Min,
  Max,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateDiscountCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsNumber()
  @IsPositive()
  value!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ValidateDiscountDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsNumber()
  @Min(0)
  orderAmount!: number;

  @IsOptional()
  @IsString()
  customerEmail?: string;
}

export class MarkUsedDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  customerEmail!: string;

  @IsNumber()
  @Min(0)
  discountAmount!: number;
}

export class ListDiscountCodesDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
