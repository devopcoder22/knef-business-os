import { IsString, IsNotEmpty, IsOptional, IsObject, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarcodeType } from '@prisma/client';

export class CreateProductVariantDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Global Trade Item Number for this variant' })
  @IsOptional()
  @IsString()
  gtin?: string;

  @ApiPropertyOptional({ enum: BarcodeType })
  @IsOptional()
  @IsEnum(BarcodeType)
  barcodeType?: BarcodeType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  costPrice!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sellingPrice!: string;

  @ApiPropertyOptional({ description: 'Variant options e.g. {color: "Black", storage: "256GB"}' })
  @IsOptional()
  @IsObject()
  options?: Record<string, string>;
}
