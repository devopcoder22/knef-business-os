/**
 * StockCountsService — unit tests (Phase 24P lifecycle)
 *
 * Covers:
 * 1. createCount() creates DRAFT count with correct fields
 * 2. beginCount() transitions DRAFT → IN_PROGRESS and snapshots inventory
 * 3. beginCount() rejects non-DRAFT count
 * 4. submitCount() transitions IN_PROGRESS → SUBMITTED with variance calculation
 * 5. submitCount() rejects non-IN_PROGRESS count
 * 6. approveCount() transitions UNDER_REVIEW → APPROVED
 * 7. rejectCount() transitions UNDER_REVIEW → REJECTED with reason
 * 8. postCount() applies inventory corrections with intervening movement safety
 * 9. postCount() prevents duplicate post (atomic claim)
 * 10. cancelCount() blocks cancel of POSTED count
 */

import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { MovementType } from '@prisma/client';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    stockCount: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: { data: unknown }) => ({ id: 'sc-1', ...(args.data as object) })),
      update: jest.fn(async (args: { data: unknown }) => ({ id: 'sc-1', ...(args.data as object) })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 0),
    },
    stockCountItem: {
      createMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async (args: { data: unknown }) => ({ id: 'sci-1', ...(args.data as object) })),
    },
    location: {
      findFirst: jest.fn(async () => ({ id: 'loc-1', name: 'Main Store' })),
    },
    inventoryLevel: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({ quantity: 10 })),
    },
    ...overrides,
  };
}

function makeInventoryService() {
  return { recordMovement: jest.fn(async () => ({})) };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const inventoryService = makeInventoryService();
  const service = new StockCountsService(prisma as never, inventoryService as never);
  return { service, prisma, inventoryService };
}

const BASE_COUNT = {
  id: 'sc-1',
  organizationId: 'org-1',
  locationId: 'loc-1',
  reference: 'CNT000001',
  status: 'DRAFT',
  items: [],
};

describe('StockCountsService — Phase 24P lifecycle', () => {
  it('1: createCount() creates a DRAFT stock count', async () => {
    const { service, prisma } = makeService();

    const result = await service.createCount('org-1', { locationId: 'loc-1', notes: 'Full count' }, 'user-1');

    expect(prisma.stockCount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          locationId: 'loc-1',
          createdBy: 'user-1',
        }),
      }),
    );
  });

  it('2: beginCount() transitions DRAFT → IN_PROGRESS and snapshots inventory levels', async () => {
    const levels = [
      { productId: 'p-1', variantId: null, quantity: 50, product: { costPrice: 1000 } },
      { productId: 'p-2', variantId: null, quantity: 20, product: { costPrice: 500 } },
    ];

    const { service, prisma } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'DRAFT' })),
        update: jest.fn(async () => ({ ...BASE_COUNT, status: 'IN_PROGRESS' })),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => []),
      },
      inventoryLevel: {
        findMany: jest.fn(async () => levels),
        findFirst: jest.fn(async () => null),
      },
    });

    await service.beginCount('org-1', 'sc-1', 'user-1');

    expect(prisma.stockCountItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ productId: 'p-1', systemQty: 50 }),
          expect.objectContaining({ productId: 'p-2', systemQty: 20 }),
        ]),
      }),
    );
    expect(prisma.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }),
    );
  });

  it('3: beginCount() throws BadRequestException if count is not DRAFT', async () => {
    const { service } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'IN_PROGRESS' })),
        update: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await expect(service.beginCount('org-1', 'sc-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('4: submitCount() transitions IN_PROGRESS → SUBMITTED with variance and varianceValue', async () => {
    const items = [
      { id: 'sci-1', productId: 'p-1', variantId: null, systemQty: 50, countedQty: 0, unitCostSnapshot: 1000 },
    ];

    const { service, prisma } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'IN_PROGRESS', items })),
        update: jest.fn(async () => ({ ...BASE_COUNT, status: 'SUBMITTED' })),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await service.submitCount('org-1', 'sc-1', [{ stockCountItemId: 'sci-1', countedQty: 45 }], 'user-1');

    expect(prisma.stockCountItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sci-1' },
        data: expect.objectContaining({ countedQty: 45, variance: -5, varianceValue: -5000 }),
      }),
    );
    expect(prisma.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUBMITTED' }),
      }),
    );
  });

  it('5: submitCount() rejects non-IN_PROGRESS count', async () => {
    const { service } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'SUBMITTED', items: [] })),
        update: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await expect(
      service.submitCount('org-1', 'sc-1', [], 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('6: approveCount() transitions UNDER_REVIEW → APPROVED', async () => {
    const { service, prisma } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'UNDER_REVIEW' })),
        update: jest.fn(async () => ({ ...BASE_COUNT, status: 'APPROVED' })),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await service.approveCount('org-1', 'sc-1');

    expect(prisma.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('7: rejectCount() transitions UNDER_REVIEW → REJECTED with reason', async () => {
    const { service, prisma } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'UNDER_REVIEW' })),
        update: jest.fn(async () => ({ ...BASE_COUNT, status: 'REJECTED' })),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await service.rejectCount('org-1', 'sc-1', 'Counts appear incorrect');

    expect(prisma.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'Counts appear incorrect' }),
      }),
    );
  });

  it('8: postCount() applies COUNT_CORRECTION movements accounting for intervening changes', async () => {
    const items = [
      { id: 'sci-1', productId: 'p-1', variantId: null, systemQty: 50, countedQty: 45, unitCostSnapshot: 1000 },
    ];

    const { service, prisma, inventoryService } = makeService({
      stockCount: {
        // updateMany succeeds (atomic claim)
        updateMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn(async () => ({
          ...BASE_COUNT,
          status: 'POSTED',
          locationId: 'loc-1',
          reference: 'CNT000001',
          items,
        })),
        update: jest.fn(async () => ({})),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      inventoryLevel: {
        findFirst: jest.fn(async () => ({ quantity: 52 })), // 2 extra units sold since snapshot
        findMany: jest.fn(),
      },
    });

    await service.postCount('org-1', 'sc-1', 'user-1');

    // counted=45, snapshot=50, variance=-5, live=52, interveningDelta=2
    // correctionQty = -5 - 2 = -7
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        type: MovementType.COUNT_CORRECTION,
        quantity: -7,
      }),
    );
  });

  it('9: postCount() throws ConflictException on duplicate post', async () => {
    const { service } = makeService({
      stockCount: {
        updateMany: jest.fn(async () => ({ count: 0 })), // already claimed
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'POSTED' })),
        update: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await expect(service.postCount('org-1', 'sc-1', 'user-1')).rejects.toThrow(ConflictException);
  });

  it('10: cancelCount() throws BadRequestException when count is POSTED', async () => {
    const { service } = makeService({
      stockCount: {
        findFirst: jest.fn(async () => ({ ...BASE_COUNT, status: 'POSTED' })),
        update: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    });

    await expect(service.cancelCount('org-1', 'sc-1')).rejects.toThrow(BadRequestException);
  });
});
