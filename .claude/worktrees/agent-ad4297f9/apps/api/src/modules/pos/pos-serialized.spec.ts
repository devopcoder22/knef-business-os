import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { POSService } from './pos.service';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SerializedUnitStatus, SessionStatus } from '@prisma/client';

const mockPrisma: any = {
  pOSSession: { findFirst: jest.fn(), update: jest.fn() },
  salesOrder: { create: jest.fn() },
  serializedUnit: { findFirst: jest.fn(), update: jest.fn() },
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

  it('rejects sale when unit status is SOLD', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({
      id: 'unit1', imei1: '123', productId: 'p1', status: SerializedUnitStatus.SOLD, locationId: 'loc1', organizationId: 'org1',
    });
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects sale when unit status is DEFECTIVE', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({
      id: 'unit1', imei1: '123', productId: 'p1', status: SerializedUnitStatus.DEFECTIVE, locationId: 'loc1', organizationId: 'org1',
    });
    await expect(service.processSale('org1', 'sess1', 'u1', baseDto as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects sale when unit location differs from session location', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({
      id: 'unit1', imei1: '123', productId: 'p1', status: SerializedUnitStatus.IN_STOCK, locationId: 'loc2', organizationId: 'org1',
    });
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
      .mockResolvedValueOnce({ id: 'unit1', imei1: 'IMEI1', productId: 'p1', status: SerializedUnitStatus.IN_STOCK, locationId: 'loc1' })
      .mockResolvedValueOnce({ id: 'unit2', imei1: 'IMEI2', productId: 'p1', status: SerializedUnitStatus.IN_STOCK, locationId: 'loc1' });
    await expect(service.processSale('org1', 'sess1', 'u1', dto as any)).resolves.toBeDefined();
    expect(mockPrisma.serializedUnit.update).toHaveBeenCalledTimes(2);
  });

  it('marks unit as SOLD after successful sale', async () => {
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({
      id: 'unit1', imei1: 'IMEI_OK', productId: 'p1', status: SerializedUnitStatus.IN_STOCK, locationId: 'loc1',
    });
    await service.processSale('org1', 'sess1', 'u1', baseDto as any);
    expect(mockPrisma.serializedUnit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'unit1' }, data: expect.objectContaining({ status: SerializedUnitStatus.SOLD }) })
    );
  });

  it('rejects when serialized quantity != 1', async () => {
    const dto = {
      items: [{ productId: 'p1', quantity: 2, unitPrice: '50000', costPrice: '40000', serializedUnitId: 'unit1' }],
      payments: [{ method: 'CASH' as const, amount: '100000' }],
    };
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({
      id: 'unit1', imei1: '123', productId: 'p1', status: SerializedUnitStatus.IN_STOCK, locationId: 'loc1',
    });
    await expect(service.processSale('org1', 'sess1', 'u1', dto as any)).rejects.toThrow(BadRequestException);
  });
});
