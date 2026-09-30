import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @ApiPropertyOptional({ default: '0', description: 'Opening float amount' })
  @IsOptional()
  @IsString()
  openingFloat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
