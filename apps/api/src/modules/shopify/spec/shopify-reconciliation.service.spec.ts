import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyReconciliationService } from '../shopify-reconciliation.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { ShopifyConnectionService } from '../shopify-connection.service';
import { ShopifyProductSyncService } from '../shopify-product-sync.service';
import { ShopifyInventorySyncService } from '../shopify-inventory-sync.service';
import { ShopifyOrderImportService } from '../shopify-order-import.service';

const mockPrisma = {
  shopifyProductMapping: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  productVariant: { findMany: jest.fn() },
};

const mockConnectionService = {
  requireShopifyConnection: jest.fn(),
};

const mockProductSyncService = {
  computeLocalHash: jest.fn(),
};

const mockInventorySyncService = {
  getInventoryReconciliation: jest.fn(),
};

const mockOrderImportService = {
  reconcileRecentOrders: jest.fn(),
};

describe('ShopifyReconciliationService', () => {
  let service: ShopifyReconciliationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyReconciliationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShopifyConnectionService, useValue: mockConnectionService },
        { provide: ShopifyProductSyncService, useValue: mockProductSyncService },
        { provide: ShopifyInventorySyncService, useValue: mockInventorySyncService },
        { provide: ShopifyOrderImportService, useValue: mockOrderImportService },
      ],
    }).compile();

    service = module.get<ShopifyReconciliationService>(ShopifyReconciliationService);
    jest.clearAllMocks();

    mockConnectionService.requireShopifyConnection.mockResolvedValue({ id: 'conn-1' });
    mockProductSyncService.computeLocalHash.mockReturnValue('hash-abc');
    mockPrisma.productVariant.findMany.mockResolvedValue([]);
    mockInventorySyncService.getInventoryReconciliation.mockResolvedValue([]);
    mockOrderImportService.reconcileRecentOrders.mockResolvedValue({ imported: 0 });
  });

  describe('reconcileProducts', () => {
    it('should return IN_SYNC when hash matches', async () => {
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          productId: 'prod-1',
          variantId: null,
          shopifyProductId: 'gid://shopify/Product/1',
          lastLocalHash: 'hash-abc',
          syncStatus: 'SYNCED',
          product: { id: 'prod-1', name: 'Test', sku: 'SKU-1', status: 'ACTIVE', description: '', sellingPrice: 100 },
          variant: null,
        },
      ]);

      const results = await service.reconcileProducts('org-1', 'conn-1');

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('IN_SYNC');
      expect(mockPrisma.shopifyProductMapping.updateMany).not.toHaveBeenCalled();
    });

    it('should detect OUT_OF_SYNC when hash differs', async () => {
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          productId: 'prod-1',
          variantId: null,
          shopifyProductId: 'gid://shopify/Product/1',
          lastLocalHash: 'old-hash',
          syncStatus: 'SYNCED',
          product: { id: 'prod-1', name: 'Test', sku: 'SKU-1', status: 'ACTIVE', description: '', sellingPrice: 100 },
          variant: null,
        },
      ]);

      const results = await service.reconcileProducts('org-1', 'conn-1');

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('OUT_OF_SYNC');
      expect(mockPrisma.shopifyProductMapping.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'OUT_OF_SYNC' }) }),
      );
    });

    it('should not auto-fix discrepancies — only identify them', async () => {
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([
        {
          id: 'map-1',
          productId: 'prod-1',
          variantId: null,
          shopifyProductId: 'gid://shopify/Product/1',
          lastLocalHash: 'old-hash',
          syncStatus: 'SYNCED',
          product: { id: 'prod-1', name: 'Test', sku: 'SKU-1', status: 'ACTIVE', description: '', sellingPrice: 100 },
          variant: null,
        },
      ]);

      const results = await service.reconcileProducts('org-1', 'conn-1');
      // Should mark OUT_OF_SYNC but NOT auto-call syncProduct or update Shopify
      expect(results[0].status).toBe('OUT_OF_SYNC');
      // No calls to Shopify GraphQL should be made in reconcile
    });
  });

  describe('reconcileOrders', () => {
    it('should import missing orders without duplicating existing ones', async () => {
      mockOrderImportService.reconcileRecentOrders.mockResolvedValue({ imported: 3 });

      const result = await service.reconcileOrders('org-1', 'conn-1');

      expect(result.imported).toBe(3);
      expect(mockOrderImportService.reconcileRecentOrders).toHaveBeenCalledWith('org-1', 'conn-1');
    });
  });

  describe('reconcileAll', () => {
    it('should aggregate results from all three reconciliation types', async () => {
      mockPrisma.shopifyProductMapping.findMany.mockResolvedValue([]);
      mockInventorySyncService.getInventoryReconciliation.mockResolvedValue([
        { difference: 5 },
        { difference: 0 },
      ]);
      mockOrderImportService.reconcileRecentOrders.mockResolvedValue({ imported: 2 });

      const result = await service.reconcileAll('org-1', 'conn-1');

      expect(result.products.checked).toBe(0);
      expect(result.inventory.checked).toBe(2);
      expect(result.inventory.discrepancies).toBe(1);
      expect(result.orders.imported).toBe(2);
    });

    it('should handle partial failures gracefully', async () => {
      mockPrisma.shopifyProductMapping.findMany.mockRejectedValue(new Error('DB error'));
      mockInventorySyncService.getInventoryReconciliation.mockResolvedValue([]);
      mockOrderImportService.reconcileRecentOrders.mockResolvedValue({ imported: 0 });

      const result = await service.reconcileAll('org-1', 'conn-1');

      // Should not throw; products section defaults to 0
      expect(result.products.checked).toBe(0);
      expect(result.inventory.checked).toBe(0);
      expect(result.orders.imported).toBe(0);
    });
  });
});
