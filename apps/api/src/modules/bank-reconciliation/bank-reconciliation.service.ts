import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { TransactionType } from '@prisma/client';
// @ts-ignore
import * as XLSX from 'xlsx';

type MatchStatus = 'UNMATCHED' | 'AUTO_MATCHED' | 'MANUALLY_MATCHED' | 'CONFIRMED' | 'EXCLUDED';
type ImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
import { PrismaService } from '../../common/services/prisma.service';

const XLSX_MAX_ROWS = 5000;
const XLSX_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
const BLOCKED_EXTENSIONS = new Set(['.xlsm', '.xlsb', '.xltm']); // macro-enabled

const DATE_COLS = ['date', 'transaction date', 'trans date', 'txn date', 'value date'];
const DESC_COLS = ['description', 'narration', 'details', 'particulars', 'remarks', 'memo', 'note'];
const DEBIT_COLS = ['debit', 'withdrawal', 'dr', 'debit amount', 'amount dr'];
const CREDIT_COLS = ['credit', 'deposit', 'cr', 'credit amount', 'amount cr'];
const AMOUNT_COLS = ['amount', 'transaction amount', 'txn amount'];
const REF_COLS = ['reference', 'ref', 'ref no', 'reference no', 'transaction ref', 'transaction id', 'txn ref'];

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

function parseAmount(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}

