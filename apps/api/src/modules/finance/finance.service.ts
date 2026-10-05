import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma, TransactionType, ExpenseStatus, PeriodStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { BusinessRuleService } from '../business-rules/business-rules.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PERMISSIONS } from '@knef/constants';
import type { CreateBankAccountDto } from './dto/create-bank-account.dto';
import type { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import type { RecordTransactionDto } from './dto/record-transaction.dto';
import type { ListTransactionsDto } from './dto/list-transactions.dto';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import type { UpdateExpenseDto } from './dto/update-expense.dto';
import type { ListExpensesDto } from './dto/list-expenses.dto';
import type { RejectExpenseDto } from './dto/reject-expense.dto';
import type { MarkExpensePaidDto } from './dto/mark-expense-paid.dto';
import type { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import type { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import type { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import type { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import type { CreateFinancialPeriodDto } from './dto/create-financial-period.dto';

import { generateReference } from '../../common/utils/references';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessRuleService: BusinessRuleService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ── Bank Accounts ─────────────────────────────────────────────

  async findAllBankAccounts(organizationId: string) {
    return this.prisma.bankAccount.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findOneBankAccount(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  async createBankAccount(organizationId: string, dto: CreateBankAccountDto) {
    const existing = await this.prisma.bankAccount.findFirst({
      where: { organizationId, accountNumber: dto.accountNumber },
    });
    if (existing) throw new ConflictException('Account number already registered');

    if (dto.isDefault) {
      await this.prisma.bankAccount.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });
    }

    return this.prisma.bankAccount.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        bankCode: dto.bankCode,
        currency: dto.currency ?? 'NGN',
        isDefault: dto.isDefault ?? false,
        notes: dto.notes,
      },
    });
  }

  async updateBankAccount(organizationId: string, id: string, dto: UpdateBankAccountDto) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    if (dto.isDefault) {
      await this.prisma.bankAccount.updateMany({
        where: { organizationId, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: dto.name,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        bankCode: dto.bankCode,
        currency: dto.currency,
        isDefault: dto.isDefault,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });
  }

  async deleteBankAccount(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const txCount = await this.prisma.bankTransaction.count({ where: { bankAccountId: id } });
    if (txCount > 0) throw new BadRequestException('Cannot delete account with transactions. Deactivate instead.');

    await this.prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
    return { message: 'Bank account deactivated' };
  }

  async recordTransaction(organizationId: string, bankAccountId: string, dto: RecordTransactionDto, userId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    if (!account.isActive) throw new BadRequestException('Bank account is inactive');

    const amount = new Prisma.Decimal(dto.amount);
    const balanceBefore = account.balance;
    let balanceAfter: Prisma.Decimal;

    if (dto.type === TransactionType.CREDIT) {
      balanceAfter = balanceBefore.add(amount);
    } else {
      balanceAfter = balanceBefore.sub(amount);
      if (balanceAfter.lessThan(0)) {
        throw new BadRequestException('Insufficient balance for this debit');
      }
    }

    const txDate = dto.date ? new Date(dto.date) : new Date();

    const [transaction] = await this.prisma.$transaction([
      this.prisma.bankTransaction.create({
        data: {
          id: createId(),
          organizationId,
          bankAccountId,
          type: dto.type,
          amount,
          balanceBefore,
          balanceAfter,
          description: dto.description,
          reference: dto.reference ?? generateReference('TXN'),
          externalRef: dto.externalRef,
          category: dto.category,
          date: txDate,
          notes: dto.notes,
        },
      }),
      this.prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: balanceAfter },
      }),
    ]);

    return transaction;
  }

  async getTransactions(organizationId: string, bankAccountId: string, query: ListTransactionsDto) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const { page = 1, limit = 20, dateFrom, dateTo, type } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BankTransactionWhereInput = {
      bankAccountId,
      organizationId,
    };
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async reconcileTransaction(organizationId: string, bankAccountId: string, transactionId: string) {
    const tx = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, bankAccountId, organizationId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    return this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { reconciled: true, reconciledAt: new Date() },
    });
  }

  // ── Expenses ──────────────────────────────────────────────────

  async findAllExpenses(organizationId: string, query: ListExpensesDto) {
    const { page = 1, limit = 20, status, categoryId, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = { organizationId };
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneExpense(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async createExpense(organizationId: string, dto: CreateExpenseDto, userId: string) {
    const reference = generateReference('EXP');

    const expense = await this.prisma.expense.create({
      data: {
        id: createId(),
        organizationId,
        reference,
        description: dto.description,
        amount: new Prisma.Decimal(dto.amount),
        date: new Date(dto.date),
        categoryId: dto.categoryId,
        vendor: dto.vendor,
        bankAccountId: dto.bankAccountId,
        receiptUrl: dto.receiptUrl,
        currency: dto.currency ?? 'NGN',
        notes: dto.notes,
        submittedBy: userId,
        status: ExpenseStatus.PENDING,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    const ruleCheck = await this.businessRuleService.checkExpenseAmount(
      organizationId,
      Number(dto.amount),
    );

    return { ...expense, ruleCheck };
  }

  async updateExpense(organizationId: string, id: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Only PENDING expenses can be updated');
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        description: dto.description,
        amount: dto.amount ? new Prisma.Decimal(dto.amount) : undefined,
        date: dto.date ? new Date(dto.date) : undefined,
        categoryId: dto.categoryId,
        vendor: dto.vendor,
        bankAccountId: dto.bankAccountId,
        receiptUrl: dto.receiptUrl,
        currency: dto.currency,
        notes: dto.notes,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async approveExpense(organizationId: string, id: string, userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId } });
    if (!expense) throw new NotFoundException('Expense not found');

    // Idempotency: if already approved return existing state
    if (expense.status === ExpenseStatus.APPROVED) {
      const ruleCheck = await this.businessRuleService.checkExpenseAmount(
        organizationId,
        Number(expense.amount),
      );
      return { ...expense, ruleCheck, idempotent: true };
    }

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Only PENDING expenses can be approved');
    }

    // Self-approval prevention
    if (expense.submittedBy && userId === expense.submittedBy) {
      throw new ForbiddenException('Cannot approve your own expense');
    }

    // Requester authority recheck — submitter must still be active and hold finance.expenses.create
    if (expense.submittedBy) {
      const requester = await this.prisma.user.findFirst({
        where: { id: expense.submittedBy, organizationId, isActive: true },
        select: { id: true },
      });
      if (!requester) {
        throw new ForbiddenException('Expense submitter is no longer active in this organization');
      }

      const perms = await this.permissionsService.getResolvedPermissions(organizationId, expense.submittedBy);
      if (!perms.data.effective.includes(PERMISSIONS.FINANCE.EXPENSES.CREATE)) {
        throw new ForbiddenException('Expense submitter no longer has permission to submit expenses');
      }
    }

    // Re-evaluate rule at approval time (threshold may have changed since submission)
    const ruleCheck = await this.businessRuleService.checkExpenseAmount(
      organizationId,
      Number(expense.amount),
    );

    // Atomic state transition — prevent concurrent double-approval
    const result = await this.prisma.expense.updateMany({
      where: { id, organizationId, status: ExpenseStatus.PENDING },
      data: {
        status: ExpenseStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    if (result.count === 0) {
      const current = await this.prisma.expense.findFirst({ where: { id, organizationId } });
      if (current?.status === ExpenseStatus.APPROVED) {
        return { ...current, ruleCheck, idempotent: true };
      }
      throw new BadRequestException('Expense is no longer in PENDING state');
    }

    const approved = await this.findOneExpense(organizationId, id);

    void this.auditService.log({
      organizationId,
      userId,
      action: 'EXPENSE_APPROVED',
      entity: 'Expense',
      entityId: id,
      oldValues: { status: 'PENDING' },
      newValues: { status: 'APPROVED', approvedBy: userId },
    });

    return { ...approved, ruleCheck };
  }

  async rejectExpense(organizationId: string, id: string, dto: RejectExpenseDto, userId?: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException('Only PENDING expenses can be rejected');
    }

    const rejected = await this.prisma.expense.update({
      where: { id },
      data: {
        status: ExpenseStatus.REJECTED,
        notes: dto.reason,
      },
    });

    void this.auditService.log({
      organizationId,
      userId,
      action: 'EXPENSE_REJECTED',
      entity: 'Expense',
      entityId: id,
      oldValues: { status: 'PENDING' },
      newValues: { status: 'REJECTED', reason: dto.reason },
    });

    return rejected;
  }

  async markExpensePaid(organizationId: string, id: string, dto: MarkExpensePaidDto, userId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== ExpenseStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED expenses can be marked as paid');
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.expense.update({
        where: { id },
        data: { status: ExpenseStatus.PAID, paidAt: new Date() },
      }),
    ];

    if (dto.bankAccountId) {
      const account = await this.prisma.bankAccount.findFirst({
        where: { id: dto.bankAccountId, organizationId },
      });
      if (account && account.isActive) {
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore.sub(expense.amount);
        ops.push(
          this.prisma.bankTransaction.create({
            data: {
              id: createId(),
              organizationId,
              bankAccountId: dto.bankAccountId,
              type: TransactionType.DEBIT,
              amount: expense.amount,
              balanceBefore,
              balanceAfter,
              description: `Expense payment: ${expense.reference}`,
              reference: expense.reference,
              category: 'EXPENSE',
              date: new Date(),
            },
          }),
          this.prisma.bankAccount.update({
            where: { id: dto.bankAccountId },
            data: { balance: balanceAfter },
          }),
        );
      }
    }

    await this.prisma.$transaction(ops);
    return this.prisma.expense.findFirst({ where: { id } });
  }

  // ── Expense Categories ────────────────────────────────────────

  async findAllExpenseCategories(organizationId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createExpenseCategory(organizationId: string, dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateExpenseCategory(organizationId: string, id: string, dto: UpdateExpenseCategoryDto) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id, organizationId } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId,
        isActive: dto.isActive,
      },
    });
  }

  async deleteExpenseCategory(organizationId: string, id: string) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id, organizationId } });
    if (!cat) throw new NotFoundException('Category not found');
    const count = await this.prisma.expense.count({ where: { categoryId: id } });
    if (count > 0) throw new BadRequestException('Category has associated expenses');
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  // ── Tax Rates ─────────────────────────────────────────────────

  async findAllTaxRates(organizationId: string) {
    return this.prisma.taxRate.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOneTaxRate(organizationId: string, id: string) {
    const rate = await this.prisma.taxRate.findFirst({ where: { id, organizationId } });
    if (!rate) throw new NotFoundException('Tax rate not found');
    return rate;
  }

  async createTaxRate(organizationId: string, dto: CreateTaxRateDto) {
    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });
    }
    return this.prisma.taxRate.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        rate: new Prisma.Decimal(dto.rate),
        description: dto.description,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTaxRate(organizationId: string, id: string, dto: UpdateTaxRateDto) {
    const rate = await this.prisma.taxRate.findFirst({ where: { id, organizationId } });
    if (!rate) throw new NotFoundException('Tax rate not found');
    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { organizationId, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.taxRate.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code ? dto.code.toUpperCase() : undefined,
        rate: dto.rate ? new Prisma.Decimal(dto.rate) : undefined,
        description: dto.description,
        isDefault: dto.isDefault,
        isActive: dto.isActive,
      },
    });
  }

  async deleteTaxRate(organizationId: string, id: string) {
    const rate = await this.prisma.taxRate.findFirst({ where: { id, organizationId } });
    if (!rate) throw new NotFoundException('Tax rate not found');
    await this.prisma.taxRate.delete({ where: { id } });
    return { message: 'Tax rate deleted' };
  }

  async setDefaultTaxRate(organizationId: string, id: string) {
    const rate = await this.prisma.taxRate.findFirst({ where: { id, organizationId } });
    if (!rate) throw new NotFoundException('Tax rate not found');
    await this.prisma.taxRate.updateMany({ where: { organizationId }, data: { isDefault: false } });
    return this.prisma.taxRate.update({ where: { id }, data: { isDefault: true } });
  }

  // ── Financial Periods ─────────────────────────────────────────

  async findAllPeriods(organizationId: string) {
    return this.prisma.financialPeriod.findMany({
      where: { organizationId },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOnePeriod(organizationId: string, id: string) {
    const period = await this.prisma.financialPeriod.findFirst({ where: { id, organizationId } });
    if (!period) throw new NotFoundException('Financial period not found');
    return period;
  }

  async createPeriod(organizationId: string, dto: CreateFinancialPeriodDto) {
    return this.prisma.financialPeriod.create({
      data: {
        id: createId(),
        organizationId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: PeriodStatus.OPEN,
      },
    });
  }

  async closePeriod(organizationId: string, id: string, userId: string) {
    const period = await this.prisma.financialPeriod.findFirst({ where: { id, organizationId } });
    if (!period) throw new NotFoundException('Financial period not found');
    if (period.status !== PeriodStatus.OPEN) throw new BadRequestException('Period must be OPEN to close');
    return this.prisma.financialPeriod.update({
      where: { id },
      data: { status: PeriodStatus.CLOSED, closedBy: userId, closedAt: new Date() },
    });
  }

  async lockPeriod(organizationId: string, id: string) {
    const period = await this.prisma.financialPeriod.findFirst({ where: { id, organizationId } });
    if (!period) throw new NotFoundException('Financial period not found');
    if (period.status !== PeriodStatus.CLOSED) throw new BadRequestException('Period must be CLOSED to lock');
    return this.prisma.financialPeriod.update({ where: { id }, data: { status: PeriodStatus.LOCKED } });
  }

  // ── Dashboard ─────────────────────────────────────────────────

  async getDashboardSummary(organizationId: string) {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const ytdStart = new Date(now.getFullYear(), 0, 1);

    const [
      currentRevRaw,
      prevRevRaw,
      ytdRevRaw,
      currentExpRaw,
      prevExpRaw,
      ytdExpRaw,
      pendingExpRaw,
      bankAccounts,
      topCatsRaw,
      revenueByMonthRaw,
    ] = await Promise.all([
      // Revenue = sum of completed SalesOrder.totalAmount
      this.prisma.salesOrder.aggregate({
        where: { organizationId, status: 'COMPLETED', completedAt: { gte: currentMonthStart, lte: currentMonthEnd } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.aggregate({
        where: { organizationId, status: 'COMPLETED', completedAt: { gte: prevMonthStart, lte: prevMonthEnd } },
        _sum: { totalAmount: true },
      }),
      this.prisma.salesOrder.aggregate({
        where: { organizationId, status: 'COMPLETED', completedAt: { gte: ytdStart } },
        _sum: { totalAmount: true },
      }),
      // Expenses = sum of PAID expense amounts
      this.prisma.expense.aggregate({
        where: { organizationId, status: ExpenseStatus.PAID, date: { gte: currentMonthStart, lte: currentMonthEnd } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { organizationId, status: ExpenseStatus.PAID, date: { gte: prevMonthStart, lte: prevMonthEnd } },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { organizationId, status: ExpenseStatus.PAID, date: { gte: ytdStart } },
        _sum: { amount: true },
      }),
      // Pending expenses
      this.prisma.expense.aggregate({
        where: { organizationId, status: { in: [ExpenseStatus.PENDING, ExpenseStatus.APPROVED] } },
        _sum: { amount: true },
      }),
      // Bank balances
      this.prisma.bankAccount.findMany({
        where: { organizationId, isActive: true },
        select: { balance: true },
      }),
      // Top 5 expense categories (ytd, paid)
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where: { organizationId, status: ExpenseStatus.PAID, date: { gte: ytdStart }, categoryId: { not: null } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      // Revenue last 12 months
      this.prisma.salesOrder.findMany({
        where: {
          organizationId,
          status: 'COMPLETED',
          completedAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
        },
        select: { totalAmount: true, completedAt: true },
      }),
    ]);

    // Resolve category names for top categories
    const categoryIds = topCatsRaw
      .map((c) => c.categoryId)
      .filter((id): id is string => id !== null);

    const categories = categoryIds.length > 0
      ? await this.prisma.expenseCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const topExpenseCategories = topCatsRaw.map((row) => ({
      name: row.categoryId ? (categoryMap.get(row.categoryId) ?? 'Unknown') : 'Uncategorized',
      amount: Number(row._sum.amount ?? 0),
    }));

    // Revenue by month (last 12 months)
    const revenueMap = new Map<string, number>();
    for (const order of revenueByMonthRaw) {
      if (!order.completedAt) continue;
      const key = `${order.completedAt.getFullYear()}-${String(order.completedAt.getMonth() + 1).padStart(2, '0')}`;
      revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(order.totalAmount ?? 0));
    }

    const revenueByMonth: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth.push({ month: key, revenue: revenueMap.get(key) ?? 0 });
    }

    const currentRevenue = Number(currentRevRaw._sum.totalAmount ?? 0);
    const prevRevenue = Number(prevRevRaw._sum.totalAmount ?? 0);
    const ytdRevenue = Number(ytdRevRaw._sum.totalAmount ?? 0);
    const currentExp = Number(currentExpRaw._sum.amount ?? 0);
    const prevExp = Number(prevExpRaw._sum.amount ?? 0);
    const ytdExp = Number(ytdExpRaw._sum.amount ?? 0);
    const pendingExpenses = Number(pendingExpRaw._sum.amount ?? 0);
    const totalBankBalance = bankAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

    return {
      currentMonth: {
        revenue: currentRevenue,
        expenses: currentExp,
        grossProfit: currentRevenue - currentExp,
        netProfit: currentRevenue - currentExp,
      },
      previousMonth: {
        revenue: prevRevenue,
        expenses: prevExp,
        grossProfit: prevRevenue - prevExp,
        netProfit: prevRevenue - prevExp,
      },
      ytd: {
        revenue: ytdRevenue,
        expenses: ytdExp,
        grossProfit: ytdRevenue - ytdExp,
      },
      cashPosition: {
        totalBankBalance,
        pendingExpenses,
      },
      topExpenseCategories,
      revenueByMonth,
      expensesByCategory: topExpenseCategories,
    };
  }
}
