import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SerializedUnitsService } from './serialized-units.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateSerializedUnitDto } from './dto/create-serialized-unit.dto';
import { UpdateSerializedStatusDto } from './dto/update-serialized-status.dto';
import { ListSerializedUnitsDto } from './dto/list-serialized-units.dto';

@ApiTags('serialized-units')
@ApiBearerAuth('JWT')
@Controller('serialized-units')
export class SerializedUnitsController {
  constructor(private readonly serializedUnitsService: SerializedUnitsService) {}

  @Get('lookup')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Look up a unit by IMEI or serial number' })
  lookup(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.serializedUnitsService.lookup(user.organizationId, q);
  }

  @Get()
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'List serialized units (paginated, filterable)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListSerializedUnitsDto) {
    return this.serializedUnitsService.findAll(user.organizationId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCTS.VIEW)
  @ApiOperation({ summary: 'Get a serialized unit by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serializedUnitsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.PRODUCTS.CREATE)
  @ApiOperation({ summary: 'Register a new serialized unit (IMEI)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSerializedUnitDto) {
    return this.serializedUnitsService.create(user.organizationId, dto, user.id);
  }

  @Post('bulk')
  @Permissions(PERMISSIONS.PRODUCTS.CREATE)
  @ApiOperation({ summary: 'Bulk register serialized units' })
  bulkCreate(
    @CurrentUser() user: AuthUser,
    @Body() dtos: CreateSerializedUnitDto[],
  ) {
    return this.serializedUnitsService.bulkCreate(user.organizationId, dtos, user.id);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.PRODUCTS.EDIT)
  @ApiOperation({ summary: 'Update serialized unit status' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSerializedStatusDto,
  ) {
    return this.serializedUnitsService.updateStatus(
      user.organizationId,
      id,
      dto.status,
      dto.notes,
      user.id,
    );
  }
}
