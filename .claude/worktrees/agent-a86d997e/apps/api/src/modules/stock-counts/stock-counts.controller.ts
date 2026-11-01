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
import { StockCountsService } from './stock-counts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { StartStockCountDto } from './dto/create-stock-count.dto';
import { SubmitStockCountDto } from './dto/submit-stock-count.dto';

@ApiTags('stock-counts')
@ApiBearerAuth('JWT')
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @ApiOperation({ summary: 'List all stock counts' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.stockCountsService.findAll(user.organizationId, { page, limit });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @ApiOperation({ summary: 'Get stock count by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.findOne(user.organizationId, id);
  }

  @Post('start')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @ApiOperation({ summary: 'Start a new stock count for a location' })
  startCount(@CurrentUser() user: AuthUser, @Body() dto: StartStockCountDto) {
    return this.stockCountsService.startCount(user.organizationId, dto, user.id);
  }

  @Patch(':id/submit')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit counted quantities' })
  submitCount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitStockCountDto,
  ) {
    return this.stockCountsService.submitCount(
      user.organizationId,
      id,
      dto.items,
      user.id,
    );
  }

  @Patch(':id/approve')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve count and apply corrections' })
  approveCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.approveCount(user.organizationId, id, user.id);
  }
}
