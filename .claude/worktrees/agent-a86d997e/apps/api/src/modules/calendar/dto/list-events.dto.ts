import { IsOptional, IsDateString, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListCalendarEventsDto {
  @IsOptional()
  @IsDateString()
  timeMin?: string;

  @IsOptional()
  @IsDateString()
  timeMax?: string;

  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsOptional()
  @IsString()
  pageToken?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}
