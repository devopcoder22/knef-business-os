import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { OpeningStockDto } from './dto/opening-stock.dto';

@ApiTags('inventory')
@ApiBearerAuth('JWT')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get all inventory levels' })
  getLevels(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
    @Query('productId') productId?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
  ) {
    return this.inventoryService.getLevels(user.organizationId, {
      locationId,
      productId,
      lowStockOnly: lowStockOnly === 'true',
    });
  }

  @Get('summary')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get inventory dashboard summary' })
  getSummary(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.inventoryService.getDashboardSummary(user.organizationId, locationId);
  }

  @Get('valuation')
  @Permissions(PERMISSIONS.INVENTORY.VIEW_COST)
  @ApiOperation({ summary: 'Get inventory valuation report' })
  getValuation(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.inventoryService.getValuation(user.organizationId, locationId);
  }

  @Get('low-stock')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get low stock products with intelligence' })
  getLowStock(
    @CurrentUser() user: AuthUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.inventoryService.getLevels(user.organizationId, {
      locationId,
      lowStockOnly: true,
    });
  }

  @Get(':productId/movements')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get movement history for a product' })
  getMovements(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Query('locationId') locationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: MovementType,
  ) {
    return this.inventoryService.getMovements(user.organizationId, productId, {
      locationId,
      from,
      to,
      type,
    });
  }

  @Post('opening-stock')
  @Permissions(PERMISSIONS.INVENTORY.ADJUST)
  @ApiOperation({ summary: 'Set opening/initial stock for a product at a location' })
  setOpeningStock(@CurrentUser() user: AuthUser, @Body() dto: OpeningStockDto) {
    return this.inventoryService.setOpeningStock(user.organizationId, {
      productId: dto.productId,
      variantId: dto.variantId,
      locationId: dto.locationId,
      quantity: dto.quantity,
      notes: dto.notes,
      createdBy: user.id,
    });
  }
}
