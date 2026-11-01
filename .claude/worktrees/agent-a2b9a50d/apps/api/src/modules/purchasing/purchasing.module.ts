import { Module } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import {
  PurchaseOrdersController,
  GoodsReceiptsController,
  SupplierInvoicesController,
  PurchaseReturnsController,
} from './purchasing.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  providers: [PurchasingService],
  controllers: [
    PurchaseOrdersController,
    GoodsReceiptsController,
    SupplierInvoicesController,
    PurchaseReturnsController,
  ],
  exports: [PurchasingService],
})
export class PurchasingModule {}
