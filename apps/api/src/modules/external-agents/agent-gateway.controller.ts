import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ExternalAgentAuthGuard } from './external-agent-auth.guard';
import { KnefToolLayerService } from './knef-tool-layer.service';
import type { ExecuteToolDto } from './dto/external-agents.dto';
import type { ExternalAgent } from '@prisma/client';

interface AgentRequest {
  organizationId: string;
  externalAgent: ExternalAgent;
  headers: Record<string, string>;
}

/**
 * External-agent-facing REST gateway.
 *
 * Authentication: X-Api-Key header (linked to an ExternalAgent record).
 * All routes use ExternalAgentAuthGuard — JWT is NOT required here.
 *
 * Routes:
 *   GET  /agent/health        — Liveness check
 *   GET  /agent/me            — Authenticated agent identity
 *   GET  /agent/tools         — Discover permitted tools
 *   GET  /agent/tools/:name   — Get single tool definition
 *   POST /agent/tools/:name/execute — Execute a tool
 */
@ApiTags('agent-gateway')
@ApiSecurity('X-Api-Key')
@UseGuards(ExternalAgentAuthGuard)
@Controller('agent')
export class AgentGatewayController {
  constructor(private readonly toolLayer: KnefToolLayerService) {}

  @Get('health')
  @SkipThrottle()
  @ApiOperation({ summary: 'Gateway health check' })
  health(@Req() req: AgentRequest) {
    return {
      status: 'ok',
      agentId: req.externalAgent.id,
      organizationId: req.organizationId,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get authenticated agent identity and capabilities' })
  getMe(@Req() req: AgentRequest) {
    const agent = req.externalAgent;
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      scopes: agent.scopes,
      allowedTools: agent.allowedTools,
      autonomyLevel: agent.autonomyLevel,
      organizationId: agent.organizationId,
      lastUsedAt: agent.lastUsedAt,
    };
  }

  @Get('tools')
  @ApiOperation({ summary: 'Discover tools this agent is authorized to use' })
  listTools(@Req() req: AgentRequest) {
    const agent = req.externalAgent;
    const allExposed = this.toolLayer.listExposedTools();

    // Only show tools that this agent's allowedTools list includes (or all if list is empty)
    const permitted = agent.allowedTools.length > 0
      ? allExposed.filter((t) => agent.allowedTools.includes(t.toolName))
      : allExposed;

    return {
      tools: permitted.map((t) => ({
        name: t.toolName,
        description: t.description,
        category: t.category,
        riskLevel: t.riskLevel,
        approvalRequired: t.approvalRequired,
        requiredScope: t.requiredScope,
        inputSchema: t.inputSchema,
      })),
      count: permitted.length,
    };
  }

  @Get('tools/:name')
  @ApiOperation({ summary: 'Get a single tool definition' })
  getTool(@Req() req: AgentRequest, @Param('name') name: string) {
    const all = this.toolLayer.listExposedTools();
    const tool = all.find((t) => t.toolName === name);
    if (!tool) {
      return { error: { code: 'TOOL_NOT_FOUND', message: `Tool "${name}" not found` } };
    }
    return {
      name: tool.toolName,
      description: tool.description,
      category: tool.category,
      riskLevel: tool.riskLevel,
      approvalRequired: tool.approvalRequired,
      externalExposure: tool.externalExposure,
      requiredScope: tool.requiredScope,
      inputSchema: tool.inputSchema,
    };
  }

  @Post('tools/:name/execute')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 1000, limit: 5 }, medium: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Execute a KNEF tool' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Client-generated key for write operation deduplication',
  })
  @ApiResponse({ status: 200, description: 'Tool result or approval request' })
  async executeTool(
    @Req() req: AgentRequest,
    @Param('name') name: string,
    @Body() dto: ExecuteToolDto,
  ) {
    const idempotencyKey =
      dto.idempotencyKey ?? (req.headers['idempotency-key'] as string | undefined);

    return this.toolLayer.execute({
      toolName: name,
      parameters: dto.parameters ?? {},
      organizationId: req.organizationId,
      externalAgent: req.externalAgent,
      requestId: req.headers['x-request-id'] as string | undefined,
      idempotencyKey,
    });
  }
}
