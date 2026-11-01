import {
  Controller,
  Get,
  Query,
  Res,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { objectsToCsv } from '../../common/utils/csv.util';
import { MovementType, ExpenseStatus } from '@prisma/client';
import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

// ── Query DTOs ───────────────────────────────────────────────────

export class DateRangeQuery {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class SalesSummaryQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

export class SalesProductsQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  limit?: number;
}

export class SalesCustomersQueryDto extends DateRangeQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  limit?: number;
}

export class SalesDailyQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class SalesExportQueryDto extends DateRangeQuery {
  @IsString()
  format!: 'csv' | 'json';

  @IsString()
  type!: 'orders' | 'items';
}

export class InventoryValuationQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class InventoryMovementQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  limit?: number;
}

export class InventoryLowStockQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class InventoryTurnoverQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  locationId?: string;
}

export class InventoryExportQueryDto {
  @IsString()
  format!: 'csv' | 'json';

  @IsString()
  type!: 'valuation' | 'movement' | 'low-stock';
}

export class PurchasingSummaryQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class FinanceExpensesQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  limit?: number;
}

export class FinanceExportQueryDto extends DateRangeQuery {
  @IsString()
  format!: 'csv' | 'json';

  @IsString()
  type!: 'pl' | 'cashflow' | 'expenses';
}

export class StaffAttendanceQueryDto extends DateRangeQuery {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class StaffExportQueryDto extends DateRangeQuery {
  @IsString()
  format!: 'csv' | 'json';

