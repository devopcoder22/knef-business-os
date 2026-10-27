import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyGraphQLClient } from './shopify-graphql.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { generateReference } from '../../common/utils/references';

interface ShopifyMoneySet {
  shopMoney: { amount: string; currencyCode?: string };
}

interface ShopifyOrderLineItem {
  id: string;
  quantity: number;
  title: string;
  sku: string | null;
  variantTitle: string | null;
  variant: { id: string; sku: string; product: { id: string } } | null;
  originalTotalSet: ShopifyMoneySet;
}

interface ShopifyOrderData {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  currencyCode: string;
  email: string | null;
  phone: string | null;
  totalPriceSet: ShopifyMoneySet;
  subtotalPriceSet: ShopifyMoneySet;
  totalTaxSet: ShopifyMoneySet;
  totalShippingPriceSet: ShopifyMoneySet;
  totalDiscountsSet: ShopifyMoneySet;
  customer: { id: string; email: string | null; firstName: string | null; lastName: string | null; phone: string | null } | null;
  shippingAddress: { address1: string | null; address2: string | null; city: string | null; province: string | null; zip: string | null; country: string | null } | null;
  lineItems: { edges: Array<{ node: ShopifyOrderLineItem }> };
}

const ORDER_QUERY = `
query getOrder($id: ID!) {
  order(id: $id) {
    id name createdAt
    displayFinancialStatus displayFulfillmentStatus
    currencyCode
    email phone
    totalPriceSet { shopMoney { amount currencyCode } }
    subtotalPriceSet { shopMoney { amount } }
    totalTaxSet { shopMoney { amount } }
    totalShippingPriceSet { shopMoney { amount } }
    totalDiscountsSet { shopMoney { amount } }
    customer { id email firstName lastName phone }
    shippingAddress { address1 address2 city province zip country }
    lineItems(first: 50) {
      edges { node {
        id quantity title sku variantTitle
        variant { id sku product { id } }
        originalTotalSet { shopMoney { amount } }
      } }
    }
  }
}`;

@Injectable()
export class ShopifyOrderImportService {
  private readonly logger = new Logger(ShopifyOrderImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gql: ShopifyGraphQLClient,
    private readonly connectionService: ShopifyConnectionService,
  ) {}

