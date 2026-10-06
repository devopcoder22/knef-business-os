import { Test } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException } from '@nestjs/common';

// Mock prisma and audit
const mockPrisma = {
  product: { findFirst: jest.fn() },
  productVariant: { findFirst: jest.fn() },
  serializedUnit: { findFirst: jest.fn() },
  // add other methods as needed by the service constructor
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
  inventoryLevel: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), create: jest.fn(), count: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  inventoryMovement: { create: jest.fn() },
  productImage: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  productCategory: { findMany: jest.fn(), findFirst: jest.fn() },
  location: { findMany: jest.fn() },
  category: { findFirst: jest.fn() },
  brand: { findFirst: jest.fn() },
};
const mockAudit = { log: jest.fn() };

describe('ProductsService.lookupByCode', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it('resolves by Product.barcode', async () => {
    const product = { id: 'p1', name: 'Phone', sku: 'PH-001', barcode: '1234567890', gtin: null, sellingPrice: '50000', costPrice: '40000', isSerialized: false, hasVariants: false };
    mockPrisma.product.findFirst.mockResolvedValueOnce(product); // barcode match
    const result = await service.lookupByCode('org1', '1234567890');
    expect(result.type).toBe('PRODUCT');
    expect(result.product.id).toBe('p1');
  });

  it('falls through to GTIN when barcode misses', async () => {
    const product = { id: 'p2', name: 'Tablet', sku: 'TB-001', barcode: null, gtin: 'GT001', sellingPrice: '80000', costPrice: '60000', isSerialized: false, hasVariants: false };
    mockPrisma.product.findFirst
      .mockResolvedValueOnce(null)  // barcode miss
      .mockResolvedValueOnce(product); // gtin hit
    const result = await service.lookupByCode('org1', 'GT001');
    expect(result.type).toBe('PRODUCT');
    expect(result.product.id).toBe('p2');
  });

  it('resolves VARIANT by variant barcode', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    const variant = { id: 'v1', name: '128GB', sku: 'PH-001-128', barcode: 'VB001', sellingPrice: '55000', product: { id: 'p1', name: 'Phone', sku: 'PH-001', sellingPrice: '50000', costPrice: '40000', isSerialized: false, hasVariants: true } };
    mockPrisma.productVariant.findFirst.mockResolvedValueOnce(variant).mockResolvedValue(null);
    const result = await service.lookupByCode('org1', 'VB001');
    expect(result.type).toBe('VARIANT');
    expect(result.variant?.id).toBe('v1');
  });

  it('resolves SERIALIZED_UNIT by IMEI', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);
    const unit = { id: 'u1', imei1: '354321000000001', imei2: null, serialNumber: null, status: 'IN_STOCK', locationId: 'loc1', product: { id: 'p1', name: 'Phone', sku: 'PH-001', sellingPrice: '50000', costPrice: '40000', isSerialized: true, hasVariants: false } };
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(unit);
    const result = await service.lookupByCode('org1', '354321000000001');
    expect(result.type).toBe('SERIALIZED_UNIT');
    expect(result.unit?.id).toBe('u1');
  });

  it('throws NotFoundException when nothing matches', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    await expect(service.lookupByCode('org1', 'UNKNOWN')).rejects.toThrow(NotFoundException);
  });

  it('does not cross org boundary — product from different org is not returned', async () => {
    // mockPrisma.product.findFirst returns null because org filter excludes it
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    await expect(service.lookupByCode('org1', 'BARCODE_ORG2')).rejects.toThrow(NotFoundException);
  });

  it('resolves by serialNumber when IMEI misses', async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);
    const unit = { id: 'u2', imei1: null, imei2: null, serialNumber: 'SN-ABC-123', status: 'IN_STOCK', locationId: 'loc1', product: { id: 'p1', name: 'Laptop', sku: 'LP-001', sellingPrice: '200000', costPrice: '150000', isSerialized: true, hasVariants: false } };
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(unit);
    const result = await service.lookupByCode('org1', 'SN-ABC-123');
    expect(result.type).toBe('SERIALIZED_UNIT');
  });

  it('returns correct product shape including sellingPrice and costPrice', async () => {
    const product = { id: 'p3', name: 'Earbuds', sku: 'EB-001', barcode: 'EB001BC', gtin: null, sellingPrice: '15000', costPrice: '10000', isSerialized: false, hasVariants: false };
    mockPrisma.product.findFirst.mockResolvedValueOnce(product);
    const result = await service.lookupByCode('org1', 'EB001BC');
    expect(result.product.sellingPrice).toBeDefined();
    expect(result.product.costPrice).toBeDefined();
  });
});
