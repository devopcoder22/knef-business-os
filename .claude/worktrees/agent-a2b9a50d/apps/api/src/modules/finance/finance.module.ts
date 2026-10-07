import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import {
  BankAccountsController,
  ExpensesController,
  ExpenseCategoriesController,
  TaxRatesController,
  FinancialPeriodsController,
  FinanceDashboardController,
} from './finance.controller';

@Module({
  providers: [FinanceService],
  controllers: [
    BankAccountsController,
    ExpensesController,
    ExpenseCategoriesController,
    TaxRatesController,
    FinancialPeriodsController,
    FinanceDashboardController,
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
