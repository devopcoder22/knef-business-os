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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';

import { AIToolsService } from './ai-tools.service';
import { AIApprovalsService } from './ai-approvals.service';
import { AIScheduledAgentsService } from './ai-scheduled-agents.service';
import { AIPermissionCheckerService } from './ai-permission-checker.service';

import {
  CreateAIToolDto,
  UpdateAIToolDto,
  ExecuteToolDto,
  ListActionsDto,
  ApproveActionDto,
  RejectActionDto,
  ListApprovalsDto,
  CreateScheduledAgentDto,
  UpdateScheduledAgentDto,
  ToggleAgentDto,
} from './dto/ai-actions.dto';

// ── AI Tools Controller ──────────────────────────────────────────

@ApiTags('ai-tools')
@ApiBearerAuth('JWT')
@Controller('ai/tools')
export class AIToolsController {
  constructor(
    private readonly toolsService: AIToolsService,
    private readonly permissionChecker: AIPermissionCheckerService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.AI.TOOLS)
  @ApiOperation({ summary: 'List AI tools' })
  listTools(@CurrentUser() user: AuthUser) {
    return this.toolsService.listTools(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.AI.TOOLS)
  @ApiOperation({ summary: 'Create AI tool' })
  createTool(@CurrentUser() user: AuthUser, @Body() dto: CreateAIToolDto) {
    return this.toolsService.createTool(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.AI.TOOLS)
  @ApiOperation({ summary: 'Update AI tool' })
  updateTool(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAIToolDto,
  ) {
    return this.toolsService.updateTool(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.AI.TOOLS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete AI tool' })
  deleteTool(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.toolsService.deleteTool(user.organizationId, id);
  }

  @Post(':id/execute')
  @Permissions(PERMISSIONS.AI.TOOLS)
  @ApiOperation({ summary: 'Execute an AI tool' })
  async executeTool(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExecuteToolDto,
  ) {
    const context = await this.permissionChecker.resolveExecutionContext(user.id, user.organizationId);
    return this.toolsService.executeTool(context, id, dto.parameters);
  }

  @Get('actions')
  @Permissions(PERMISSIONS.AI.TOOLS)
  @ApiOperation({ summary: 'List AI actions' })
  listActions(@CurrentUser() user: AuthUser, @Query() query: ListActionsDto) {
    return this.toolsService.listActions(user.organizationId, query);
  }

  @Get('actions/:id')
  @Permissions(PERMISSIONS.AI.TOOLS)
  @ApiOperation({ summary: 'Get action detail' })
  getAction(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.toolsService.getAction(user.organizationId, id);
  }
}

// ── AI Approvals Controller ──────────────────────────────────────

@ApiTags('ai-approvals')
@ApiBearerAuth('JWT')
@Controller('ai/approvals')
export class AIApprovalsController {
  constructor(private readonly approvalsService: AIApprovalsService) {}

  @Get()
  @Permissions(PERMISSIONS.AI.APPROVALS)
  @ApiOperation({ summary: 'List pending approvals' })
  listPending(@CurrentUser() user: AuthUser) {
    return this.approvalsService.listPending(user.organizationId);
  }

  @Get('stats')
  @Permissions(PERMISSIONS.AI.APPROVALS)
  @ApiOperation({ summary: 'Approval stats' })
  getStats(@CurrentUser() user: AuthUser) {
    return this.approvalsService.getStats(user.organizationId);
  }

  @Get('history')
  @Permissions(PERMISSIONS.AI.APPROVALS)
  @ApiOperation({ summary: 'Approval history' })
  listHistory(@CurrentUser() user: AuthUser, @Query() query: ListApprovalsDto) {
    return this.approvalsService.listHistory(user.organizationId, query);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.AI.APPROVALS)
  @ApiOperation({ summary: 'Approve an action' })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveActionDto,
  ) {
    return this.approvalsService.approve(user.organizationId, id, user.id, dto.reason);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.AI.APPROVALS)
  @ApiOperation({ summary: 'Reject an action' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectActionDto,
  ) {
    return this.approvalsService.reject(user.organizationId, id, user.id, dto.reason);
  }
}

// ── AI Scheduled Agents Controller ──────────────────────────────

@ApiTags('ai-agents')
@ApiBearerAuth('JWT')
@Controller('ai/agents')
export class AIScheduledAgentsController {
  constructor(private readonly agentsService: AIScheduledAgentsService) {}

  @Get()
  @Permissions(PERMISSIONS.AI.AGENTS)
  @ApiOperation({ summary: 'List scheduled agents' })
  listAgents(@CurrentUser() user: AuthUser) {
    return this.agentsService.listAgents(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.AI.AGENTS)
  @ApiOperation({ summary: 'Create scheduled agent' })
  createAgent(@CurrentUser() user: AuthUser, @Body() dto: CreateScheduledAgentDto) {
    return this.agentsService.createAgent(user.organizationId, dto);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.AI.AGENTS)
  @ApiOperation({ summary: 'Update scheduled agent' })
  updateAgent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateScheduledAgentDto,
  ) {
    return this.agentsService.updateAgent(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.AI.AGENTS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete scheduled agent' })
  deleteAgent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.deleteAgent(user.organizationId, id);
  }

  @Post(':id/toggle')
  @Permissions(PERMISSIONS.AI.AGENTS)
  @ApiOperation({ summary: 'Toggle agent active state' })
  toggleAgent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ToggleAgentDto,
  ) {
    return this.agentsService.toggleAgent(user.organizationId, id, dto.isActive);
  }

  @Post(':id/run')
  @Permissions(PERMISSIONS.AI.AGENTS)
  @ApiOperation({ summary: 'Run agent now' })
  runAgentNow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.runAgentNow(user.organizationId, id, user.id);
  }
}
