/**
 * CampaignScheduler — unit tests
 *
 * Verifies that the scheduler correctly identifies SCHEDULED campaigns
 * with scheduledAt <= now, atomically claims them (idempotency), applies
 * suppression filtering, enqueues per-recipient email jobs, and advances
 * campaign status to SENDING / SENT.
 */

import { CampaignScheduler } from './campaign.scheduler';

function makePrisma(campaigns: unknown[] = [], recipients: unknown[] = [], suppressedEmailRecords: unknown[] = []) {
  const campaignData = campaigns[0] as Record<string, unknown> | undefined;
  return {
    emailCampaign: {
      findMany: jest.fn(async () => campaigns),
      findFirst: jest.fn(async () => campaignData ?? null),
      update: jest.fn(async (args: { data: unknown }) => args.data),
      updateMany: jest.fn(async () => ({ count: campaignData ? 1 : 0 })),
    },
    emailCampaignRecipient: {
      findMany: jest.fn(async () => recipients),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    emailSubscription: {
      findMany: jest.fn(async () => suppressedEmailRecords),
    },
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => overrides[key] ?? def),
  };
}

function makeScheduler(prisma: ReturnType<typeof makePrisma>) {
  const config = makeConfig();
  const scheduler = new CampaignScheduler(prisma as never, config as never);

  const addBulk = jest.fn(async () => []);
  (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = { addBulk } as never;

  return { scheduler, addBulk };
}

const BASE_CAMPAIGN = {
  id: 'camp-1',
  organizationId: 'org-1',
  status: 'SCHEDULED',
  scheduledAt: new Date(Date.now() - 5000),
  subject: 'Hello',
  htmlContent: '<p>Hi</p>',
  textContent: 'Hi',
  fromEmail: 'noreply@org.com',
  fromName: 'Org',
  providerId: null,
  campaignType: 'MARKETING',
  subscriptionList: 'GENERAL_MARKETING',
};

describe('CampaignScheduler.dispatchScheduledCampaigns', () => {
  it('1: campaigns with scheduledAt <= now are dispatched', async () => {
    const recipient = { id: 'rec-1', email: 'user@test.com', status: 'PENDING' };
    const prisma = makePrisma([BASE_CAMPAIGN], [recipient]);
    const { scheduler, addBulk } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchScheduledCampaigns: () => Promise<void> })
      .dispatchScheduledCampaigns();

    expect(addBulk).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobs = (addBulk.mock.calls as any)[0][0] as Array<{ data: { recipientId: string } }>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.recipientId).toBe('rec-1');
  });

  it('2: campaign is atomically claimed (updateMany SCHEDULED→SENDING) before enqueueing', async () => {
    const recipient = { id: 'rec-1', email: 'a@b.com', status: 'PENDING' };
    const prisma = makePrisma([BASE_CAMPAIGN], [recipient]);
    const { scheduler } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string, type: string, list: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING');

    // updateMany (atomic claim) should be called with SCHEDULED condition
    expect(prisma.emailCampaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'camp-1', organizationId: 'org-1', status: 'SCHEDULED' },
      data: { status: 'SENDING' },
    });
  });

  it('3: campaign with 0 recipients → immediately marked SENT (no jobs enqueued)', async () => {
    const prisma = makePrisma([BASE_CAMPAIGN], []); // no recipients
    const { scheduler, addBulk } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string, type: string, list: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING');

    expect(addBulk).not.toHaveBeenCalled();
    const updateCall = (prisma.emailCampaign.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SENT');
  });

  it('4: no due campaigns → no jobs enqueued', async () => {
    const prisma = makePrisma([], []); // no campaigns due
    const { scheduler, addBulk } = makeScheduler(prisma);
    // updateMany returns count=0 since no campaign data
    prisma.emailCampaign.updateMany.mockResolvedValue({ count: 0 });

    await (scheduler as unknown as { dispatchScheduledCampaigns: () => Promise<void> })
      .dispatchScheduledCampaigns();

    expect(addBulk).not.toHaveBeenCalled();
  });

  it('5: duplicate invocation — second dispatch returns without re-enqueueing (updateMany count=0)', async () => {
    const recipient = { id: 'rec-1', email: 'user@test.com', status: 'PENDING' };
    const prisma = makePrisma([BASE_CAMPAIGN], [recipient]);
    // Simulate already-claimed (second instance): updateMany returns count=0
    (prisma.emailCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const { scheduler, addBulk } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string, type: string, list: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING');

    // Nothing should be enqueued since the campaign was already claimed
    expect(addBulk).not.toHaveBeenCalled();
    // No subsequent update calls (early return)
    expect(prisma.emailCampaign.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('6: suppression filtering — PENDING recipient with suppressed email → marked SUPPRESSED, not enqueued', async () => {
    const eligibleRecipient = { id: 'rec-1', email: 'ok@test.com', status: 'PENDING' };
    const suppressedRecipient = { id: 'rec-2', email: 'unsub@test.com', status: 'PENDING' };
    const prisma = makePrisma(
      [BASE_CAMPAIGN],
      [eligibleRecipient, suppressedRecipient],
      [{ email: 'unsub@test.com' }], // suppressed email record
    );
    const { scheduler, addBulk } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string, type: string, list: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING');

    // Suppressed recipient must be marked SUPPRESSED in emailCampaignRecipient
    expect(prisma.emailCampaignRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['rec-2'] } },
      data: { status: 'SUPPRESSED' },
    });

    // Only eligible recipient should be enqueued
    expect(addBulk).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobs = (addBulk.mock.calls as any)[0][0] as Array<{ data: { recipientId: string } }>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.recipientId).toBe('rec-1');
  });

  it('7: concurrent invocation — first to claim dispatches, second (count=0) skips entirely', async () => {
    const recipient = { id: 'rec-1', email: 'user@test.com', status: 'PENDING' };
    const prisma = makePrisma([BASE_CAMPAIGN], [recipient]);

    // First call: claim succeeds (count=1)
    const firstPrisma = { ...prisma };
    const { scheduler: scheduler1, addBulk: addBulk1 } = makeScheduler(firstPrisma);

    // Second call: claim fails (count=0) — simulates concurrent instance
    const secondPrisma = makePrisma([BASE_CAMPAIGN], [recipient]);
    (secondPrisma.emailCampaign.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const { scheduler: scheduler2, addBulk: addBulk2 } = makeScheduler(secondPrisma);

    const dispatchFn = 'dispatchCampaign';
    await Promise.all([
      (scheduler1 as unknown as Record<string, (a: string, b: string, c: string, d: string) => Promise<void>>)
        [dispatchFn]('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING'),
      (scheduler2 as unknown as Record<string, (a: string, b: string, c: string, d: string) => Promise<void>>)
        [dispatchFn]('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING'),
    ]);

    // First instance dispatches, second does not
    expect(addBulk1).toHaveBeenCalledTimes(1);
    expect(addBulk2).not.toHaveBeenCalled();
  });

  it('8: TRANSACTIONAL campaign — no suppression filtering applied', async () => {
    const recipient = { id: 'rec-1', email: 'user@test.com', status: 'PENDING' };
    const transactionalCampaign = { ...BASE_CAMPAIGN, campaignType: 'TRANSACTIONAL' };
    const prisma = makePrisma([transactionalCampaign], [recipient]);
    const { scheduler, addBulk } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string, type: string, list: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1', 'TRANSACTIONAL', 'GENERAL_MARKETING');

    // emailSubscription should NOT be queried for transactional campaigns
    expect(prisma.emailSubscription.findMany).not.toHaveBeenCalled();
    // Recipient should still be enqueued
    expect(addBulk).toHaveBeenCalledTimes(1);
  });

  it('9: all recipients suppressed → campaign marked SENT with suppressedCount, no jobs enqueued', async () => {
    const suppressedRecipient = { id: 'rec-1', email: 'unsub@test.com', status: 'PENDING' };
    const prisma = makePrisma(
      [BASE_CAMPAIGN],
      [suppressedRecipient],
      [{ email: 'unsub@test.com' }],
    );
    const { scheduler, addBulk } = makeScheduler(prisma);

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string, type: string, list: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1', 'MARKETING', 'GENERAL_MARKETING');

    expect(addBulk).not.toHaveBeenCalled();
    const updateCall = (prisma.emailCampaign.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SENT');
    expect(updateCall.data.suppressedCount).toBe(1);
    expect(updateCall.data.eligibleCount).toBe(0);
  });
});
