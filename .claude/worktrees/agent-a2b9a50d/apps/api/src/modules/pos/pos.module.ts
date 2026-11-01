import { Module } from '@nestjs/common';
import { POSService } from './pos.service';
import { POSController } from './pos.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [InventoryModule, SalesModule],
  providers: [POSService],
  controllers: [POSController],
  exports: [POSService],
})
export class POSModule {}
