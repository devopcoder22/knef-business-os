import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../common/services/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { BusinessRuleService } from '../business-rules/business-rules.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';

const mockPrisma: any = {
  purchaseOrder: { findFirst: jest.fn(), update: jest.fn() },
  goodsReceipt: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  purchaseOrderItem: { updateMany: jest.fn(), findMany: jest.fn() },
  serializedUnit: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrisma)),
};
const mockInventory = { recordMovement: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };
const mockBusinessRules = { checkPurchaseAmount: jest.fn() };
const mockAudit = { log: jest.fn() };
const mockPermissions = { getResolvedPermissions: jest.fn() };

describe('PurchasingService.createGoodsReceipt — over-receive and serialized', () => {
  let service: PurchasingService;

  const poItems = [{ id: 'poi1', productId: 'p1', variantId: null, quantity: 5, receivedQty: 0, unitCost: '10000' }];
  const approvedPO = {
    id: 'po1', organizationId: 'org1', status: 'APPROVED', locationId: 'loc1',
    items: poItems,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryService, useValue: mockInventory },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: BusinessRuleService, useValue: mockBusinessRules },
        { provide: AuditService, useValue: mockAudit },
        { provide: PermissionsService, useValue: mockPermissions },
      ],
    }).compile();
    service = module.get(PurchasingService);
  });

  it('rejects over-receiving', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    // Inside TX: re-read PO items (fresh data, receivedQty: 0)
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValueOnce(poItems);
    await expect(
      service.createGoodsReceipt('org1', { purchaseOrderId: 'po1', items: [{ productId: 'p1', quantityReceived: 6, unitCost: '10000' }] }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts valid quantity', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    // 1st findMany inside TX: fresh validation read (receivedQty: 0)
    // 2nd findMany inside TX: after update, for PO status determination (receivedQty: 3)
    mockPrisma.purchaseOrderItem.findMany
      .mockResolvedValueOnce(poItems)
      .mockResolvedValueOnce([{ ...poItems[0], receivedQty: 3 }]);
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [{ productId: 'p1', quantityReceived: 3 }] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    await expect(
      service.createGoodsReceipt('org1', { purchaseOrderId: 'po1', items: [{ productId: 'p1', quantityReceived: 3, unitCost: '10000' }] }, 'u1')
    ).resolves.toBeDefined();
  });

  it('rejects product not on PO', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValueOnce(poItems);
    await expect(
      service.createGoodsReceipt('org1', { purchaseOrderId: 'po1', items: [{ productId: 'p999', quantityReceived: 1, unitCost: '10000' }] }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate IMEI within receipt', async () => {
    const po2Items = [{ id: 'poi1', productId: 'p1', variantId: null, quantity: 2, receivedQty: 0, unitCost: '10000' }];
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ ...approvedPO, items: po2Items });
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValueOnce(po2Items);
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 2, unitCost: '10000', serializedUnits: [{ imei1: 'SAME' }, { imei1: 'SAME' }] }],
      }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects IMEI already in org', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    // 1st findMany: fresh validation read; 2nd findMany: PO status determination
    mockPrisma.purchaseOrderItem.findMany
      .mockResolvedValueOnce(poItems)
      .mockResolvedValueOnce([{ ...poItems[0], receivedQty: 1 }]);
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce({ id: 'existing' }); // IMEI already exists
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 1, unitCost: '10000', serializedUnits: [{ imei1: 'EXISTING_IMEI' }] }],
      }, 'u1')
    ).rejects.toThrow(ConflictException);
  });

  it('rejects quantity/IMEI count mismatch', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValueOnce(poItems);
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 2, unitCost: '10000', serializedUnits: [{ imei1: 'ONLY_ONE' }] }],
      }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects whitespace-only IMEI', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.purchaseOrderItem.findMany.mockResolvedValueOnce(poItems);
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 1, unitCost: '10000', serializedUnits: [{ imei1: '   ' }] }],
      }, 'u1')
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException on P2002 (concurrent IMEI)', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(approvedPO);
    mockPrisma.purchaseOrderItem.findMany
      .mockResolvedValueOnce(poItems)
      .mockResolvedValueOnce([{ ...poItems[0], receivedQty: 1 }]);
    mockPrisma.goodsReceipt.create.mockResolvedValue({ id: 'gr1', items: [] });
    mockPrisma.purchaseOrderItem.updateMany.mockResolvedValue({});
    mockPrisma.purchaseOrder.update.mockResolvedValue({});
    mockInventory.recordMovement.mockResolvedValue({});
    mockPrisma.serializedUnit.findFirst.mockResolvedValueOnce(null); // not found by pre-check
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrisma.serializedUnit.create.mockRejectedValueOnce(p2002);
    await expect(
      service.createGoodsReceipt('org1', {
        purchaseOrderId: 'po1',
        items: [{ productId: 'p1', quantityReceived: 1, unitCost: '10000', serializedUnits: [{ imei1: 'CONCURRENT_IMEI' }] }],
      }, 'u1')
    ).rejects.toThrow(ConflictException);
  });
});
