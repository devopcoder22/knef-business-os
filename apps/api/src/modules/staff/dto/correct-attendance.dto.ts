import { IsDateString, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class CorrectAttendanceDto {
  @ApiProperty({ description: 'Reason for correction — required' })
  @IsString()
  correctionReason!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  clockIn?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  clockOut?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional() @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}
