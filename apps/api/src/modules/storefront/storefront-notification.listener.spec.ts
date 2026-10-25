import { StorefrontNotificationListener } from './storefront-notification.listener';

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeEmail(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    sendEmail: jest.fn(async () => ({})),
    sendSms: jest.fn(async () => ({})),
    ...overrides,
  };
}

function makePrisma() {
  return {
    salesOrder: { findFirst: jest.fn(async () => null) },
  };
}

function makeWhatsApp(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    notifyOrderEvent: jest.fn(async () => {}),
    ...overrides,
  };
}

function makeListener(
  emailOverrides: Partial<Record<string, jest.Mock>> = {},
  whatsappOverrides: Partial<Record<string, jest.Mock>> = {},
) {
  const email = makeEmail(emailOverrides);
  const prisma = makePrisma();
  const whatsApp = makeWhatsApp(whatsappOverrides);
  const listener = new StorefrontNotificationListener(
    email as never,
    prisma as never,
    whatsApp as never,
  );
  return { listener, email, prisma, whatsApp };
}

const basePayload = {
  organizationId: 'org-1',
  orderId: 'order-1',
  reference: 'ORD-001',
  customerName: 'Ada Obi',
  customerEmail: 'ada@example.com',
  customerPhone: '+2348012345678',
  totalAmount: '15000',
};

// ── Communication failure independence tests ───────────────────────────────────

describe('StorefrontNotificationListener — communication failure independence', () => {
  it('email failure does not propagate as an unhandled rejection', async () => {
    const { listener } = makeListener({
      sendEmail: jest.fn().mockRejectedValue(new Error('SMTP timeout')),
    });
    // Must resolve without throwing — email failure is caught internally
    await expect(listener.onOrderCreated(basePayload)).resolves.toBeUndefined();
  });

  it('SMS failure does not propagate as an unhandled rejection', async () => {
    const { listener } = makeListener({
      sendSms: jest.fn().mockRejectedValue(new Error('Termii 503')),
    });
    await expect(listener.onOrderCreated(basePayload)).resolves.toBeUndefined();
  });

  it('WhatsApp failure does not propagate as an unhandled rejection', async () => {
    const { listener } = makeListener(
      {},
      { notifyOrderEvent: jest.fn().mockRejectedValue(new Error('Meta API down')) },
    );
    await expect(listener.onOrderCreated(basePayload)).resolves.toBeUndefined();
  });

  it('all three channels failing simultaneously does not throw', async () => {
    const { listener } = makeListener(
      {
        sendEmail: jest.fn().mockRejectedValue(new Error('email down')),
        sendSms: jest.fn().mockRejectedValue(new Error('sms down')),
      },
      { notifyOrderEvent: jest.fn().mockRejectedValue(new Error('whatsapp down')) },
    );
    await expect(listener.onOrderCreated(basePayload)).resolves.toBeUndefined();
  });

  it('email sends when provided, skipped when email is null', async () => {
    const { listener, email } = makeListener();
    await listener.onOrderCreated({ ...basePayload, customerEmail: null });
    expect(email.sendEmail).not.toHaveBeenCalled();
    // SMS and WhatsApp still attempted even without email
    expect(email.sendSms).toHaveBeenCalledTimes(1);
  });

  it('order data is passed through correctly to SMS (uses customer phone, not email)', async () => {
    const { listener, email } = makeListener();
    await listener.onOrderCreated(basePayload);
    expect(email.sendSms).toHaveBeenCalledWith(
      'org-1',
      basePayload.customerPhone,
      expect.stringContaining(basePayload.reference),
    );
  });

  it('WhatsApp is notified with ORDER_RECEIVED event after order creation', async () => {
    const { listener, whatsApp } = makeListener();
    await listener.onOrderCreated(basePayload);
    expect(whatsApp.notifyOrderEvent).toHaveBeenCalledWith('org-1', 'order-1', 'ORDER_RECEIVED');
  });
});
