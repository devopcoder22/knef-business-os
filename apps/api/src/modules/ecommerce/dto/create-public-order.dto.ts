import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  IsNumber,
  Min,
  Max,
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryLandmark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryPlaceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  deliveryLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  deliveryLongitude?: number;

  @IsOptional()
  @IsIn(['GOOGLE_PLACE', 'MANUAL', 'SAVED_ADDRESS'])
  deliveryAddressSource?: string;

  @IsIn(['CASH', 'BANK_TRANSFER', 'OTHER', 'PAYSTACK'])
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paystackReference?: string;

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
