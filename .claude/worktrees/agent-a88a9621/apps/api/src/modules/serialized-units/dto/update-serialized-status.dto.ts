import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SerializedUnitStatus } from '@prisma/client';

export class UpdateSerializedStatusDto {
  @ApiProperty({ enum: SerializedUnitStatus })
  @IsEnum(SerializedUnitStatus)
  status!: SerializedUnitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
