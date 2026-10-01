import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@knef/constants';
import type { AuthUser } from '@knef/types';
import { ExternalAgentsService } from './external-agents.service';
import { KnefToolLayerService } from './knef-tool-layer.service';
import type { CreateExternalAgentDto, UpdateExternalAgentDto } from './dto/external-agents.dto';

/**
 * Admin-facing endpoints for managing external agent identities.
 * Requires JWT authentication and EXTERNAL_AGENTS permissions.
 */
@ApiTags('external-agents')
@ApiBearerAuth('JWT')
@Controller('external-agents')
export class ExternalAgentsController {
  constructor(
    private readonly agentsService: ExternalAgentsService,
    private readonly toolLayer: KnefToolLayerService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.VIEW)
  @ApiOperation({ summary: 'List external agents for this organization' })
  listAgents(@CurrentUser() user: AuthUser) {
    return this.agentsService.listAgents(user.organizationId);
  }

  @Post()
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.CREATE)
  @ApiOperation({ summary: 'Create an external agent (returns one-time API key)' })
  @ApiResponse({
    status: 201,
    description: 'Agent created. The rawApiKey is returned once and cannot be retrieved again.',
  })
  createAgent(@CurrentUser() user: AuthUser, @Body() dto: CreateExternalAgentDto) {
    return this.agentsService.createAgent(user.organizationId, dto, user.id);
  }

  @Get('tools')
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.VIEW)
  @ApiOperation({ summary: 'List all externally exposed KNEF tools' })
  listExposedTools() {
    return { tools: this.agentsService.listExposedTools() };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.VIEW)
  @ApiOperation({ summary: 'Get external agent by ID' })
  getAgent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.getAgent(user.organizationId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.MANAGE)
  @ApiOperation({ summary: 'Update external agent' })
  updateAgent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExternalAgentDto,
  ) {
    return this.agentsService.updateAgent(user.organizationId, id, dto, user.id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete external agent and revoke its API key' })
  deleteAgent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.deleteAgent(user.organizationId, id, user.id);
  }

  @Post(':id/rotate-key')
  @Permissions(PERMISSIONS.EXTERNAL_AGENTS.MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the API key for an external agent (returns new one-time key)' })
  rotateKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agentsService.rotateApiKey(user.organizationId, id, user.id);
  }
}
