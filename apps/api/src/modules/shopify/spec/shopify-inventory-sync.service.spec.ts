import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyInventorySyncService } from '../shopify-inventory-sync.service';
import { ShopifyGraphQLClient } from '../shopify-graphql.client';
import { ShopifyConnectionService } from '../shopify-connection.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  shopifyLocationMapping: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  location: { findFirst: jest.fn() },
  shopifyProductMapping: { findMany: jest.fn() },
  inventoryLevel: { findFirst: jest.fn() },
};

const mockGql = { query: jest.fn(), mutate: jest.fn() };

const mockConnectionService = {
  requireShopifyConnection: jest.fn(),
  getShopDomain: jest.fn(),
  decryptToken: jest.fn(),
};

const baseConn = { id: 'conn-1', metadata: { domain: 'test.myshopify.com' }, accessTokenEncrypted: 'enc-token' };

describe('ShopifyInventorySyncService', () => {
  let service: ShopifyInventorySyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyInventorySyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShopifyGraphQLClient, useValue: mockGql },
        { provide: ShopifyConnectionService, useValue: mockConnectionService },
      ],
    }).compile();

    service = module.get<ShopifyInventorySyncService>(ShopifyInventorySyncService);
    jest.clearAllMocks();

    mockConnectionService.requireShopifyConnection.mockResolvedValue(baseConn);
    mockConnectionService.getShopDomain.mockReturnValue('test.myshopify.com');
    mockConnectionService.decryptToken.mockReturnValue('test-token');
  });

  describe('syncInventoryForProduct', () => {
    beforeEach(() => {
      process.env['SHOPIFY_SYNC_ENABLED'] = 'true';
    });

    afterEach(() => {
      delete process.env['SHOPIFY_SYNC_ENABLED'];
    });

    it('should throw BadRequestException when no location mappings exist', async () => {
      mockPrisma.shopifyLocationMapping.findMany.mockResolvedValue([]);

      await expect(
        service.syncInventoryForProduct('org-1', 'conn-1', 'prod-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call inventorySetQuantities for mapped locations', async () => {
      mockPrisma.shopifyLocationMapping.findMany.mockResolvedValue([
        { locationId: 'loc-1', shopifyLocationId: 'gid://shopify/Location/1', isActive: true },
      ]);
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          productId: 'prod-1',
          variantId: null,
          shopifyInventoryItemId: 'gid://shopify/InventoryItem/1',
          syncStatus: 'SYNCED',
        },
      ]);
      mockPrisma.inventoryLevel.findFirst.mockResolvedValue({ quantity: 50 });
      mockGql.mutate.mockResolvedValue({
        data: { inventorySetQuantities: { userErrors: [] } },
      });

      await service.syncInventoryForProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).toHaveBeenCalledWith(
        'test.myshopify.com',
        'test-token',
        expect.stringContaining('inventorySetQuantities'),
        expect.objectContaining({
          input: expect.objectContaining({
            setQuantities: expect.arrayContaining([
              expect.objectContaining({
                inventoryItemId: 'gid://shopify/InventoryItem/1',
                locationId: 'gid://shopify/Location/1',
                quantity: 50,
              }),
            ]),
          }),
        }),
      );
    });

    it('should block sync when no location mapping but KNEF location exists', async () => {
      mockPrisma.shopifyLocationMapping.findMany.mockResolvedValue([]);

      await expect(
        service.syncInventoryForProduct('org-1', 'conn-1', 'prod-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockGql.mutate).not.toHaveBeenCalled();
    });

    it('should not call Shopify when sync disabled', async () => {
      delete process.env['SHOPIFY_SYNC_ENABLED'];
      mockPrisma.shopifyLocationMapping.findMany.mockResolvedValue([
        { locationId: 'loc-1', shopifyLocationId: 'gid://shopify/Location/1', isActive: true },
      ]);

      await service.syncInventoryForProduct('org-1', 'conn-1', 'prod-1');

      expect(mockGql.mutate).not.toHaveBeenCalled();
    });
  });

  describe('createLocationMapping', () => {
    it('should create a location mapping', async () => {
      mockPrisma.location.findFirst.mockResolvedValue({ id: 'loc-1', name: 'Main Store' });
      mockGql.query.mockResolvedValue({
        data: { location: { id: 'gid://shopify/Location/1', name: 'Main Shopify Location', fulfillsOnlineOrders: true, isActive: true } },
      });
      mockPrisma.shopifyLocationMapping.upsert.mockResolvedValue({ id: 'mapping-1' });

      const result = await service.createLocationMapping('org-1', 'conn-1', 'loc-1', 'gid://shopify/Location/1');
      expect(result).toEqual({ id: 'mapping-1' });
    });

    it('should block cross-org access — wrong org location not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockPrisma.location.findFirst.mockResolvedValue(null); // not found for this org

      await expect(
        service.createLocationMapping('org-wrong', 'conn-1', 'loc-1', 'gid://shopify/Location/1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getInventoryReconciliation', () => {
    it('should return empty array when no location mappings', async () => {
      mockPrisma.shopifyLocationMapping.findMany.mockResolvedValue([]);
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([]);

      const result = await service.getInventoryReconciliation('org-1', 'conn-1');
      expect(result).toEqual([]);
    });
  });
});
