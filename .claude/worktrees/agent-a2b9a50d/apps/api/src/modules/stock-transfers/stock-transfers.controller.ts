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
import { StockTransfersService } from './stock-transfers.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateStockTransferDto, StockTransferItemDto } from './dto/create-stock-transfer.dto';
import { ReceiveTransferDto } from './dto/receive-transfer.dto';

@ApiTags('stock-transfers')
@ApiBearerAuth('JWT')
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'List all stock transfers' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.stockTransfersService.findAll(user.organizationId, { page, limit });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVENTORY.VIEW)
  @ApiOperation({ summary: 'Get stock transfer by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockTransfersService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.INVENTORY.TRANSFER)
  @ApiOperation({ summary: 'Create a new stock transfer' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStockTransferDto) {
    return this.stockTransfersService.create(user.organizationId, dto, user.id);
  }

  @Post(':id/items')
  @Permissions(PERMISSIONS.INVENTORY.TRANSFER)
  @ApiOperation({ summary: 'Add items to a draft transfer' })
  addItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() items: StockTransferItemDto[],
  ) {
    return this.stockTransfersService.addItems(user.organizationId, id, items);
  }

  @Patch(':id/submit')
  @Permissions(PERMISSIONS.INVENTORY.TRANSFER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a draft transfer for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockTransfersService.submit(user.organizationId, id, user.id);
  }

  @Patch(':id/approve')
  @Permissions(PERMISSIONS.INVENTORY.TRANSFER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending transfer (moves to IN_TRANSIT)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockTransfersService.approve(user.organizationId, id, user.id);
  }

  @Patch(':id/receive')
  @Permissions(PERMISSIONS.INVENTORY.TRANSFER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive a transfer (records movements)' })
  receive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveTransferDto,
  ) {
    return this.stockTransfersService.receive(
      user.organizationId,
      id,
      dto.items,
      user.id,
    );
  }

  @Patch(':id/cancel')
  @Permissions(PERMISSIONS.INVENTORY.TRANSFER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a transfer' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockTransfersService.cancel(user.organizationId, id, user.id);
  }
}
