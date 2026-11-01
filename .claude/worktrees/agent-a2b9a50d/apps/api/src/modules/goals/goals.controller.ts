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
import { GoalsService } from './goals.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { ListGoalsDto } from './dto/list-goals.dto';
import { AddProgressDto } from './dto/add-progress.dto';
import { CreateKpiDto, UpdateKpiDto } from './dto/create-kpi.dto';

@ApiTags('goals')
@ApiBearerAuth('JWT')
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  @Permissions(PERMISSIONS.GOALS.VIEW)
  @ApiOperation({ summary: 'List goals' })
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListGoalsDto) {
    return this.goalsService.findAll(user.organizationId, query);
  }

  @Post()
  @Permissions(PERMISSIONS.GOALS.CREATE)
  @ApiOperation({ summary: 'Create goal' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(user.organizationId, dto);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.GOALS.VIEW)
  @ApiOperation({ summary: 'Get goal detail' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.goalsService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.GOALS.MANAGE)
  @ApiOperation({ summary: 'Update goal' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goalsService.update(user.organizationId, id, dto);
  }

  @Post(':id/progress')
  @Permissions(PERMISSIONS.GOALS.MANAGE)
  @ApiOperation({ summary: 'Add progress entry' })
  addProgress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddProgressDto,
  ) {
    return this.goalsService.addProgress(user.organizationId, id, dto, user.id);
  }

  @Post(':id/kpis')
  @Permissions(PERMISSIONS.GOALS.MANAGE)
  @ApiOperation({ summary: 'Add KPI to goal' })
  addKpi(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateKpiDto) {
    return this.goalsService.addKpi(user.organizationId, id, dto);
  }

  @Patch(':id/kpis/:kpiId')
  @Permissions(PERMISSIONS.GOALS.MANAGE)
  @ApiOperation({ summary: 'Update KPI current value' })
  updateKpi(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('kpiId') kpiId: string,
    @Body() dto: UpdateKpiDto,
  ) {
    return this.goalsService.updateKpi(user.organizationId, id, kpiId, dto);
  }
}