  async importOrder(
    organizationId: string,
    connectionId: string,
    shopifyOrderId: string,
    webhookEventId?: string,
  ): Promise<{ orderId: string; created: boolean }> {
    // Idempotency check
    const existing = await this.prisma.salesOrder.findFirst({
      where: { organizationId, externalOrderId: shopifyOrderId, externalProvider: 'shopify' },
    });
    if (existing) {
      this.logger.debug(`Order ${shopifyOrderId} already imported as ${existing.id}`);
      return { orderId: existing.id, created: false };
    }

    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const result = await this.gql.query<{ order: ShopifyOrderData | null }>(
      shopDomain,
      token,
      ORDER_QUERY,
      { id: shopifyOrderId },
    );

    if (result.errors?.length) throw new Error(result.errors[0].message);
    const shopifyOrder = result.data?.order;
    if (!shopifyOrder) throw new Error(`Shopify order ${shopifyOrderId} not found`);

    // Determine KNEF location: first mapped Shopify location, fallback to org first location
    const locationMapping = await this.prisma.shopifyLocationMapping.findFirst({
      where: { organizationId, externalConnectionId: connectionId, isActive: true },
    });
    let locationId: string;
    if (locationMapping) {
      locationId = locationMapping.locationId;
    } else {
      const firstLocation = await this.prisma.location.findFirst({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!firstLocation) throw new Error('No active location found for org');
      locationId = firstLocation.id;
    }

    // Map financial status to KNEF order status
    const statusMap: Record<string, string> = {
      PAID: 'COMPLETED',
      PENDING: 'CONFIRMED',
      AUTHORIZED: 'CONFIRMED',
      VOIDED: 'CANCELLED',
      REFUNDED: 'REFUNDED',
      PARTIALLY_REFUNDED: 'PARTIAL_REFUND',
    };
    const orderStatus = statusMap[shopifyOrder.displayFinancialStatus] ?? 'CONFIRMED';

    const lineItems = shopifyOrder.lineItems.edges.map(e => e.node);
    let unmappedNote = '';

    const orderItems: Array<{
      productId: string;
      variantId: string | null;
      description: string;
      quantity: number;
      unitPrice: string;
      costPrice: string;
      totalPrice: string;
    }> = [];

    for (const li of lineItems) {
      const shopifyVariantId = li.variant?.id ?? null;
      const shopifyProductId = li.variant?.product?.id ?? null;

      let productId: string | null = null;
      let variantId: string | null = null;

      if (shopifyVariantId) {
        const mapping = await this.prisma.shopifyProductMapping.findFirst({
          where: { organizationId, externalConnectionId: connectionId, shopifyVariantId },
        });
        if (mapping) {
          productId = mapping.productId;
          variantId = mapping.variantId ?? null;
        }
      } else if (shopifyProductId) {
        const mapping = await this.prisma.shopifyProductMapping.findFirst({
          where: { organizationId, externalConnectionId: connectionId, shopifyProductId, variantId: null },
        });
        if (mapping) productId = mapping.productId;
      }

      if (!productId) {
        unmappedNote += `UNMAPPED: ${li.title} (Shopify variant: ${shopifyVariantId ?? 'none'}, qty: ${li.quantity})\n`;
        continue;
      }

      const totalPrice = parseFloat(li.originalTotalSet.shopMoney.amount);
      const unitPrice = li.quantity > 0 ? totalPrice / li.quantity : 0;

      orderItems.push({
        productId,
        variantId,
        description: li.title,
        quantity: li.quantity,
        unitPrice: unitPrice.toFixed(2),
        costPrice: '0.00',
        totalPrice: totalPrice.toFixed(2),
      });
    }

    const totalAmount = parseFloat(shopifyOrder.totalPriceSet.shopMoney.amount);
    const subtotal = parseFloat(shopifyOrder.subtotalPriceSet.shopMoney.amount);
    const taxAmount = parseFloat(shopifyOrder.totalTaxSet.shopMoney.amount);
    const deliveryFee = parseFloat(shopifyOrder.totalShippingPriceSet.shopMoney.amount);
    const discountAmount = parseFloat(shopifyOrder.totalDiscountsSet.shopMoney.amount);

    const notes = [
      unmappedNote.trim() ? `Unmapped items:\n${unmappedNote.trim()}` : '',
    ].filter(Boolean).join('\n');

    const orderId = createId();
    const reference = generateReference('SO');

    await this.prisma.salesOrder.create({
      data: {
        id: orderId,
        organizationId,
        reference,
        locationId,
        status: orderStatus as never,
        channel: 'SHOPIFY',
        currency: shopifyOrder.currencyCode,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount: orderStatus === 'COMPLETED' ? totalAmount : 0,
        deliveryFee,
        notes: notes || null,
        externalOrderId: shopifyOrderId,
        externalOrderName: shopifyOrder.name,
        externalProvider: 'shopify',
        externalConnectionId: connectionId,
        items: {
          create: orderItems.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice),
            costPrice: parseFloat(item.costPrice),
            totalPrice: parseFloat(item.totalPrice),
          })),
        },
      },
    });

    // Mark webhook event as processed
    if (webhookEventId) {
      await this.prisma.shopifyWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      }).catch(() => void 0);
    }

    this.logger.log(`Imported Shopify order ${shopifyOrderId} as KNEF order ${orderId}`);
    return { orderId, created: true };
  }

  async getImportedOrders(
    organizationId: string,
    connectionId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { organizationId, externalConnectionId: connectionId, externalProvider: 'shopify' },
        skip,
        take: limit,
        select: {
          id: true,
          reference: true,
          status: true,
          totalAmount: true,
          currency: true,
          externalOrderId: true,
          externalOrderName: true,
          createdAt: true,
          customer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.salesOrder.count({
        where: { organizationId, externalConnectionId: connectionId, externalProvider: 'shopify' },
      }),
    ]);

    return {
      data: orders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async reconcileRecentOrders(organizationId: string, connectionId: string): Promise<{ imported: number }> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const result = await this.gql.query<{
      orders: { edges: Array<{ node: { id: string } }> };
    }>(
      shopDomain,
      token,
      `{ orders(first: 50, sortKey: CREATED_AT, reverse: true) { edges { node { id } } } }`,
    );

    if (result.errors?.length) throw new Error(result.errors[0].message);
    const shopifyOrders = result.data?.orders?.edges?.map(e => e.node) ?? [];

    let imported = 0;
    for (const order of shopifyOrders) {
      try {
        const res = await this.importOrder(organizationId, connectionId, order.id);
        if (res.created) imported++;
      } catch (err) {
        this.logger.warn(`Failed to reconcile order ${order.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return { imported };
  }

  async cancelImportedOrder(organizationId: string, shopifyOrderId: string): Promise<void> {
    await this.prisma.salesOrder.updateMany({
      where: { organizationId, externalOrderId: shopifyOrderId, externalProvider: 'shopify' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Cancelled via Shopify' },
    });
  }
}
