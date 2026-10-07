import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class PermissionsBodyDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class CloneRoleDto {
  @ApiProperty({ example: 'BRANCH_MANAGER_2' })
  @IsString()
  name!: string;
}

@ApiTags('roles')
@ApiBearerAuth('JWT')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'List all roles' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.rolesService.findAll(user.organizationId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Get role by ID with permissions' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rolesService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Create a new role' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Update role description or replace all permissions' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(user.organizationId, id, dto);
  }

  @Post(':id/permissions/add')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Add permissions to a role' })
  addPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PermissionsBodyDto,
  ) {
    return this.rolesService.addPermissions(user.organizationId, id, body.permissions);
  }

  @Post(':id/permissions/remove')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Remove permissions from a role' })
  removePermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: PermissionsBodyDto,
  ) {
    return this.rolesService.removePermissions(user.organizationId, id, body.permissions);
  }

  @Post(':id/clone')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Clone a role with all its permissions' })
  clone(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CloneRoleDto,
  ) {
    return this.rolesService.clone(user.organizationId, id, body.name);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_ROLES)
  @ApiOperation({ summary: 'Delete a role (only custom roles, not system roles)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rolesService.remove(user.organizationId, id);
  }
}
