import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';

@ApiTags('stock-adjustments')
@ApiBearerAuth('JWT')
@Controller('stock-adjustments')
export class StockAdjustmentsController {
  constructor(private readonly stockAdjustmentsService: StockAdjustmentsService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'List all stock adjustments' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.stockAdjustmentsService.findAll(user.organizationId, { page, limit }, user.locationIds);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get a stock adjustment by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockAdjustmentsService.findOne(user.organizationId, id, user.locationIds);
  }

  @Post()
  @Permissions(PERMISSIONS.INVENTORY.ADJUST)
  @ApiOperation({ summary: 'Create a stock adjustment (PENDING state)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStockAdjustmentDto) {
    return this.stockAdjustmentsService.create(user.organizationId, dto, user.id, user.locationIds);
  }

  @Patch(':id/approve')
  @Permissions(PERMISSIONS.INVENTORY.ADJUST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a stock adjustment (applies movements)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockAdjustmentsService.approve(user.organizationId, id, user.id, user.locationIds);
  }

  @Patch(':id/reject')
  @Permissions(PERMISSIONS.INVENTORY.ADJUST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a stock adjustment' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.stockAdjustmentsService.reject(
      user.organizationId,
      id,
      user.id,
      body.reason,
      user.locationIds,
    );
  }
}
