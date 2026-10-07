import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { encrypt, decrypt } from '@knef/utils';
import { ConfigService } from '@nestjs/config';
import { JumiaAdapter, KongaAdapter, ProductListing } from './marketplace.adapter';
import type { MarketplaceAdapter } from './marketplace.adapter';
import { ProductStatus } from '@prisma/client';

export type MarketplaceProvider = 'jumia' | 'konga';

interface ConfigureProviderDto {
  apiKey: string;
  secretKey: string;
  sellerId: string;
}

@Injectable()
export class MarketplaceService {
  private readonly adapters: Map<MarketplaceProvider, MarketplaceAdapter>;
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.adapters = new Map([
      ['jumia', new JumiaAdapter()],
      ['konga', new KongaAdapter()],
    ]);
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY', '0'.repeat(64));
  }

  private getAdapter(provider: MarketplaceProvider): MarketplaceAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new NotFoundException(`Unknown marketplace provider: ${provider}`);
    return adapter;
  }

  async getStatus(organizationId: string) {
    const providers: MarketplaceProvider[] = ['jumia', 'konga'];

    const statuses = await Promise.all(
      providers.map(async (provider) => {
        const [enabledSetting, lastSyncSetting] = await Promise.all([
          this.prisma.systemSetting.findUnique({
            where: {
              organizationId_key: {
                organizationId,
                key: `integration.${provider}.enabled`,
              },
            },
          }),
          this.prisma.systemSetting.findUnique({
            where: {
              organizationId_key: {
                organizationId,
                key: `integration.${provider}.lastSync`,
              },
            },
          }),
        ]);

        const isConfigured = enabledSetting !== null;
        const isActive = enabledSetting?.value === 'true';
        const lastSync = lastSyncSetting?.value ?? null;

        return {
          name: provider,
          isConfigured,
          isActive,
          lastSync,
        };
      }),
    );

    return { data: statuses };
  }

  async configureProvider(
    organizationId: string,
    provider: MarketplaceProvider,
    dto: ConfigureProviderDto,
    userId: string,
  ) {
    this.getAdapter(provider); // validate provider

    const credentials = JSON.stringify({
      apiKey: dto.apiKey,
      secretKey: dto.secretKey,
      sellerId: dto.sellerId,
    });
    const encrypted = encrypt(credentials, this.encryptionKey);

    const upsertSetting = async (key: string, value: string, label: string) => {
      await this.prisma.systemSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: {
          id: `${organizationId}-${key}`,
          organizationId,
          key,
          value,
          label,
          group: 'integrations',
          updatedBy: userId,
        },
        update: {
          value,
          updatedBy: userId,
        },
      });
    };

    await Promise.all([
      upsertSetting(
        `integration.${provider}.enabled`,
        'true',
        `${provider} integration enabled`,
      ),
      upsertSetting(
        `integration.${provider}.credentials`,
        encrypted,
        `${provider} credentials`,
      ),
    ]);

    return { message: `${provider} configured successfully` };
  }

  async syncProducts(organizationId: string, provider: MarketplaceProvider) {
    this.getAdapter(provider); // validate

    // Check configured
    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: `integration.${provider}.enabled` },
      },
    });
    if (!setting || setting.value !== 'true') {
      throw new BadRequestException(`${provider} is not configured or not enabled`);
    }

    // In production: push to BullMQ queue
    // For now: collect active products and return stub
    const products = await this.prisma.product.findMany({
      where: { organizationId, status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        description: true,
        category: { select: { name: true } },
        inventoryLevels: { select: { quantity: true } },
      },
    });

    const listings: ProductListing[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.sellingPrice.toString(),
      stock: p.inventoryLevels.reduce((sum, l) => sum + l.quantity, 0),
      description: p.description ?? undefined,
      categoryName: p.category?.name ?? undefined,
    }));

    // Record sync time
    await this.prisma.systemSetting.upsert({
      where: {
        organizationId_key: { organizationId, key: `integration.${provider}.lastSync` },
      },
      create: {
        id: `${organizationId}-integration.${provider}.lastSync`,
        organizationId,
        key: `integration.${provider}.lastSync`,
        value: new Date().toISOString(),
        label: `${provider} last sync`,
        group: 'integrations',
      },
      update: {
        value: new Date().toISOString(),
      },
    });

    return {
      queued: true,
      message: `Sync job queued for ${provider} (${listings.length} products)`,
    };
  }

  async fetchOrders(organizationId: string, provider: MarketplaceProvider) {
    const adapter = this.getAdapter(provider);

    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: `integration.${provider}.enabled` },
      },
    });
    if (!setting || setting.value !== 'true') {
      throw new BadRequestException(`${provider} is not configured or not enabled`);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const orders = await adapter.fetchOrders(organizationId, since);

    return {
      data: orders,
      meta: {
        provider,
        since: since.toISOString(),
        count: orders.length,
      },
    };
  }

  async getDecryptedCredentials(organizationId: string, provider: MarketplaceProvider) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: `integration.${provider}.credentials`,
        },
      },
    });
    if (!setting) return null;
    try {
      const decrypted = decrypt(setting.value, this.encryptionKey);
      return JSON.parse(decrypted) as { apiKey: string; secretKey: string; sellerId: string };
    } catch {
      return null;
    }
  }
}
