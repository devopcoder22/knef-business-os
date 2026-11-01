import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { POSService } from './pos.service';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductStatus, SerializedUnitStatus, SessionStatus } from '@prisma/client';

const mockPrisma: any = {
  pOSSession: { findFirst: jest.fn(), update: jest.fn() },
  salesOrder: { create: jest.fn() },
  serializedUnit: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  payment: { create: jest.fn() },
  receipt: { create: jest.fn() },
  customer: { update: jest.fn() },
  $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrisma)),
};
const mockInventory = { recordMovement: jest.fn() };

describe('POSService — serialized unit validation', () => {
  let service: POSService;

  const openSession = {
    id: 'sess1', status: SessionStatus.OPEN, locationId: 'loc1', organizationId: 'org1', userId: 'u1',
    totalSales: '0', openingFloat: '0',
    location: { id: 'loc1', name: 'Main', code: 'MAIN' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        POSService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryService, useValue: mockInventory },
      ],
    }).compile();
    service = module.get(POSService);
    mockPrisma.pOSSession.findFirst.mockResolvedValue(openSession);
    mockPrisma.salesOrder.create.mockResolvedValue({
      id: 'order1', reference: 'SO-xxx', items: [], customer: null,
    });
    mockPrisma.payment.create.mockResolvedValue({});
    mockPrisma.receipt.create.mockResolvedValue({});
    mockPrisma.pOSSession.update.mockResolvedValue({});
    mockPrisma.serializedUnit.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
  });

  const baseDto = {
    items: [{ productId: 'p1', quantity: 1, unitPrice: '50000', costPrice: '40000', discountRate: '0', serializedUnitId: 'unit1' }],
    payments: [{ method: 'CASH' as const, amount: '50000' }],
  };

  const activeUnit = (overrides: object = {}) => ({
    id: 'unit1', imei1: '123456789012345', imei2: null, serialNumber: null,
    productId: 'p1', status: SerializedUnitStatus.IN_STOCK, locationId: 'loc1',
    product: { id: 'p1', status: ProductStatus.ACTIVE },
    variant: null,
    ...overrides,
  });

  it('rejects sale when unit status is SOLD', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ status: SerializedUnitStatus.SOLD }));
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects sale when unit status is DEFECTIVE', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ status: SerializedUnitStatus.DEFECTIVE }));
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects sale when unit location differs from session location', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ locationId: 'loc2' }));
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate serialized unit in same sale', async () => {
    const dto = {
      items: [
        { productId: 'p1', quantity: 1, unitPrice: '50000', costPrice: '40000', serializedUnitId: 'unit1' },
        { productId: 'p1', quantity: 1, unitPrice: '50000', costPrice: '40000', serializedUnitId: 'unit1' },
      ],
      payments: [{ method: 'CASH' as const, amount: '100000' }],
    };
    await expect(service.processSale('org1', 'sess1', 'u1', dto as any)).rejects.toThrow(BadRequestException);
  });

  it('allows two different IMEIs of same product in same sale', async () => {
    const dto = {
      items: [
        { productId: 'p1', quantity: 1, unitPrice: '50000', costPrice: '40000', serializedUnitId: 'unit1' },
        { productId: 'p1', quantity: 1, unitPrice: '50000', costPrice: '40000', serializedUnitId: 'unit2' },
      ],
      payments: [{ method: 'CASH' as const, amount: '100000' }],
    };
    mockPrisma.serializedUnit.findFirst
      .mockResolvedValueOnce(activeUnit({ id: 'unit1', imei1: 'IMEI1' }))
      .mockResolvedValueOnce(activeUnit({ id: 'unit2', imei1: 'IMEI2' }));
    mockPrisma.serializedUnit.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.processSale('org1', 'sess1', 'u1', dto as any)).resolves.toBeDefined();
    expect(mockPrisma.serializedUnit.updateMany).toHaveBeenCalledTimes(2);
  });

  it('marks unit as SOLD via atomic updateMany', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ imei1: 'IMEI_OK' }));
    mockPrisma.serializedUnit.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.processSale('org1', 'sess1', 'u1', baseDto as any);
    expect(mockPrisma.serializedUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'unit1', status: { in: [SerializedUnitStatus.IN_STOCK, SerializedUnitStatus.RETURNED] } }),
        data: expect.objectContaining({ status: SerializedUnitStatus.SOLD }),
      }),
    );
  });

  it('rejects when serialized quantity != 1', async () => {
    const dto = {
      items: [{ productId: 'p1', quantity: 2, unitPrice: '50000', costPrice: '40000', serializedUnitId: 'unit1' }],
      payments: [{ method: 'CASH' as const, amount: '100000' }],
    };
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ imei1: '123' }));
    await expect(service.processSale('org1', 'sess1', 'u1', dto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects when atomic claim returns count 0 (double-sale race)', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ imei1: 'RACE_IMEI' }));
    mockPrisma.serializedUnit.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('stores IMEI (not CUID) in serialNumbers field', async () => {
    const EXPECTED_IMEI = '356938035643809';
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(activeUnit({ imei1: EXPECTED_IMEI }));
    mockPrisma.serializedUnit.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.processSale('org1', 'sess1', 'u1', baseDto as any);
    const createCall = mockPrisma.salesOrder.create.mock.calls[0][0];
    const item = createCall.data.items.create[0];
    expect(item.serialNumbers).toEqual([EXPECTED_IMEI]);
  });

  it('rejects sale when parent product is DISCONTINUED', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(
      activeUnit({ product: { id: 'p1', status: ProductStatus.DISCONTINUED } })
    );
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects sale when variant is inactive', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(
      activeUnit({ variant: { id: 'v1', isActive: false } })
    );
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });
});
