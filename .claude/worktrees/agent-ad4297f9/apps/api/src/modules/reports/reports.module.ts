import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import {
  SalesReportsController,
  InventoryReportsController,
  PurchaseReportsController,
  FinanceReportsController,
  StaffReportsController,
} from './reports.controller';

@Module({
  providers: [ReportsService],
  controllers: [
    SalesReportsController,
    InventoryReportsController,
    PurchaseReportsController,
    FinanceReportsController,
    StaffReportsController,
  ],
})
export class ReportsModule {}
