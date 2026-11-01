import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { LocationScopeService } from '../../common/services/location-scope.service';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import {
  DateRangeDto,
  SalesIntelligenceDto,
  PurchasingIntelligenceDto,
  CustomerIntelligenceDto,
  ForecastSalesDto,
  ForecastInventoryDto,
  SimulateDto,
  AskDto,
} from './dto/bi.dto';

function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);
  return { startDate, endDate };
}

function validateDateRange(startDate: string, endDate: string, maxDays = 366): void {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ForbiddenException('Invalid date range');
  }
  if (start > end) {
    throw new ForbiddenException('startDate must be before endDate');
  }
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (days > maxDays) {
    throw new ForbiddenException(`Date range cannot exceed ${maxDays} days`);
  }
}

@ApiTags('business-intelligence')
@ApiBearerAuth()
@Controller('business-intelligence')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class BusinessIntelligenceController {
  constructor(
    private readonly biService: BusinessIntelligenceService,
    private readonly locationScope: LocationScopeService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Executive business snapshot — what is happening right now?' })
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  async getOverview(@CurrentUser() user: AuthUser) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.getOverview(user.organizationId, user.id, locationIds);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Sales intelligence with trend and product analysis' })
  @Permissions(PERMISSIONS.REPORTS.SALES)
  async getSalesIntelligence(
    @CurrentUser() user: AuthUser,
    @Query() query: SalesIntelligenceDto,
  ) {
    const { startDate, endDate } = query.startDate
      ? query
      : defaultDateRange();
    validateDateRange(startDate, endDate);

    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    // If user requests a specific location, verify they have access
    if (query.locationId) {
      this.locationScope.assertAccess(locationIds, query.locationId);
    }

    const effectiveLocationIds =
      query.locationId
        ? [query.locationId]
        : locationIds;

    return this.biService.getSalesIntelligence(
      user.organizationId,
      startDate,
      endDate,
      effectiveLocationIds,
    );
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Inventory intelligence with stock levels and movers' })
  @Permissions(PERMISSIONS.REPORTS.INVENTORY)
  async getInventoryIntelligence(@CurrentUser() user: AuthUser) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.getInventoryIntelligence(user.organizationId, locationIds);
  }

  @Get('purchasing')
  @ApiOperation({ summary: 'Purchasing intelligence with pending orders and supplier trends' })
  @Permissions(PERMISSIONS.PURCHASING.VIEW)
  async getPurchasingIntelligence(
    @CurrentUser() user: AuthUser,
    @Query() query: PurchasingIntelligenceDto,
  ) {
    const { startDate, endDate } = query.startDate
      ? query
      : defaultDateRange();
    validateDateRange(startDate, endDate);

    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    if (query.locationId) {
      this.locationScope.assertAccess(locationIds, query.locationId);
    }
    const effectiveLocationIds = query.locationId ? [query.locationId] : locationIds;

    return this.biService.getPurchasingIntelligence(
      user.organizationId,
      startDate,
      endDate,
      effectiveLocationIds,
    );
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer intelligence with segmentation and activity' })
  @Permissions(PERMISSIONS.CUSTOMERS.VIEW)
  async getCustomerIntelligence(
    @CurrentUser() user: AuthUser,
    @Query() query: CustomerIntelligenceDto,
  ) {
    const { startDate, endDate } = query.startDate
      ? query
      : defaultDateRange();
    validateDateRange(startDate, endDate);
    return this.biService.getCustomerIntelligence(user.organizationId, startDate, endDate);
  }

  @Get('goals')
  @ApiOperation({ summary: 'Goal and KPI intelligence with progress tracking' })
  @Permissions(PERMISSIONS.GOALS.VIEW)
  async getGoalIntelligence(@CurrentUser() user: AuthUser) {
    return this.biService.getGoalIntelligence(user.organizationId);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Evidence-based management recommendations' })
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  async getRecommendations(@CurrentUser() user: AuthUser) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.getRecommendations(user.organizationId, locationIds);
  }

  @Post('forecast/sales')
  @ApiOperation({ summary: 'Sales revenue forecast using historical moving average' })
  @Permissions(PERMISSIONS.REPORTS.SALES)
  async forecastSales(
    @CurrentUser() user: AuthUser,
    @Body() dto: ForecastSalesDto,
  ) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.forecastSales(
      user.organizationId,
      locationIds,
      dto.horizonDays ?? 30,
      dto.windowDays ?? 90,
    );
  }

  @Post('forecast/inventory')
  @ApiOperation({ summary: 'Inventory depletion forecast per product' })
  @Permissions(PERMISSIONS.REPORTS.INVENTORY)
  async forecastInventory(
    @CurrentUser() user: AuthUser,
    @Body() dto: ForecastInventoryDto,
  ) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.forecastInventoryDepletion(
      user.organizationId,
      locationIds,
      dto.productIds,
    );
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Run a what-if scenario simulation (never mutates data)' })
  @Permissions(PERMISSIONS.REPORTS.VIEW)
  async simulate(
    @CurrentUser() user: AuthUser,
    @Body() dto: SimulateDto,
  ) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.simulate(user.organizationId, locationIds, dto);
  }

  @Post('ask')
  @ApiOperation({ summary: 'Ask a business question answered with structured AI analysis' })
  @Permissions(PERMISSIONS.AI.ACCESS)
  async ask(
    @CurrentUser() user: AuthUser,
    @Body() dto: AskDto,
  ) {
    const locationIds = await this.locationScope.getUserLocationIds(user.id);
    return this.biService.ask(user.organizationId, user.id, locationIds, dto.question);
  }
}
