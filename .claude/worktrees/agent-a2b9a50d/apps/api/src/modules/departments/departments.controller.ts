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
import { DepartmentsService } from './departments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('departments')
@ApiBearerAuth('JWT')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_DEPARTMENTS)
  @ApiOperation({ summary: 'List all departments' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.departmentsService.findAll(user.organizationId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_DEPARTMENTS)
  @ApiOperation({ summary: 'Get department by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.departmentsService.findOne(user.organizationId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.ADMIN.MANAGE_DEPARTMENTS)
  @ApiOperation({ summary: 'Create a new department' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_DEPARTMENTS)
  @ApiOperation({ summary: 'Update a department' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ADMIN.MANAGE_DEPARTMENTS)
  @ApiOperation({ summary: 'Deactivate a department' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.departmentsService.remove(user.organizationId, id);
  }
}
