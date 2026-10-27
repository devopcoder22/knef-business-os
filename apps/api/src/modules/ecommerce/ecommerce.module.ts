import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EcommerceService } from './ecommerce.service';
import { EcommercePublicController, EcommerceManagementController } from './ecommerce.controller';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyScopeGuard } from '../../common/guards/api-key-scope.guard';

@Module({
  imports: [ConfigModule, InventoryModule, AuditModule, SettingsModule, TestimonialsModule],
  providers: [EcommerceService, ApiKeyGuard, ApiKeyScopeGuard],
  controllers: [EcommercePublicController, EcommerceManagementController, PaystackWebhookController],
  exports: [EcommerceService],
})
export class EcommerceModule {}
