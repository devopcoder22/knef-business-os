import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class SetOverrideDto {
  @ApiProperty({ example: 'sales.apply_discount' })
  @IsString()
  @IsNotEmpty()
  permission!: string;

  @ApiProperty({ example: true, description: 'true = grant, false = deny' })
  @IsBoolean()
  granted!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
