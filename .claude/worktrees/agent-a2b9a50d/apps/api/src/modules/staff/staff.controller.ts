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
import { StaffService } from './staff.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { ListAttendanceDto } from './dto/list-attendance.dto';
import { CreateDutyDto } from './dto/create-duty.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('employees')
@ApiBearerAuth('JWT')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Permissions(PERMISSIONS.STAFF.VIEW)
  @ApiOperation({ summary: 'List employees (paginated)' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListEmployeesDto) {
    return this.staffService.findAllEmployees(user.organizationId, query);
  }

  @Post()
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Create employee' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.staffService.createEmployee(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.STAFF.VIEW)
  @ApiOperation({ summary: 'Get employee detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.findOneEmployee(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Update employee' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.staffService.updateEmployee(user.organizationId, id, dto);
  }

  @Get(':id/attendance')
  @Permissions(PERMISSIONS.STAFF.VIEW)
  @ApiOperation({ summary: 'Get employee attendance history' })
  getAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ListAttendanceDto,
  ) {
    return this.staffService.getAttendance(user.organizationId, id, query);
  }

  @Post(':id/attendance')
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Record attendance entry' })
  recordAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordAttendanceDto,
  ) {
    return this.staffService.recordAttendance(user.organizationId, id, dto);
  }

  @Get(':id/duties')
  @Permissions(PERMISSIONS.STAFF.VIEW)
  @ApiOperation({ summary: 'Get upcoming duties' })
  getDuties(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.getDuties(user.organizationId, id);
  }

  @Post(':id/duties')
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Create duty/shift' })
  createDuty(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateDutyDto,
  ) {
    return this.staffService.createDuty(user.organizationId, id, dto);
  }
}

@ApiTags('departments')
@ApiBearerAuth('JWT')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'List departments' })
  findAll(@CurrentUser() user: AuthUser) {
    return this.staffService.findAllDepartments(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Create department' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepartmentDto) {
    return this.staffService.createDepartment(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Get department' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.findOneDepartment(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @ApiOperation({ summary: 'Update department' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.staffService.updateDepartment(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete department' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.deleteDepartment(user.organizationId, id);
  }

  @Get(':id/employees')
  @Permissions(PERMISSIONS.STAFF.VIEW)
  @ApiOperation({ summary: 'List employees in department' })
  getEmployees(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.getDepartmentEmployees(user.organizationId, id);
  }
}
