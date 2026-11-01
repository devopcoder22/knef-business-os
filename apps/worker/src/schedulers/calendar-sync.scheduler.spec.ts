import { CalendarSyncScheduler } from './calendar-sync.scheduler';
import { JOB_TYPES } from '@knef/constants';

function makeIntegration(overrides: Partial<{
  id: string;
  organizationId: string;
  userId: string;
  provider: string;
  lastSyncAt: Date | null;
}> = {}) {
  return {
    id: 'int-1',
    organizationId: 'org-1',
    userId: 'user-1',
    provider: 'google',
    lastSyncAt: null,
    ...overrides,
  };
}

function makePrisma(integrations: unknown[] = []) {
  return {
    calendarIntegration: {
      findMany: jest.fn(async () => integrations),
    },
  };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: unknown) => def) };
}

describe('CalendarSyncScheduler.enqueueStaleIntegrations', () => {
  function makeScheduler(integrations: unknown[] = []) {
    const prisma = makePrisma(integrations);
    const config = makeConfig();
    const scheduler = new CalendarSyncScheduler(prisma as never, config as never);
    const addBulk = jest.fn(async () => []);
    (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = { addBulk } as never;
    return { scheduler, prisma, addBulk };
  }

  it('enqueues one job per stale integration', async () => {
    const { scheduler, addBulk } = makeScheduler([
      makeIntegration({ id: 'int-1' }),
      makeIntegration({ id: 'int-2', provider: 'microsoft' }),
    ]);

    await (scheduler as unknown as { enqueueStaleIntegrations: () => Promise<void> })
      .enqueueStaleIntegrations();

    expect(addBulk).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [jobs] = (addBulk.mock.calls as any)[0] as [Array<{ name: string; data: { connectionId: string } }>];
    expect(jobs).toHaveLength(2);
    expect(jobs[0].name).toBe(JOB_TYPES.SYNC_CALENDAR);
    expect(jobs[0].data.connectionId).toBe('int-1');
    expect(jobs[1].data.connectionId).toBe('int-2');
  });

  it('no integrations → addBulk never called', async () => {
    const { scheduler, addBulk } = makeScheduler([]);

    await (scheduler as unknown as { enqueueStaleIntegrations: () => Promise<void> })
      .enqueueStaleIntegrations();

    expect(addBulk).not.toHaveBeenCalled();
  });

  it('job uses integration id as jobId for deduplication', async () => {
    const { scheduler, addBulk } = makeScheduler([makeIntegration({ id: 'int-42' })]);

    await (scheduler as unknown as { enqueueStaleIntegrations: () => Promise<void> })
      .enqueueStaleIntegrations();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [jobs] = (addBulk.mock.calls as any)[0] as [Array<{ opts: { jobId: string } }>];
    expect(jobs[0].opts.jobId).toBe('cal:int-42');
  });

  it('forwards organizationId and userId in job data', async () => {
    const { scheduler, addBulk } = makeScheduler([
      makeIntegration({ id: 'int-1', organizationId: 'org-99', userId: 'user-42', provider: 'google' }),
    ]);

    await (scheduler as unknown as { enqueueStaleIntegrations: () => Promise<void> })
      .enqueueStaleIntegrations();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [jobs] = (addBulk.mock.calls as any)[0] as [Array<{ data: { organizationId: string; userId: string; provider: string } }>];
    expect(jobs[0].data.organizationId).toBe('org-99');
    expect(jobs[0].data.userId).toBe('user-42');
    expect(jobs[0].data.provider).toBe('google');
  });

  it('poll guard prevents concurrent runs', async () => {
    const prisma = makePrisma([]);
    const config = makeConfig();
    const scheduler = new CalendarSyncScheduler(prisma as never, config as never);
    const addBulk = jest.fn(async () => []);
    (scheduler as unknown as { queue: { addBulk: jest.Mock } }).queue = { addBulk } as never;

    // Simulate running flag already set
    (scheduler as unknown as { running: boolean }).running = true;

    await (scheduler as unknown as { poll: () => Promise<void> }).poll();

    expect(prisma.calendarIntegration.findMany).not.toHaveBeenCalled();
  });
});
