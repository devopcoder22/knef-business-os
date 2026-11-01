import { IsOptional, IsString, IsInt, Min, Max, IsBoolean, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type CustomerSortBy = 'name' | 'totalSpent' | 'outstandingBalance' | 'createdAt' | 'lastPurchase';

export class ListCustomersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: ['name', 'totalSpent', 'outstandingBalance', 'createdAt'] })
  @IsOptional()
  @IsIn(['name', 'totalSpent', 'outstandingBalance', 'createdAt'])
  sortBy?: CustomerSortBy;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Filter by segment: NEW|ACTIVE|REPEAT|HIGH_VALUE|AT_RISK|INACTIVE|OUTSTANDING_BALANCE' })
  @IsOptional()
  @IsString()
  segment?: string;

  @ApiPropertyOptional({ description: 'Filter by tag id' })
  @IsOptional()
  @IsString()
  tagId?: string;

  @ApiPropertyOptional({ description: 'Outstanding balance > 0' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasOutstanding?: boolean;
}
