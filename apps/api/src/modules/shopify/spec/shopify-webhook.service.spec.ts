import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyWebhookService } from '../shopify-webhook.service';
import { ShopifyGraphQLClient } from '../shopify-graphql.client';
import { ShopifyConnectionService } from '../shopify-connection.service';
import { ShopifyProductSyncService } from '../shopify-product-sync.service';
import { ShopifyOrderImportService } from '../shopify-order-import.service';
import { PrismaService } from '../../../common/services/prisma.service';
import { QueueService } from '../../../common/services/queue.service';
import { createHmac } from 'crypto';

const mockPrisma = {
  shopifyWebhookEvent: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockGql = { query: jest.fn(), mutate: jest.fn() };

const mockConnectionService = {
  requireShopifyConnection: jest.fn(),
  getShopDomain: jest.fn(),
  decryptToken: jest.fn(),
  handleAppUninstalled: jest.fn(),
};

const mockProductSyncService = {
  handleProductUpdateWebhook: jest.fn(),
  handleProductDeleteWebhook: jest.fn(),
};

const mockOrderImportService = {
  importOrder: jest.fn(),
  cancelImportedOrder: jest.fn(),
};

const mockQueueService = {
  enqueue: jest.fn(),
};

const CLIENT_SECRET = 'test-client-secret';

function signPayload(body: string): string {
  return createHmac('sha256', CLIENT_SECRET).update(body, 'utf8').digest('base64');
}

describe('ShopifyWebhookService', () => {
  let service: ShopifyWebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShopifyGraphQLClient, useValue: mockGql },
        { provide: ShopifyConnectionService, useValue: mockConnectionService },
        { provide: ShopifyProductSyncService, useValue: mockProductSyncService },
        { provide: ShopifyOrderImportService, useValue: mockOrderImportService },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<ShopifyWebhookService>(ShopifyWebhookService);
    jest.clearAllMocks();

    mockPrisma.shopifyWebhookEvent.create.mockResolvedValue({ id: 'event-1' });
    mockPrisma.shopifyWebhookEvent.update.mockResolvedValue({});
  });

  describe('verifySignature', () => {
    it('should accept a valid HMAC', () => {
      const body = '{"test":"payload"}';
      const sig = signPayload(body);
      expect(service.verifySignature(body, sig, CLIENT_SECRET)).toBe(true);
    });

    it('should reject an invalid HMAC', () => {
      const body = '{"test":"payload"}';
      expect(service.verifySignature(body, 'invalid', CLIENT_SECRET)).toBe(false);
    });

    it('should reject when body is modified', () => {
      const original = '{"test":"payload"}';
      const modified = '{"test":"tampered"}';
      const sig = signPayload(original);
      expect(service.verifySignature(modified, sig, CLIENT_SECRET)).toBe(false);
    });
  });

  describe('verifyAndDedup', () => {
    const deliveryId = 'delivery-123';
    const rawBody = '{"test":"payload"}';

    it('should return valid=false for invalid HMAC', async () => {
      const result = await service.verifyAndDedup(deliveryId, 'org-1', 'conn-1', rawBody, 'bad-sig', CLIENT_SECRET);
      expect(result.valid).toBe(false);
      expect(result.duplicate).toBe(false);
    });

    it('should return valid=true duplicate=false for new delivery', async () => {
      mockPrisma.shopifyWebhookEvent.findUnique.mockResolvedValue(null);
      const sig = signPayload(rawBody);
      const result = await service.verifyAndDedup(deliveryId, 'org-1', 'conn-1', rawBody, sig, CLIENT_SECRET);
      expect(result.valid).toBe(true);
      expect(result.duplicate).toBe(false);
    });

    it('should return duplicate=true for already-seen deliveryId', async () => {
      mockPrisma.shopifyWebhookEvent.findUnique.mockResolvedValue({ id: 'event-1' });
      const sig = signPayload(rawBody);
      const result = await service.verifyAndDedup(deliveryId, 'org-1', 'conn-1', rawBody, sig, CLIENT_SECRET);
      expect(result.valid).toBe(true);
      expect(result.duplicate).toBe(true);
    });
  });

  describe('processWebhookWithPayload', () => {
    it('should route orders/create to orderImportService', async () => {
      mockOrderImportService.importOrder.mockResolvedValue({ orderId: 'order-1', created: true });

      await service.processWebhookWithPayload(
        'org-1', 'conn-1', 'orders/create', 'event-1',
        { admin_graphql_api_id: 'gid://shopify/Order/999' },
      );

      expect(mockOrderImportService.importOrder).toHaveBeenCalledWith(
        'org-1', 'conn-1', 'gid://shopify/Order/999', 'event-1',
      );
    });

    it('should route app/uninstalled to connectionService.handleAppUninstalled', async () => {
      await service.processWebhookWithPayload('org-1', 'conn-1', 'app/uninstalled', 'event-1', {});

      expect(mockConnectionService.handleAppUninstalled).toHaveBeenCalledWith('conn-1');
    });

    it('should route products/update to productSyncService', async () => {
      await service.processWebhookWithPayload(
        'org-1', 'conn-1', 'products/update', 'event-1',
        { admin_graphql_api_id: 'gid://shopify/Product/123', id: 123 },
      );

      expect(mockProductSyncService.handleProductUpdateWebhook).toHaveBeenCalledWith(
        'org-1', 'conn-1', 'gid://shopify/Product/123', expect.any(Object),
      );
    });

    it('should route products/delete to productSyncService', async () => {
      await service.processWebhookWithPayload(
        'org-1', 'conn-1', 'products/delete', 'event-1',
        { admin_graphql_api_id: 'gid://shopify/Product/456' },
      );

      expect(mockProductSyncService.handleProductDeleteWebhook).toHaveBeenCalledWith(
        'org-1', 'conn-1', 'gid://shopify/Product/456',
      );
    });

    it('should not auto-restock on refunds/create', async () => {
      // Should not throw and not call any inventory services
      await expect(
        service.processWebhookWithPayload('org-1', 'conn-1', 'refunds/create', 'event-1', {}),
      ).resolves.not.toThrow();
    });
  });

  describe('processWebhookEvent', () => {
    it('should mark event PROCESSING then PROCESSED on success', async () => {
      mockPrisma.shopifyWebhookEvent.findUnique.mockResolvedValue({
        id: 'event-1',
        organizationId: 'org-1',
        externalConnectionId: 'conn-1',
        topic: 'inventory_levels/update',
      });

      await service.processWebhookEvent('event-1');

      expect(mockPrisma.shopifyWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
      );
      expect(mockPrisma.shopifyWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
      );
    });

    it('should mark event FAILED on error', async () => {
      mockPrisma.shopifyWebhookEvent.findUnique.mockResolvedValue({
        id: 'event-1',
        organizationId: 'org-1',
        externalConnectionId: 'conn-1',
        topic: 'app/uninstalled',
      });
      mockConnectionService.handleAppUninstalled.mockRejectedValue(new Error('DB error'));

      await expect(service.processWebhookEvent('event-1')).rejects.toThrow('DB error');

      expect(mockPrisma.shopifyWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });
  });
});
