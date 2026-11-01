import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { RecordTransactionDto } from './dto/record-transaction.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesDto } from './dto/list-expenses.dto';
import { RejectExpenseDto } from './dto/reject-expense.dto';
import { MarkExpensePaidDto } from './dto/mark-expense-paid.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { CreateFinancialPeriodDto } from './dto/create-financial-period.dto';

// ── Bank Accounts ─────────────────────────────────────────────

@ApiTags('bank-accounts')
@ApiBearerAuth('JWT')
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'List all bank accounts' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.financeService.findAllBankAccounts(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'Create bank account' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBankAccountDto) {
    return this.financeService.createBankAccount(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'Get bank account' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.findOneBankAccount(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'Update bank account' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.financeService.updateBankAccount(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate bank account' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.deleteBankAccount(user.organizationId, id);
  }

  @Post(':id/transactions')
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'Record manual transaction' })
  recordTransaction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordTransactionDto,
  ) {
    return this.financeService.recordTransaction(user.organizationId, id, dto, user.id);
  }

  @Get(':id/transactions')
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'Get transaction history' })
  getTransactions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ListTransactionsDto,
  ) {
    return this.financeService.getTransactions(user.organizationId, id, query);
  }

  @Post(':id/reconcile/:transactionId')
  @Permissions(PERMISSIONS.FINANCE.BANK_ACCOUNTS)
  @ApiOperation({ summary: 'Mark transaction as reconciled' })
  reconcile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('transactionId') transactionId: string,
  ) {
    return this.financeService.reconcileTransaction(user.organizationId, id, transactionId, user.id);
  }
}

// ── Expenses ──────────────────────────────────────────────────

@ApiTags('expenses')
@ApiBearerAuth('JWT')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.VIEW)
  @ApiOperation({ summary: 'List expenses (paginated)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListExpensesDto) {
    return this.financeService.findAllExpenses(user.organizationId, query);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.CREATE)
  @ApiOperation({ summary: 'Create expense' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.financeService.createExpense(user.organizationId, dto, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.VIEW)
  @ApiOperation({ summary: 'Get expense detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.findOneExpense(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.CREATE)
  @ApiOperation({ summary: 'Update expense (PENDING only)' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.financeService.updateExpense(user.organizationId, id, dto);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve expense' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.approveExpense(user.organizationId, id, user.id);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject expense' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
  ) {
    return this.financeService.rejectExpense(user.organizationId, id, dto, user.id);
  }

  @Post(':id/mark-paid')
  @Permissions(PERMISSIONS.FINANCE.EXPENSES.APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark expense as paid' })
  markPaid(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MarkExpensePaidDto,
  ) {
    return this.financeService.markExpensePaid(user.organizationId, id, dto, user.id);
  }
}

// ── Expense Categories ────────────────────────────────────────

@ApiTags('expense-categories')
@ApiBearerAuth('JWT')
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'List expense categories' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.financeService.findAllExpenseCategories(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Create expense category' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseCategoryDto) {
    return this.financeService.createExpenseCategory(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Update expense category' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.financeService.updateExpenseCategory(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete expense category' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.deleteExpenseCategory(user.organizationId, id);
  }
}

// ── Tax Rates ─────────────────────────────────────────────────

@ApiTags('tax-rates')
@ApiBearerAuth('JWT')
@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'List tax rates' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.financeService.findAllTaxRates(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Create tax rate' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaxRateDto) {
    return this.financeService.createTaxRate(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Get tax rate' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.findOneTaxRate(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Update tax rate' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaxRateDto,
  ) {
    return this.financeService.updateTaxRate(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete tax rate' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.deleteTaxRate(user.organizationId, id);
  }

  @Post(':id/set-default')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set default tax rate' })
  setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.setDefaultTaxRate(user.organizationId, id);
  }
}

// ── Financial Periods ─────────────────────────────────────────

@ApiTags('financial-periods')
@ApiBearerAuth('JWT')
@Controller('financial-periods')
export class FinancialPeriodsController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'List financial periods' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.financeService.findAllPeriods(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Create financial period' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFinancialPeriodDto) {
    return this.financeService.createPeriod(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @ApiOperation({ summary: 'Get financial period' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.findOnePeriod(user.organizationId, id);
  }

  @Post(':id/close')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close financial period' })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.closePeriod(user.organizationId, id, user.id);
  }

  @Post(':id/lock')
  @Permissions(PERMISSIONS.FINANCE.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock financial period' })
  lock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeService.lockPeriod(user.organizationId, id);
  }
}

// ── Finance Dashboard ─────────────────────────────────────────

@ApiTags('finance-dashboard')
@ApiBearerAuth('JWT')
@Controller('finance/dashboard')
export class FinanceDashboardController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  @Permissions(PERMISSIONS.FINANCE.VIEW)
  @ApiOperation({ summary: 'Get financial dashboard summary' })
  getSummary(@CurrentUser() user: AuthUser) {
    return this.financeService.getDashboardSummary(user.organizationId);
  }
}
