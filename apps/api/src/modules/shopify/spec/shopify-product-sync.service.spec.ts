import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyProductSyncService } from '../shopify-product-sync.service';
import { ShopifyGraphQLClient } from '../shopify-graphql.client';
import { ShopifyConnectionService } from '../shopify-connection.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  product: { findFirst: jest.fn() },
  shopifyProductMapping: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  productVariant: { findMany: jest.fn() },
};

const mockGql = {
  query: jest.fn(),
  mutate: jest.fn(),
};

const mockConnectionService = {
  requireShopifyConnection: jest.fn(),
  getShopDomain: jest.fn(),
  decryptToken: jest.fn(),
};

const baseProduct = {
  id: 'prod-1',
  name: 'Test Product',
  sku: 'SKU-001',
  status: 'ACTIVE',
  description: 'A test product',
  sellingPrice: 100,
  variants: [],
};

const baseConn = { id: 'conn-1', metadata: { domain: 'test.myshopify.com' }, accessTokenEncrypted: 'enc-token' };

describe('ShopifyProductSyncService', () => {
  let service: ShopifyProductSyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyProductSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShopifyGraphQLClient, useValue: mockGql },
        { provide: ShopifyConnectionService, useValue: mockConnectionService },
      ],
    }).compile();

    service = module.get<ShopifyProductSyncService>(ShopifyProductSyncService);
    jest.clearAllMocks();

    // Default mocks
    mockConnectionService.requireShopifyConnection.mockResolvedValue(baseConn);
    mockConnectionService.getShopDomain.mockReturnValue('test.myshopify.com');
    mockConnectionService.decryptToken.mockReturnValue('test-token');
    mockPrisma.product.findFirst.mockResolvedValue(baseProduct);
    mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue(null);
    mockPrisma.shopifyProductMapping.upsert.mockResolvedValue({});
    mockPrisma.shopifyProductMapping.updateMany.mockResolvedValue({});
    mockPrisma.shopifyProductMapping.update.mockResolvedValue({});
  });

  describe('computeLocalHash', () => {
    it('should produce consistent hashes', () => {
      const h1 = service.computeLocalHash(baseProduct, []);
      const h2 = service.computeLocalHash(baseProduct, []);
      expect(h1).toBe(h2);
    });

    it('should produce different hashes for different products', () => {
      const h1 = service.computeLocalHash(baseProduct, []);
      const h2 = service.computeLocalHash({ ...baseProduct, name: 'Different' }, []);
      expect(h1).not.toBe(h2);
    });
  });

  describe('publishProduct', () => {
    beforeEach(() => {
      process.env['SHOPIFY_SYNC_ENABLED'] = 'true';
    });

    afterEach(() => {
      delete process.env['SHOPIFY_SYNC_ENABLED'];
    });

    it('should create product and mapping in Shopify', async () => {
      mockGql.mutate.mockResolvedValue({
        data: {
          productCreate: {
            product: { id: 'gid://shopify/Product/123', handle: 'test-product', variants: { edges: [] } },
            userErrors: [],
          },
        },
      });

      await service.publishProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).toHaveBeenCalledWith(
        'test.myshopify.com',
        'test-token',
        expect.stringContaining('productCreate'),
        expect.any(Object),
      );
      expect(mockPrisma.shopifyProductMapping.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ syncStatus: 'SYNCED' }),
        }),
      );
    });

    it('should skip if already mapped', async () => {
      mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue({
        id: 'map-1',
        shopifyProductId: 'gid://shopify/Product/existing',
        syncStatus: 'SYNCED',
      });

      await service.publishProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).not.toHaveBeenCalled();
    });

    it('should handle userErrors from Shopify', async () => {
      mockGql.mutate.mockResolvedValue({
        data: {
          productCreate: {
            product: null,
            userErrors: [{ field: ['title'], message: 'Title is required', code: 'BLANK' }],
          },
        },
      });

      await expect(service.publishProduct('org-1', 'conn-1', 'prod-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.shopifyProductMapping.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'FAILED' }) }),
      );
    });

    it('should not call Shopify when sync disabled', async () => {
      delete process.env['SHOPIFY_SYNC_ENABLED'];
      mockPrisma.shopifyProductMapping.upsert.mockResolvedValue({});

      await service.publishProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).not.toHaveBeenCalled();
    });
  });

  describe('syncProduct', () => {
    beforeEach(() => {
      process.env['SHOPIFY_SYNC_ENABLED'] = 'true';
    });

    afterEach(() => {
      delete process.env['SHOPIFY_SYNC_ENABLED'];
    });

    it('should skip sync if hash unchanged (loop prevention)', async () => {
      const hash = service.computeLocalHash(baseProduct, []);
      mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue({
        id: 'map-1',
        shopifyProductId: 'gid://shopify/Product/123',
        lastLocalHash: hash,
        syncStatus: 'SYNCED',
      });

      await service.syncProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).not.toHaveBeenCalled();
    });

    it('should update Shopify if hash changed', async () => {
      mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue({
        id: 'map-1',
        shopifyProductId: 'gid://shopify/Product/123',
        lastLocalHash: 'old-hash',
        syncStatus: 'SYNCED',
      });
      mockGql.mutate.mockResolvedValue({
        data: { productUpdate: { product: { id: 'gid://shopify/Product/123' }, userErrors: [] } },
      });

      await service.syncProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).toHaveBeenCalledWith(
        'test.myshopify.com',
        'test-token',
        expect.stringContaining('productUpdate'),
        expect.any(Object),
      );
      expect(mockPrisma.shopifyProductMapping.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'SYNCED' }) }),
      );
    });

    it('should publish if no existing mapping', async () => {
      const publishSpy = jest.spyOn(service, 'publishProduct').mockResolvedValue(undefined);

      await service.syncProduct('org-1', 'conn-1', 'prod-1');

      expect(publishSpy).toHaveBeenCalledWith('org-1', 'conn-1', 'prod-1');
    });
  });

  describe('getMappings', () => {
    it('should return paginated mappings', async () => {
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([]);
      mockPrisma.shopifyProductMapping.count.mockResolvedValue(0);

      const result = await service.getMappings('org-1', 'conn-1', 1, 20);

      expect(result.meta.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('handleProductUpdateWebhook', () => {
    it('should skip if syncStatus is SYNCED (our own update)', async () => {
      mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue({
        id: 'map-1',
        shopifyProductId: 'gid://shopify/Product/123',
        lastLocalHash: 'some-hash',
        syncStatus: 'SYNCED',
      });

      await service.handleProductUpdateWebhook('org-1', 'conn-1', 'gid://shopify/Product/123', {});

      expect(mockPrisma.shopifyProductMapping.updateMany).not.toHaveBeenCalled();
    });

    it('should mark OUT_OF_SYNC if hash missing', async () => {
      mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue({
        id: 'map-1',
        shopifyProductId: 'gid://shopify/Product/123',
        lastLocalHash: null,
        syncStatus: 'SYNCED',
      });

      await service.handleProductUpdateWebhook('org-1', 'conn-1', 'gid://shopify/Product/123', {});

      expect(mockPrisma.shopifyProductMapping.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'OUT_OF_SYNC' }) }),
      );
    });
  });
});
