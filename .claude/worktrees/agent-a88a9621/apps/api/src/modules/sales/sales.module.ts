import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesOrdersController, InvoicesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { PdfService } from '../../common/services/pdf.service';

@Module({
  imports: [InventoryModule],
  providers: [SalesService, PdfService],
  controllers: [SalesOrdersController, InvoicesController],
  exports: [SalesService],
})
export class SalesModule {}
