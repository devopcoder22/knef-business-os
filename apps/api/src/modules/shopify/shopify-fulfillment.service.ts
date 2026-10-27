import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyGraphQLClient, type UserError } from './shopify-graphql.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { QueueService } from '../../common/services/queue.service';
import { QUEUES, JOB_TYPES, type ShopifyFulfillmentSyncJobData } from '@knef/constants';

@Injectable()
export class ShopifyFulfillmentService {
  private readonly logger = new Logger(ShopifyFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gql: ShopifyGraphQLClient,
    private readonly connectionService: ShopifyConnectionService,
    private readonly queueService: QueueService,
  ) {}

  private get syncEnabled(): boolean {
    return process.env['SHOPIFY_SYNC_ENABLED'] === 'true';
  }

  /**
   * Enqueue a fulfillment sync job — do NOT call Shopify inside KNEF order transaction
   */
  async syncFulfillmentToShopify(
    organizationId: string,
    connectionId: string,
    salesOrderId: string,
  ): Promise<void> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, organizationId, externalProvider: 'shopify', externalConnectionId: connectionId },
    });
    if (!order?.externalOrderId) {
      this.logger.warn(`Order ${salesOrderId} has no Shopify external order ID — skipping fulfillment sync`);
      return;
    }

    await this.queueService.enqueue<ShopifyFulfillmentSyncJobData>(
      QUEUES.INTEGRATIONS,
      JOB_TYPES.SHOPIFY_FULFILLMENT_SYNC,
      {
        organizationId,
        connectionId,
        salesOrderId,
        shopifyOrderId: order.externalOrderId,
      },
    );
  }

  /**
   * Called by worker: execute fulfillment creation in Shopify
   */
  async executeFulfillmentSync(
    organizationId: string,
    connectionId: string,
    salesOrderId: string,
    shopifyOrderId: string,
  ): Promise<void> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);

    if (!this.syncEnabled) {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED is not true — skipping fulfillment sync for order ${salesOrderId}`);
      return;
    }

    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    // Get fulfillment orders from Shopify
    const foResult = await this.gql.query<{
      order: {
        fulfillmentOrders: {
          edges: Array<{ node: { id: string; status: string; assignedLocation: { id: string } } }>;
        };
      } | null;
    }>(
      shopDomain,
      token,
      `query getFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) {
            edges { node { id status assignedLocation { id } } }
          }
        }
      }`,
      { id: shopifyOrderId },
    );

    const fulfillmentOrders =
      foResult.data?.order?.fulfillmentOrders?.edges?.map(e => e.node).filter(
        fo => fo.status === 'OPEN',
      ) ?? [];

    if (fulfillmentOrders.length === 0) {
      this.logger.debug(`No open fulfillment orders for Shopify order ${shopifyOrderId}`);
      return;
    }

    const fulfillmentInput = {
      lineItemsByFulfillmentOrder: fulfillmentOrders.map(fo => ({
        fulfillmentOrderId: fo.id,
      })),
      notifyCustomer: true,
    };

    const result = await this.gql.mutate<{
      fulfillmentCreateV2?: {
        fulfillment?: { id: string; status: string };
        userErrors?: UserError[];
      };
    }>(
      shopDomain,
      token,
      `mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!, $message: String) {
        fulfillmentCreateV2(fulfillment: $fulfillment, message: $message) {
          fulfillment { id status }
          userErrors { field message }
        }
      }`,
      {
        fulfillment: fulfillmentInput,
        message: `Fulfilled from KNEF Business OS (order ${salesOrderId})`,
      },
    );

    const userErrors = result.data?.fulfillmentCreateV2?.userErrors ?? [];
    if (userErrors.length > 0) {
      const msg = userErrors.map((e: UserError) => e.message).join('; ');
      this.logger.warn(`Fulfillment sync failed for order ${salesOrderId}: ${msg}`);
      throw new Error(`Shopify fulfillment failed: ${msg}`);
    }

    const fulfillment = result.data?.fulfillmentCreateV2?.fulfillment;
    this.logger.log(
      `Fulfillment created in Shopify for order ${salesOrderId}: ${fulfillment?.id} (${fulfillment?.status})`,
    );
  }
}
