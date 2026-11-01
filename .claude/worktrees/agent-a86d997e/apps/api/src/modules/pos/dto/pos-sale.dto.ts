import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class POSSaleItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ description: 'Unit price as string' })
  @IsString()
  @IsNotEmpty()
  unitPrice!: string;

  @ApiProperty({ description: 'Cost price as string' })
  @IsString()
  @IsNotEmpty()
  costPrice!: string;

  @ApiPropertyOptional({ default: '0' })
  @IsOptional()
  @IsString()
  discountRate?: string;
}

export class PaymentSplitDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ description: 'Amount for this payment method' })
  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class POSSaleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ type: [POSSaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => POSSaleItemDto)
  items!: POSSaleItemDto[];

  @ApiProperty({ type: [PaymentSplitDto], description: 'Payment method splits' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments!: PaymentSplitDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
