import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProductStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma: any = {
  serializedUnit: { findFirst: jest.fn() },
  product: { findFirst: jest.fn(), findMany: jest.fn() },
  productVariant: { findFirst: jest.fn(), create: jest.fn() },
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

  const activeUnit = (overrides: object = {}) => ({
    id: 'u1', imei1: 'SAME_CODE', imei2: null, serialNumber: null, status: 'IN_STOCK', locationId: 'loc1',
    product: { id: 'p1', name: 'Phone', sku: 'PH-001', sellingPrice: '50000', costPrice: '40000', isSerialized: true, hasVariants: false, status: ProductStatus.ACTIVE },
    variant: null,
    ...overrides,
  });

  it('SerializedUnit lookup takes precedence over Product barcode', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit());
    const result = await service.lookupByCode('org1', 'SAME_CODE');
    expect(result.type).toBe('SERIALIZED_UNIT');
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('inactive variant is not resolved', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.productVariant.findFirst.mockResolvedValue(null);
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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activeUnit({ imei1: '111', imei2: 'DUAL_IMEI' }));
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

  it('throws NotFoundException for serialized unit with DISCONTINUED parent product', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(
      activeUnit({ product: { id: 'p1', name: 'Old Phone', sku: 'OP-001', sellingPrice: '30000', costPrice: '25000', isSerialized: true, hasVariants: false, status: ProductStatus.DISCONTINUED } })
    );
    await expect(service.lookupByCode('org1', 'SAME_CODE')).rejects.toThrow(NotFoundException);
  });
});

describe('ProductsService — variant barcode namespace isolation', () => {
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

  it('rejects addVariant when barcode collides with an existing product barcode', async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: 'p1' }) // product exists check
      .mockResolvedValueOnce({ id: 'p2' }); // validateVariantBarcodeUniqueness: barcode found on a product
    mockPrisma.productVariant.findFirst.mockResolvedValueOnce(null); // SKU not taken
    await expect(
      service.addVariant('org1', 'p1', { name: 'V1', sku: 'V1-SKU', barcode: 'PROD_BARCODE' } as any, 'u1')
    ).rejects.toThrow(ConflictException);
  });

  it('rejects addVariant when barcode collides with another variant barcode', async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: 'p1' }) // product exists check
      .mockResolvedValueOnce(null); // validateVariantBarcodeUniqueness: barcode not on any product
    mockPrisma.productVariant.findFirst
      .mockResolvedValueOnce(null) // SKU not taken
      .mockResolvedValueOnce({ id: 'v2' }); // validateVariantBarcodeUniqueness: barcode found on another variant
    await expect(
      service.addVariant('org1', 'p1', { name: 'V1', sku: 'V1-SKU', barcode: 'VAR_BARCODE' } as any, 'u1')
    ).rejects.toThrow(ConflictException);
  });

  it('rejects addVariant when GTIN collides with product GTIN', async () => {
    // addVariant flow: product.findFirst (exists), productVariant.findFirst (SKU),
    // validateVariantBarcodeUniqueness(gtin only — no barcode in dto):
    //   product.findFirst(gtin) → found → ConflictException
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: 'p1' }) // addVariant: product exists
      .mockResolvedValueOnce({ id: 'p3' }); // validateVariantBarcodeUniqueness: gtin found on product
    mockPrisma.productVariant.findFirst
      .mockResolvedValueOnce(null); // SKU not taken
    await expect(
      service.addVariant('org1', 'p1', { name: 'V1', sku: 'V1-SKU', gtin: 'PROD_GTIN' } as any, 'u1')
    ).rejects.toThrow(ConflictException);
  });

  it('rejects product barcode that collides with existing variant barcode', async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce(null); // barcode not on any product
    mockPrisma.productVariant.findFirst.mockResolvedValueOnce({ id: 'v1' }); // barcode found on a variant
    await expect(
      (service as any).validateBarcodeUniqueness('org1', 'VARIANT_BARCODE', undefined)
    ).rejects.toThrow(ConflictException);
  });
});
