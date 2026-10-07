import { Module } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { StockCountsController } from './stock-counts.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  providers: [StockCountsService],
  controllers: [StockCountsController],
  exports: [StockCountsService],
})
export class StockCountsModule {}
