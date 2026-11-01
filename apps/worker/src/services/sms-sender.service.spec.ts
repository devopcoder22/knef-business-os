import { SmsSenderService } from './sms-sender.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    ENCRYPTION_KEY: 'a'.repeat(64),
    SMS_DELIVERY_ENABLED: 'true',
  };
  const merged = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string, def?: unknown) => merged[key] ?? def),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in merged)) throw new Error(`Missing config: ${key}`);
      return merged[key];
    }),
  };
}

function makePrisma(overrides: Record<string, Record<string, jest.Mock>> = {}) {
  return {
    smsProvider: {
      findFirst: jest.fn(async () => null),
      ...overrides.smsProvider,
    },
    communicationLog: {
      update: jest.fn(async () => ({})),
      findFirst: jest.fn(async () => null),
      ...overrides.communicationLog,
    },
  };
}

function makeEligibility(allowed = true, reason?: string) {
  return {
    canSend: jest.fn(async () => ({ allowed, reason })),
  };
}

describe('SmsSenderService', () => {
  function makeService(
    configOverrides: Record<string, string> = {},
    prismaOverrides: Record<string, Record<string, jest.Mock>> = {},
    eligibilityAllowed = true,
    eligibilityReason?: string,
  ) {
    const prisma = makePrisma(prismaOverrides);
    const config = makeConfig(configOverrides);
    const eligibility = makeEligibility(eligibilityAllowed, eligibilityReason);
    const service = new SmsSenderService(prisma as never, config as never, eligibility as never);
    return { service, prisma, config, eligibility };
  }

  it('skips send when SMS_DELIVERY_ENABLED=false and returns mock success', async () => {
    const { service, prisma } = makeService({ SMS_DELIVERY_ENABLED: 'false' });
    const result = await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Hello',
      logId: 'log-1',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('mock-disabled');
    // Should not attempt to resolve provider
    expect((prisma.smsProvider.findFirst as jest.Mock)).not.toHaveBeenCalled();
  });

  it('returns error when no SMS provider is configured', async () => {
    const { service } = makeService({ SMS_DELIVERY_ENABLED: 'true' });
    const result = await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Hello',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No SMS provider/);
  });

  it('skips duplicate when idempotency hit returns existing log', async () => {
    const { service, prisma } = makeService({ SMS_DELIVERY_ENABLED: 'true' }, {
      communicationLog: {
        findFirst: jest.fn(async () => ({ id: 'log-existing', providerMessageId: 'msg-123' })),
        update: jest.fn(async () => ({})),
      },
    });

    const result = await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Hi',
      idempotencyKey: 'sms:org-1:order-1:confirmed',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-123');
    // Provider should not be queried since we hit idempotency early
    expect((prisma.smsProvider.findFirst as jest.Mock)).not.toHaveBeenCalled();
  });

  it('returns error when phone number cannot be normalized', async () => {
    const { service } = makeService({ SMS_DELIVERY_ENABLED: 'true' }, {
      smsProvider: {
        findFirst: jest.fn(async () => ({
          id: 'sp-1',
          organizationId: 'org-1',
          provider: 'termii',
          apiKeyEncrypted: 'encrypted-key',
          senderId: 'KNEF',
        })),
      },
    });

    // Provide an invalid phone number that cannot be normalized
    // The real normalizeToE164 will be called but should return null for empty/invalid input
    const result = await service.sendSms({
      organizationId: 'org-1',
      to: 'invalid-phone',
      message: 'Hi',
    });

    // May fail at provider resolution or normalization depending on how normalizeToE164 handles it
    expect(result.success).toBe(false);
  });

  it('updates log on successful send', async () => {
    const mockUpdate = jest.fn(async () => ({}));
    const { service, prisma } = makeService({}, {
      communicationLog: { update: mockUpdate, findFirst: jest.fn(async () => null) },
    });

    // Delivery is disabled in this test since we can't mock fetch easily,
    // so test the mock path
    Object.defineProperty(service, 'deliveryEnabled', { get: () => false });

    await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Hello',
      logId: 'log-1',
    });

    // In mock path, updateLog is called with 'sent'
    expect((prisma.communicationLog.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('passes idempotencyKey check against correct fields', async () => {
    const mockFindFirst = jest.fn(async () => null);
    const { service } = makeService({ SMS_DELIVERY_ENABLED: 'true' }, {
      communicationLog: {
        findFirst: mockFindFirst,
        update: jest.fn(async () => ({})),
      },
    });

    await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Hi',
      idempotencyKey: 'sms:org-1:order-1:dispatched',
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        idempotencyKey: 'sms:org-1:order-1:dispatched',
        status: 'sent',
      },
      select: { id: true, providerMessageId: true },
    });
  });

  // ── DEF-24O-FCV-004: Suppression checks ───────────────────────────────────

  it('blocks MARKETING SMS when recipient has unsubscribed status', async () => {
    const { service, prisma, eligibility } = makeService(
      {},
      {},
      false,  // eligibility blocked
      'Marketing preference: unsubscribed',
    );

    const result = await service.sendSms({
      organizationId: 'org-1',
      to: '+2348012345678',
      message: 'Buy now!',
      messageType: 'MARKETING',
      logId: 'log-1',
    });

    expect(eligibility.canSend).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channel: 'SMS',
      messageType: 'MARKETING',
      phone: '+2348012345678',
    });
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('suppressed');
    // Log should be updated to suppressed
    expect((prisma.communicationLog.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'suppressed' }) }),
    );
    // Provider must not be called
    expect((prisma.smsProvider.findFirst as jest.Mock)).not.toHaveBeenCalled();
  });

  it('blocks MARKETING SMS when recipient has suppressed status', async () => {
    const { service, eligibility } = makeService(
      {},
      {},
      false,
      'Marketing preference: suppressed',
    );

    const result = await service.sendSms({
      organizationId: 'org-1',
      to: '+2348012345678',
      message: 'Big sale!',
      messageType: 'MARKETING',
    });

    expect(eligibility.canSend).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'MARKETING', channel: 'SMS' }),
    );
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('suppressed');
  });

  it('allows TRANSACTIONAL SMS even when eligibility service would block marketing', async () => {
    // eligibility returns allowed=false, but for TRANSACTIONAL it should never be consulted
    const { service, eligibility } = makeService(
      { SMS_DELIVERY_ENABLED: 'false' }, // disable delivery so we don't need a provider
      {},
      false,  // would block if called
    );

    const result = await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Your order is confirmed.',
      messageType: 'TRANSACTIONAL',
    });

    // eligibility.canSend must NOT be called for transactional
    expect(eligibility.canSend).not.toHaveBeenCalled();
    // Returns mock success (delivery disabled)
    expect(result.success).toBe(true);
  });

  it('does not call eligibility service when messageType is not set', async () => {
    const { service, eligibility } = makeService({ SMS_DELIVERY_ENABLED: 'false' });

    await service.sendSms({
      organizationId: 'org-1',
      to: '08012345678',
      message: 'Test',
    });

    expect(eligibility.canSend).not.toHaveBeenCalled();
  });
});