export interface ImportRow {
  date: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  reference?: string;
  externalRef?: string;
}

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  parseXlsxBuffer(buffer: Buffer, originalName: string): ImportRow[] {
    const ext = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();

    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new UnsupportedMediaTypeException(`Macro-enabled files (${ext}) are not allowed`);
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new UnsupportedMediaTypeException('Only .xlsx, .xls, and .csv files are accepted');
    }
    if (buffer.length > XLSX_MAX_FILE_BYTES) {
      throw new PayloadTooLargeException(`File exceeds maximum size of 5 MB`);
    }

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      sheetStubs: false,
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Workbook contains no sheets');

    const sheet = workbook.Sheets[sheetName];
    const raw: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    if (!raw.length) throw new BadRequestException('Sheet is empty');

    // Find header row (first non-empty row)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      if (raw[i].some((c) => c.trim() !== '')) {
        headerIdx = i;
        break;
      }
    }

    const headers = raw[headerIdx].map(normalizeHeader);

    // Map column indices
    const colIdx = (candidates: string[]) => headers.findIndex((h) => candidates.includes(h));
    const dateCol = colIdx(DATE_COLS);
    const descCol = colIdx(DESC_COLS);
    const debitCol = colIdx(DEBIT_COLS);
    const creditCol = colIdx(CREDIT_COLS);
    const amountCol = colIdx(AMOUNT_COLS);
    const refCol = colIdx(REF_COLS);

    if (dateCol === -1) throw new BadRequestException('Could not find a date column in the spreadsheet');
    if (descCol === -1) throw new BadRequestException('Could not find a description/narration column');
    if (debitCol === -1 && creditCol === -1 && amountCol === -1) {
      throw new BadRequestException('Could not find amount/debit/credit columns');
    }

    const dataRows = raw.slice(headerIdx + 1).filter((row) => row.some((c) => c.trim() !== ''));

    if (dataRows.length === 0) throw new BadRequestException('No data rows found after the header');
    if (dataRows.length > XLSX_MAX_ROWS) {
      throw new PayloadTooLargeException(`File contains ${dataRows.length} rows; maximum is ${XLSX_MAX_ROWS}`);
    }

    const rows: ImportRow[] = [];
    for (const row of dataRows) {
      const dateStr = row[dateCol]?.trim();
      if (!dateStr) continue;

      // Parse date: try ISO, DD/MM/YYYY, MM/DD/YYYY, serial number
      let parsedDate: Date | null = null;
      if (/^\d+$/.test(dateStr)) {
        // Excel serial date number
        parsedDate = new Date(XLSX.SSF.parse_date_code(parseInt(dateStr, 10)).y,
          XLSX.SSF.parse_date_code(parseInt(dateStr, 10)).m - 1,
          XLSX.SSF.parse_date_code(parseInt(dateStr, 10)).d);
      } else {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) parsedDate = d;
      }
      if (!parsedDate) continue;

      const description = row[descCol]?.trim() || 'No description';
      const reference = refCol !== -1 ? row[refCol]?.trim() : undefined;

      let amount = 0;
      let type: 'CREDIT' | 'DEBIT' = 'CREDIT';

      if (debitCol !== -1 && creditCol !== -1) {
        const debit = parseAmount(row[debitCol]);
        const credit = parseAmount(row[creditCol]);
        if (debit > 0) { amount = debit; type = 'DEBIT'; }
        else if (credit > 0) { amount = credit; type = 'CREDIT'; }
        else continue;
      } else if (amountCol !== -1) {
        const raw = parseFloat(String(row[amountCol] ?? '').replace(/[^0-9.\-]/g, ''));
        if (isNaN(raw) || raw === 0) continue;
        amount = Math.abs(raw);
        type = raw < 0 ? 'DEBIT' : 'CREDIT';
      }

      rows.push({
        date: parsedDate.toISOString().split('T')[0],
        description,
        amount,
        type,
        reference: reference || undefined,
      });
    }

    if (rows.length === 0) throw new BadRequestException('No valid rows could be parsed from the file');
    return rows;
  }

  async listImports(
    organizationId: string,
    bankAccountId: string,
    query: { page?: number; limit?: number },
  ) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [imports, total] = await Promise.all([
      (this.prisma as any).bankStatementImport.findMany({
        where: { bankAccountId, organizationId },
        skip,
        take: limit,
        orderBy: { importedAt: 'desc' },
      }),
      (this.prisma as any).bankStatementImport.count({ where: { bankAccountId, organizationId } }),
    ]);

    return {
      data: imports,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async importStatement(
    organizationId: string,
    bankAccountId: string,
    fileName: string,
    fileType: string,
    rows: ImportRow[],
    userId: string,
  ) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    if (!rows.length) throw new BadRequestException('No rows to import');

    // Deduplicate: reject if this exact fileName was already imported for this account
    const existing = await (this.prisma as any).bankStatementImport.findFirst({
      where: { bankAccountId, organizationId, fileName },
    });
    if (existing) {
      throw new ConflictException(`Statement file "${fileName}" was already imported (importId: ${existing.id}). Re-import is blocked to prevent duplicate transactions.`);
    }

    const importId = createId();

    await (this.prisma as any).bankStatementImport.create({
      data: {
        id: importId,
        organizationId,
        bankAccountId,
        fileName,
        fileType,
        rowCount: rows.length,
        status: 'PROCESSING',
        importedBy: userId,
      },
    });

    // Create import transactions, attempt auto-match
    let matchedCount = 0;
    const txnData = [];

    for (const row of rows) {
      const id = createId();
      let matchStatus = 'UNMATCHED';
      let matchedTxnId: string | undefined;

      // Auto-match: look for a BankTransaction with same date+amount+type
      const candidate = await this.prisma.bankTransaction.findFirst({
        where: {
          bankAccountId,
          organizationId,
          amount: Math.abs(row.amount),
          type: row.type as TransactionType,
          date: {
            gte: new Date(new Date(row.date).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(row.date).setHours(23, 59, 59, 999)),
          },
          reconciled: false,
        },
      });

      if (candidate) {
        matchStatus = 'AUTO_MATCHED';
        matchedTxnId = candidate.id;
        matchedCount++;
      }

      txnData.push({
        id,
        importId,
        organizationId,
        bankAccountId,
        date: new Date(row.date),
        description: row.description,
        amount: Math.abs(row.amount),
        type: row.type as TransactionType,
        reference: row.reference,
        externalRef: row.externalRef,
        matchedTxnId,
        matchStatus,
      });
    }

    await (this.prisma as any).bankImportTransaction.createMany({ data: txnData });

    await (this.prisma as any).bankStatementImport.update({
      where: { id: importId },
      data: {
        status: 'COMPLETE',
        matchedCount,
        unmatchedCount: rows.length - matchedCount,
      },
    });

    return (this.prisma as any).bankStatementImport.findUnique({ where: { id: importId } });
  }

  async listImportTransactions(
    organizationId: string,
    importId: string,
    query: { page?: number; limit?: number; matchStatus?: string },
  ) {
    const imp = await (this.prisma as any).bankStatementImport.findFirst({
      where: { id: importId, organizationId },
    });
    if (!imp) throw new NotFoundException('Import not found');

    const { page = 1, limit = 50, matchStatus } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { importId };
    if (matchStatus) where['matchStatus'] = matchStatus;

    const [txns, total] = await Promise.all([
      (this.prisma as any).bankImportTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'asc' },
      }),
      (this.prisma as any).bankImportTransaction.count({ where }),
    ]);

    return {
      data: txns,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async matchTransaction(
    organizationId: string,
    importTxnId: string,
    bankTxnId: string,
    userId: string,
  ) {
    const importTxn = await (this.prisma as any).bankImportTransaction.findFirst({
      where: { id: importTxnId, organizationId },
    });
    if (!importTxn) throw new NotFoundException('Import transaction not found');
    if (importTxn.matchStatus === 'CONFIRMED') {
      throw new BadRequestException('Transaction already confirmed');
    }

    const bankTxn = await this.prisma.bankTransaction.findFirst({
      where: { id: bankTxnId, organizationId },
    });
    if (!bankTxn) throw new NotFoundException('Bank transaction not found');

    return (this.prisma as any).bankImportTransaction.update({
      where: { id: importTxnId },
      data: {
        matchedTxnId: bankTxnId,
        matchStatus: 'MANUALLY_MATCHED',
      },
    });
  }

  async confirmMatch(
    organizationId: string,
    importTxnId: string,
    userId: string,
  ) {
    const importTxn = await (this.prisma as any).bankImportTransaction.findFirst({
      where: { id: importTxnId, organizationId },
    });
    if (!importTxn) throw new NotFoundException('Import transaction not found');
    if (!importTxn.matchedTxnId) {
      throw new BadRequestException('No matched bank transaction to confirm');
    }

    await this.prisma.$transaction([
      (this.prisma as any).bankImportTransaction.update({
        where: { id: importTxnId },
        data: {
          matchStatus: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedBy: userId,
        },
      }),
      this.prisma.bankTransaction.update({
        where: { id: importTxn.matchedTxnId },
        data: { reconciled: true, reconciledAt: new Date() },
      }),
    ]);

    return (this.prisma as any).bankImportTransaction.findUnique({ where: { id: importTxnId } });
  }

  async excludeTransaction(organizationId: string, importTxnId: string) {
    const importTxn = await (this.prisma as any).bankImportTransaction.findFirst({
      where: { id: importTxnId, organizationId },
    });
    if (!importTxn) throw new NotFoundException('Import transaction not found');

    return (this.prisma as any).bankImportTransaction.update({
      where: { id: importTxnId },
      data: { matchStatus: 'EXCLUDED' },
    });
  }

  async getReconciliationSummary(organizationId: string, bankAccountId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const [reconciledCount, unreconciledCount, totalTxns] = await Promise.all([
      this.prisma.bankTransaction.count({ where: { bankAccountId, organizationId, reconciled: true } }),
      this.prisma.bankTransaction.count({ where: { bankAccountId, organizationId, reconciled: false } }),
      this.prisma.bankTransaction.count({ where: { bankAccountId, organizationId } }),
    ]);

    const unreconciledAmt = await this.prisma.bankTransaction.aggregate({
      where: { bankAccountId, organizationId, reconciled: false },
      _sum: { amount: true },
    });

    return {
      bankAccount: { id: account.id, name: account.name, balance: account.balance },
      totalTransactions: totalTxns,
      reconciledCount,
      unreconciledCount,
      unreconciledAmount: unreconciledAmt._sum.amount ?? 0,
    };
  }
}
