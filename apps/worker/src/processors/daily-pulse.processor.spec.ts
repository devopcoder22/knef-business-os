/**
 * DailyPulseProcessor — unit tests (Phase 24P)
 *
 * Covers idempotency, delivery states, and channel handling.
 */

import { DailyPulseProcessor } from './daily-pulse.processor';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    dailyPulseConfig: {
      findFirst: jest.fn(async () => ({
        organizationId: 'org-1',
        enabled: true,
        channels: ['EMAIL'],
        recipientIds: ['user-1'],
      })),
    },
    dailyPulseDelivery: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'del-1', ...args.data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: {
      findMany: jest.fn(async () => [
        { id: 'user-1', email: 'admin@knef.test', name: 'Admin' },
      ]),
    },
    salesOrder: {
      aggregate: jest.fn(async () => ({ _sum: { totalAmount: 150000 }, _count: 5 })),
      count: jest.fn(async () => 5),
    },
    inventoryLevel: {
      count: jest.fn(async () => 2),
    },
    ...overrides,
  };
}

function makeEmailSender() {
  return { sendEmail: jest.fn(async () => ({ success: true })) };
}

function makeWebPushSender() {
  return { sendPush: jest.fn(async () => undefined) };
}

function makeConfig() {
  return { get: jest.fn((key: string, fallback?: string) => fallback ?? 'redis://localhost:6379') };
}

function makeProcessor(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(prismaOverrides);
  const emailSender = makeEmailSender();
  const webPushSender = makeWebPushSender();
  const config = makeConfig();
  const processor = new DailyPulseProcessor(
    prisma as never,
    emailSender as never,
    webPushSender as never,
    config as never,
  );
  return { processor, prisma, emailSender, webPushSender };
}

describe('DailyPulseProcessor (Phase 24P)', () => {
  it('1: sends EMAIL when no prior delivery record exists (idempotency key is new)', async () => {
    const { processor, prisma, emailSender } = makeProcessor();

    await processor.getPulseSummary('org-1', '2026-10-28');

    // Simulate successful delivery attempt
    const existingDelivery = null;
    (prisma.dailyPulseDelivery.findFirst as jest.Mock).mockResolvedValueOnce(existingDelivery);

    const delivered = await (processor as any).attemptDelivery(
      'org-1',
      '2026-10-28',
      'EMAIL',
      'admin@knef.test',
      'org-1:2026-10-28:EMAIL:admin@knef.test',
      { id: 'user-1', email: 'admin@knef.test', name: 'Admin' },
      await processor.getPulseSummary('org-1', '2026-10-28'),
    );

    expect(delivered).toBe(true);
    expect(emailSender.sendEmail).toHaveBeenCalled();
    expect(prisma.dailyPulseDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('2: skips delivery when idempotency key already exists with SENT status', async () => {
    const { processor, emailSender } = makeProcessor({
      dailyPulseDelivery: {
        findFirst: jest.fn(async () => ({ id: 'del-existing', status: 'SENT' })),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    });

    const delivered = await (processor as any).attemptDelivery(
      'org-1',
      '2026-10-28',
      'EMAIL',
      'admin@knef.test',
      'org-1:2026-10-28:EMAIL:admin@knef.test',
      { id: 'user-1', email: 'admin@knef.test', name: 'Admin' },
      await processor.getPulseSummary('org-1', '2026-10-28'),
    );

    expect(delivered).toBe(false);
    expect(emailSender.sendEmail).not.toHaveBeenCalled();
  });

  it('3: marks FAILED and rethrows when email send throws', async () => {
    const { processor, prisma, emailSender } = makeProcessor();
    (emailSender.sendEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));

    await expect(
      (processor as any).attemptDelivery(
        'org-1',
        '2026-10-28',
        'EMAIL',
        'admin@knef.test',
        'org-1:2026-10-28:EMAIL:admin@knef.test',
        { id: 'user-1', email: 'admin@knef.test', name: 'Admin' },
        await processor.getPulseSummary('org-1', '2026-10-28'),
      ),
    ).rejects.toThrow('SMTP down');

    expect(prisma.dailyPulseDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('4: marks SKIPPED for unsupported channel', async () => {
    const { processor, prisma, emailSender } = makeProcessor();

    const delivered = await (processor as any).attemptDelivery(
      'org-1',
      '2026-10-28',
      'TELEGRAM',
      'user-1',
      'org-1:2026-10-28:TELEGRAM:user-1',
      { id: 'user-1', email: 'admin@knef.test', name: 'Admin' },
      await processor.getPulseSummary('org-1', '2026-10-28'),
    );

    expect(delivered).toBe(false);
    expect(emailSender.sendEmail).not.toHaveBeenCalled();
    expect(prisma.dailyPulseDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
    );
  });

  it('5: sends WEB_PUSH when channel is WEB_PUSH', async () => {
    const { processor, webPushSender } = makeProcessor();

    const delivered = await (processor as any).attemptDelivery(
      'org-1',
      '2026-10-28',
      'WEB_PUSH',
      'user-1',
      'org-1:2026-10-28:WEB_PUSH:user-1',
      { id: 'user-1', email: 'admin@knef.test', name: 'Admin' },
      await processor.getPulseSummary('org-1', '2026-10-28'),
    );

    expect(delivered).toBe(true);
    expect(webPushSender.sendPush).toHaveBeenCalled();
  });

  it('6: getPulseSummary() returns todaySalesAmount and order counts', async () => {
    const { processor } = makeProcessor();
    const summary = await processor.getPulseSummary('org-1', '2026-10-28');
    expect(summary.todaySalesAmount).toBe(150000);
    expect(summary.todayOrders).toBe(5);
    expect(summary.lowStockItems).toBe(2);
  });

  it('7: two calls with same idempotency key: second is skipped', async () => {
    const { processor, prisma, emailSender } = makeProcessor();
    const pulse = await processor.getPulseSummary('org-1', '2026-10-28');
    const user = { id: 'user-1', email: 'admin@knef.test', name: 'Admin' };
    const key = 'org-1:2026-10-28:EMAIL:admin@knef.test';

    // First call: creates record + sends
    await (processor as any).attemptDelivery('org-1', '2026-10-28', 'EMAIL', 'admin@knef.test', key, user, pulse);

    // Second call: record already SENT
    (prisma.dailyPulseDelivery.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'del-1', status: 'SENT' });
    const result2 = await (processor as any).attemptDelivery('org-1', '2026-10-28', 'EMAIL', 'admin@knef.test', key, user, pulse);
    expect(result2).toBe(false);
    expect(emailSender.sendEmail).toHaveBeenCalledTimes(1); // only once
  });
});
