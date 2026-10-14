import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PublicOrderItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreatePublicOrderDto {
  @IsEmail()
  customerEmail!: string;

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;

  @IsString()
  locationId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublicOrderItemDto)
  items!: PublicOrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPhone?: string;

  @IsIn(['CASH', 'BANK_TRANSFER', 'OTHER'])
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  customerAccountId?: string;

  @IsOptional()
  @IsIn(['PICKUP', 'DELIVERY'])
  deliveryMethod?: 'PICKUP' | 'DELIVERY';
}
