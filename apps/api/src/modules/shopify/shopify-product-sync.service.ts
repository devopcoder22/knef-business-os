import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyGraphQLClient, type UserError } from './shopify-graphql.client';
import { ShopifyConnectionService } from './shopify-connection.service';

interface ShopifyProduct {
  id: string;
  handle: string;
  title?: string;
  variants?: { edges: Array<{ node: { id: string; sku: string; inventoryItem: { id: string } } }> };
}

interface ShopifyProductCreateResult {
  productCreate?: {
    product?: ShopifyProduct;
    userErrors?: UserError[];
  };
}

interface ShopifyProductUpdateResult {
  productUpdate?: { product?: { id: string }; userErrors?: UserError[] };
}

interface ShopifyVariantBulkCreateResult {
  productVariantsBulkCreate?: {
    product?: { id: string };
    productVariants?: Array<{ id: string; sku: string; inventoryItem: { id: string } }>;
    userErrors?: UserError[];
  };
}

@Injectable()
export class ShopifyProductSyncService {
  private readonly logger = new Logger(ShopifyProductSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gql: ShopifyGraphQLClient,
    private readonly connectionService: ShopifyConnectionService,
  ) {}

  private get syncEnabled(): boolean {
    return process.env['SHOPIFY_SYNC_ENABLED'] === 'true';
  }

  computeLocalHash(
    product: { name: string; sellingPrice: unknown; status: string; description?: string | null; sku: string },
    variants?: Array<{ sku: string; sellingPrice: unknown; isActive: boolean }>,
  ): string {
    const payload = JSON.stringify({
      name: product.name,
      price: String(product.sellingPrice),
      status: product.status,
      description: product.description ?? '',
      sku: product.sku,
      variants: (variants ?? []).map(v => ({ sku: v.sku, price: String(v.sellingPrice), active: v.isActive })),
    });
    return createHash('md5').update(payload).digest('hex');
  }

