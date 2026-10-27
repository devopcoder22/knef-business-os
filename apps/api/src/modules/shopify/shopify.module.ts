import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ShopifyGraphQLClient } from './shopify-graphql.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductSyncService } from './shopify-product-sync.service';
import { ShopifyInventorySyncService } from './shopify-inventory-sync.service';
import { ShopifyOrderImportService } from './shopify-order-import.service';
import { ShopifyFulfillmentService } from './shopify-fulfillment.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyReconciliationService } from './shopify-reconciliation.service';
import { ShopifyController } from './shopify.controller';
import { ShopifyWebhookController } from './shopify-webhook.controller';

@Module({
  imports: [AuditModule],
  providers: [
    ShopifyGraphQLClient,
    ShopifyConnectionService,
    ShopifyProductSyncService,
    ShopifyInventorySyncService,
    ShopifyOrderImportService,
    ShopifyFulfillmentService,
    ShopifyWebhookService,
    ShopifyReconciliationService,
  ],
  controllers: [ShopifyController, ShopifyWebhookController],
  exports: [
    ShopifyProductSyncService,
    ShopifyInventorySyncService,
    ShopifyOrderImportService,
    ShopifyFulfillmentService,
  ],
})
export class ShopifyModule {}
