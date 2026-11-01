import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierInvoiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @ApiProperty({ description: 'Amount as string' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiPropertyOptional({ default: 'NGN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Invoice date ISO string' })
  @IsString()
  @IsNotEmpty()
  invoiceDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
