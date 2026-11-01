/**
 * CampaignScheduler — unit tests
 *
 * Verifies that the scheduler correctly identifies SCHEDULED campaigns
 * with scheduledAt <= now, enqueues per-recipient email jobs, and advances
 * campaign status to SENDING.
 */

import { CampaignScheduler } from './campaign.scheduler';

function makePrisma(campaigns: unknown[] = [], recipients: unknown[] = []) {
  return {
    emailCampaign: {
      findMany: jest.fn(async () => campaigns),
      findFirst: jest.fn(async () => campaigns[0] ?? null),
      update: jest.fn(async (args: { data: unknown }) => args.data),
    },
    emailCampaignRecipient: {
      findMany: jest.fn(async () => recipients),
    },
  };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => overrides[key] ?? def),
  };
}

describe('CampaignScheduler.dispatchScheduledCampaigns', () => {
  it('1: campaigns with scheduledAt <= now are dispatched', async () => {
    const campaign = {
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
    };
    const recipient = { id: 'rec-1', email: 'user@test.com' };
    const prisma = makePrisma([campaign], [recipient]);
    const config = makeConfig();

    const scheduler = new CampaignScheduler(prisma as never, config as never);

    // Intercept queue.addBulk
    const addBulk = jest.fn(async () => []);
    (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = { addBulk } as never;

    await (scheduler as unknown as { dispatchScheduledCampaigns: () => Promise<void> })
      .dispatchScheduledCampaigns();

    expect(addBulk).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobs = (addBulk.mock.calls as any)[0][0] as Array<{ data: { recipientId: string } }>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.recipientId).toBe('rec-1');
  });

  it('2: campaign status updated to SENDING before enqueueing', async () => {
    const campaign = {
      id: 'camp-1',
      organizationId: 'org-1',
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() - 1000),
      subject: 'S',
      htmlContent: null,
      textContent: null,
      fromEmail: null,
      fromName: null,
      providerId: null,
    };
    const recipient = { id: 'rec-1', email: 'a@b.com' };
    const prisma = makePrisma([campaign], [recipient]);
    const config = makeConfig();

    const scheduler = new CampaignScheduler(prisma as never, config as never);
    (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = {
      addBulk: jest.fn(async () => []),
    } as never;

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1');

    const updateCall = (prisma.emailCampaign.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SENDING');
  });

  it('3: campaign with 0 recipients → immediately marked SENT (no jobs enqueued)', async () => {
    const campaign = {
      id: 'camp-1',
      organizationId: 'org-1',
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() - 1000),
      subject: 'S',
      htmlContent: null,
      textContent: null,
      fromEmail: null,
      fromName: null,
      providerId: null,
    };
    const prisma = makePrisma([campaign], []); // no recipients
    const config = makeConfig();

    const scheduler = new CampaignScheduler(prisma as never, config as never);
    const addBulk = jest.fn(async () => []);
    (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = { addBulk } as never;

    await (scheduler as unknown as { dispatchCampaign: (id: string, orgId: string) => Promise<void> })
      .dispatchCampaign('camp-1', 'org-1');

    expect(addBulk).not.toHaveBeenCalled();
    const updateCall = (prisma.emailCampaign.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SENT');
  });

  it('4: no due campaigns → no jobs enqueued', async () => {
    const prisma = makePrisma([], []); // no campaigns due
    const config = makeConfig();

    const scheduler = new CampaignScheduler(prisma as never, config as never);
    const addBulk = jest.fn(async () => []);
    (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = { addBulk } as never;

    await (scheduler as unknown as { dispatchScheduledCampaigns: () => Promise<void> })
      .dispatchScheduledCampaigns();

    expect(addBulk).not.toHaveBeenCalled();
  });
});
