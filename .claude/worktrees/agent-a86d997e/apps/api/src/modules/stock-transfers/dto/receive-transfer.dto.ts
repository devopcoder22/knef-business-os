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

export class ReceivedItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transferItemId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityReceived!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReceiveTransferDto {
  @ApiProperty({ type: [ReceivedItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  items!: ReceivedItemDto[];
}
