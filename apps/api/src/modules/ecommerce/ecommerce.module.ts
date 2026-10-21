import { Module } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { EcommercePublicController, EcommerceManagementController } from './ecommerce.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyScopeGuard } from '../../common/guards/api-key-scope.guard';

@Module({
  imports: [InventoryModule, AuditModule, SettingsModule, TestimonialsModule],
  providers: [EcommerceService, ApiKeyGuard, ApiKeyScopeGuard],
  controllers: [EcommercePublicController, EcommerceManagementController],
  exports: [EcommerceService],
})
export class EcommerceModule {}
