import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyGraphQLClient, type UserError } from './shopify-graphql.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyProductSyncService } from './shopify-product-sync.service';
import { ShopifyOrderImportService } from './shopify-order-import.service';
import { SHOPIFY_WEBHOOK_TOPICS } from './shopify.constants';
import { QueueService } from '../../common/services/queue.service';
import { QUEUES, JOB_TYPES, type ShopifyWebhookProcessJobData } from '@knef/constants';

@Injectable()
export class ShopifyWebhookService {
  private readonly logger = new Logger(ShopifyWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gql: ShopifyGraphQLClient,
    private readonly connectionService: ShopifyConnectionService,
    private readonly productSyncService: ShopifyProductSyncService,
    private readonly orderImportService: ShopifyOrderImportService,
    private readonly queueService: QueueService,
  ) {}

  async registerWebhooks(organizationId: string, connectionId: string): Promise<{ registered: number; errors: string[] }> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const callbackBase = process.env['API_URL'] ?? `https://api.knef.com`;
    const callbackUrl = `${callbackBase}/api/v1/shopify/webhooks/${shopDomain}`;

    let registered = 0;
    const errors: string[] = [];

    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      const gqlTopic = topic.replace('/', '_').toUpperCase();
      const result = await this.gql.mutate<{
        webhookSubscriptionCreate?: {
          webhookSubscription?: { id: string; topic: string; callbackUrl: string };
          userErrors?: UserError[];
        };
      }>(
        shopDomain,
        token,
        `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id topic callbackUrl }
            userErrors { field message }
          }
        }`,
        {
          topic: gqlTopic,
          webhookSubscription: { callbackUrl, format: 'JSON' },
        },
      );

