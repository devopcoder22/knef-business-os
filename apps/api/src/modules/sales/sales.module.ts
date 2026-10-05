import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesOrdersController, InvoicesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { PdfService } from '../../common/services/pdf.service';
import { BusinessRulesModule } from '../business-rules/business-rules.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [InventoryModule, BusinessRulesModule, AuditModule],
  providers: [SalesService, PdfService],
  controllers: [SalesOrdersController, InvoicesController],
  exports: [SalesService],
})
export class SalesModule {}
