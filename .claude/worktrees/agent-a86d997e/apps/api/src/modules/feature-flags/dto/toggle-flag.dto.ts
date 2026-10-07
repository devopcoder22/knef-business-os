import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class ToggleFlagDto {
  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;

  @ApiProperty({ required: false, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;
}
