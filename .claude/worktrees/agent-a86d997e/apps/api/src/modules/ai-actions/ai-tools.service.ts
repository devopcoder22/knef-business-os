import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AIToolExecutorService } from './ai-tool-executor.service';
import { AIPermissionCheckerService, type AIExecutionContext } from './ai-permission-checker.service';
import type { CreateAIToolDto, UpdateAIToolDto, ListActionsDto } from './dto/ai-actions.dto';

@Injectable()
export class AIToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: AIToolExecutorService,
    private readonly permissionChecker: AIPermissionCheckerService,
  ) {}

  async listTools(orgId: string) {
    return this.prisma.aITool.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTool(orgId: string, dto: CreateAIToolDto) {
    return this.prisma.aITool.create({
      data: {
        id: createId(),
        organizationId: orgId,
        name: dto.name,
        description: dto.description,
        inputSchema: (dto.inputSchema ?? {}) as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        requiresApproval: dto.requiresApproval ?? false,
        category: dto.category ?? null,
      },
    });
  }

  async updateTool(orgId: string, id: string, dto: UpdateAIToolDto) {
    const tool = await this.prisma.aITool.findFirst({ where: { id, organizationId: orgId } });
    if (!tool) throw new NotFoundException('Tool not found');

    return this.prisma.aITool.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.inputSchema !== undefined && { inputSchema: dto.inputSchema as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
      },
    });
  }

  async deleteTool(orgId: string, id: string) {
    const tool = await this.prisma.aITool.findFirst({ where: { id, organizationId: orgId } });
    if (!tool) throw new NotFoundException('Tool not found');

    return this.prisma.aITool.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async executeTool(
    context: AIExecutionContext,
    toolId: string,
    parameters: Record<string, unknown>,
  ) {
    const orgId = context.organizationId;
    const userId = context.userId;

    const tool = await this.prisma.aITool.findFirst({ where: { id: toolId, organizationId: orgId } });
    if (!tool) throw new NotFoundException('Tool not found');
    if (!tool.isActive) throw new BadRequestException('Tool is not active');

    // Enforce permission gate before any business logic
    await this.permissionChecker.checkToolPermission(context, tool.name);

    const action = await this.prisma.aIAction.create({
      data: {
        id: createId(),
        organizationId: orgId,
        toolId: tool.id,
        userId,
        action: tool.name,
        parameters: parameters as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });

    if (tool.requiresApproval) {
      await this.prisma.aIApproval.create({
        data: {
          id: createId(),
          organizationId: orgId,
          actionId: action.id,
          requestedBy: userId,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return { actionId: action.id, status: 'PENDING', requiresApproval: true };
    }

    // Execute immediately
    await this.prisma.aIAction.update({
      where: { id: action.id },
      data: { status: 'EXECUTING' },
    });

    try {
      const result = await this.executor.execute(tool, parameters, orgId, context.locationIds ?? null);
      const updated = await this.prisma.aIAction.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          result: result as Prisma.InputJsonValue,
          executedAt: new Date(),
        },
      });
      return { actionId: updated.id, status: 'COMPLETED', result };
    } catch (err: unknown) {
      await this.prisma.aIAction.update({
        where: { id: action.id },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }

  async listActions(orgId: string, query: ListActionsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AIActionWhereInput = { organizationId: orgId };
    if (query.status) where.status = query.status as Prisma.EnumActionStatusFilter;

    const [data, total] = await Promise.all([
      this.prisma.aIAction.findMany({
        where,
        include: { tool: { select: { name: true, category: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.aIAction.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getAction(orgId: string, id: string) {
    const action = await this.prisma.aIAction.findFirst({
      where: { id, organizationId: orgId },
      include: { tool: true },
    });
    if (!action) throw new NotFoundException('Action not found');
    return action;
  }
}
