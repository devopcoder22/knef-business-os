import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AICompletionService } from './ai-completion.service';
import type { CreateConversationDto, SendMessageDto } from './dto/ai.dto';

@Injectable()
export class AIConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: AICompletionService,
  ) {}

  async createConversation(orgId: string, userId: string, dto: CreateConversationDto) {
    return this.prisma.aIConversation.create({
      data: {
        id: createId(),
        organizationId: orgId,
        userId,
        title: dto.title ?? 'New Conversation',
        context: dto.context ?? null,
        isArchived: false,
        metadata: {},
      },
    });
  }

  async listConversations(
    orgId: string,
    userId: string,
    opts: { page?: number; limit?: number; isArchived?: boolean },
  ) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { organizationId: orgId, userId };
    if (opts.isArchived !== undefined) where.isArchived = opts.isArchived;

    const [data, total] = await Promise.all([
      this.prisma.aIConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.aIConversation.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getConversation(orgId: string, userId: string, id: string) {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id, organizationId: orgId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async sendMessage(orgId: string, userId: string, conversationId: string, dto: SendMessageDto) {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id: conversationId, organizationId: orgId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // Create user message
    const userMessage = await this.prisma.aIMessage.create({
      data: {
        id: createId(),
        conversationId,
        role: 'user',
        content: dto.content,
        model: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        latencyMs: null,
        metadata: {},
      },
    });

    // Fetch last 20 messages for context
    const history = await this.prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const contextMessages = history.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Call LLM
    const result = await this.completion.complete({
      organizationId: orgId,
      userId,
      taskType: dto.taskType ?? 'chat',
      messages: contextMessages,
      systemPrompt: conv.context ?? undefined,
      conversationId,
    });

    // Create assistant message
    const assistantMessage = await this.prisma.aIMessage.create({
      data: {
        id: createId(),
        conversationId,
        role: 'assistant',
        content: result.content,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        latencyMs: result.latencyMs,
        metadata: {},
      },
    });

    // Update conversation timestamp
    await this.prisma.aIConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return { userMessage, assistantMessage, result };
  }

  async archiveConversation(orgId: string, userId: string, id: string): Promise<void> {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id, organizationId: orgId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.prisma.aIConversation.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  async deleteConversation(orgId: string, userId: string, id: string): Promise<void> {
    const conv = await this.prisma.aIConversation.findFirst({
      where: { id, organizationId: orgId, userId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.prisma.aIMessage.deleteMany({ where: { conversationId: id } });
    await this.prisma.aIConversation.delete({ where: { id } });
  }
}
