import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GoodsReceiptItemDto {
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
  quantityReceived!: number;

  @ApiProperty({ description: 'Unit cost as string' })
  @IsString()
  @IsNotEmpty()
  unitCost!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [Object], description: 'Serialized unit identifiers for serialized products' })
  @IsOptional()
  @IsArray()
  serializedUnits?: Array<{ imei1: string; imei2?: string; serialNumber?: string }>;
}

export class CreateGoodsReceiptDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [GoodsReceiptItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];
}
