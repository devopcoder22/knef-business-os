import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ClockInDto {
  @ApiPropertyOptional({ description: 'Location ID (must belong to this organization)' })
  @IsOptional() @IsString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'User agent string for clock source detection' })
  @IsOptional() @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Optional latitude (supplemental only)' })
  @IsOptional() @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Optional longitude (supplemental only)' })
  @IsOptional() @IsNumber()
  longitude?: number;
}
