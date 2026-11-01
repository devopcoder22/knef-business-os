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
import { CycleCountsService, CreateCycleCountDto, UpdateCycleCountItemDto } from './cycle-counts.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

@ApiTags('cycle-counts')
@ApiBearerAuth('JWT')
@Controller('cycle-counts')
export class CycleCountsController {
  constructor(private readonly cycleCountsService: CycleCountsService) {}

  @Get()
  @Permissions(PERMISSIONS.INVENTORY.CYCLE_COUNT)
  @ApiOperation({ summary: 'List cycle counts' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.cycleCountsService.findAll(user.organizationId, { page, limit, status, locationId });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INVENTORY.CYCLE_COUNT)
  @ApiOperation({ summary: 'Get cycle count by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cycleCountsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.INVENTORY.CYCLE_COUNT)
  @ApiOperation({ summary: 'Schedule a new cycle count' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCycleCountDto) {
    return this.cycleCountsService.create(user.organizationId, dto, user.id);
  }

  @Patch(':id/start')
  @Permissions(PERMISSIONS.INVENTORY.CYCLE_COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a scheduled cycle count — snapshot inventory' })
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cycleCountsService.start(user.organizationId, id);
  }

  @Patch(':id/submit')
  @Permissions(PERMISSIONS.INVENTORY.CYCLE_COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit counted items and complete the cycle count' })
  submitItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { items: UpdateCycleCountItemDto[] },
  ) {
    return this.cycleCountsService.submitItems(user.organizationId, id, body.items);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.INVENTORY.CYCLE_COUNT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a cycle count' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cycleCountsService.cancel(user.organizationId, id);
  }
}
