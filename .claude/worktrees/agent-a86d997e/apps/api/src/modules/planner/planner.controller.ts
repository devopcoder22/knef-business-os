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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

import { PlannerService } from './planner.service';
import { PlanGeneratorService } from './plan-generator.service';
import { PlanExecutorService } from './plan-executor.service';
import { PlanProgressService } from './plan-progress.service';
import { PersonalPlannerService } from './personal-planner.service';

import {
  CreatePlanDto,
  UpdatePlanDto,
  ListPlansDto,
  GeneratePlanDto,
  ApprovePlanDto,
  RejectPlanDto,
  ExecutePlanDto,
  AskPlannerDto,
  DailyPlanDto,
  WeeklyPlanDto,
  CreateTemplateDto,
} from './dto/planner.dto';

// ── Plans Controller ─────────────────────────────────────────────

@ApiTags('planner')
@ApiBearerAuth('JWT')
@Controller('plans')
export class PlansController {
  private readonly logger = new Logger(PlansController.name);

  constructor(
    private readonly plannerService: PlannerService,
    private readonly generator: PlanGeneratorService,
    private readonly executor: PlanExecutorService,
    private readonly progress: PlanProgressService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @ApiOperation({ summary: 'List plans' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListPlansDto) {
    return this.plannerService.listPlans(user.organizationId, query);
  }

  @Post()
  @Permissions(PERMISSIONS.PLANNER.CREATE)
  @ApiOperation({ summary: 'Create a plan' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto) {
    return this.plannerService.create(user.organizationId, dto, user.id);
  }

  @Get('templates')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @ApiOperation({ summary: 'List plan templates' })
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.plannerService.listTemplates(user.organizationId);
  }

  @Post('templates')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @ApiOperation({ summary: 'Create a plan template' })
  createTemplate(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.plannerService.createTemplate(user.organizationId, dto, user.id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @ApiOperation({ summary: 'Get plan details' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plannerService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PLANNER.CREATE)
  @ApiOperation({ summary: 'Update a plan' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plannerService.update(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a plan' })
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plannerService.delete(user.organizationId, id, user.id);
  }

  @Post(':id/generate')
  @Permissions(PERMISSIONS.PLANNER.CREATE)
  @ApiOperation({ summary: 'AI generates plan content from instruction' })
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: GeneratePlanDto,
  ) {
    return this.generator.generate(user.organizationId, user.id, id, dto);
  }

  @Post(':id/preview-execution')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview what execution would create' })
  previewExecution(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.generator.previewExecution(user.organizationId, id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a plan' })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApprovePlanDto,
  ) {
    return this.plannerService.approve(user.organizationId, id, user.id, dto.comment);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject / send back for revision' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectPlanDto,
  ) {
    return this.plannerService.reject(user.organizationId, id, user.id, dto.reason);
  }

  @Post(':id/execute')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute an approved plan (creates tasks and KPIs)' })
  execute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExecutePlanDto,
  ) {
    return this.executor.execute(user.organizationId, id, user.id, dto.stepIds);
  }

  @Post(':id/pause')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause an active plan' })
  pause(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plannerService.pause(user.organizationId, id, user.id);
  }

  @Post(':id/resume')
  @Permissions(PERMISSIONS.PLANNER.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused plan' })
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plannerService.resume(user.organizationId, id, user.id);
  }

  @Get(':id/progress')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @ApiOperation({ summary: 'Get plan progress and KPI status' })
  getProgress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.progress.getProgress(user.organizationId, id);
  }
}

// ── Personal Planner Controller ───────────────────────────────────

@ApiTags('planner')
@ApiBearerAuth('JWT')
@Controller('planner')
export class PersonalPlannerController {
  constructor(private readonly personalPlanner: PersonalPlannerService) {}

  @Post('daily')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get AI-generated daily plan for the current user' })
  daily(@CurrentUser() user: AuthUser, @Body() dto: DailyPlanDto) {
    return this.personalPlanner.buildDailyPlan(user.organizationId, user.id, dto.date);
  }

  @Post('weekly')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get AI-generated weekly plan for the current user' })
  weekly(@CurrentUser() user: AuthUser, @Body() dto: WeeklyPlanDto) {
    return this.personalPlanner.buildWeeklyPlan(user.organizationId, user.id, dto.weekStart);
  }

  @Post('ask')
  @Permissions(PERMISSIONS.PLANNER.VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the AI planner a question' })
  ask(@CurrentUser() user: AuthUser, @Body() dto: AskPlannerDto) {
    return this.personalPlanner.askPlanner(user.organizationId, user.id, dto.message, dto.planId);
  }
}
