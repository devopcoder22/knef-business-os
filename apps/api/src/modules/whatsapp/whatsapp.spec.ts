import { createHmac } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WhatsAppOrderService } from './whatsapp-order.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const ORG_A = 'org-aaa';
const ORG_B = 'org-bbb';
const PHONE = '+2348012345678';
const WABA_ID = 'waba-001';
const PHONE_NUM_ID = 'pnid-001';

function makeCfg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cfg-1',
    organizationId: ORG_A,
    phoneNumberId: PHONE_NUM_ID,
    businessAccountId: WABA_ID,
    accessTokenEncrypted: 'enc-token',
    appSecretEncrypted: null,
    displayPhoneNumber: PHONE,
    isActive: true,
    status: 'CONNECTED',
    ...overrides,
  };
}

// ─── MetaWhatsAppProvider — verifyWebhookSignature ───────────────────────────

describe('MetaWhatsAppProvider.verifyWebhookSignature', () => {
  let provider: MetaWhatsAppProvider;

  beforeEach(() => {
    provider = new MetaWhatsAppProvider();
  });

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const secret = 'my-app-secret';
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    expect(provider.verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const secret = 'my-app-secret';
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    expect(provider.verifyWebhookSignature(body + 'extra', sig, secret)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const body = '{"object":"test"}';
    const sig = `sha256=${createHmac('sha256', 'correct-secret').update(body).digest('hex')}`;

    expect(provider.verifyWebhookSignature(body, sig, 'wrong-secret')).toBe(false);
  });

  it('returns false when signature has different length (prevents buffer comparison crash)', () => {
    const secret = 'sec';
    const body = 'body';
    expect(provider.verifyWebhookSignature(body, 'sha256=tooshort', secret)).toBe(false);
  });

  it('returns false when signature is empty', () => {
    expect(provider.verifyWebhookSignature('body', '', 'secret')).toBe(false);
  });
});

// ─── WhatsAppConfigService ───────────────────────────────────────────────────

