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
  MinLength,
  IsBoolean,
  IsUrl,
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
  @MaxLength(128)
  idempotencyKey?: string;

  // NOTE: there is deliberately no customerAccountId field. A logged-in customer is
  // identified only from their verified access token (Authorization header).

  @IsOptional()
  @IsIn(['PICKUP', 'DELIVERY'])
  deliveryMethod?: 'PICKUP' | 'DELIVERY';

  /** Validated and priced on the server. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;

  /** Validated and debited on the server. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  giftCardCode?: string;

  /** Guest checkout: create a customer account with the order's email and this password. */
  @IsOptional()
  @IsBoolean()
  createAccount?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  accountPassword?: string;

  /** Where Paystack returns the customer after a full-page payment (set by the storefront server). */
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(500)
  paystackCallbackUrl?: string;
}

export class VerifyPaystackPaymentDto {
  @IsString()
  @MaxLength(100)
  reference!: string;
}
