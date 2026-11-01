/**
 * WhatsAppSenderService — unit tests
 *
 * Focuses on DEF-24O-FCV-004: suppression check via RecipientEligibilityService.
 * The service must block MARKETING messages for both 'unsubscribed' and 'suppressed'
 * statuses, and must NOT block TRANSACTIONAL messages regardless of opt-out.
 */

import { WhatsAppSenderService } from './whatsapp-sender.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    ENCRYPTION_KEY: 'a'.repeat(64),
    WHATSAPP_DELIVERY_ENABLED: 'false', // off by default so tests don't hit network
  };
  const merged = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string) => merged[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in merged)) throw new Error(`Missing config: ${key}`);
      return merged[key];
    }),
  };
}

function makePrisma() {
  return {
    whatsAppConfig: {
      findUnique: jest.fn(async () => null),
    },
    whatsAppMessage: {
      update: jest.fn(async () => ({})),
    },
    channelPreference: {
      findFirst: jest.fn(async () => null),
    },
  };
}

function makeEligibility(allowed = true, reason?: string) {
  return {
    canSend: jest.fn(async () => ({ allowed, reason })),
  };
}

const BASE_JOB = {
  organizationId: 'org-1',
  to: '+2348012345678',
  message: 'Hello',
  messageType: 'MARKETING' as const,
  messageId: 'msg-1',
};

describe('WhatsAppSenderService — suppression (DEF-24O-FCV-004)', () => {
  function makeService(eligibilityAllowed = true, eligibilityReason?: string) {
    const prisma = makePrisma();
    const config = makeConfig();
    const eligibility = makeEligibility(eligibilityAllowed, eligibilityReason);
    const service = new WhatsAppSenderService(prisma as never, config as never, eligibility as never);
    return { service, prisma, eligibility };
  }

  it('blocks MARKETING WhatsApp when recipient has unsubscribed status', async () => {
    const { service, prisma, eligibility } = makeService(false, 'Marketing preference: unsubscribed');

    await service.sendWhatsApp(BASE_JOB);

    expect(eligibility.canSend).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channel: 'WHATSAPP',
      messageType: 'MARKETING',
      phone: '+2348012345678',
    });
    // Message status should be set to FAILED (marketing blocked)
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    // No config lookup (returned early)
    expect(prisma.whatsAppConfig.findUnique).not.toHaveBeenCalled();
  });

  it('blocks MARKETING WhatsApp when recipient has suppressed status', async () => {
    const { service, prisma, eligibility } = makeService(false, 'Marketing preference: suppressed');

    await service.sendWhatsApp({ ...BASE_JOB, messageId: undefined });

    expect(eligibility.canSend).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'MARKETING', channel: 'WHATSAPP' }),
    );
    // No delivery attempted
    expect(prisma.whatsAppConfig.findUnique).not.toHaveBeenCalled();
  });

  it('allows TRANSACTIONAL WhatsApp even when eligibility would block marketing', async () => {
    // eligibility blocked but message is TRANSACTIONAL — eligibility must not be consulted
    const { service, prisma, eligibility } = makeService(false, 'Marketing preference: unsubscribed');

    await service.sendWhatsApp({
      ...BASE_JOB,
      messageType: 'TRANSACTIONAL',
    });

    // Eligibility must NOT be called for transactional
    expect(eligibility.canSend).not.toHaveBeenCalled();
    // Config lookup is not reached because delivery is disabled in test config — no assertion needed
    // What matters: the function did not throw and did not call eligibility
    expect(prisma.whatsAppConfig.findUnique).not.toHaveBeenCalled();
  });

  it('proceeds past eligibility gate when eligibility allows MARKETING send', async () => {
    // eligibility allowed — service must not block at the consent gate
    const { service, prisma, eligibility } = makeService(true);

    await service.sendWhatsApp(BASE_JOB);

    expect(eligibility.canSend).toHaveBeenCalledWith({
      organizationId: 'org-1',
      channel: 'WHATSAPP',
      messageType: 'MARKETING',
      phone: '+2348012345678',
    });
    // Delivery is disabled in test config — service returns early after delivery flag check
    // without config lookup. No network call is made, no error thrown.
    expect(prisma.whatsAppConfig.findUnique).not.toHaveBeenCalled();
  });

  it('does not call eligibility when no messageType set', async () => {
    const { service, eligibility } = makeService(false);

    // No messageType field — cast to partial job type
    await service.sendWhatsApp({
      organizationId: 'org-1',
      to: '+2348012345678',
      message: 'Hello',
    } as never);

    expect(eligibility.canSend).not.toHaveBeenCalled();
  });
});
