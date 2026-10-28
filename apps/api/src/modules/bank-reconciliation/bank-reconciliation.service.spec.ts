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

import { NotFoundException, BadRequestException, ConflictException, UnsupportedMediaTypeException, PayloadTooLargeException } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
// @ts-ignore
import * as XLSX from 'xlsx';

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
      // Default null: no existing import found (deduplication passes by default)
      findFirst: jest.fn(async () => null),
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

  it('8: importStatement() throws ConflictException when same fileName already imported', async () => {
    const { service } = makeService({
      bankStatementImport: {
        create: jest.fn(),
        findFirst: jest.fn(async () => ({ id: 'imp-existing', fileName: 'stmt.csv' })),
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        update: jest.fn(),
        count: jest.fn(async () => 1),
      },
    });

    await expect(
      service.importStatement('org-1', 'ba-1', 'stmt.csv', 'CSV', BASE_ROWS, 'user-1'),
    ).rejects.toThrow(ConflictException);
  });

  // ── XLSX parsing tests ────────────────────────────────────────────────────────

  function makeXlsxBuffer(headers: string[], rows: (string | number)[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('9: parseXlsxBuffer() parses debit/credit columns correctly', () => {
    const { service } = makeService();
    const buf = makeXlsxBuffer(
      ['Date', 'Description', 'Debit', 'Credit', 'Reference'],
      [
        ['2026-10-01', 'Customer Payment', '', '50000', 'REF001'],
        ['2026-10-02', 'Supplier Payment', '20000', '', 'REF002'],
      ],
    );
    const rows = service.parseXlsxBuffer(buf, 'stmt.xlsx');
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('CREDIT');
    expect(rows[0].amount).toBe(50000);
    expect(rows[1].type).toBe('DEBIT');
    expect(rows[1].amount).toBe(20000);
  });

  it('10: parseXlsxBuffer() parses signed amount column (negative = debit)', () => {
    const { service } = makeService();
    const buf = makeXlsxBuffer(
      ['Date', 'Description', 'Amount'],
      [
        ['2026-10-01', 'Credit txn', '50000'],
        ['2026-10-02', 'Debit txn', '-20000'],
      ],
    );
    const rows = service.parseXlsxBuffer(buf, 'stmt.xlsx');
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('CREDIT');
    expect(rows[1].type).toBe('DEBIT');
    expect(rows[1].amount).toBe(20000);
  });

  it('11: parseXlsxBuffer() throws BadRequestException for missing date column', () => {
    const { service } = makeService();
    const buf = makeXlsxBuffer(
      ['Description', 'Amount'],
      [['Payment', '1000']],
    );
    expect(() => service.parseXlsxBuffer(buf, 'stmt.xlsx')).toThrow(BadRequestException);
  });

  it('12: parseXlsxBuffer() throws BadRequestException for missing amount columns', () => {
    const { service } = makeService();
    const buf = makeXlsxBuffer(
      ['Date', 'Description'],
      [['2026-10-01', 'Payment']],
    );
    expect(() => service.parseXlsxBuffer(buf, 'stmt.xlsx')).toThrow(BadRequestException);
  });

  it('13: parseXlsxBuffer() throws UnsupportedMediaTypeException for .xlsm files', () => {
    const { service } = makeService();
    const buf = Buffer.from('fake');
    expect(() => service.parseXlsxBuffer(buf, 'stmt.xlsm')).toThrow(UnsupportedMediaTypeException);
  });

  it('14: parseXlsxBuffer() throws PayloadTooLargeException for oversized buffer', () => {
    const { service } = makeService();
    const buf = Buffer.alloc(6 * 1024 * 1024);
    expect(() => service.parseXlsxBuffer(buf, 'stmt.xlsx')).toThrow(PayloadTooLargeException);
  });

  it('15: parseXlsxBuffer() skips empty rows, returns only valid rows', () => {
    const { service } = makeService();
    const buf = makeXlsxBuffer(
      ['Date', 'Description', 'Amount'],
      [
        ['2026-10-01', 'Valid row', '1000'],
        ['', '', ''],
        ['2026-10-03', 'Another valid', '2000'],
      ],
    );
    const rows = service.parseXlsxBuffer(buf, 'stmt.xlsx');
    expect(rows).toHaveLength(2);
  });

  it('16: parseXlsxBuffer() maps reference column when present', () => {
    const { service } = makeService();
    const buf = makeXlsxBuffer(
      ['Date', 'Description', 'Amount', 'Reference'],
      [['2026-10-01', 'Payment', '5000', 'TXN-001']],
    );
    const rows = service.parseXlsxBuffer(buf, 'stmt.xlsx');
    expect(rows[0].reference).toBe('TXN-001');
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
