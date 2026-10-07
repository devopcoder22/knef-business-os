import { IsString, IsNotEmpty, IsOptional, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKpiDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Target value as string (e.g. "100.00")' })
  @IsNumberString()
  target!: string;

  @ApiPropertyOptional({ description: 'Current value as string' })
  @IsOptional()
  @IsNumberString()
  current?: string;

  @ApiPropertyOptional({ description: 'Unit of measurement (e.g. %, NGN, units)' })
  @IsOptional()
  @IsString()
  unit?: string;
}

export class UpdateKpiDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  current?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  target?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
