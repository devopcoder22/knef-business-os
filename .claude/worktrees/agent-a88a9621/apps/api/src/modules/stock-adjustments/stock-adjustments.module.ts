import { Module } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [InventoryModule, AuditModule],
  providers: [StockAdjustmentsService],
  controllers: [StockAdjustmentsController],
  exports: [StockAdjustmentsService],
})
export class StockAdjustmentsModule {}