describe('WhatsAppConfigService', () => {
  let service: WhatsAppConfigService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockAudit: { log: jest.Mock };
  let mockQueue: { enqueue: jest.Mock };
  let mockConfig: { getOrThrow: jest.Mock };
  let mockMeta: { getPhoneHealth: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      whatsAppConfig: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    mockQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    mockConfig = { getOrThrow: jest.fn(() => 'a'.repeat(64)) };
    mockMeta = { getPhoneHealth: jest.fn() };

    service = new WhatsAppConfigService(
      mockPrisma as never,
      mockAudit as never,
      mockQueue as never,
      mockConfig as never,
      mockMeta as never,
    );
  });

  describe('configure', () => {
    it('creates a new config when none exists', async () => {
      mockPrisma.whatsAppConfig.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.whatsAppConfig.create = jest.fn().mockResolvedValue(makeCfg());
      mockPrisma.whatsAppConfig.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeCfg());

      await service.configure(ORG_A, 'user-1', {
        phoneNumberId: PHONE_NUM_ID,
        businessAccountId: WABA_ID,
        accessToken: 'tok-123',
      });

      expect(mockPrisma.whatsAppConfig.create).toHaveBeenCalledTimes(1);
      const created = (mockPrisma.whatsAppConfig.create as jest.Mock).mock.calls[0][0].data;
      expect(created.status).toBe('CONNECTING');
      expect(created.isActive).toBe(true);
      // Token must be encrypted — must NOT store raw value
      expect(created.accessTokenEncrypted).not.toBe('tok-123');
    });

    it('updates existing config without creating a duplicate', async () => {
      const existing = makeCfg();
      mockPrisma.whatsAppConfig.findUnique = jest.fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makeCfg({ status: 'CONNECTING' }));
      mockPrisma.whatsAppConfig.update = jest.fn().mockResolvedValue(makeCfg());

      await service.configure(ORG_A, 'user-1', {
        phoneNumberId: PHONE_NUM_ID,
        businessAccountId: WABA_ID,
        accessToken: 'new-token',
      });

      expect(mockPrisma.whatsAppConfig.create).not.toHaveBeenCalled();
      expect(mockPrisma.whatsAppConfig.update).toHaveBeenCalledTimes(1);
    });

    it('enqueues a health check after configure', async () => {
      mockPrisma.whatsAppConfig.findUnique = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeCfg());
      mockPrisma.whatsAppConfig.create = jest.fn().mockResolvedValue(makeCfg());

      await service.configure(ORG_A, 'user-1', {
        phoneNumberId: PHONE_NUM_ID,
        businessAccountId: WABA_ID,
        accessToken: 'tok',
      });

      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('health'),
        expect.objectContaining({ organizationId: ORG_A }),
      );
    });

    it('throws BadRequestException when phoneNumberId is blank', async () => {
      await expect(
        service.configure(ORG_A, 'u', { phoneNumberId: ' ', businessAccountId: WABA_ID, accessToken: 'tok' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByVerifyToken', () => {
    it('returns config matching the verify token', async () => {
      const cfg = { organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID };
      mockPrisma.whatsAppConfig.findFirst = jest.fn().mockResolvedValue(cfg);

      const result = await service.findByVerifyToken('my-verify-token');
      expect(result).toEqual(cfg);
      expect(mockPrisma.whatsAppConfig.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
      );
    });

    it('returns null when token is not recognised', async () => {
      mockPrisma.whatsAppConfig.findFirst = jest.fn().mockResolvedValue(null);
      expect(await service.findByVerifyToken('unknown-token')).toBeNull();
    });
  });

  describe('getConfig', () => {
    it('queries Prisma with a select that excludes access token and app secret', async () => {
      mockPrisma.whatsAppConfig.findUnique = jest.fn().mockResolvedValue(makeCfg());

      await service.getConfig(ORG_A);

      const callArgs = (mockPrisma.whatsAppConfig.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).toBeDefined();
      expect(callArgs.select.accessTokenEncrypted).toBeUndefined();
      expect(callArgs.select.appSecretEncrypted).toBeUndefined();
      expect(callArgs.select.id).toBe(true);
      expect(callArgs.select.status).toBe(true);
    });
  });
});

// ─── WhatsAppConversationService ─────────────────────────────────────────────

describe('WhatsAppConversationService', () => {
  let service: WhatsAppConversationService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(() => {
    mockPrisma = {
      whatsAppConversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      customerAccount: {
        findMany: jest.fn(),
      },
    };
    service = new WhatsAppConversationService(mockPrisma as never);
  });

  describe('findOrCreate', () => {
    it('returns existing OPEN conversation without creating a new one', async () => {
      const existing = { id: 'conv-1', organizationId: ORG_A, customerPhone: PHONE };
      mockPrisma.whatsAppConversation.findFirst = jest.fn().mockResolvedValue(existing);

      const result = await service.findOrCreate(ORG_A, PHONE, PHONE_NUM_ID, 'cfg-1');

      expect(result).toBe(existing);
      expect(mockPrisma.whatsAppConversation.create).not.toHaveBeenCalled();
    });

    it('creates a new conversation when none exists', async () => {
      mockPrisma.whatsAppConversation.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.customerAccount.findMany = jest.fn().mockResolvedValue([]);
      const created = { id: 'conv-new', organizationId: ORG_A, customerPhone: PHONE };
      mockPrisma.whatsAppConversation.create = jest.fn().mockResolvedValue(created);

      const result = await service.findOrCreate(ORG_A, PHONE, PHONE_NUM_ID, 'cfg-1');
      expect(result).toBe(created);
    });

    it('does not cross org boundaries — creates new conv for ORG_B even if ORG_A has one', async () => {
      // ORG_A has existing, ORG_B will not match it
      mockPrisma.whatsAppConversation.findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.customerAccount.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.whatsAppConversation.create = jest.fn().mockResolvedValue({ id: 'conv-b', organizationId: ORG_B });

      await service.findOrCreate(ORG_B, PHONE, PHONE_NUM_ID, 'cfg-b');

      expect(mockPrisma.whatsAppConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_B }) }),
      );
    });
  });

  describe('resolveCustomer', () => {
    it('returns null when multiple customer accounts match (prevents incorrect merge)', async () => {
      mockPrisma.customerAccount.findMany = jest.fn().mockResolvedValue([
        { id: 'ca-1', phone: PHONE },
        { id: 'ca-2', phone: PHONE },
      ]);

      const result = await service.resolveCustomer(ORG_A, PHONE);
      expect(result).toBeNull();
    });

    it('returns the single matching customer account', async () => {
      const account = { id: 'ca-1', phone: PHONE };
      mockPrisma.customerAccount.findMany = jest.fn().mockResolvedValue([account]);

      const result = await service.resolveCustomer(ORG_A, PHONE);
      expect(result).toBe(account);
    });
  });
});

