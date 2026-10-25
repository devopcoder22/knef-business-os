import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { normalizeToE164 } from '@knef/utils';

@Injectable()
export class WhatsAppConversationService {
  private readonly logger = new Logger(WhatsAppConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(
    organizationId: string,
    customerPhone: string,
    phoneNumberId: string,
    configId: string,
  ) {
    const normalized = normalizeToE164(customerPhone) ?? customerPhone;

    const existing = await this.prisma.whatsAppConversation.findFirst({
      where: { organizationId, customerPhone: normalized, businessPhoneNumberId: phoneNumberId, status: 'OPEN' },
    });
    if (existing) return existing;

    // Try to match a CustomerAccount by phone
    const customerAccount = await this.resolveCustomer(organizationId, normalized);

    return this.prisma.whatsAppConversation.create({
      data: {
        id: createId(),
        organizationId,
        whatsAppConfigId: configId,
        customerPhone: normalized,
        businessPhoneNumberId: phoneNumberId,
        customerAccountId: customerAccount?.id ?? null,
        status: 'OPEN',
      },
    });
  }

  async resolveCustomer(organizationId: string, phone: string) {
    const normalized = normalizeToE164(phone) ?? phone;
    // Search by phone and whatsappPhone; avoid merging on multiple matches
    const candidates = await this.prisma.customerAccount.findMany({
      where: {
        organizationId,
        OR: [
          { phone: normalized },
          { phone: phone },
          { whatsappPhone: normalized },
        ],
      },
      take: 2,
    });
    if (candidates.length === 1) return candidates[0];
    // Multiple matches — cannot safely resolve; return null for manual resolution
    return null;
  }

  async listConversations(
    organizationId: string,
    filters: { status?: string; page?: number; limit?: number },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const where = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [conversations, total] = await Promise.all([
      this.prisma.whatsAppConversation.findMany({
        where,
        orderBy: [{ lastInboundAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      this.prisma.whatsAppConversation.count({ where }),
    ]);
    return { conversations, total, page, limit };
  }

  async getConversation(organizationId: string, conversationId: string) {
    const conv = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    // Mark as read
    await this.prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { unreadCount: 0 },
    }).catch(() => {});

    return conv;
  }
}
