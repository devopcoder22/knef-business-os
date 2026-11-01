import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyGraphQLClient, type UserError } from './shopify-graphql.client';
import { ShopifyConnectionService } from './shopify-connection.service';

export interface ShopifyLocationNode {
  id: string;
  name: string;
  fulfillsOnlineOrders: boolean;
  isActive: boolean;
}

interface ShopifyInventoryLevel {
  location: { id: string };
  quantities: Array<{ name: string; quantity: number }>;
}

@Injectable()
export class ShopifyInventorySyncService {
  private readonly logger = new Logger(ShopifyInventorySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gql: ShopifyGraphQLClient,
    private readonly connectionService: ShopifyConnectionService,
  ) {}

  private get syncEnabled(): boolean {
    return process.env['SHOPIFY_SYNC_ENABLED'] === 'true';
  }

  async getShopifyLocations(organizationId: string, connectionId: string) {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const result = await this.gql.query<{
      locations: {
        edges: Array<{ node: ShopifyLocationNode }>;
      };
    }>(
      shopDomain,
      token,
      `{ locations(first: 50) { edges { node { id name fulfillsOnlineOrders isActive } } } }`,
    );

    if (result.errors?.length) throw new Error(result.errors[0].message);
    return (result.data?.locations?.edges ?? []).map(e => e.node);
  }

  async createLocationMapping(
    organizationId: string,
    connectionId: string,
    locationId: string,
    shopifyLocationId: string,
  ) {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);