  @IsString()
  type!: 'attendance';
}

// ─── helpers ────────────────────────────────────────────────────

function sendCsv(res: Response, filename: string, data: Record<string, unknown>[]) {
  const csv = objectsToCsv(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(csv);
}

// ═══════════════════════════════════════════════════════════════
// SALES
// ═══════════════════════════════════════════════════════════════

@ApiTags('reports-sales')
@ApiBearerAuth('JWT')
@Controller('reports/sales')
export class SalesReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Sales summary report' })
  getSummary(@CurrentUser() user: AuthUser, @Query() q: SalesSummaryQueryDto) {
    return this.reportsService.getSalesSummary(user.organizationId, q);
  }

  @Get('products')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Sales by product report' })
  getProducts(@CurrentUser() user: AuthUser, @Query() q: SalesProductsQueryDto) {
    return this.reportsService.getSalesProducts(user.organizationId, {
      ...q,
      page: q.page ?? 1,
      limit: q.limit ?? 50,
    });
  }

  @Get('customers')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Sales by customer report' })
  getCustomers(@CurrentUser() user: AuthUser, @Query() q: SalesCustomersQueryDto) {
    return this.reportsService.getSalesCustomers(user.organizationId, {
      ...q,
      page: q.page ?? 1,
      limit: q.limit ?? 50,
    });
  }

  @Get('daily')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Daily sales report' })
  getDaily(@CurrentUser() user: AuthUser, @Query() q: SalesDailyQueryDto) {
    return this.reportsService.getSalesDaily(user.organizationId, q);
  }

  @Get('export')
  @Permissions(PERMISSIONS.REPORTS.EXPORT)
  @ApiOperation({ summary: 'Export sales data' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() q: SalesExportQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getSalesExportData(user.organizationId, {
      startDate: q.startDate,
      endDate: q.endDate,
      type: q.type,
    });
    if (q.format === 'csv') {
      sendCsv(res, `sales-${q.type}-export.csv`, data as Record<string, unknown>[]);
    } else {
      res.json(data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════

@ApiTags('reports-inventory')
@ApiBearerAuth('JWT')
@Controller('reports/inventory')
export class InventoryReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('valuation')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Inventory valuation report' })
  getValuation(@CurrentUser() user: AuthUser, @Query() q: InventoryValuationQueryDto) {
    return this.reportsService.getInventoryValuation(user.organizationId, q);
  }

  @Get('movement')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Inventory movement history' })
  getMovement(@CurrentUser() user: AuthUser, @Query() q: InventoryMovementQueryDto) {
    return this.reportsService.getInventoryMovement(user.organizationId, {
      ...q,
      page: q.page ?? 1,
      limit: q.limit ?? 50,
    });
  }

  @Get('low-stock')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Low stock alerts report' })
  getLowStock(@CurrentUser() user: AuthUser, @Query() q: InventoryLowStockQueryDto) {
    return this.reportsService.getInventoryLowStock(user.organizationId, q);
  }

  @Get('turnover')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Inventory turnover report' })
  getTurnover(@CurrentUser() user: AuthUser, @Query() q: InventoryTurnoverQueryDto) {
    return this.reportsService.getInventoryTurnover(user.organizationId, q);
  }

  @Get('export')
  @Permissions(PERMISSIONS.REPORTS.EXPORT)
  @ApiOperation({ summary: 'Export inventory data' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() q: InventoryExportQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getInventoryExportData(
      user.organizationId,
      q.type,
    );
    if (q.format === 'csv') {
      sendCsv(res, `inventory-${q.type}-export.csv`, data);
    } else {
      res.json(data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PURCHASING
// ═══════════════════════════════════════════════════════════════

@ApiTags('reports-purchasing')
@ApiBearerAuth('JWT')
@Controller('reports/purchasing')
export class PurchaseReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Purchasing summary report' })
  getSummary(@CurrentUser() user: AuthUser, @Query() q: PurchasingSummaryQueryDto) {
    return this.reportsService.getPurchasingSummary(user.organizationId, q);
  }

  @Get('suppliers')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Supplier performance report' })
  getSuppliers(@CurrentUser() user: AuthUser, @Query() q: DateRangeQuery) {
    return this.reportsService.getPurchasingSuppliers(user.organizationId, q);
  }
}

// ═══════════════════════════════════════════════════════════════
// FINANCE
// ═══════════════════════════════════════════════════════════════

@ApiTags('reports-finance')
@ApiBearerAuth('JWT')
@Controller('reports/finance')
export class FinanceReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('pl')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Profit & Loss report' })
  getPL(@CurrentUser() user: AuthUser, @Query() q: DateRangeQuery) {
    return this.reportsService.getFinancePL(user.organizationId, q);
  }

  @Get('cashflow')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Cash flow report' })
  getCashflow(@CurrentUser() user: AuthUser, @Query() q: DateRangeQuery) {
    return this.reportsService.getFinanceCashflow(user.organizationId, q);
  }

  @Get('expenses')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Finance expenses report' })
  getExpenses(@CurrentUser() user: AuthUser, @Query() q: FinanceExpensesQueryDto) {
    return this.reportsService.getFinanceExpenses(user.organizationId, {
      ...q,
      page: q.page ?? 1,
      limit: q.limit ?? 50,
      status: q.status as ExpenseStatus | undefined,
    });
  }

  @Get('export')
  @Permissions(PERMISSIONS.REPORTS.EXPORT)
  @ApiOperation({ summary: 'Export finance data' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() q: FinanceExportQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getFinanceExportData(
      user.organizationId,
      { startDate: q.startDate, endDate: q.endDate },
      q.type,
    );
    if (q.format === 'csv') {
      sendCsv(res, `finance-${q.type}-export.csv`, data);
    } else {
      res.json(data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// STAFF
// ═══════════════════════════════════════════════════════════════

@ApiTags('reports-staff')
@ApiBearerAuth('JWT')
@Controller('reports/staff')
export class StaffReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('attendance')
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  @ApiOperation({ summary: 'Staff attendance report' })
  getAttendance(@CurrentUser() user: AuthUser, @Query() q: StaffAttendanceQueryDto) {
    return this.reportsService.getStaffAttendance(user.organizationId, q);
  }

  @Get('export')
  @Permissions(PERMISSIONS.REPORTS.EXPORT)
  @ApiOperation({ summary: 'Export staff data' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() q: StaffExportQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getStaffExportData(user.organizationId, {
      startDate: q.startDate,
      endDate: q.endDate,
    });
    if (q.format === 'csv') {
      sendCsv(res, `staff-attendance-export.csv`, data);
    } else {
      res.json(data);
    }
  }
}
