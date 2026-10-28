/**
 * PurchasingService.threeWayMatch() — unit tests (Phase 24P)
 *
 * Covers:
 * 1. threeWayMatch() throws NotFoundException for unknown PO
 * 2. threeWayMatch() returns qtyMatch=true when GRN qty matches PO qty
 * 3. threeWayMatch() detects quantity variance
 * 4. threeWayMatch() detects value variance (invoice > PO total)
 * 5. threeWayMatch() aggregates multiple GRNs for same line item
 */

import { NotFoundException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  const baseProduct = { id: 'p-1', name: 'Phone', sku: 'PH-001' };
  const baseSupplier = { id: 's-1', name: 'ACME', code: 'ACME' };

  const basePO = {
    id: 'po-1',
    reference: 'PO-000001',
    status: 'RECEIVED',
    totalAmount: 100000,
    supplier: baseSupplier,
    items: [
      { id: 'poi-1', productId: 'p-1', variantId: null, quantity: 10, unitCost: 10000, totalCost: 100000, product: baseProduct },
    ],
  };

  return {
    purchaseOrder: {
      findFirst: jest.fn(async () => basePO),
    },
    goodsReceipt: {
      findMany: jest.fn(async () => [
        {
          id: 'gr-1',
          items: [{ productId: 'p-1', variantId: null, quantityReceived: 10, unitCost: 10000 }],
        },
      ]),
    },
    supplierInvoice: {
      findMany: jest.fn(async () => [
        { id: 'inv-1', amount: 100000, paidAmount: 0 },
      ]),
    },
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  // PurchasingService takes many dependencies — provide minimal stubs for unused ones
  const service = new PurchasingService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe('PurchasingService.threeWayMatch() (Phase 24P)', () => {
  it('1: throws NotFoundException for unknown PO', async () => {
    const { service } = makeService({
      purchaseOrder: { findFirst: jest.fn(async () => null) },
    });

    await expect(service.threeWayMatch('org-1', 'po-unknown')).rejects.toThrow(NotFoundException);
  });

  it('2: returns qtyMatch=true when GRN qty equals PO qty', async () => {
    const { service } = makeService();

    const result = await service.threeWayMatch('org-1', 'po-1');

    expect(result.match.quantityMatch).toBe(true);
    expect(result.lines[0].qtyMatch).toBe(true);
    expect(result.lines[0].poQty).toBe(10);
    expect(result.lines[0].grnQty).toBe(10);
  });

  it('3: detects quantity variance when GRN qty differs from PO qty', async () => {
    const { service } = makeService({
      goodsReceipt: {
        findMany: jest.fn(async () => [
          {
            id: 'gr-1',
            items: [{ productId: 'p-1', variantId: null, quantityReceived: 8, unitCost: 10000 }],
          },
        ]),
      },
    });

    const result = await service.threeWayMatch('org-1', 'po-1');

    expect(result.match.quantityMatch).toBe(false);
    expect(result.lines[0].qtyVariance).toBe(-2);
    expect(result.match.requiresReview).toBe(true);
  });

  it('4: detects value variance when invoice total exceeds PO total by more than 5%', async () => {
    const { service } = makeService({
      supplierInvoice: {
        findMany: jest.fn(async () => [
          { id: 'inv-1', amount: 110000, paidAmount: 0 }, // 10% over
        ]),
      },
    });

    const result = await service.threeWayMatch('org-1', 'po-1');

    expect(result.match.valueVariance).toBe(10000);
    expect(result.match.valueMatchWithin5Pct).toBe(false);
    expect(result.match.requiresReview).toBe(true);
  });

  it('5: aggregates multiple GRNs for the same line item', async () => {
    const { service } = makeService({
      goodsReceipt: {
        findMany: jest.fn(async () => [
          {
            id: 'gr-1',
            items: [{ productId: 'p-1', variantId: null, quantityReceived: 6, unitCost: 10000 }],
          },
          {
            id: 'gr-2',
            items: [{ productId: 'p-1', variantId: null, quantityReceived: 4, unitCost: 10000 }],
          },
        ]),
      },
    });

    const result = await service.threeWayMatch('org-1', 'po-1');

    expect(result.lines[0].grnQty).toBe(10); // 6+4
    expect(result.match.quantityMatch).toBe(true);
  });
});