    // Verify local location exists
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, organizationId },
    });
    if (!location) throw new NotFoundException('Local location not found');

    // Fetch Shopify location details
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);
    const result = await this.gql.query<{ location: ShopifyLocationNode | null }>(
      shopDomain,
      token,
      `query getLocation($id: ID!) { location(id: $id) { id name fulfillsOnlineOrders isActive } }`,
      { id: shopifyLocationId },
    );

    const shopifyLocation = result.data?.location;

    return this.prisma.shopifyLocationMapping.upsert({
      where: {
        organizationId_externalConnectionId_locationId: {
          organizationId,
          externalConnectionId: connectionId,
          locationId,
        },
      },
      create: {
        organizationId,
        externalConnectionId: connectionId,
        locationId,
        shopifyLocationId,
        shopifyLocationName: shopifyLocation?.name ?? null,
        fulfillsOnlineOrders: shopifyLocation?.fulfillsOnlineOrders ?? false,
      },
      update: {
        shopifyLocationId,
        shopifyLocationName: shopifyLocation?.name ?? null,
        fulfillsOnlineOrders: shopifyLocation?.fulfillsOnlineOrders ?? false,
      },
    });
  }

  async deleteLocationMapping(organizationId: string, connectionId: string, mappingId: string) {
    const mapping = await this.prisma.shopifyLocationMapping.findFirst({
      where: { id: mappingId, organizationId, externalConnectionId: connectionId },
    });
    if (!mapping) throw new NotFoundException('Location mapping not found');
    await this.prisma.shopifyLocationMapping.delete({ where: { id: mappingId } });
  }

  async getLocationMappings(organizationId: string, connectionId: string) {
    return this.prisma.shopifyLocationMapping.findMany({
      where: { organizationId, externalConnectionId: connectionId },
      include: { location: { select: { id: true, name: true, code: true } } },
    });
  }

  async syncInventoryForProduct(
    organizationId: string,
    connectionId: string,
    productId: string,
    variantId?: string,
  ): Promise<void> {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);

    const locationMappings = await this.prisma.shopifyLocationMapping.findMany({
      where: { organizationId, externalConnectionId: connectionId, isActive: true },
    });

    if (locationMappings.length === 0) {
      throw new BadRequestException('No Shopify location mappings configured — map at least one location before syncing inventory');
    }

    if (!this.syncEnabled) {
      this.logger.warn(`SHOPIFY_SYNC_ENABLED is not true — skipping inventory sync for product ${productId}`);
      return;
    }

    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const productMappings = await this.prisma.shopifyProductMapping.findMany({
      where: {
        organizationId,
        externalConnectionId: connectionId,
        productId,
        ...(variantId ? { variantId } : {}),
        shopifyInventoryItemId: { not: null },
        syncStatus: 'SYNCED',
      },
    });

    if (productMappings.length === 0) {
      this.logger.warn(`No synced Shopify mappings found for product ${productId}`);
      return;
    }

    for (const productMapping of productMappings) {
      const inventoryItemId = productMapping.shopifyInventoryItemId!;
      const quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];

      for (const locMapping of locationMappings) {
        const inventoryLevel = await this.prisma.inventoryLevel.findFirst({
          where: {
            productId,
            ...(productMapping.variantId ? { variantId: productMapping.variantId } : { variantId: null }),
            locationId: locMapping.locationId,
          },
        });
        const qty = inventoryLevel ? Number(inventoryLevel.quantity) : 0;
        quantities.push({
          inventoryItemId,
          locationId: locMapping.shopifyLocationId,
          quantity: qty,
        });
      }

      const idempotencyKey = `knef-inv-sync-${inventoryItemId}-${Date.now()}`;
      const input = {
        reason: 'correction',
        setQuantities: quantities,
        name: 'available',
        ignoreCompareQuantity: true,
      };

      const result = await this.gql.mutate<{
        inventorySetQuantities?: { userErrors?: UserError[] };
      }>(
        shopDomain,
        token,
        `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroups { reason changes { inventoryItemId locationId quantity } }
            userErrors { field message }
          }
        }`,
        { input: { ...input, clientMutationId: idempotencyKey } },
      );

      const userErrors = result.data?.inventorySetQuantities?.userErrors ?? [];
      if (userErrors.length > 0) {
        this.logger.warn(`Inventory sync errors for item ${inventoryItemId}: ${userErrors.map((e: UserError) => e.message).join('; ')}`);
      }
    }

    this.logger.log(`Inventory synced for product ${productId} (connection ${connectionId})`);
  }

  async getInventoryReconciliation(organizationId: string, connectionId: string) {
    const conn = await this.connectionService.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.connectionService.getShopDomain(conn);
    const token = this.connectionService.decryptToken(conn);

    const locationMappings = await this.getLocationMappings(organizationId, connectionId);
    if (locationMappings.length === 0) return [];

    const syncedMappings = await this.prisma.shopifyProductMapping.findMany({
      where: {
        organizationId,
        externalConnectionId: connectionId,
        syncStatus: 'SYNCED',
        shopifyInventoryItemId: { not: null },
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true, sku: true } },
      },
    });

    const reconciliation: Array<{
      knefProduct: unknown;
      variant: unknown;
      knefLocationId: string;
      shopifyLocationId: string;
      knefQty: number;
      shopifyQty: number;
      difference: number;
    }> = [];

    for (const mapping of syncedMappings) {
      const inventoryItemId = mapping.shopifyInventoryItemId!;

      // Fetch Shopify inventory levels
      const result = await this.gql.query<{
        inventoryItem: {
          inventoryLevels: { edges: Array<{ node: ShopifyInventoryLevel }> };
        } | null;
      }>(
        shopDomain,
        token,
        `query getInventoryItem($id: ID!) {
          inventoryItem(id: $id) {
            inventoryLevels(first: 50) {
              edges { node {
                location { id }
                quantities(names: ["available"]) { name quantity }
              } }
            }
          }
        }`,
        { id: inventoryItemId },
      );

      const shopifyLevels = result.data?.inventoryItem?.inventoryLevels?.edges?.map(e => e.node) ?? [];

      for (const locMapping of locationMappings) {
        const knefLevel = await this.prisma.inventoryLevel.findFirst({
          where: {
            productId: mapping.productId,
            variantId: mapping.variantId ?? null,
            locationId: locMapping.locationId,
          },
        });
        const knefQty = knefLevel ? Number(knefLevel.quantity) : 0;

        const shopifyLevel = shopifyLevels.find(sl => sl.location.id === locMapping.shopifyLocationId);
        const shopifyQty = shopifyLevel?.quantities?.find(q => q.name === 'available')?.quantity ?? 0;

        reconciliation.push({
          knefProduct: mapping.product,
          variant: mapping.variant,
          knefLocationId: locMapping.locationId,
          shopifyLocationId: locMapping.shopifyLocationId,
          knefQty,
          shopifyQty,
          difference: knefQty - shopifyQty,
        });
      }
    }

    return reconciliation;
  }
}
