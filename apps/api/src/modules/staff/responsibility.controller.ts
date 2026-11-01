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
import { ResponsibilityService } from './responsibility.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateResponsibilityDto } from './dto/create-responsibility.dto';
import { UpdateResponsibilityDto } from './dto/update-responsibility.dto';

@ApiTags('responsibilities')
@ApiBearerAuth('JWT')
@Controller('responsibilities')
export class ResponsibilityController {
  constructor(private readonly responsibilityService: ResponsibilityService) {}

  // IMPORTANT: /mine must come BEFORE /:id
  @Get('mine')
  @Permissions(PERMISSIONS.STAFF.CLOCK)
  @ApiOperation({ summary: 'Get my own active responsibilities' })
  findMine(@CurrentUser() user: AuthUser) {
    return this.responsibilityService.findMine(user.id, user.organizationId);
  }

  @Get()
  @Permissions(PERMISSIONS.STAFF.VIEW_RESPONSIBILITIES)
  @ApiOperation({ summary: 'List responsibilities (query by employeeId)' })
  findByEmployee(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId: string) {
    return this.responsibilityService.findByEmployee(user.organizationId, employeeId);
  }

  @Post()
  @Permissions(PERMISSIONS.STAFF.MANAGE_RESPONSIBILITIES)
  @ApiOperation({ summary: 'Create responsibility for an employee' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateResponsibilityDto) {
    return this.responsibilityService.create(user.id, user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE_RESPONSIBILITIES)
  @ApiOperation({ summary: 'Update responsibility' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateResponsibilityDto,
  ) {
    return this.responsibilityService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.STAFF.MANAGE_RESPONSIBILITIES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate (soft-delete) a responsibility' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.responsibilityService.deactivate(user.organizationId, id);
  }
}
