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
import { AutomationRulesService } from './automation-rules.service';
import { AutomationActionDispatcherService } from './automation-action-dispatcher.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import {
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
  ListAutomationRulesDto,
  ListExecutionsDto,
  SimulateRuleDto,
} from './dto/automation-rule.dto';
import { AUTOMATION_TRIGGERS } from './automation-trigger.registry';
import { AUTOMATION_ACTIONS } from './automation-action.registry';

@ApiTags('automation')
@ApiBearerAuth('JWT')
@Controller('automation')
export class AutomationController {
  constructor(
    private readonly rulesService: AutomationRulesService,
    private readonly dispatcher: AutomationActionDispatcherService,
  ) {}

  // ── Meta endpoints ─────────────────────────────────────────────────────────

  @Get('triggers')
  @Permissions(PERMISSIONS.AUTOMATION.VIEW)
  @ApiOperation({ summary: 'List available trigger types' })
  getTriggers() {
    return AUTOMATION_TRIGGERS;
  }

  @Get('actions')
  @Permissions(PERMISSIONS.AUTOMATION.VIEW)
  @ApiOperation({ summary: 'List available action types' })
  getActions() {
    return AUTOMATION_ACTIONS;
  }

  // ── Rules ──────────────────────────────────────────────────────────────────

  @Get('rules')
  @Permissions(PERMISSIONS.AUTOMATION.VIEW)
  @ApiOperation({ summary: 'List automation rules (paginated)' })
  listRules(@CurrentUser() user: AuthUser, @Query() query: ListAutomationRulesDto) {
    return this.rulesService.findAll(user.organizationId, query);
  }

  @Post('rules')
  @Permissions(PERMISSIONS.AUTOMATION.CREATE)
  @ApiOperation({ summary: 'Create automation rule' })
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateAutomationRuleDto) {
    const locationIds = user.locationIds ?? null;
    return this.rulesService.create(user.organizationId, dto, user.id, locationIds);
  }

  @Get('rules/:id')
  @Permissions(PERMISSIONS.AUTOMATION.VIEW)
  @ApiOperation({ summary: 'Get automation rule detail' })
  getRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rulesService.findOne(user.organizationId, id);
  }

  @Patch('rules/:id')
  @Permissions(PERMISSIONS.AUTOMATION.EDIT)
  @ApiOperation({ summary: 'Update automation rule' })
  updateRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    const locationIds = user.locationIds ?? null;
    return this.rulesService.update(user.organizationId, id, dto, user.id, locationIds);
  }

  @Post('rules/:id/activate')
  @Permissions(PERMISSIONS.AUTOMATION.ACTIVATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate rule' })
  activateRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rulesService.setActive(user.organizationId, id, true, user.id);
  }

  @Post('rules/:id/deactivate')
  @Permissions(PERMISSIONS.AUTOMATION.ACTIVATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate rule' })
  deactivateRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rulesService.setActive(user.organizationId, id, false, user.id);
  }

  @Delete('rules/:id')
  @Permissions(PERMISSIONS.AUTOMATION.DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete automation rule' })
  deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rulesService.delete(user.organizationId, id, user.id);
  }

  @Post('rules/:id/test')
  @Permissions(PERMISSIONS.AUTOMATION.EXECUTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate rule with test payload (no side effects)' })
  async simulateRule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SimulateRuleDto,
  ) {
    const rule = await this.rulesService.findOne(user.organizationId, id);
    return this.dispatcher.simulateRule(rule, dto.payload);
  }

  // ── Executions ─────────────────────────────────────────────────────────────

  @Get('executions')
  @Permissions(PERMISSIONS.AUTOMATION.HISTORY_VIEW)
  @ApiOperation({ summary: 'List execution history (paginated)' })
  listExecutions(@CurrentUser() user: AuthUser, @Query() query: ListExecutionsDto) {
    return this.rulesService.findExecutions(user.organizationId, query);
  }

  @Get('executions/:id')
  @Permissions(PERMISSIONS.AUTOMATION.HISTORY_VIEW)
  @ApiOperation({ summary: 'Get execution detail' })
  getExecution(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rulesService.findExecution(user.organizationId, id);
  }
}
