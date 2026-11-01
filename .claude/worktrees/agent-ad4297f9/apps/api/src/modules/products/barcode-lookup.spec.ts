import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma: any = {
  serializedUnit: { findFirst: jest.fn() },
  product: { findFirst: jest.fn(), findMany: jest.fn() },
  productVariant: { findFirst: jest.fn() },
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

  it('SerializedUnit lookup takes precedence over Product barcode', async () => {
    const unit = {
      id: 'u1', imei1: 'SAME_CODE', imei2: null, serialNumber: null, status: 'IN_STOCK', locationId: 'loc1',
      product: { id: 'p1', name: 'Phone', sku: 'PH-001', sellingPrice: '50000', costPrice: '40000', isSerialized: true, hasVariants: false },
    };
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(unit); // imei1 match
    const result = await service.lookupByCode('org1', 'SAME_CODE');
    expect(result.type).toBe('SERIALIZED_UNIT'); // SerializedUnit wins over Product barcode
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled(); // did not fall through
  });

  it('inactive variant is not resolved', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null); // null because isActive:false
    mockPrisma.product.findFirst.mockResolvedValue(null);
    await expect(service.lookupByCode('org1', 'INACTIVE_BARCODE')).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException for ambiguous barcode', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    mockPrisma.product.findMany
      .mockResolvedValueOnce([
        { id: 'p1', name: 'A', sku: 'A-001', barcode: 'DUP', gtin: null, sellingPrice: '1000', costPrice: '800', isSerialized: false, hasVariants: false },
        { id: 'p2', name: 'B', sku: 'B-001', barcode: 'DUP', gtin: null, sellingPrice: '1000', costPrice: '800', isSerialized: false, hasVariants: false },
      ]);
    await expect(service.lookupByCode('org1', 'DUP')).rejects.toThrow(ConflictException);
  });

  it('resolves by imei2', async () => {
    mockPrisma.serializedUnit.findFirst
      .mockResolvedValueOnce(null)  // imei1 miss
      .mockResolvedValueOnce({
        id: 'u1', imei1: '111', imei2: 'DUAL_IMEI', serialNumber: null, status: 'IN_STOCK', locationId: 'loc1',
        product: { id: 'p1', name: 'Dual-SIM', sku: 'DS-001', sellingPrice: '50000', costPrice: '40000', isSerialized: true, hasVariants: false },
      }); // imei2 match
    const result = await service.lookupByCode('org1', 'DUAL_IMEI');
    expect(result.type).toBe('SERIALIZED_UNIT');
  });

  it('resolves by SKU as fallback', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);
    const skuProduct = {
      id: 'p5', name: 'SKU Product', sku: 'SKU-001', barcode: null, gtin: null,
      sellingPrice: '10000', costPrice: '8000', isSerialized: false, hasVariants: false,
    };
    mockPrisma.product.findFirst.mockResolvedValueOnce(skuProduct);
    const result = await service.lookupByCode('org1', 'SKU-001');
    expect(result.type).toBe('PRODUCT');
    expect(result.product.sku).toBe('SKU-001');
  });
});
