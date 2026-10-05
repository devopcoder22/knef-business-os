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
import { BusinessRulesModule } from '../business-rules/business-rules.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [BusinessRulesModule, AuditModule, PermissionsModule],
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
