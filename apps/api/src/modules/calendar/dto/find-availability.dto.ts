import { IsDateString, IsString, IsOptional, IsArray } from 'class-validator';

export class FindAvailabilityDto {
  @IsDateString()
  timeMin!: string;

  @IsDateString()
  timeMax!: string;

  @IsString()
  timezone!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  calendarIds?: string[];
}
