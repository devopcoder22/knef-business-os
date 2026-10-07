import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

const mockPrisma: any = {
  purchaseOrder: { findFirst: jest.fn(), update: jest.fn() },
  goodsReceipt: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  purchaseOrderItem: { updateMany: jest.fn(), findMany: jest.fn() },
  serializedUnit: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrisma)),
};
const mockInventory = { recordMovement: jest.fn() };

describe('PurchasingService.createGoodsReceipt — over-receive and serialized', () => {
  let service: PurchasingService;

  const approvedPO = {
    id: 'po1', organizationId: 'org1', status: 'APPROVED', locationId: 'loc1',
    items: [{ id: 'poi1', productId: 'p1', variantId: null, quantity: 5, receivedQty: 0, unitCost: '10000' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryService, useValue: mockInventory },
      ],
    }).compile();
    service = module.get(PurchasingService);
  });

  it('rejects over-receiving', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    await expect(
      service.createGoodsReceipt('org1', { purchaseOrderId: 'po1', items: [{ productId: 'p1', quantityReceived: 6, unitCost: '10000' }] }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts valid quantity', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [{ productId: 'p1', quantityReceived: 3 }] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([{ ...approvedPO.items[0], receivedQty: 3 }]);
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    await expect(
      service.createGoodsReceipt('org1', { purchaseOrderId: 'po1', items: [{ productId: 'p1', quantityReceived: 3, unitCost: '10000' }] }, 'u1')
    ).resolves.toBeDefined();
  });

  it('rejects product not on PO', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    await expect(
      service.createGoodsReceipt('org1', { purchaseOrderId: 'po1', items: [{ productId: 'p999', quantityReceived: 1, unitCost: '10000' }] }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate IMEI within receipt', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
      ...approvedPO,
      items: [{ id: 'poi1', productId: 'p1', variantId: null, quantity: 2, receivedQty: 0, unitCost: '10000' }],
    });
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([{ productId: 'p1', quantity: 2, receivedQty: 2 }]);
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    mockPrisma.serializedUnit.findFirst.mockResolvedValue(null);
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 2, unitCost: '10000', serializedUnits: [{ imei1: 'SAME' }, { imei1: 'SAME' }] }],
      }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects IMEI already in org', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([{ productId: 'p1', quantity: 5, receivedQty: 1 }]);
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({ id: 'existing' }); // already exists
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 1, unitCost: '10000', serializedUnits: [{ imei1: 'EXISTING_IMEI' }] }],
      }, 'u1')
    ).rejects.toThrow(ConflictException);
  });

  it('rejects quantity/IMEI count mismatch', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([{ productId: 'p1', quantity: 5, receivedQty: 2 }]);
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 2, unitCost: '10000', serializedUnits: [{ imei1: 'ONLY_ONE' }] }],
      }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });
});
