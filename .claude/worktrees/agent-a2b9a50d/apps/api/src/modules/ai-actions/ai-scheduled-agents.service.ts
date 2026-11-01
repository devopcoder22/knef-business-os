import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type { AIScheduledAgent, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { AICompletionService } from '../ai/ai-completion.service';
import type { CreateScheduledAgentDto, UpdateScheduledAgentDto } from './dto/ai-actions.dto';

function buildAgentPrompt(agent: AIScheduledAgent): string {
  const params = agent.parameters as Record<string, unknown>;
  const prompts: Record<string, string> = {
    inventory_check: `You are an inventory management assistant. Check inventory levels and identify any products that need reordering. Parameters: ${JSON.stringify(params)}`,
    sales_summary: `You are a sales analyst. Summarize recent sales performance and highlight key trends. Parameters: ${JSON.stringify(params)}`,
    expense_review: `You are a finance assistant. Review pending expenses and identify any that may need attention. Parameters: ${JSON.stringify(params)}`,
    customer_followup: `You are a CRM assistant. Identify customers who may need follow-up based on their purchase history. Parameters: ${JSON.stringify(params)}`,
  };
  return (
    prompts[agent.taskType as string] ??
    `Execute task: ${String(agent.taskType)}. Parameters: ${JSON.stringify(params)}`
  );
}

@Injectable()
export class AIScheduledAgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiCompletion: AICompletionService,
  ) {}

  async listAgents(orgId: string) {
    return this.prisma.aIScheduledAgent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAgent(orgId: string, dto: CreateScheduledAgentDto) {
    const parts = dto.cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new BadRequestException('cronExpression must have exactly 5 space-separated parts');
    }

    const nextRunAt = new Date(Date.now() + 60 * 60 * 1000);

    return this.prisma.aIScheduledAgent.create({
      data: {
        id: createId(),
        organizationId: orgId,
        name: dto.name,
        description: dto.description ?? null,
        taskType: dto.taskType,
        parameters: (dto.parameters ?? {}) as Prisma.InputJsonValue,
        cronExpression: dto.cronExpression,
        isActive: dto.isActive ?? true,
        nextRunAt,
      },
    });
  }

  async updateAgent(orgId: string, id: string, dto: UpdateScheduledAgentDto) {
    const agent = await this.prisma.aIScheduledAgent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    if (dto.cronExpression !== undefined) {
      const parts = dto.cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) {
        throw new BadRequestException('cronExpression must have exactly 5 space-separated parts');
      }
    }

    return this.prisma.aIScheduledAgent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.taskType !== undefined && { taskType: dto.taskType }),
        ...(dto.parameters !== undefined && { parameters: dto.parameters as Prisma.InputJsonValue }),
        ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteAgent(orgId: string, id: string) {
    const agent = await this.prisma.aIScheduledAgent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    return this.prisma.aIScheduledAgent.delete({ where: { id } });
  }

  async toggleAgent(orgId: string, id: string, isActive: boolean) {
    const agent = await this.prisma.aIScheduledAgent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    return this.prisma.aIScheduledAgent.update({
      where: { id },
      data: { isActive },
    });
  }

  async runAgentNow(orgId: string, id: string, userId: string) {
    const agent = await this.prisma.aIScheduledAgent.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const prompt = buildAgentPrompt(agent);

    try {
      const completion = await this.aiCompletion.complete({
        organizationId: orgId,
        userId,
        taskType: agent.taskType as string,
        messages: [{ role: 'user', content: prompt }],
      });

      await this.prisma.aIScheduledAgent.update({
        where: { id },
        data: { lastRunAt: new Date(), lastStatus: 'SUCCESS' },
      });

      return { result: completion.content };
    } catch (err: unknown) {
      await this.prisma.aIScheduledAgent.update({
        where: { id },
        data: { lastRunAt: new Date(), lastStatus: 'FAILED' },
      });
      const message = err instanceof Error ? err.message : 'Agent execution failed';
      return { error: message };
    }
  }
}
