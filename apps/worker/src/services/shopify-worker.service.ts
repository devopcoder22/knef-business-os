/**
 * ShopifyWorkerService — Shopify integration operations executed by the BullMQ worker.
 *
 * This service is a lightweight wrapper that calls the Shopify GraphQL API directly,
 * following the same patterns as IntegrationSyncService. It avoids importing the
 * full API module tree and keeps the worker self-contained.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { decrypt } from '@knef/utils';
import { PrismaService } from './prisma.service';
import type { WorkerConfig } from '../config/worker.config';

const SHOPIFY_API_VERSION = '2026-10';

@Injectable()
export class ShopifyWorkerService {
  private readonly logger = new Logger(ShopifyWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<WorkerConfig>,
  ) {}

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  private async getConnectionAndToken(connectionId: string, organizationId: string) {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId, organizationId, provider: 'shopify' },
    });
    if (!conn || !conn.accessTokenEncrypted) throw new Error('Shopify connection not found or missing token');
    const meta = conn.metadata as Record<string, unknown> | null;
    const shopDomain = meta?.['domain'] as string | undefined;
    if (!shopDomain) throw new Error('Shopify connection missing shopDomain');
    const accessToken = decrypt(conn.accessTokenEncrypted, this.encryptionKey);
    return { conn, shopDomain, accessToken };
  }

  private async gql<T>(shopDomain: string, accessToken: string, document: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
    const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data as T;
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck(organizationId: string, connectionId: string): Promise<void> {
    const { conn, shopDomain, accessToken } = await this.getConnectionAndToken(connectionId, organizationId);
    try {
      await this.gql<{ shop: { id: string } }>(shopDomain, accessToken, `{ shop { id } }`);
      await this.prisma.externalConnection.update({
        where: { id: conn.id },
        data: { healthStatus: 'ok', lastHealthCheckAt: new Date(), errorCount: 0, lastErrorMessage: null },
      });
      this.logger.log(`Shopify health check OK for connection ${connectionId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.externalConnection.update({
        where: { id: conn.id },
        data: { healthStatus: 'down', lastHealthCheckAt: new Date(), lastErrorAt: new Date(), lastErrorMessage: message },
      });
      throw err;
    }
  }

  // ── Product sync ──────────────────────────────────────────────────────────

  async syncProduct(
    organizationId: string,
    connectionId: string,
    productId: string,
    operation: 'publish' | 'update' | 'archive',
  ): Promise<void> {
    if (this.config.get("SHOPIFY_SYNC_ENABLED") !== 'true') {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED=false — skipping product ${operation} for ${productId}`);
      return;
    }

    const { shopDomain, accessToken } = await this.getConnectionAndToken(connectionId, organizationId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: { variants: true },
    });
    if (!product) throw new Error(`Product ${productId} not found`);

    const mapping = await this.prisma.shopifyProductMapping.findFirst({
      where: { organizationId, externalConnectionId: connectionId, productId, variantId: null },
    });

    const statusMap: Record<string, string> = { ACTIVE: 'ACTIVE', DRAFT: 'DRAFT', INACTIVE: 'ARCHIVED', DISCONTINUED: 'ARCHIVED' };

    const computeHash = () => createHash('md5').update(JSON.stringify({
      name: product.name,
      price: String(product.sellingPrice),
      status: product.status,
      description: product.description ?? '',
      sku: product.sku,
    })).digest('hex');

    if (operation === 'archive' && mapping?.shopifyProductId) {
      await this.gql(shopDomain, accessToken,
        `mutation productUpdate($id: ID!, $product: ProductUpdateInput!) {
          productUpdate(id: $id, product: $product) { product { id } userErrors { message } }
        }`,
        { id: mapping.shopifyProductId, product: { status: 'ARCHIVED' } },
      );
      return;
    }

    if (!mapping?.shopifyProductId || operation === 'publish') {
      // Create
      const hash = computeHash();
      const data = await this.gql<{ productCreate: { product: { id: string; handle: string } | null; userErrors: Array<{ message: string }> } }>(
        shopDomain, accessToken,
        `mutation productCreate($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product { id handle }
            userErrors { message }
          }
        }`,
        { product: { title: product.name, descriptionHtml: product.description ?? '', status: statusMap[product.status] ?? 'ACTIVE' } },
      );
      if (data.productCreate.userErrors.length > 0) {
        throw new Error(`Shopify productCreate errors: ${data.productCreate.userErrors.map(e => e.message).join('; ')}`);
      }
      const shopifyProduct = data.productCreate.product;
      if (!shopifyProduct) throw new Error('No product returned from Shopify productCreate');
      await this.prisma.shopifyProductMapping.upsert({
        where: {
          organizationId_externalConnectionId_productId_variantId: {
            organizationId, externalConnectionId: connectionId, productId, variantId: null as unknown as string,
          },
        },
        create: { organizationId, externalConnectionId: connectionId, productId, variantId: null, shopifyProductId: shopifyProduct.id, shopifyHandle: shopifyProduct.handle, syncStatus: 'SYNCED', lastLocalHash: hash, lastSyncedAt: new Date() },
        update: { shopifyProductId: shopifyProduct.id, syncStatus: 'SYNCED', lastLocalHash: hash, lastSyncedAt: new Date() },
      });
    } else {
      // Update
      const hash = computeHash();
      if (mapping.lastLocalHash === hash) {
        this.logger.debug(`Product ${productId} hash unchanged — skipping Shopify update`);
        return;
      }
      await this.gql(shopDomain, accessToken,
        `mutation productUpdate($id: ID!, $product: ProductUpdateInput!) {
          productUpdate(id: $id, product: $product) { product { id } userErrors { message } }
        }`,
        { id: mapping.shopifyProductId, product: { title: product.name, descriptionHtml: product.description ?? '', status: statusMap[product.status] ?? 'ACTIVE' } },
      );
      await this.prisma.shopifyProductMapping.update({ where: { id: mapping.id }, data: { syncStatus: 'SYNCED', lastLocalHash: hash, lastSyncedAt: new Date() } });
    }
    this.logger.log(`Product ${productId} ${operation} completed in Shopify`);
  }

  // ── Inventory sync ────────────────────────────────────────────────────────

  async syncInventory(
    organizationId: string,
    connectionId: string,
    productId?: string,
    variantId?: string,
  ): Promise<void> {
    if (this.config.get("SHOPIFY_SYNC_ENABLED") !== 'true') {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED=false — skipping inventory sync`);
      return;
    }
    const { shopDomain, accessToken } = await this.getConnectionAndToken(connectionId, organizationId);

    const locationMappings = await this.prisma.shopifyLocationMapping.findMany({
      where: { organizationId, externalConnectionId: connectionId, isActive: true },
    });
    if (locationMappings.length === 0) {
      this.logger.warn('No location mappings — skipping inventory sync');
      return;
    }

    const productMappings = await this.prisma.shopifyProductMapping.findMany({
      where: {
        organizationId,
        externalConnectionId: connectionId,
        ...(productId ? { productId } : {}),
        ...(variantId ? { variantId } : {}),
        shopifyInventoryItemId: { not: null },
        syncStatus: 'SYNCED',
      },
    });

    for (const pm of productMappings) {
      const quantities = await Promise.all(locationMappings.map(async lm => {
        const level = await this.prisma.inventoryLevel.findFirst({
          where: { productId: pm.productId, variantId: pm.variantId ?? null, locationId: lm.locationId },
        });
        return { inventoryItemId: pm.shopifyInventoryItemId!, locationId: lm.shopifyLocationId, quantity: level ? Number(level.quantity) : 0 };
      }));

      await this.gql(shopDomain, accessToken,
        `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) { userErrors { message } }
        }`,
        { input: { reason: 'correction', setQuantities: quantities, name: 'available', ignoreCompareQuantity: true } },
      );
    }
    this.logger.log(`Inventory sync completed for ${productMappings.length} mappings`);
  }

  // ── Order import ──────────────────────────────────────────────────────────

  async importOrder(organizationId: string, connectionId: string, shopifyOrderId: string): Promise<void> {
    const existing = await this.prisma.salesOrder.findFirst({
      where: { organizationId, externalOrderId: shopifyOrderId, externalProvider: 'shopify' },
    });
    if (existing) {
      this.logger.debug(`Order ${shopifyOrderId} already imported`);
      return;
    }
    // Delegate to the main import logic — just log for now in worker context
    this.logger.log(`Worker: order ${shopifyOrderId} needs import for org ${organizationId} (connection ${connectionId})`);
  }

  // ── Fulfillment sync ──────────────────────────────────────────────────────

  async syncFulfillment(
    organizationId: string,
    connectionId: string,
    salesOrderId: string,
    shopifyOrderId: string,
  ): Promise<void> {
    if (this.config.get("SHOPIFY_SYNC_ENABLED") !== 'true') {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED=false — skipping fulfillment sync`);
      return;
    }
    const { shopDomain, accessToken } = await this.getConnectionAndToken(connectionId, organizationId);

    const foData = await this.gql<{
      order: { fulfillmentOrders: { edges: Array<{ node: { id: string; status: string } }> } } | null;
    }>(shopDomain, accessToken,
      `query getFO($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { edges { node { id status } } } } }`,
      { id: shopifyOrderId },
    );
    const openFOs = foData.order?.fulfillmentOrders?.edges?.map(e => e.node).filter(fo => fo.status === 'OPEN') ?? [];
    if (openFOs.length === 0) return;

    await this.gql(shopDomain, accessToken,
      `mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
        fulfillmentCreateV2(fulfillment: $fulfillment) { fulfillment { id status } userErrors { message } }
      }`,
      { fulfillment: { lineItemsByFulfillmentOrder: openFOs.map(fo => ({ fulfillmentOrderId: fo.id })), notifyCustomer: true } },
    );
    this.logger.log(`Fulfillment synced to Shopify for order ${salesOrderId}`);
  }

  // ── Webhook processing ────────────────────────────────────────────────────

  async processWebhookEvent(webhookEventId: string): Promise<void> {
    const event = await this.prisma.shopifyWebhookEvent.findUnique({ where: { id: webhookEventId } });
    if (!event) return;

    try {
      await this.prisma.shopifyWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'PROCESSING' },
      });

      this.logger.log(`Processing webhook event ${webhookEventId} topic=${event.topic}`);

      if (event.topic === 'app/uninstalled') {
        await this.prisma.externalConnection.update({
          where: { id: event.externalConnectionId },
          data: { status: 'disconnected', disconnectedAt: new Date(), tokenStatus: 'revoked', healthStatus: 'down' },
        });
      }

      await this.prisma.shopifyWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.shopifyWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'FAILED', error: message.slice(0, 500) },
      });
      throw err;
    }
  }

  // ── Reconcile ─────────────────────────────────────────────────────────────

  async reconcile(organizationId: string, connectionId: string, scope: 'products' | 'inventory' | 'orders' | 'all'): Promise<void> {
    this.logger.log(`Reconciliation scope=${scope} for connection ${connectionId} (org ${organizationId})`);
    // Lightweight reconcile in worker: just mark out-of-sync products
    if (scope === 'products' || scope === 'all') {
      await this.prisma.shopifyProductMapping.updateMany({
        where: { organizationId, externalConnectionId: connectionId, syncStatus: 'OUT_OF_SYNC' },
        data: { syncRetryCount: { increment: 1 } },
      });
    }
  }
}
