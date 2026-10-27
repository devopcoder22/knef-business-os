import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyOrderImportService } from '../shopify-order-import.service';
import { ShopifyGraphQLClient } from '../shopify-graphql.client';
import { ShopifyConnectionService } from '../shopify-connection.service';
import { PrismaService } from '../../../common/services/prisma.service';

const mockPrisma = {
  salesOrder: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  shopifyLocationMapping: { findFirst: jest.fn() },
  shopifyWebhookEvent: { update: jest.fn() },
  location: { findFirst: jest.fn() },
  shopifyProductMapping: { findFirst: jest.fn() },
};

const mockGql = { query: jest.fn(), mutate: jest.fn() };

const mockConnectionService = {
  requireShopifyConnection: jest.fn(),
  getShopDomain: jest.fn(),
  decryptToken: jest.fn(),
};

const baseConn = { id: 'conn-1', metadata: { domain: 'test.myshopify.com' }, accessTokenEncrypted: 'enc-token' };

const shopifyOrderResponse = {
  data: {
    order: {
      id: 'gid://shopify/Order/100',
      name: '#1001',
      createdAt: '2026-10-26T10:00:00Z',
      displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'UNFULFILLED',
      currencyCode: 'USD',
      email: 'customer@example.com',
      phone: null,
      totalPriceSet: { shopMoney: { amount: '150.00', currencyCode: 'USD' } },
      subtotalPriceSet: { shopMoney: { amount: '130.00' } },
      totalTaxSet: { shopMoney: { amount: '10.00' } },
      totalShippingPriceSet: { shopMoney: { amount: '10.00' } },
      totalDiscountsSet: { shopMoney: { amount: '0.00' } },
      customer: { id: 'gid://shopify/Customer/1', email: 'customer@example.com', firstName: 'John', lastName: 'Doe', phone: null },
      shippingAddress: { address1: '123 Main St', address2: null, city: 'Lagos', province: 'Lagos State', zip: '100001', country: 'Nigeria' },
      lineItems: {
        edges: [
          {
            node: {
              id: 'li-1',
              quantity: 2,
              title: 'Test Product',
              sku: 'SKU-001',
              variantTitle: null,
              variant: { id: 'gid://shopify/ProductVariant/1', sku: 'SKU-001', product: { id: 'gid://shopify/Product/1' } },
              originalTotalSet: { shopMoney: { amount: '130.00' } },
            },
          },
        ],
      },
    },
  },
};

describe('ShopifyOrderImportService', () => {
  let service: ShopifyOrderImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyOrderImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShopifyGraphQLClient, useValue: mockGql },
        { provide: ShopifyConnectionService, useValue: mockConnectionService },
      ],
    }).compile();

    service = module.get<ShopifyOrderImportService>(ShopifyOrderImportService);
    jest.clearAllMocks();

    mockConnectionService.requireShopifyConnection.mockResolvedValue(baseConn);
    mockConnectionService.getShopDomain.mockReturnValue('test.myshopify.com');
    mockConnectionService.decryptToken.mockReturnValue('test-token');
    mockPrisma.salesOrder.findFirst.mockResolvedValue(null);
    mockPrisma.salesOrder.create.mockResolvedValue({ id: 'order-created' });
    mockPrisma.shopifyLocationMapping.findFirst.mockResolvedValue({ locationId: 'loc-1' });
    mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue({ productId: 'prod-1', variantId: 'var-1' });
    mockGql.query.mockResolvedValue(shopifyOrderResponse);
  });

  describe('importOrder', () => {
    it('should create a SalesOrder for a new Shopify order', async () => {
      const result = await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');
      expect(result.created).toBe(true);
      expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalOrderId: 'gid://shopify/Order/100',
            externalProvider: 'shopify',
            channel: 'SHOPIFY',
          }),
        }),
      );
    });

    it('should be idempotent — same order creates only one SalesOrder', async () => {
      // First import succeeds
      await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');

      // Second import — mock existing order found
      mockPrisma.salesOrder.findFirst.mockResolvedValue({ id: 'order-1' });

      const result = await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');
      expect(result.created).toBe(false);
      expect(mockPrisma.salesOrder.create).toHaveBeenCalledTimes(1); // only the first time
    });

    it('should set status COMPLETED for PAID orders', async () => {
      await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');
      expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('should set status CONFIRMED for PENDING orders', async () => {
      mockGql.query.mockResolvedValue({
        data: {
          order: {
            ...shopifyOrderResponse.data.order,
            displayFinancialStatus: 'PENDING',
          },
        },
      });

      await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');
      expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CONFIRMED' }),
        }),
      );
    });

    it('should note unmapped variants but still create the order', async () => {
      mockPrisma.shopifyProductMapping.findFirst.mockResolvedValue(null); // No mapping

      await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');

      // Order is still created
      expect(mockPrisma.salesOrder.create).toHaveBeenCalled();
      // Notes should contain UNMAPPED
      const createCall = mockPrisma.salesOrder.create.mock.calls[0][0];
      expect(createCall.data.notes).toContain('UNMAPPED');
    });

    it('should use Shopify snapshot prices, not current catalogue prices', async () => {
      await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');

      const createCall = mockPrisma.salesOrder.create.mock.calls[0][0];
      // Total amount should come from Shopify order totalPrice, not KNEF catalogue
      expect(parseFloat(createCall.data.totalAmount)).toBe(150.00);
    });

    it('should fallback to first org location when no location mapping exists', async () => {
      mockPrisma.shopifyLocationMapping.findFirst.mockResolvedValue(null);
      mockPrisma.location.findFirst.mockResolvedValue({ id: 'fallback-loc' });

      await service.importOrder('org-1', 'conn-1', 'gid://shopify/Order/100');

      expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ locationId: 'fallback-loc' }),
        }),
      );
    });
  });

  describe('getImportedOrders', () => {
    it('should return paginated list of Shopify-sourced orders', async () => {
      mockPrisma.salesOrder.findMany.mockResolvedValue([]);
      mockPrisma.salesOrder.count.mockResolvedValue(0);

      const result = await service.getImportedOrders('org-1', 'conn-1', 1, 20);
      expect(result.meta.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });
});
