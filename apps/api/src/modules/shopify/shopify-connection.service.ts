import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { ShopifyGraphQLClient } from './shopify-graphql.client';
import { SHOPIFY_CONNECTION_STATUS } from './shopify.constants';
import { decrypt } from '@knef/utils';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ShopifyConnectionService {
  private readonly logger = new Logger(ShopifyConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gql: ShopifyGraphQLClient,
    private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  async getShopifyConnection(organizationId: string) {
    return this.prisma.externalConnection.findFirst({
      where: { organizationId, provider: 'shopify', status: { not: 'disconnected' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requireShopifyConnection(organizationId: string, connectionId: string) {
    const conn = await this.prisma.externalConnection.findFirst({
      where: { id: connectionId, organizationId, provider: 'shopify' },
    });
    if (!conn) throw new NotFoundException('Shopify connection not found');
    return conn;
  }

  getShopDomain(conn: { metadata: unknown }): string {
    const meta = conn.metadata as Record<string, unknown> | null;
    const domain = meta?.['domain'] as string | undefined;
    if (!domain) throw new Error('Shopify connection missing shopDomain in metadata');
    return domain;
  }

  decryptToken(conn: { accessTokenEncrypted: string | null }): string {
    if (!conn.accessTokenEncrypted) throw new Error('No Shopify access token stored');
    return decrypt(conn.accessTokenEncrypted, this.encryptionKey);
  }

  async getShopInfo(organizationId: string, connectionId: string) {
    const conn = await this.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.getShopDomain(conn);
    const token = this.decryptToken(conn);

    const result = await this.gql.query<{ shop: Record<string, unknown> }>(
      shopDomain,
      token,
      `{ shop { id name email myshopifyDomain ianaTimezone currencyCode plan { displayName } } }`,
    );

    if (result.errors?.length) throw new Error(result.errors[0].message);
    return result.data?.shop;
  }

  async healthCheck(organizationId: string, connectionId: string) {
    const conn = await this.requireShopifyConnection(organizationId, connectionId);
    const shopDomain = this.getShopDomain(conn);
    const token = this.decryptToken(conn);

    try {
      const result = await this.gql.query<{ shop: { id: string; name: string } }>(
        shopDomain,
        token,
        `{ shop { id name } }`,
      );

      if (result.errors?.length) {
        await this.prisma.externalConnection.update({
          where: { id: connectionId },
          data: {
            healthStatus: 'degraded',
            lastHealthCheckAt: new Date(),
            lastErrorMessage: result.errors[0].message,
          },
        });
        return { status: SHOPIFY_CONNECTION_STATUS.DEGRADED, error: result.errors[0].message };
      }

      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          healthStatus: 'ok',
          lastHealthCheckAt: new Date(),
          errorCount: 0,
          lastErrorMessage: null,
        },
      });
      return { status: SHOPIFY_CONNECTION_STATUS.CONNECTED, shop: result.data?.shop };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.prisma.externalConnection.update({
        where: { id: connectionId },
        data: {
          healthStatus: 'down',
          lastHealthCheckAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorMessage: message,
        },
      });
      return { status: SHOPIFY_CONNECTION_STATUS.DEGRADED, error: message };
    }
  }

  async getOverview(organizationId: string, connectionId: string) {
    const conn = await this.requireShopifyConnection(organizationId, connectionId);

    const [productMappings, locationMappings, failedWebhooks, importedOrders] = await Promise.all([
      this.prisma.shopifyProductMapping.groupBy({
        by: ['syncStatus'],
        where: { organizationId, externalConnectionId: connectionId },
        _count: true,
      }),
      this.prisma.shopifyLocationMapping.count({
        where: { organizationId, externalConnectionId: connectionId },
      }),
      this.prisma.shopifyWebhookEvent.count({
        where: { organizationId, externalConnectionId: connectionId, status: 'FAILED' },
      }),
      this.prisma.salesOrder.count({
        where: { organizationId, externalConnectionId: connectionId },
      }),
    ]);

    return {
      connection: {
        id: conn.id,
        status: conn.status,
        healthStatus: conn.healthStatus,
        lastHealthCheckAt: conn.lastHealthCheckAt,
        scopes: conn.scopes,
        externalAccountName: conn.externalAccountName,
      },
      productMappings: productMappings.reduce(
        (acc, g) => ({ ...acc, [g.syncStatus]: g._count }),
        {} as Record<string, number>,
      ),
      locationMappings,
      failedWebhooks,
      importedOrders,
    };
  }

  async handleAppUninstalled(connectionId: string): Promise<void> {
    await this.prisma.externalConnection.update({
      where: { id: connectionId },
      data: {
        status: 'disconnected',
        disconnectedAt: new Date(),
        tokenStatus: 'revoked',
        healthStatus: 'down',
      },
    });
    this.logger.warn(`Shopify connection ${connectionId} disconnected via app/uninstalled webhook`);
  }
}
