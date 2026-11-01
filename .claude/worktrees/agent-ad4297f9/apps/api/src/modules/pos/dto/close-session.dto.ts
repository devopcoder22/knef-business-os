import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CloseSessionDto {
  @ApiProperty({ description: 'Actual cash counted at close' })
  @IsString()
  @IsNotEmpty()
  closingFloat!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
