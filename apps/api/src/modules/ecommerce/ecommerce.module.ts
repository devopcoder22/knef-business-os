import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EcommerceService } from './ecommerce.service';
import { EcommercePublicController, EcommerceManagementController } from './ecommerce.controller';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { DiscountModule } from '../discounts/discount.module';
import { GiftCardsModule } from '../gift-cards/gift-card.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { PaystackService } from './paystack.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyScopeGuard } from '../../common/guards/api-key-scope.guard';

@Module({
  imports: [
    ConfigModule,
    InventoryModule,
    AuditModule,
    SettingsModule,
    TestimonialsModule,
    DiscountModule,
    GiftCardsModule,
    StorefrontModule,
  ],
  providers: [EcommerceService, PaystackService, ApiKeyGuard, ApiKeyScopeGuard],
  controllers: [EcommercePublicController, EcommerceManagementController, PaystackWebhookController],
  exports: [EcommerceService],
})
export class EcommerceModule {}
