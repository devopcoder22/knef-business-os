import {
  IsArray,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CountedItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  stockCountItemId!: string;

  @ApiProperty({ description: 'Actual counted quantity' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitStockCountDto {
  @ApiProperty({ type: [CountedItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountedItemDto)
  items!: CountedItemDto[];
}