      const userErrors = result.data?.webhookSubscriptionCreate?.userErrors ?? [];
      if (userErrors.length > 0) {
        const errMsg = `${topic}: ${userErrors.map((e: UserError) => e.message).join('; ')}`;
        errors.push(errMsg);
        this.logger.warn(`Failed to register webhook ${topic}: ${errMsg}`);
      } else {
        registered++;
        this.logger.log(`Registered Shopify webhook: ${topic} → ${callbackUrl}`);
      }
    }

    return { registered, errors };
  }

  verifySignature(rawBody: string | Buffer, signature: string, clientSecret: string): boolean {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha256', clientSecret).update(body, 'utf8').digest('base64');
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async verifyAndDedup(
    shopifyDeliveryId: string,
    organizationId: string,
    connectionId: string,
    rawBody: string | Buffer,
    signature: string,
    clientSecret: string,
  ): Promise<{ valid: boolean; duplicate: boolean; eventId?: string }> {
    // Signature check first
    if (!this.verifySignature(rawBody, signature, clientSecret)) {
      return { valid: false, duplicate: false };
    }

    // Dedup check
    const existing = await this.prisma.shopifyWebhookEvent.findUnique({
      where: { shopifyDeliveryId },
    });
    if (existing) {
      return { valid: true, duplicate: true, eventId: existing.id };
    }

    return { valid: true, duplicate: false };
  }

  async storeWebhookEvent(
    organizationId: string,
    connectionId: string,
    shopifyDeliveryId: string,
    shopifyEventId: string | null,
    topic: string,
    shopDomain: string,
  ): Promise<string> {
    const event = await this.prisma.shopifyWebhookEvent.create({
      data: {
        id: createId(),
        organizationId,
        externalConnectionId: connectionId,
        shopifyDeliveryId,
        shopifyEventId,
        topic,
        shopDomain,
        status: 'PENDING',
      },
    });
    return event.id;
  }

  async enqueueWebhookProcessing(
    webhookEventId: string,
    organizationId: string,
    connectionId: string,
    topic: string,
  ): Promise<void> {
    await this.queueService.enqueue<ShopifyWebhookProcessJobData>(
      QUEUES.INTEGRATIONS,
      JOB_TYPES.SHOPIFY_WEBHOOK_PROCESS,
      { webhookEventId, organizationId, connectionId, topic },
    );
  }

  async processWebhookEvent(webhookEventId: string): Promise<void> {
    const event = await this.prisma.shopifyWebhookEvent.findUnique({
      where: { id: webhookEventId },
    });
    if (!event) {
      this.logger.warn(`Webhook event ${webhookEventId} not found`);
      return;
    }

    // Mark as PROCESSING
    await this.prisma.shopifyWebhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'PROCESSING' },
    });

    try {
      await this.routeWebhook(event.organizationId, event.externalConnectionId, event.topic, webhookEventId);

      await this.prisma.shopifyWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.shopifyWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'FAILED', error: message.slice(0, 500) },
      });
      throw err;
    }
  }

  private async routeWebhook(
    organizationId: string,
    connectionId: string,
    topic: string,
    webhookEventId: string,
  ): Promise<void> {
    // NOTE: payload is stored in the event but not used here yet — routing is by topic
    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        // We'd need the shopifyOrderId from the webhook payload — stored events need payload
        // For now, log that reconciliation will pick it up
        this.logger.log(`Webhook ${topic} received for event ${webhookEventId} — will be reconciled`);
        break;
      }
      case 'orders/cancelled': {
        this.logger.log(`Webhook orders/cancelled for event ${webhookEventId}`);
        break;
      }
      case 'products/create':
      case 'products/update': {
        this.logger.log(`Webhook ${topic} received for event ${webhookEventId} — sync loop check delegated to reconciliation`);
        break;
      }
      case 'products/delete': {
        this.logger.log(`Webhook products/delete received for event ${webhookEventId}`);
        break;
      }
      case 'inventory_levels/update': {
        // KNEF is authoritative for inventory — log and ignore
        this.logger.debug(`Webhook inventory_levels/update received — KNEF is authoritative, ignoring push-back`);
        break;
      }
      case 'app/uninstalled': {
        await this.connectionService.handleAppUninstalled(connectionId);
        break;
      }
      case 'refunds/create': {
        this.logger.log(`Webhook refunds/create received for event ${webhookEventId} — logged, no auto-restock`);
        break;
      }
      default:
        this.logger.warn(`Unknown webhook topic: ${topic}`);
    }
  }

  /**
   * Extended version: accepts full payload for richer processing
   */
  async processWebhookWithPayload(
    organizationId: string,
    connectionId: string,
    topic: string,
    webhookEventId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const shopifyOrderId = payload['admin_graphql_api_id'] as string | undefined
          ?? (payload['id'] ? `gid://shopify/Order/${payload['id']}` : null);
        if (shopifyOrderId) {
          await this.orderImportService.importOrder(organizationId, connectionId, shopifyOrderId, webhookEventId);
        }
        break;
      }
      case 'orders/cancelled': {
        const shopifyOrderId = payload['admin_graphql_api_id'] as string | undefined
          ?? (payload['id'] ? `gid://shopify/Order/${payload['id']}` : null);
        if (shopifyOrderId) {
          await this.orderImportService.cancelImportedOrder(organizationId, shopifyOrderId);
        }
        break;
      }
      case 'products/update':
      case 'products/create': {
        const shopifyProductId = payload['admin_graphql_api_id'] as string | undefined
          ?? (payload['id'] ? `gid://shopify/Product/${payload['id']}` : null);
        if (shopifyProductId) {
          await this.productSyncService.handleProductUpdateWebhook(organizationId, connectionId, shopifyProductId, payload);
        }
        break;
      }
      case 'products/delete': {
        const shopifyProductId = payload['admin_graphql_api_id'] as string | undefined
          ?? (payload['id'] ? `gid://shopify/Product/${payload['id']}` : null);
        if (shopifyProductId) {
          await this.productSyncService.handleProductDeleteWebhook(organizationId, connectionId, shopifyProductId);
        }
        break;
      }
      case 'inventory_levels/update': {
        this.logger.debug(`inventory_levels/update webhook — KNEF is authoritative, ignoring`);
        break;
      }
      case 'app/uninstalled': {
        await this.connectionService.handleAppUninstalled(connectionId);
        break;
      }
      case 'refunds/create': {
        this.logger.log(`refunds/create webhook logged — no auto-restock`);
        break;
      }
      default:
        this.logger.warn(`Unknown webhook topic: ${topic}`);
    }
  }
}
