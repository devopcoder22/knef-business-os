import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PriceHistoryService } from './price-history.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('price-history')
@ApiBearerAuth('JWT')
@Controller('price-history')
export class PriceHistoryController {
  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.VIEW_PRICE_HISTORY)
  @ApiOperation({ summary: 'Get all price changes for the organization' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('priceType') priceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.priceHistoryService.findForOrg(user.organizationId, {
      page,
      limit,
      priceType,
      from,
      to,
    });
  }

  @Get('product/:productId')
  @Permissions(PERMISSIONS.INVENTORY.VIEW_PRICE_HISTORY)
  @ApiOperation({ summary: 'Get price history for a specific product' })
  findByProduct(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('priceType') priceType?: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.priceHistoryService.findByProduct(user.organizationId, productId, {
      page,
      limit,
      priceType,
      variantId,
    });
  }
}