// ─── WhatsAppMessageService ───────────────────────────────────────────────────

describe('WhatsAppMessageService', () => {
  let service: WhatsAppMessageService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockAudit: { log: jest.Mock };
  let mockQueue: { enqueue: jest.Mock };
  let mockConvService: { findOrCreate: jest.Mock };
  let mockConfigService: { resolveAccessToken: jest.Mock };
  let mockMeta: { sendText: jest.Mock };

  const baseCfg = makeCfg();
  const baseConv = {
    id: 'conv-1',
    organizationId: ORG_A,
    customerPhone: PHONE,
    windowExpiresAt: new Date(Date.now() + 86_400_000),
  };

  beforeEach(() => {
    mockPrisma = {
      whatsAppMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      whatsAppConfig: {
        findUnique: jest.fn().mockResolvedValue(baseCfg),
      },
      whatsAppConversation: {
        findFirst: jest.fn().mockResolvedValue(baseConv),
        update: jest.fn().mockResolvedValue({}),
      },
      channelPreference: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    mockQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    mockConvService = { findOrCreate: jest.fn().mockResolvedValue({ id: 'conv-1', organizationId: ORG_A }) };
    mockConfigService = { resolveAccessToken: jest.fn().mockResolvedValue('decrypted-token') };
    mockMeta = { sendText: jest.fn().mockResolvedValue({ providerMessageId: 'wamid-123', status: 'accepted' }) };

    service = new WhatsAppMessageService(
      mockPrisma as never,
      mockAudit as never,
      mockQueue as never,
      { get: () => 'false' } as never,
      mockConfigService as never,
      mockConvService as never,
      mockMeta as never,
    );
  });

  describe('enqueueTransactional — idempotency', () => {
    it('returns existing messageId without re-enqueuing on duplicate idempotency key', async () => {
      const existing = { id: 'msg-existing' };
      mockPrisma.whatsAppMessage.findUnique = jest.fn().mockResolvedValue(existing);

      const result = await service.enqueueTransactional({
        organizationId: ORG_A,
        to: PHONE,
        templateName: 'order_confirmed',
        idempotencyKey: 'wa:order:org-aaa:ord-1:ORDER_RECEIVED',
      });

      expect(result.messageId).toBe('msg-existing');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('creates a QUEUED message and enqueues a job for a new key', async () => {
      mockPrisma.whatsAppMessage.findUnique = jest.fn().mockResolvedValue(null);

      await service.enqueueTransactional({
        organizationId: ORG_A,
        to: PHONE,
        templateName: 'order_confirmed',
        idempotencyKey: 'wa:order:org-aaa:ord-2:ORDER_RECEIVED',
      });

      expect(mockPrisma.whatsAppMessage.create).toHaveBeenCalledTimes(1);
      const msgData = (mockPrisma.whatsAppMessage.create as jest.Mock).mock.calls[0][0].data;
      expect(msgData.status).toBe('QUEUED');
      expect(msgData.direction).toBe('OUTBOUND');
      expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('stores templateName and language on the created message', async () => {
      mockPrisma.whatsAppMessage.findUnique = jest.fn().mockResolvedValue(null);

      await service.enqueueTransactional({
        organizationId: ORG_A,
        to: PHONE,
        templateName: 'payment_confirmed',
        templateLanguage: 'en_GB',
        idempotencyKey: 'key-unique',
      });

      const msgData = (mockPrisma.whatsAppMessage.create as jest.Mock).mock.calls[0][0].data;
      expect(msgData.templateName).toBe('payment_confirmed');
      expect(msgData.templateLanguage).toBe('en_GB');
    });

    it('throws NotFoundException when WhatsApp is not configured for org', async () => {
      mockPrisma.whatsAppConfig.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        service.enqueueTransactional({
          organizationId: ORG_A,
          to: PHONE,
          templateName: 'tmpl',
          idempotencyKey: 'key-x',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendSupportReply — messaging window', () => {
    it('throws BadRequestException when the 24h window has expired', async () => {
      mockPrisma.whatsAppConversation.findFirst = jest.fn().mockResolvedValue({
        ...baseConv,
        windowExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.sendSupportReply(ORG_A, 'user-1', 'conv-1', 'Hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for a conversation belonging to a different org (IDOR)', async () => {
      mockPrisma.whatsAppConversation.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.sendSupportReply(ORG_B, 'user-1', 'conv-1', 'Hello'),
      ).rejects.toThrow(NotFoundException);
    });

    it('suppresses the send (returns mock id) when WHATSAPP_DELIVERY_ENABLED is false', async () => {
      // Default process.env value is not 'true', so delivery is disabled
      const result = await service.sendSupportReply(ORG_A, 'user-1', 'conv-1', 'Hello');
      expect(mockMeta.sendText).not.toHaveBeenCalled();
      expect(typeof result.messageId).toBe('string');
    });
  });

  describe('processInboundMessage — dedup & window', () => {
    it('skips processing when providerMessageId already exists', async () => {
      mockPrisma.whatsAppMessage.findUnique = jest.fn().mockResolvedValue({ id: 'dup' });

      await service.processInboundMessage(ORG_A, WABA_ID, {
        from: '2348012345678',
        id: 'wamid-dup',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Hi' },
      }, PHONE_NUM_ID);

      expect(mockPrisma.whatsAppMessage.create).not.toHaveBeenCalled();
    });

    it('extends the 24h window and increments unread count on new inbound', async () => {
      mockPrisma.whatsAppMessage.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.whatsAppConfig.findUnique = jest.fn().mockResolvedValue(baseCfg);
      mockConvService.findOrCreate = jest.fn().mockResolvedValue(baseConv);

      await service.processInboundMessage(ORG_A, WABA_ID, {
        from: '2348012345678',
        id: 'wamid-new',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Hello' },
      }, PHONE_NUM_ID);

      expect(mockPrisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unreadCount: { increment: 1 } }),
        }),
      );
    });

    it('records an opt-out when customer sends STOP', async () => {
      mockPrisma.whatsAppMessage.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.whatsAppConfig.findUnique = jest.fn().mockResolvedValue(baseCfg);
      mockConvService.findOrCreate = jest.fn().mockResolvedValue(baseConv);

      await service.processInboundMessage(ORG_A, WABA_ID, {
        from: '2348012345678',
        id: 'wamid-stop',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'STOP' },
      }, PHONE_NUM_ID);

      // Either create or update a channelPreference record
      const created = mockPrisma.channelPreference.create as jest.Mock;
      const updated = mockPrisma.channelPreference.update as jest.Mock;
      const optOutRecorded = created.mock.calls.length > 0 || updated.mock.calls.length > 0;
      expect(optOutRecorded).toBe(true);
    });
  });

  describe('updateMessageStatus — monotonic', () => {
    it('does not regress a DELIVERED status back to SENT', async () => {
      mockPrisma.whatsAppMessage.findFirst = jest.fn().mockResolvedValue({
        id: 'msg-1',
        status: 'DELIVERED',
        organizationId: ORG_A,
      });

      await service.updateMessageStatus(ORG_A, {
        id: 'wamid-1',
        status: 'sent',
        timestamp: String(Math.floor(Date.now() / 1000)),
      });

      expect(mockPrisma.whatsAppMessage.update).not.toHaveBeenCalled();
    });

    it('does not regress a READ status back to DELIVERED', async () => {
      mockPrisma.whatsAppMessage.findFirst = jest.fn().mockResolvedValue({
        id: 'msg-1',
        status: 'READ',
        organizationId: ORG_A,
      });

      await service.updateMessageStatus(ORG_A, {
        id: 'wamid-1',
        status: 'delivered',
        timestamp: String(Math.floor(Date.now() / 1000)),
      });

      expect(mockPrisma.whatsAppMessage.update).not.toHaveBeenCalled();
    });

    it('advances SENT → DELIVERED correctly', async () => {
      mockPrisma.whatsAppMessage.findFirst = jest.fn().mockResolvedValue({
        id: 'msg-1',
        status: 'SENT',
        organizationId: ORG_A,
      });

      await service.updateMessageStatus(ORG_A, {
        id: 'wamid-1',
        status: 'delivered',
        timestamp: String(Math.floor(Date.now() / 1000)),
      });

      expect(mockPrisma.whatsAppMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
      );
    });

    it('is a no-op when the message is not found (cross-org safety)', async () => {
      mockPrisma.whatsAppMessage.findFirst = jest.fn().mockResolvedValue(null);

      await service.updateMessageStatus(ORG_B, {
        id: 'wamid-1',
        status: 'read',
        timestamp: String(Math.floor(Date.now() / 1000)),
      });

      expect(mockPrisma.whatsAppMessage.update).not.toHaveBeenCalled();
    });
  });
});

// ─── WhatsAppOrderService ─────────────────────────────────────────────────────

describe('WhatsAppOrderService', () => {
  let service: WhatsAppOrderService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockMessageService: { enqueueTransactional: jest.Mock };
  let mockChannelPref: { isOptedIn: jest.Mock };

  const baseOrder = {
    id: 'ord-1',
    reference: 'REF-001',
    deliveryPhone: PHONE,
    customerAccount: { phone: PHONE, whatsappPhone: null, whatsappOptIn: true },
  };

  const baseTemplate = { id: 'tmpl-1', name: 'order_confirmed', language: 'en_US', status: 'APPROVED' };
  const baseMapping = { id: 'map-1', organizationId: ORG_A, orderEvent: 'ORDER_RECEIVED', isActive: true, template: baseTemplate };

  beforeEach(() => {
    mockPrisma = {
      salesOrder: { findFirst: jest.fn().mockResolvedValue(baseOrder) },
      whatsAppConfig: { findUnique: jest.fn().mockResolvedValue(makeCfg()) },
      whatsAppTemplate: { findFirst: jest.fn().mockResolvedValue(baseTemplate) },
      whatsAppOrderEventMapping: {
        findFirst: jest.fn().mockResolvedValue(baseMapping),
        findMany: jest.fn().mockResolvedValue([baseMapping]),
        upsert: jest.fn().mockResolvedValue(baseMapping),
      },
    };
    mockMessageService = { enqueueTransactional: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) };
    mockChannelPref = { isOptedIn: jest.fn().mockResolvedValue(true) };

    service = new WhatsAppOrderService(
      mockPrisma as never,
      mockMessageService as never,
      mockChannelPref as never,
    );
  });

  it('enqueues a transactional send for a matching approved template', async () => {
    await service.notifyOrderEvent(ORG_A, 'ord-1', 'ORDER_RECEIVED');

    expect(mockMessageService.enqueueTransactional).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        templateName: 'order_confirmed',
        messageType: 'TRANSACTIONAL',
        orderId: 'ord-1',
      }),
    );
  });

  it('uses idempotency key format wa:order:{org}:{orderId}:{event}', async () => {
    await service.notifyOrderEvent(ORG_A, 'ord-1', 'ORDER_RECEIVED');

    const call = mockMessageService.enqueueTransactional.mock.calls[0][0];
    expect(call.idempotencyKey).toBe(`wa:order:${ORG_A}:ord-1:ORDER_RECEIVED`);
  });

  it('skips send when no template mapping exists', async () => {
    mockPrisma.whatsAppOrderEventMapping.findFirst = jest.fn().mockResolvedValue(null);

    await service.notifyOrderEvent(ORG_A, 'ord-1', 'ORDER_RECEIVED');

    expect(mockMessageService.enqueueTransactional).not.toHaveBeenCalled();
  });

  it('skips send when mapped template is not APPROVED', async () => {
    mockPrisma.whatsAppOrderEventMapping.findFirst = jest.fn().mockResolvedValue({
      ...baseMapping,
      template: { ...baseTemplate, status: 'PENDING' },
    });

    await service.notifyOrderEvent(ORG_A, 'ord-1', 'ORDER_RECEIVED');

    expect(mockMessageService.enqueueTransactional).not.toHaveBeenCalled();
  });

  it('skips send silently when order does not belong to the org (IDOR)', async () => {
    mockPrisma.salesOrder.findFirst = jest.fn().mockResolvedValue(null);

    await service.notifyOrderEvent(ORG_B, 'ord-1', 'ORDER_RECEIVED');

    expect(mockMessageService.enqueueTransactional).not.toHaveBeenCalled();
  });

  it('skips send when no phone is available on the order', async () => {
    mockPrisma.salesOrder.findFirst = jest.fn().mockResolvedValue({
      id: 'ord-1',
      reference: 'REF-001',
      deliveryPhone: null,
      customerAccount: null,
    });

    await service.notifyOrderEvent(ORG_A, 'ord-1', 'ORDER_RECEIVED');

    expect(mockMessageService.enqueueTransactional).not.toHaveBeenCalled();
  });
});

// ─── WhatsAppWebhookController ───────────────────────────────────────────────

describe('WhatsAppWebhookController', () => {
  let controller: WhatsAppWebhookController;
  let mockConfigService: {
    findByVerifyToken: jest.Mock;
    markWebhookVerified: jest.Mock;
    findByWabaId: jest.Mock;
    resolveAppSecret: jest.Mock;
  };
  let mockMessageService: {
    processInboundMessage: jest.Mock;
    updateMessageStatus: jest.Mock;
  };
  let mockMetaProvider: MetaWhatsAppProvider;

  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  }

  function makeReq(rawBody?: string) {
    return { rawBody };
  }

  beforeEach(() => {
    mockConfigService = {
      findByVerifyToken: jest.fn(),
      markWebhookVerified: jest.fn().mockResolvedValue(undefined),
      findByWabaId: jest.fn(),
      resolveAppSecret: jest.fn().mockResolvedValue(null),
    };
    mockMessageService = {
      processInboundMessage: jest.fn().mockResolvedValue(undefined),
      updateMessageStatus: jest.fn().mockResolvedValue(undefined),
    };
    mockMetaProvider = new MetaWhatsAppProvider();

    controller = new WhatsAppWebhookController(
      mockConfigService as never,
      mockMessageService as never,
      mockMetaProvider,
    );
  });

  // ── Webhook verification ────────────────────────────────────────────────

  describe('verifyWebhook', () => {
    it('returns 403 when hub.mode is not subscribe', async () => {
      const res = makeRes();
      await controller.verifyWebhook({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok', 'hub.challenge': 'ch' }, res as never);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when verify token is unrecognised', async () => {
      mockConfigService.findByVerifyToken = jest.fn().mockResolvedValue(null);
      const res = makeRes();
      await controller.verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'bad-tok', 'hub.challenge': 'ch-1' }, res as never);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('echoes the challenge and marks webhook verified on valid token', async () => {
      mockConfigService.findByVerifyToken = jest.fn().mockResolvedValue({ organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID });
      const res = makeRes();
      await controller.verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'correct-tok', 'hub.challenge': 'ch-ok' }, res as never);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('ch-ok');
      expect(mockConfigService.markWebhookVerified).toHaveBeenCalledWith(ORG_A);
    });
  });

  // ── Inbound webhook ─────────────────────────────────────────────────────

  function makeWebhookPayload(wabaId = WABA_ID) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: wabaId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: PHONE, phone_number_id: PHONE_NUM_ID },
                messages: [
                  { from: '2348012345678', id: 'wamid-new', timestamp: '1700000000', type: 'text', text: { body: 'Hello' } },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  describe('receiveWebhook', () => {
    it('ignores payloads where object is not whatsapp_business_account', async () => {
      const result = await controller.receiveWebhook(
        makeReq() as never,
        '',
        { object: 'instagram' } as never,
      );
      expect(result).toEqual({ status: 'ignored' });
      expect(mockMessageService.processInboundMessage).not.toHaveBeenCalled();
    });

    it('skips entry when org is not found by wabaId', async () => {
      mockConfigService.findByWabaId = jest.fn().mockResolvedValue(null);

      await controller.receiveWebhook(makeReq() as never, '', makeWebhookPayload() as never);

      expect(mockMessageService.processInboundMessage).not.toHaveBeenCalled();
    });

    it('processes inbound message when org is found and no app secret configured', async () => {
      mockConfigService.findByWabaId = jest.fn().mockResolvedValue({ organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID });
      mockConfigService.resolveAppSecret = jest.fn().mockResolvedValue(null);

      await controller.receiveWebhook(makeReq() as never, '', makeWebhookPayload() as never);

      expect(mockMessageService.processInboundMessage).toHaveBeenCalledWith(
        ORG_A,
        WABA_ID,
        expect.objectContaining({ id: 'wamid-new' }),
        PHONE_NUM_ID,
      );
    });

    it('skips processing when signature is invalid', async () => {
      const secret = 'test-secret';
      mockConfigService.findByWabaId = jest.fn().mockResolvedValue({ organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID });
      mockConfigService.resolveAppSecret = jest.fn().mockResolvedValue(secret);
      const payload = makeWebhookPayload();

      await controller.receiveWebhook(
        makeReq(JSON.stringify(payload)) as never,
        'sha256=badsignature',
        payload as never,
      );

      expect(mockMessageService.processInboundMessage).not.toHaveBeenCalled();
    });

    it('processes message when signature is valid', async () => {
      const secret = 'test-secret';
      const payload = makeWebhookPayload();
      const rawBody = JSON.stringify(payload);
      const validSig = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

      mockConfigService.findByWabaId = jest.fn().mockResolvedValue({ organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID });
      mockConfigService.resolveAppSecret = jest.fn().mockResolvedValue(secret);

      await controller.receiveWebhook(makeReq(rawBody) as never, validSig, payload as never);

      expect(mockMessageService.processInboundMessage).toHaveBeenCalled();
    });

    it('always returns { status: "ok" } regardless of signature errors', async () => {
      mockConfigService.findByWabaId = jest.fn().mockResolvedValue({ organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID });
      mockConfigService.resolveAppSecret = jest.fn().mockResolvedValue('secret');

      const result = await controller.receiveWebhook(
        makeReq() as never,
        'sha256=badsig',
        makeWebhookPayload() as never,
      );

      expect(result).toEqual({ status: 'ok' });
    });

    it('processes status updates and calls updateMessageStatus', async () => {
      const statusPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: WABA_ID,
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: PHONE_NUM_ID },
                  statuses: [
                    { id: 'wamid-1', status: 'delivered', timestamp: '1700000001', recipient_id: PHONE },
                  ],
                },
              },
            ],
          },
        ],
      };

      mockConfigService.findByWabaId = jest.fn().mockResolvedValue({ organizationId: ORG_A, phoneNumberId: PHONE_NUM_ID });
      mockConfigService.resolveAppSecret = jest.fn().mockResolvedValue(null);

      await controller.receiveWebhook(makeReq() as never, '', statusPayload as never);

      expect(mockMessageService.updateMessageStatus).toHaveBeenCalledWith(
        ORG_A,
        expect.objectContaining({ id: 'wamid-1', status: 'delivered' }),
      );
    });
  });
});
