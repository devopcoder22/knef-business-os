import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Length,
  IsISO8601,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSerializedUnitDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ description: '15-digit IMEI number' })
  @IsString()
  @Length(15, 15, { message: 'IMEI1 must be exactly 15 digits' })
  imei1!: string;

  @ApiPropertyOptional({ description: 'Second IMEI (for dual-SIM devices)' })
  @IsOptional()
  @IsString()
  @Length(15, 15, { message: 'IMEI2 must be exactly 15 digits' })
  imei2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiProperty({ description: 'Cost price as string' })
  @IsString()
  @IsNotEmpty()
  costPrice!: string;

  @ApiPropertyOptional({ description: 'Selling price as string' })
  @IsOptional()
  @IsString()
  sellingPrice?: string;

  @ApiPropertyOptional({ description: 'Warranty expiry ISO date' })
  @IsOptional()
  @IsISO8601()
  warrantyExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
