import { Module } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { EcommercePublicController, EcommerceManagementController } from './ecommerce.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Module({
  imports: [InventoryModule],
  providers: [EcommerceService, ApiKeyGuard],
  controllers: [EcommercePublicController, EcommerceManagementController],
  exports: [EcommerceService],
})
export class EcommerceModule {}
