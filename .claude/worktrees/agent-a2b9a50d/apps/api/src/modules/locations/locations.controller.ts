import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@ApiTags('locations')
@ApiBearerAuth('JWT')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'List all locations' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.locationsService.findAll(user.organizationId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Get location by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.locationsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Create a new location' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Update a location' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.update(user.organizationId, id, dto);
  }

  @Patch(':id/activate')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Activate a location' })
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.locationsService.setActive(user.organizationId, id, true);
  }

  @Patch(':id/deactivate')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Deactivate a location' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.locationsService.setActive(user.organizationId, id, false);
  }
}
