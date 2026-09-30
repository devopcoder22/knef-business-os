import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordSupplierPaymentDto {
  @ApiProperty({ description: 'Amount as string' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiProperty({ description: 'Payment method e.g. CASH, BANK_TRANSFER' })
  @IsString()
  @IsNotEmpty()
  method!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paidAt?: string;
}
