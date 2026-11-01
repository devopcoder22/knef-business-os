import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../../common/services/queue.service';
import { QUEUES, JOB_TYPES } from '@knef/constants';
import type { AppConfig } from '../../config/app.config';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';

// Status precedence for out-of-order webhook deduplication
const STATUS_RANK: Record<string, number> = {
  QUEUED: 0,
  SUBMITTED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 5,
};

export interface SendTransactionalParams {
  organizationId: string;
  to: string;
  templateName: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  messageType?: 'TRANSACTIONAL' | 'MARKETING';
  orderId?: string;
  idempotencyKey: string;
}

@Injectable()
export class WhatsAppMessageService {
  private readonly logger = new Logger(WhatsAppMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<AppConfig>,
    private readonly configService: WhatsAppConfigService,
    private readonly conversationService: WhatsAppConversationService,
    private readonly metaProvider: MetaWhatsAppProvider,
  ) {}

  private get deliveryEnabled(): boolean {
    return this.config.get('WHATSAPP_DELIVERY_ENABLED') === 'true';
  }

  async enqueueTransactional(params: SendTransactionalParams): Promise<{ messageId: string }> {
    // Idempotency check
    const existing = await this.prisma.whatsAppMessage.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      this.logger.log(`Duplicate WhatsApp send suppressed (idempotencyKey=${params.idempotencyKey})`);
      return { messageId: existing.id };
    }

    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId: params.organizationId },
    });
    if (!cfg || !cfg.isActive) throw new NotFoundException('WhatsApp not configured or inactive');

    const conv = await this.conversationService.findOrCreate(
      params.organizationId,
      params.to,
      cfg.phoneNumberId,
      cfg.id,
    );

    const msgId = createId();
    await this.prisma.whatsAppMessage.create({
      data: {
        id: msgId,
        organizationId: params.organizationId,
        conversationId: conv.id,
        direction: 'OUTBOUND',
        fromNumber: cfg.displayPhoneNumber ?? cfg.phoneNumberId,
        toNumber: params.to,
        messageType: 'template',
        templateName: params.templateName,
        templateLanguage: params.templateLanguage ?? 'en_US',
        templateComponents: (params.templateComponents ?? []) as object[],
        status: 'QUEUED',
        idempotencyKey: params.idempotencyKey,
      },
    });

    await this.queue.enqueue(QUEUES.NOTIFICATIONS, JOB_TYPES.SEND_WHATSAPP, {
      organizationId: params.organizationId,
      to: params.to,
      messageType: params.messageType ?? 'TRANSACTIONAL',
      templateName: params.templateName,
      templateLanguage: params.templateLanguage ?? 'en_US',
      templateComponents: params.templateComponents,
      messageId: msgId,
      conversationId: conv.id,
      orderId: params.orderId,
      idempotencyKey: params.idempotencyKey,
    });

    return { messageId: msgId };
  }

  async sendSupportReply(
    organizationId: string,
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<{ messageId: string }> {
    // Server resolves recipient — never trust client-supplied number
    const conv = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { organizationId },
    });
    if (!cfg || !cfg.isActive) throw new NotFoundException('WhatsApp not configured');

    // Enforce messaging window
    if (conv.windowExpiresAt && conv.windowExpiresAt < new Date()) {
      throw new BadRequestException(
        'Messaging window expired (24h). Use a template message to re-engage.',
      );
    }

    if (!this.deliveryEnabled) {
      this.logger.log(`[MOCK] Support reply suppressed — WHATSAPP_DELIVERY_ENABLED=false`);
      return { messageId: createId() };
    }

    const accessToken = await this.configService.resolveAccessToken(organizationId);
    const result = await this.metaProvider.sendText({
      phoneNumberId: cfg.phoneNumberId,
      accessToken,
      to: conv.customerPhone,
      body,
    });

    const msgId = createId();
    await this.prisma.whatsAppMessage.create({
      data: {
        id: msgId,
        organizationId,
        conversationId: conv.id,
        direction: 'OUTBOUND',
        fromNumber: cfg.displayPhoneNumber ?? cfg.phoneNumberId,
        toNumber: conv.customerPhone,
        messageType: 'text',
        body,
        providerMessageId: result.providerMessageId || null,
        status: result.status === 'accepted' ? 'SENT' : 'FAILED',
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        sentAt: result.status === 'accepted' ? new Date() : null,
      },
    });

    await this.audit.log({ organizationId, userId, action: 'WHATSAPP_SUPPORT_REPLY', entity: 'WhatsAppConversation', entityId: conv.id }).catch(() => {});
    return { messageId: msgId };
  }

  async processInboundMessage(
    organizationId: string,
    wabaId: string,
    msg: {
      from: string;
      id: string;
      timestamp: string;
      type: string;
      text?: { body: string };
    },
    phoneNumberId: string,
  ): Promise<void> {
    // Dedup by providerMessageId
    const exists = await this.prisma.whatsAppMessage.findUnique({
      where: { organizationId_providerMessageId: { organizationId, providerMessageId: msg.id } },
    });
    if (exists) return;

    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) return;

    const conv = await this.conversationService.findOrCreate(
      organizationId,
      `+${msg.from}`,
      phoneNumberId,
      cfg.id,
    );

    // Update conversation window (24h from now)
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: {
        windowExpiresAt: windowExpiry,
        lastInboundAt: new Date(),
        status: 'OPEN',
        unreadCount: { increment: 1 },
      },
    });

    await this.prisma.whatsAppMessage.create({
      data: {
        id: createId(),
        organizationId,
        conversationId: conv.id,
        providerMessageId: msg.id,
        direction: 'INBOUND',
        fromNumber: `+${msg.from}`,
        toNumber: cfg.displayPhoneNumber ?? cfg.phoneNumberId,
        messageType: msg.type === 'text' ? 'text' : msg.type,
        body: msg.text?.body ?? null,
        status: 'DELIVERED',
        deliveredAt: new Date(parseInt(msg.timestamp, 10) * 1000),
      },
    });

    // Handle opt-out keywords
    const body = msg.text?.body?.trim().toUpperCase() ?? '';
    if (body === 'STOP' || body === 'UNSUBSCRIBE') {
      await this.handleOptOut(organizationId, `+${msg.from}`);
    }
  }

  async updateMessageStatus(
    organizationId: string,
    status: { id: string; status: string; timestamp: string; errors?: { code: number; message: string }[] },
  ): Promise<void> {
    const msg = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId, providerMessageId: status.id },
    });
    if (!msg) return;

    const currentRank = STATUS_RANK[msg.status] ?? 0;
    const newStatus = status.status.toUpperCase();
    const newRank = STATUS_RANK[newStatus] ?? 0;

    // Monotonic: never regress a terminal or higher status
    if (newRank <= currentRank) return;

    const ts = new Date(parseInt(status.timestamp, 10) * 1000);
    await this.prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status: newStatus,
        ...(newStatus === 'SENT' ? { sentAt: ts } : {}),
        ...(newStatus === 'DELIVERED' ? { deliveredAt: ts } : {}),
        ...(newStatus === 'READ' ? { readAt: ts } : {}),
        ...(newStatus === 'FAILED' ? {
          failedAt: ts,
          errorCode: status.errors?.[0]?.code ?? null,
          errorMessage: status.errors?.[0]?.message ?? null,
        } : {}),
      },
    });
  }

  private async handleOptOut(organizationId: string, phone: string): Promise<void> {
    const existing = await this.prisma.channelPreference.findFirst({
      where: { organizationId, phone, channel: 'WHATSAPP', messageType: 'MARKETING' },
    });
    if (existing) {
      await this.prisma.channelPreference.update({
        where: { id: existing.id },
        data: { status: 'unsubscribed', unsubscribedAt: new Date() },
      });
    } else {
      await this.prisma.channelPreference.create({
        data: {
          id: createId(),
          organizationId,
          phone,
          channel: 'WHATSAPP',
          messageType: 'MARKETING',
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
          source: 'INBOUND_STOP_KEYWORD',
        },
      });
    }
    this.logger.log(`WhatsApp marketing opt-out recorded for ${phone} (org=${organizationId})`);
  }

  async isMarketingOptedIn(organizationId: string, phone: string): Promise<boolean> {
    const pref = await this.prisma.channelPreference.findFirst({
      where: { organizationId, phone, channel: 'WHATSAPP', messageType: 'MARKETING' },
    });
    return !pref || pref.status === 'subscribed';
  }

  async listHistory(
    organizationId: string,
    filters: { conversationId?: string; direction?: string; status?: string; fromDate?: string; toDate?: string },
    page = 1,
    limit = 50,
  ) {
    const where = {
      organizationId,
      ...(filters.conversationId ? { conversationId: filters.conversationId } : {}),
      ...(filters.direction ? { direction: filters.direction } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.fromDate || filters.toDate ? {
        createdAt: {
          ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
          ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
        },
      } : {}),
    };
    const [messages, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);
    return { messages, total, page, limit };
  }
}
