import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { TransactionType } from '@prisma/client';

type MatchStatus = 'UNMATCHED' | 'AUTO_MATCHED' | 'MANUALLY_MATCHED' | 'CONFIRMED' | 'EXCLUDED';
type ImportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
import { PrismaService } from '../../common/services/prisma.service';

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
