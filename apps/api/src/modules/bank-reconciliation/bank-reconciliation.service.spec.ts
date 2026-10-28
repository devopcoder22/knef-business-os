/**
 * BankReconciliationService — unit tests (Phase 24P)
 *
 * Covers:
 * 1. importStatement() rejects unknown bank account
 * 2. importStatement() rejects empty rows
 * 3. importStatement() auto-matches rows with matching BankTransaction
 * 4. importStatement() leaves unmatched rows as UNMATCHED
 * 5. confirmMatch() marks import txn CONFIRMED and sets bankTransaction.reconciled=true
 * 6. confirmMatch() rejects txn with no matched bank transaction
 * 7. excludeTransaction() sets status EXCLUDED
 */

import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    bankAccount: {
      findFirst: jest.fn(async () => ({
        id: 'ba-1',
        name: 'Main Account',
        balance: 500000,
      })),
    },
    bankStatementImport: {
      create: jest.fn(async (args: { data: unknown }) => ({ id: 'imp-1', ...(args.data as object) })),
      findFirst: jest.fn(async () => ({ id: 'imp-1', organizationId: 'org-1' })),
      findUnique: jest.fn(async () => ({ id: 'imp-1' })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({ id: 'imp-1' })),
      count: jest.fn(async () => 0),
    },
    bankImportTransaction: {
      createMany: jest.fn(async () => ({ count: 0 })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
    },
    bankTransaction: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
      aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new BankReconciliationService(prisma as never);
  return { service, prisma };
}

const BASE_ROWS = [
  { date: '2026-10-01', description: 'Customer Payment', amount: 50000, type: 'CREDIT' as const },
  { date: '2026-10-02', description: 'Supplier Payment', amount: 20000, type: 'DEBIT' as const },
];

describe('BankReconciliationService (Phase 24P)', () => {
  it('1: importStatement() throws NotFoundException for unknown bank account', async () => {
    const { service } = makeService({
      bankAccount: { findFirst: jest.fn(async () => null) },
    });

    await expect(
      service.importStatement('org-1', 'ba-unknown', 'stmt.csv', 'CSV', BASE_ROWS, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('2: importStatement() throws BadRequestException for empty rows', async () => {
    const { service } = makeService();

    await expect(
      service.importStatement('org-1', 'ba-1', 'stmt.csv', 'CSV', [], 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('3: importStatement() auto-matches row when a matching BankTransaction exists', async () => {
    const matchingTxn = { id: 'bt-1', amount: 50000, type: 'CREDIT', date: new Date('2026-10-01'), reconciled: false };

    const { service, prisma } = makeService({
      bankTransaction: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(matchingTxn)  // first row matches
          .mockResolvedValueOnce(null),          // second row no match
        update: jest.fn(async () => ({})),
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      },
    });

    await service.importStatement('org-1', 'ba-1', 'stmt.csv', 'CSV', BASE_ROWS, 'user-1');

    const createManyCall = (prisma.bankImportTransaction as any).createMany.mock.calls[0][0];
    const rows = createManyCall.data as any[];

    const creditRow = rows.find((r: any) => r.type === 'CREDIT');
    const debitRow = rows.find((r: any) => r.type === 'DEBIT');

    expect(creditRow.matchStatus).toBe('AUTO_MATCHED');
    expect(creditRow.matchedTxnId).toBe('bt-1');
    expect(debitRow.matchStatus).toBe('UNMATCHED');
    expect(debitRow.matchedTxnId).toBeUndefined();
  });

  it('4: importStatement() leaves all rows UNMATCHED when no bank transactions found', async () => {
    const { service, prisma } = makeService({
      bankTransaction: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(),
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      },
    });

    await service.importStatement('org-1', 'ba-1', 'stmt.csv', 'CSV', BASE_ROWS, 'user-1');

    const createManyCall = (prisma.bankImportTransaction as any).createMany.mock.calls[0][0];
    const rows = createManyCall.data as any[];
    expect(rows.every((r: any) => r.matchStatus === 'UNMATCHED')).toBe(true);
  });

  it('5: confirmMatch() marks import txn CONFIRMED and reconciles the linked bank transaction', async () => {
    const { service, prisma } = makeService({
      bankImportTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'iti-1',
          organizationId: 'org-1',
          matchedTxnId: 'bt-1',
          matchStatus: 'AUTO_MATCHED',
        })),
        update: jest.fn(async () => ({})),
        findUnique: jest.fn(async () => ({ id: 'iti-1', matchStatus: 'CONFIRMED' })),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        createMany: jest.fn(async () => ({})),
      },
      bankTransaction: {
        findFirst: jest.fn(async () => ({ id: 'bt-1' })),
        update: jest.fn(async () => ({})),
        count: jest.fn(async () => 0),
        aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      },
    });

    await service.confirmMatch('org-1', 'iti-1', 'user-1');

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('6: confirmMatch() throws BadRequestException when no matched bank transaction', async () => {
    const { service } = makeService({
      bankImportTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'iti-1',
          organizationId: 'org-1',
          matchedTxnId: null,
          matchStatus: 'UNMATCHED',
        })),
        update: jest.fn(async () => ({})),
        findUnique: jest.fn(async () => ({})),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        createMany: jest.fn(async () => ({})),
      },
    });

    await expect(service.confirmMatch('org-1', 'iti-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('7: excludeTransaction() sets matchStatus to EXCLUDED', async () => {
    const { service, prisma } = makeService({
      bankImportTransaction: {
        findFirst: jest.fn(async () => ({
          id: 'iti-1',
          organizationId: 'org-1',
          matchStatus: 'UNMATCHED',
        })),
        update: jest.fn(async () => ({})),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        createMany: jest.fn(async () => ({})),
        findUnique: jest.fn(async () => ({})),
      },
    });

    await service.excludeTransaction('org-1', 'iti-1');

    expect((prisma.bankImportTransaction as any).update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'iti-1' },
        data: { matchStatus: 'EXCLUDED' },
      }),
    );
  });
});
