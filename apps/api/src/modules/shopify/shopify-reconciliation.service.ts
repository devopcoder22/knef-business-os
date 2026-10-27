import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductSyncService } from './shopify-product-sync.service';
import { ShopifyInventorySyncService } from './shopify-inventory-sync.service';
import { ShopifyOrderImportService } from './shopify-order-import.service';

export interface ProductReconciliationItem {
  productId: string;
  shopifyProductId: string;
  status: 'IN_SYNC' | 'OUT_OF_SYNC' | 'MISSING_LOCAL' | 'MISSING_SHOPIFY';
}

export interface ReconcileAllResult {
  products: { checked: number; outOfSync: number };
  inventory: { checked: number; discrepancies: number };
  orders: { imported: number };
}

@Injectable()
export class ShopifyReconciliationService {
  private readonly logger = new Logger(ShopifyReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionService: ShopifyConnectionService,
    private readonly productSyncService: ShopifyProductSyncService,
    private readonly inventorySyncService: ShopifyInventorySyncService,
    private readonly orderImportService: ShopifyOrderImportService,
  ) {}

  async reconcileProducts(organizationId: string, connectionId: string): Promise<ProductReconciliationItem[]> {
    const mappings = await this.prisma.shopifyProductMapping.findMany({
      where: { organizationId, externalConnectionId: connectionId, syncStatus: 'SYNCED' },
      include: { product: { select: { id: true, name: true, sku: true, status: true, description: true, sellingPrice: true } }, variant: true },
    });

    const results: ProductReconciliationItem[] = [];

    for (const mapping of mappings) {
      if (!mapping.product || mapping.variantId !== null) continue; // only root mappings

      const variants = await this.prisma.productVariant.findMany({
        where: { productId: mapping.productId },
      });

      const currentHash = this.productSyncService.computeLocalHash(
        mapping.product as Parameters<typeof this.productSyncService.computeLocalHash>[0],
        variants as Parameters<typeof this.productSyncService.computeLocalHash>[1],
      );

      if (mapping.lastLocalHash && mapping.lastLocalHash !== currentHash) {
        // Mark as OUT_OF_SYNC
        await this.prisma.shopifyProductMapping.updateMany({
          where: { organizationId, externalConnectionId: connectionId, productId: mapping.productId },
          data: { syncStatus: 'OUT_OF_SYNC' },
        });
        results.push({
          productId: mapping.productId,
          shopifyProductId: mapping.shopifyProductId,
          status: 'OUT_OF_SYNC',
        });
      } else {
        results.push({
          productId: mapping.productId,
          shopifyProductId: mapping.shopifyProductId,
          status: 'IN_SYNC',
        });
      }
    }

    this.logger.log(`Product reconciliation: ${results.length} checked, ${results.filter(r => r.status === 'OUT_OF_SYNC').length} out of sync`);
    return results;
  }

  async reconcileInventory(organizationId: string, connectionId: string) {
    const reconciliation = await this.inventorySyncService.getInventoryReconciliation(
      organizationId,
      connectionId,
    );
    // Read-only by default — identify discrepancies but don't auto-fix large ones
    const discrepancies = reconciliation.filter(r => r.difference !== 0);
    this.logger.log(
      `Inventory reconciliation: ${reconciliation.length} checked, ${discrepancies.length} discrepancies`,
    );
    return { items: reconciliation, discrepancies: discrepancies.length };
  }

  async reconcileOrders(organizationId: string, connectionId: string) {
    const result = await this.orderImportService.reconcileRecentOrders(organizationId, connectionId);
    this.logger.log(`Order reconciliation: ${result.imported} new orders imported`);
    return result;
  }

  async reconcileAll(organizationId: string, connectionId: string): Promise<ReconcileAllResult> {
    const [productResults, inventoryResult, orderResult] = await Promise.allSettled([
      this.reconcileProducts(organizationId, connectionId),
      this.reconcileInventory(organizationId, connectionId),
      this.reconcileOrders(organizationId, connectionId),
    ]);

    const products =
      productResults.status === 'fulfilled'
        ? {
            checked: productResults.value.length,
            outOfSync: productResults.value.filter(r => r.status === 'OUT_OF_SYNC').length,
          }
        : { checked: 0, outOfSync: 0 };

    const inventory =
      inventoryResult.status === 'fulfilled'
        ? { checked: inventoryResult.value.items.length, discrepancies: inventoryResult.value.discrepancies }
        : { checked: 0, discrepancies: 0 };

    const orders =
      orderResult.status === 'fulfilled'
        ? { imported: orderResult.value.imported }
        : { imported: 0 };

    return { products, inventory, orders };
  }
}
