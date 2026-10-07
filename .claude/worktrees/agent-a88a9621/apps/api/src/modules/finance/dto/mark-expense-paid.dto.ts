import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkExpensePaidDto {
  @ApiPropertyOptional({ description: 'Bank account to deduct from' })
  @IsOptional()
  @IsString()
  bankAccountId?: string;
}
