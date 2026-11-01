import { IsString, MinLength, MaxLength, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GlobalSearchDto {
  @ApiProperty({ minLength: 2, maxLength: 100, description: 'Search query (2–100 characters)' })
  @IsString()
  @MinLength(2, { message: 'Search query must be at least 2 characters' })
  @MaxLength(100, { message: 'Search query must not exceed 100 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q!: string;

  @ApiPropertyOptional({
    description: 'Comma-separated entity types to search',
    example: 'PRODUCT,CUSTOMER',
  })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 5;
}
