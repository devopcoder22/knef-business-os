import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { SubmitStockCountDto } from './dto/submit-stock-count.dto';

@ApiTags('stock-counts')
@ApiBearerAuth('JWT')
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @ApiOperation({ summary: 'List stock counts' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockCountsService.findAll(user.organizationId, { page, limit, status, locationId });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @ApiOperation({ summary: 'Get stock count by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @ApiOperation({ summary: 'Create a new stock count (DRAFT)' })
  createCount(@CurrentUser() user: AuthUser, @Body() dto: CreateStockCountDto) {
    return this.stockCountsService.createCount(user.organizationId, dto, user.id);
  }

  @Patch(':id/begin')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin count — snapshot inventory and move to IN_PROGRESS' })
  beginCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.beginCount(user.organizationId, id, user.id);
  }

  @Patch(':id/submit')
  @Permissions(PERMISSIONS.INVENTORY.COUNT_SUBMIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit counted quantities for review' })
  submitCount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitStockCountDto,
  ) {
    return this.stockCountsService.submitCount(user.organizationId, id, dto.items, user.id);
  }

  @Patch(':id/review')
  @Permissions(PERMISSIONS.INVENTORY.COUNT_REVIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin review of submitted count' })
  beginReview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.beginReview(user.organizationId, id);
  }

  @Patch(':id/approve')
  @Permissions(PERMISSIONS.INVENTORY.COUNT_APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve count after review' })
  approveCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.approveCount(user.organizationId, id);
  }

  @Patch(':id/reject')
  @Permissions(PERMISSIONS.INVENTORY.COUNT_APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject count with reason' })
  rejectCount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.stockCountsService.rejectCount(user.organizationId, id, body.reason);
  }

  @Patch(':id/post')
  @Permissions(PERMISSIONS.INVENTORY.COUNT_POST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post approved count — apply inventory corrections' })
  postCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.postCount(user.organizationId, id, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.INVENTORY.COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a stock count' })
  cancelCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.stockCountsService.cancelCount(user.organizationId, id);
  }
}
