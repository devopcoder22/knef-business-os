import { Module } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import {
  PurchaseOrdersController,
  GoodsReceiptsController,
  SupplierInvoicesController,
  PurchaseReturnsController,
} from './purchasing.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { BusinessRulesModule } from '../business-rules/business-rules.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PdfService } from '../../common/services/pdf.service';

@Module({
  imports: [InventoryModule, BusinessRulesModule, AuditModule, PermissionsModule],
  providers: [PurchasingService, PdfService],
  controllers: [
    PurchaseOrdersController,
    GoodsReceiptsController,
    SupplierInvoicesController,
    PurchaseReturnsController,
  ],
  exports: [PurchasingService],
})
export class PurchasingModule {}
