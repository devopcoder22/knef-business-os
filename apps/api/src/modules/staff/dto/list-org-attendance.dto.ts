import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class ListOrgAttendanceDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional() @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;
}
