import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PrismaService } from '../../common/services/prisma.service';
import { normalizeToE164 } from '@knef/utils';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { ChannelPreferenceService } from '../communications/channel-preference.service';

export const WHATSAPP_ORDER_EVENTS = [
  'ORDER_RECEIVED',
  'PAYMENT_CONFIRMED',
  'ORDER_CONFIRMED',
  'ORDER_PROCESSING',
  'ORDER_READY',
  'ORDER_DISPATCHED',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
] as const;

export type WhatsAppOrderEvent = (typeof WHATSAPP_ORDER_EVENTS)[number];

@Injectable()
export class WhatsAppOrderService {
  private readonly logger = new Logger(WhatsAppOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageService: WhatsAppMessageService,
    private readonly channelPref: ChannelPreferenceService,
  ) {}

  async notifyOrderEvent(
    organizationId: string,
    orderId: string,
    event: WhatsAppOrderEvent,
  ): Promise<void> {
    // Resolve order authoritatively — never trust caller-supplied phone
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, organizationId },
      select: {
        id: true,
        reference: true,
        deliveryPhone: true,
        customerAccount: { select: { phone: true, whatsappPhone: true, whatsappOptIn: true } },
      },
    });
    if (!order) {
      this.logger.warn(`WhatsApp order notify: order ${orderId} not found`);
      return;
    }

    // Resolve recipient phone
    const rawPhone =
      order.customerAccount?.whatsappPhone ??
      order.deliveryPhone ??
      order.customerAccount?.phone;
    if (!rawPhone) return;

    const to = normalizeToE164(rawPhone) ?? rawPhone;

    // Check transactional vs marketing consent
    const mapping = await this.prisma.whatsAppOrderEventMapping.findFirst({
      where: { organizationId, orderEvent: event, isActive: true },
      include: { template: true },
    });
    if (!mapping || mapping.template.status !== 'APPROVED') {
      this.logger.log(`No approved template mapped for ${event} (org=${organizationId})`);
      return;
    }

    // Idempotency: one send per org+order+event
    const idempotencyKey = `wa:order:${organizationId}:${orderId}:${event}`;

    await this.messageService.enqueueTransactional({
      organizationId,
      to,
      templateName: mapping.template.name,
      templateLanguage: mapping.template.language,
      templateComponents: [],
      messageType: 'TRANSACTIONAL',
      orderId,
      idempotencyKey,
    });
  }

  async setOrderEventMapping(
    organizationId: string,
    userId: string,
    orderEvent: string,
    templateId: string,
    isActive: boolean,
  ) {
    if (!WHATSAPP_ORDER_EVENTS.includes(orderEvent as WhatsAppOrderEvent)) {
      throw new Error(`Unknown order event: ${orderEvent}`);
    }

    const cfg = await this.prisma.whatsAppConfig.findUnique({ where: { organizationId } });
    if (!cfg) throw new Error('WhatsApp not configured');

    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, organizationId },
    });
    if (!template) throw new Error('Template not found');

    return this.prisma.whatsAppOrderEventMapping.upsert({
      where: { organizationId_orderEvent: { organizationId, orderEvent } },
      create: {
        id: createId(),
        organizationId,
        whatsAppConfigId: cfg.id,
        orderEvent,
        templateId,
        isActive,
      },
      update: { templateId, isActive },
    });
  }

  async listOrderEventMappings(organizationId: string) {
    return this.prisma.whatsAppOrderEventMapping.findMany({
      where: { organizationId },
      include: { template: { select: { id: true, name: true, language: true, status: true, category: true } } },
      orderBy: { orderEvent: 'asc' },
    });
  }
}
