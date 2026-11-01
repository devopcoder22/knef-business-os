import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsObject,
  MaxLength,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class DateRangeDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class SalesIntelligenceDto extends DateRangeDto {
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class PurchasingIntelligenceDto extends DateRangeDto {
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class CustomerIntelligenceDto extends DateRangeDto {}

export class ForecastSalesDto {
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  @Transform(({ value }: { value: unknown }) => Number(value))
  horizonDays?: number = 30;

  @IsOptional()
  @IsInt()
  @Min(14)
  @Max(365)
  @Transform(({ value }: { value: unknown }) => Number(value))
  windowDays?: number = 90;
}

export class ForecastInventoryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}

export class SimulateDto {
  @IsEnum(['SALES_CHANGE', 'MARGIN_CHANGE', 'EXPENSE_CHANGE', 'DEMAND_CHANGE', 'REORDER'])
  scenario!: 'SALES_CHANGE' | 'MARGIN_CHANGE' | 'EXPENSE_CHANGE' | 'DEMAND_CHANGE' | 'REORDER';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  baselinePeriodDays?: number;

  @IsObject()
  parameters!: Record<string, number | string>;
}

export class AskDto {
  @IsString()
  @MaxLength(500)
  question!: string;
}

export class OverviewQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;
}