  async publishProduct(organizationId: string, connectionId: string, productId: string): Promise<void> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: { variants: true, images: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existingMapping = await this.prisma.shopifyProductMapping.findFirst({
      where: { organizationId, externalConnectionId: connectionId, productId, variantId: null },
    });
    if (existingMapping?.shopifyProductId) {
      this.logger.log(`Product ${productId} already mapped to Shopify ${existingMapping.shopifyProductId}`);
      return;
    }

    const localHash = this.computeLocalHash(product, product.variants);

    if (!this.syncEnabled) {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED is not true — skipping Shopify product create for ${productId}`);
      return;
    }

    const statusMap: Record<string, string> = {
      ACTIVE: 'ACTIVE',
      DRAFT: 'DRAFT',
      INACTIVE: 'ARCHIVED',
      DISCONTINUED: 'ARCHIVED',
    };

    // Mark as SYNCING
    await this.prisma.shopifyProductMapping.upsert({
      where: {
        organizationId_externalConnectionId_productId_variantId: {
          organizationId,
          externalConnectionId: connectionId,
          productId,
          variantId: null as unknown as string,
        },
      },
      create: {
        organizationId,
        externalConnectionId: connectionId,
        productId,
        variantId: null,
        shopifyProductId: '',
        syncStatus: 'SYNCING',
      },
      update: { syncStatus: 'SYNCING', syncError: null },
    });

    const productInput = {
      title: product.name,
      descriptionHtml: product.description ?? '',
      status: statusMap[product.status] ?? 'ACTIVE',
      vendor: organizationId,
    };

    const createResult = await this.gql.mutate<ShopifyProductCreateResult>(
      shopDomain,
      token,
      `mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id handle variants(first: 250) { edges { node { id sku inventoryItem { id } } } } }
          userErrors { field message }
        }
      }`,
      { product: productInput },
    );

    const userErrors = createResult.data?.productCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      const errMsg = userErrors.map((e: UserError) => `${e.field.join('.')}: ${e.message}`).join('; ');
      await this.prisma.shopifyProductMapping.updateMany({
        where: { organizationId, externalConnectionId: connectionId, productId },
        data: { syncStatus: 'FAILED', syncError: errMsg, syncRetryCount: { increment: 1 } },
      });
      throw new BadRequestException(`Shopify product create failed: ${errMsg}`);
    }

    const shopifyProduct = createResult.data?.productCreate?.product;
    if (!shopifyProduct) throw new Error('Shopify returned no product after create');

    // Update the root mapping
    await this.prisma.shopifyProductMapping.updateMany({
      where: { organizationId, externalConnectionId: connectionId, productId, variantId: null },
      data: {
        shopifyProductId: shopifyProduct.id,
        shopifyHandle: shopifyProduct.handle,
        syncStatus: 'SYNCED',
        lastLocalHash: localHash,
        lastSyncedAt: new Date(),
        syncError: null,
      },
    });

    // Map variants
    const shopifyVariants = shopifyProduct.variants?.edges.map(e => e.node) ?? [];
    for (const variant of product.variants) {
      const shopifyVariant = shopifyVariants.find(sv => sv.sku === variant.sku);
      if (shopifyVariant) {
        await this.prisma.shopifyProductMapping.upsert({
          where: {
            organizationId_externalConnectionId_productId_variantId: {
              organizationId,
              externalConnectionId: connectionId,
              productId,
              variantId: variant.id,
            },
          },
          create: {
            organizationId,
            externalConnectionId: connectionId,
            productId,
            variantId: variant.id,
            shopifyProductId: shopifyProduct.id,
            shopifyVariantId: shopifyVariant.id,
            shopifyInventoryItemId: shopifyVariant.inventoryItem?.id,
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date(),
          },
          update: {
            shopifyVariantId: shopifyVariant.id,
            shopifyInventoryItemId: shopifyVariant.inventoryItem?.id,
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date(),
          },
        });
      }
    }

    this.logger.log(`Product ${productId} published to Shopify as ${shopifyProduct.id}`);
  }

  async syncProduct(organizationId: string, connectionId: string, productId: string): Promise<void> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const mapping = await this.prisma.shopifyProductMapping.findFirst({
      where: { organizationId, externalConnectionId: connectionId, productId, variantId: null },
    });
    if (!mapping?.shopifyProductId) {
      // Not yet published — publish it
      return this.publishProduct(organizationId, connectionId, productId);
    }

    const localHash = this.computeLocalHash(product, product.variants);
    if (mapping.lastLocalHash === localHash) {
      this.logger.debug(`Product ${productId} hash unchanged — skipping Shopify sync (loop prevention)`);
      return;
    }

    if (!this.syncEnabled) {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED is not true — skipping Shopify product update for ${productId}`);
      return;
    }

    const statusMap: Record<string, string> = {
      ACTIVE: 'ACTIVE', DRAFT: 'DRAFT', INACTIVE: 'ARCHIVED', DISCONTINUED: 'ARCHIVED',
    };

    const updateResult = await this.gql.mutate<ShopifyProductUpdateResult>(
      shopDomain,
      token,
      `mutation productUpdate($id: ID!, $product: ProductUpdateInput!) {
        productUpdate(id: $id, product: $product) {
          product { id }
          userErrors { field message }
        }
      }`,
      {
        id: mapping.shopifyProductId,
        product: {
          title: product.name,
          descriptionHtml: product.description ?? '',
          status: statusMap[product.status] ?? 'ACTIVE',
        },
      },
    );

    const userErrors = updateResult.data?.productUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      const errMsg = userErrors.map((e: UserError) => `${e.field.join('.')}: ${e.message}`).join('; ');
      await this.prisma.shopifyProductMapping.update({
        where: { id: mapping.id },
        data: { syncStatus: 'FAILED', syncError: errMsg, syncRetryCount: { increment: 1 } },
      });
      throw new BadRequestException(`Shopify product update failed: ${errMsg}`);
    }

    await this.prisma.shopifyProductMapping.update({
      where: { id: mapping.id },
      data: { syncStatus: 'SYNCED', lastLocalHash: localHash, lastSyncedAt: new Date(), syncError: null },
    });

    this.logger.log(`Product ${productId} synced to Shopify ${mapping.shopifyProductId}`);
  }

  async archiveProduct(organizationId: string, connectionId: string, productId: string): Promise<void> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const mapping = await this.prisma.shopifyProductMapping.findFirst({
      where: { organizationId, externalConnectionId: connectionId, productId, variantId: null },
    });
    if (!mapping?.shopifyProductId) return;

    if (!this.syncEnabled) {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED is not true — skipping Shopify product archive for ${productId}`);
      return;
    }

    await this.gql.mutate<ShopifyProductUpdateResult>(
      shopDomain,
      token,
      `mutation productUpdate($id: ID!, $product: ProductUpdateInput!) {
        productUpdate(id: $id, product: $product) {
          product { id }
          userErrors { field message }
        }
      }`,
      { id: mapping.shopifyProductId, product: { status: 'ARCHIVED' } },
    );

    await this.prisma.shopifyProductMapping.updateMany({
      where: { organizationId, externalConnectionId: connectionId, productId },
      data: { syncStatus: 'OUT_OF_SYNC' },
    });
  }

  async importShopifyProduct(
    organizationId: string,
    connectionId: string,
    shopifyProductId: string,
  ): Promise<void> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const result = await this.gql.query<{
      product: {
        id: string;
        handle: string;
        title: string;
        variants: { edges: Array<{ node: { id: string; sku: string; barcode: string | null; inventoryItem: { id: string } } }> };
      };
    }>(
      shopDomain,
      token,
      `query getProduct($id: ID!) {
        product(id: $id) {
          id handle title
          variants(first: 250) {
            edges { node { id sku barcode inventoryItem { id } } }
          }
        }
      }`,
      { id: shopifyProductId },
    );

    if (result.errors?.length) throw new Error(result.errors[0].message);
    const shopifyProduct = result.data?.product;
    if (!shopifyProduct) throw new NotFoundException('Shopify product not found');

    const shopifyVariants = shopifyProduct.variants.edges.map(e => e.node);

    for (const sv of shopifyVariants) {
      if (!sv.sku) continue;
      // Try to find a matching local product by SKU
      const localVariant = await this.prisma.productVariant.findFirst({
        where: { sku: sv.sku, product: { organizationId } },
        include: { product: true },
      });
      const localProduct = localVariant
        ? localVariant.product
        : await this.prisma.product.findFirst({ where: { sku: sv.sku, organizationId } });

      if (!localProduct) continue;

      await this.prisma.shopifyProductMapping.upsert({
        where: {
          organizationId_externalConnectionId_shopifyProductId_shopifyVariantId: {
            organizationId,
            externalConnectionId: connectionId,
            shopifyProductId: shopifyProduct.id,
            shopifyVariantId: localVariant ? sv.id : null as unknown as string,
          },
        },
        create: {
          organizationId,
          externalConnectionId: connectionId,
          productId: localProduct.id,
          variantId: localVariant?.id ?? null,
          shopifyProductId: shopifyProduct.id,
          shopifyVariantId: localVariant ? sv.id : null,
          shopifyInventoryItemId: sv.inventoryItem?.id,
          shopifyHandle: shopifyProduct.handle,
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
        },
        update: {
          shopifyInventoryItemId: sv.inventoryItem?.id,
          shopifyHandle: shopifyProduct.handle,
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
        },
      });
    }
  }

  async getMappings(
    organizationId: string,
    connectionId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const [mappings, total] = await Promise.all([
      this.prisma.shopifyProductMapping.findMany({
        where: { organizationId, externalConnectionId: connectionId },
        skip,
        take: limit,
        include: {
          product: { select: { id: true, name: true, sku: true, status: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shopifyProductMapping.count({
        where: { organizationId, externalConnectionId: connectionId },
      }),
    ]);

    return {
      data: mappings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async deleteMapping(organizationId: string, connectionId: string, productId: string): Promise<void> {
    await this.prisma.shopifyProductMapping.deleteMany({
      where: { organizationId, externalConnectionId: connectionId, productId },
    });
  }

  /** Called from webhook handler — update sync status from Shopify product/update event */
  async handleProductUpdateWebhook(
    organizationId: string,
    connectionId: string,
    shopifyProductId: string,
    _payload: unknown,
  ): Promise<void> {
    const mapping = await this.prisma.shopifyProductMapping.findFirst({
      where: { organizationId, externalConnectionId: connectionId, shopifyProductId, variantId: null },
    });
    if (!mapping) return;

    // If last sync hash exists and is recent, this webhook is likely our own update coming back
    // We trust the lastLocalHash as our sync loop prevention mechanism
    if (mapping.lastLocalHash && mapping.syncStatus === 'SYNCED') {
      this.logger.debug(`Shopify webhook products/update for ${shopifyProductId} — skipping (our own push)`);
      return;
    }

    // Mark as OUT_OF_SYNC so reconciliation picks it up
    await this.prisma.shopifyProductMapping.updateMany({
      where: { organizationId, externalConnectionId: connectionId, shopifyProductId },
      data: { syncStatus: 'OUT_OF_SYNC' },
    });
  }

  async handleProductDeleteWebhook(
    organizationId: string,
    connectionId: string,
    shopifyProductId: string,
  ): Promise<void> {
    // Mark as OUT_OF_SYNC — do NOT delete local product
    await this.prisma.shopifyProductMapping.updateMany({
      where: { organizationId, externalConnectionId: connectionId, shopifyProductId },
      data: { syncStatus: 'OUT_OF_SYNC', syncError: 'Shopify product deleted' },
    });
    this.logger.warn(`Shopify product ${shopifyProductId} deleted — marked mappings as OUT_OF_SYNC`);
  }
}
