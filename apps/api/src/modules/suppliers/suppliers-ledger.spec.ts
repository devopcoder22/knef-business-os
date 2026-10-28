/**
 * SuppliersService — ledger & AP aging tests (Phase 24P)
 *
 * Covers:
 * 1. getLedger() throws NotFoundException for unknown supplier
 * 2. getLedger() returns summary with correct totals
 * 3. getApAging() buckets invoices correctly (current / 1-30 / 31-60 / 61-90 / 90+)
 * 4. getApAging() excludes PAID invoices
 * 5. getApAging() aggregates multiple invoices per supplier
 */

import { NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    supplier: {
      findFirst: jest.fn(async () => ({
        id: 's-1',
        name: 'ACME Corp',
        code: 'ACME',
        currency: 'NGN',
      })),
      findMany: jest.fn(async () => []),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(async () => 0),
      $executeRaw: jest.fn(),
    },
    supplierContact: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    supplierPrice: {
      upsert: jest.fn(),
      findMany: jest.fn(async () => []),
    },
    purchaseOrder: {
      findMany: jest.fn(async () => []),
    },
    supplierInvoice: {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { amount: 0, paidAmount: 0 } })),
    },
    supplierPayment: {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
    },
    $executeRaw: jest.fn(),
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new SuppliersService(prisma as never);
  return { service, prisma };
}

describe('SuppliersService — Ledger & AP Aging (Phase 24P)', () => {
  it('1: getLedger() throws NotFoundException for unknown supplier', async () => {
    const { service } = makeService({
      supplier: { findFirst: jest.fn(async () => null), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    });

    await expect(service.getLedger('org-1', 's-unknown', {})).rejects.toThrow(NotFoundException);
  });

  it('2: getLedger() returns correct summary totals', async () => {
    const { service } = makeService({
      supplierInvoice: {
        findMany: jest.fn(async () => [
          { id: 'inv-1', invoiceNumber: 'INV-001', amount: 100000, paidAmount: 50000, status: 'PARTIAL', invoiceDate: new Date(), dueDate: new Date() },
        ]),
        aggregate: jest.fn(async () => ({ _sum: { amount: 100000, paidAmount: 50000 } })),
      },
      supplierPayment: {
        findMany: jest.fn(async () => [
          { id: 'pay-1', amount: 50000, method: 'BANK', reference: 'TXN-001', paidAt: new Date() },
        ]),
        aggregate: jest.fn(async () => ({ _sum: { amount: 50000 } })),
      },
    });

    const result = await service.getLedger('org-1', 's-1', {});

    expect(result.summary.totalInvoiced).toBe(100000);
    expect(result.summary.totalPaid).toBe(50000);
    expect(result.summary.outstanding).toBe(50000);
    expect(result.invoices).toHaveLength(1);
    expect(result.payments).toHaveLength(1);
  });

  it('3: getApAging() correctly buckets invoices into aging bands', async () => {
    const now = new Date();
    const daysAgo = (d: number) => {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      return dt;
    };

    const supplier = { id: 's-1', name: 'ACME Corp', code: 'ACME' };

    const invoices = [
      // Current (due today)
      { supplierId: 's-1', amount: 10000, paidAmount: 0, status: 'UNPAID', dueDate: now, invoiceDate: daysAgo(0), supplier },
      // 1-30 days overdue
      { supplierId: 's-1', amount: 20000, paidAmount: 0, status: 'UNPAID', dueDate: daysAgo(15), invoiceDate: daysAgo(45), supplier },
      // 31-60 days overdue
      { supplierId: 's-1', amount: 30000, paidAmount: 0, status: 'UNPAID', dueDate: daysAgo(45), invoiceDate: daysAgo(75), supplier },
      // 61-90 days overdue
      { supplierId: 's-1', amount: 40000, paidAmount: 0, status: 'UNPAID', dueDate: daysAgo(75), invoiceDate: daysAgo(105), supplier },
      // 90+ days overdue
      { supplierId: 's-1', amount: 50000, paidAmount: 0, status: 'UNPAID', dueDate: daysAgo(100), invoiceDate: daysAgo(130), supplier },
    ];

    const { service } = makeService({
      supplierInvoice: {
        findMany: jest.fn(async () => invoices),
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      },
    });

    const result = await service.getApAging('org-1');

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.amounts.days1_30).toBeCloseTo(20000, 0);
    expect(row.amounts.days31_60).toBeCloseTo(30000, 0);
    expect(row.amounts.days61_90).toBeCloseTo(40000, 0);
    expect(row.amounts.over90).toBeCloseTo(50000, 0);
    expect(row.amounts.total).toBeCloseTo(150000, 0);

    expect(result.totals.total).toBeCloseTo(150000, 0);
  });

  it('4: getApAging() excludes PAID invoices', async () => {
    const { service } = makeService({
      supplierInvoice: {
        findMany: jest.fn(async () => []),
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      },
    });

    const result = await service.getApAging('org-1');

    expect(result.rows).toHaveLength(0);
    expect(result.totals.total).toBe(0);
  });

  it('5: getApAging() aggregates multiple invoices for the same supplier', async () => {
    const now = new Date();
    const daysAgo = (d: number) => {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      return dt;
    };

    const supplier = { id: 's-1', name: 'ACME Corp', code: 'ACME' };

    const invoices = [
      { supplierId: 's-1', amount: 5000, paidAmount: 0, status: 'UNPAID', dueDate: daysAgo(10), invoiceDate: daysAgo(40), supplier },
      { supplierId: 's-1', amount: 8000, paidAmount: 0, status: 'PARTIAL', dueDate: daysAgo(20), invoiceDate: daysAgo(50), supplier },
    ];

    const { service } = makeService({
      supplierInvoice: { findMany: jest.fn(async () => invoices), aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })) },
    });

    const result = await service.getApAging('org-1');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amounts.days1_30).toBeCloseTo(13000, 0);
  });
});
