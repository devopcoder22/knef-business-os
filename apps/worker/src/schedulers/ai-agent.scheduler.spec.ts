/**
 * AIAgentScheduler — unit tests
 *
 * Verifies that due agents are dispatched with deterministic job IDs,
 * nextRunAt is advanced without drift using real cron parsing,
 * and invalid cron expressions are handled safely (no tight-loop).
 */

import { AIAgentScheduler, nextRunFromCron, scheduledJobId } from './ai-agent.scheduler';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<{
  id: string;
  organizationId: string;
  isActive: boolean;
  cronExpression: string;
  nextRunAt: Date;
}> = {}) {
  return {
    id: 'agent-1',
    organizationId: 'org-1',
    isActive: true,
    cronExpression: '0 8 * * *', // daily at 08:00 UTC
    nextRunAt: new Date(Date.now() - 1000), // overdue by 1s
    ...overrides,
  };
}

function makePrisma(agents: unknown[] = []) {
  return {
    aIScheduledAgent: {
      findMany: jest.fn(async () => agents),
      update: jest.fn(async () => null),
    },
  };
}

function makeConfig() {
  return { get: jest.fn((key: string, def?: unknown) => def) };
}

// ── nextRunFromCron — pure function tests ─────────────────────────────────────

describe('nextRunFromCron', () => {
  it('daily at 08:00 → next 08:00 after reference', () => {
    // Reference: 2026-10-03 07:00 UTC — next 08:00 is same day
    const ref = new Date('2026-10-03T07:00:00.000Z');
    const next = nextRunFromCron('0 8 * * *', ref);
    expect(next.toISOString()).toBe('2026-10-03T08:00:00.000Z');
  });

  it('daily at 08:00 → next day when already past 08:00', () => {
    // Reference: 2026-10-03 09:00 UTC — next 08:00 is tomorrow
    const ref = new Date('2026-10-03T09:00:00.000Z');
    const next = nextRunFromCron('0 8 * * *', ref);
    expect(next.toISOString()).toBe('2026-10-04T08:00:00.000Z');
  });

  it('every 30 minutes → next 30-min boundary', () => {
    const ref = new Date('2026-10-03T10:05:00.000Z');
    const next = nextRunFromCron('*/30 * * * *', ref);
    expect(next.toISOString()).toBe('2026-10-03T10:30:00.000Z');
  });

  it('weekly on Monday at 09:00', () => {
    // 2026-10-03 is a Saturday; next Monday is 2026-10-05
    const ref = new Date('2026-10-03T10:00:00.000Z');
    const next = nextRunFromCron('0 9 * * 1', ref);
    expect(next.toISOString()).toBe('2026-10-05T09:00:00.000Z');
  });

  it('monthly on the 1st at midnight', () => {
    // Reference: 2026-10-03 → next 1st is 2026-11-01
    const ref = new Date('2026-10-03T00:00:00.000Z');
    const next = nextRunFromCron('0 0 1 * *', ref);
    expect(next.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('invalid expression → throws', () => {
    expect(() => nextRunFromCron('NOT_A_CRON', new Date())).toThrow();
  });

  it('uses UTC — no silent local-time reinterpretation', () => {
    const ref = new Date('2026-10-03T00:00:00.000Z');
    const next = nextRunFromCron('0 8 * * *', ref);
    // Must be exactly 08:00 UTC, not 08:00 in some local offset
    expect(next.getUTCHours()).toBe(8);
    expect(next.getUTCMinutes()).toBe(0);
  });
});

// ── scheduledJobId — determinism tests ───────────────────────────────────────

describe('scheduledJobId', () => {
  it('same agentId + same scheduledAt → identical job ID', () => {
    const t = new Date('2026-10-03T08:00:00.000Z');
    expect(scheduledJobId('agent-1', t)).toBe(scheduledJobId('agent-1', t));
  });

  it('same agentId + different scheduledAt → different job ID', () => {
    const t1 = new Date('2026-10-03T08:00:00.000Z');
    const t2 = new Date('2026-10-04T08:00:00.000Z');
    expect(scheduledJobId('agent-1', t1)).not.toBe(scheduledJobId('agent-1', t2));
  });

  it('different agentId + same scheduledAt → different job ID', () => {
    const t = new Date('2026-10-03T08:00:00.000Z');
    expect(scheduledJobId('agent-1', t)).not.toBe(scheduledJobId('agent-2', t));
  });

  it('job ID contains the agentId and an ISO timestamp', () => {
    const t = new Date('2026-10-03T08:00:00.000Z');
    const id = scheduledJobId('agent-abc', t);
    expect(id).toContain('agent-abc');
    expect(id).toContain('2026-10-03T08:00');
  });
});

// ── AIAgentScheduler.dispatchDueAgents ───────────────────────────────────────

describe('AIAgentScheduler.dispatchDueAgents', () => {
  it('1: due agent is enqueued with correct jobData', async () => {
    const agent = makeAgent();
    const prisma = makePrisma([agent]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'job-1' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    expect(add).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, jobData] = (add.mock.calls as any)[0] as [string, { agentId: string; organizationId: string }];
    expect(jobData.agentId).toBe('agent-1');
    expect(jobData.organizationId).toBe('org-1');
  });

  it('2: nextRunAt is advanced after dispatch to prevent re-dispatch', async () => {
    const agent = makeAgent();
    const prisma = makePrisma([agent]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = {
      add: jest.fn(async () => ({ id: 'job-1' })),
    } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    const updateCall = (prisma.aIScheduledAgent.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where.id).toBe('agent-1');
    expect(updateCall.data.nextRunAt).toBeInstanceOf(Date);
    expect(updateCall.data.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('3: no due agents → nothing enqueued', async () => {
    const prisma = makePrisma([]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'x' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    expect(add).not.toHaveBeenCalled();
  });

  it('4: multiple due agents → each enqueued separately', async () => {
    const agents = [
      makeAgent({ id: 'agent-1' }),
      makeAgent({ id: 'agent-2' }),
      makeAgent({ id: 'agent-3' }),
    ];
    const prisma = makePrisma(agents);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'job' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    expect(add).toHaveBeenCalledTimes(3);
  });

  it('5: job ID is deterministic — same scheduled time produces same ID', async () => {
    const scheduledAt = new Date('2026-10-03T08:00:00.000Z');
    const agent = makeAgent({ id: 'agent-1', nextRunAt: scheduledAt });
    const prisma = makePrisma([agent]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'job' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    // Call twice (simulates two scheduler instances)
    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();
    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    // Both calls attempt the same jobId — BullMQ would deduplicate in production.
    // Here we just verify the IDs are identical.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstId = ((add.mock.calls as any)[0] as [string, unknown, { jobId: string }])[2].jobId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondId = ((add.mock.calls as any)[1] as [string, unknown, { jobId: string }])[2].jobId;
    expect(firstId).toBe(secondId);
  });

  it('6: job ID contains the original scheduled time (not Date.now())', async () => {
    const scheduledAt = new Date('2026-10-03T08:00:00.000Z');
    const agent = makeAgent({ id: 'agent-42', nextRunAt: scheduledAt });
    const prisma = makePrisma([agent]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'job' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = ((add.mock.calls as any)[0] as [string, unknown, { jobId: string }])[2];
    expect(opts.jobId).toContain('agent-42');
    expect(opts.jobId).toContain('2026-10-03T08:00');
  });

  it('7: invalid cron expression → agent deactivated, no job enqueued', async () => {
    const agent = makeAgent({ cronExpression: 'INVALID_CRON_!!!', id: 'bad-agent' });
    const prisma = makePrisma([agent]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'job' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    // No job enqueued
    expect(add).not.toHaveBeenCalled();

    // Agent is deactivated to prevent tight retry loop
    const updateCall = (prisma.aIScheduledAgent.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where.id).toBe('bad-agent');
    expect(updateCall.data.isActive).toBe(false);
    expect(updateCall.data.lastStatus).toContain('SCHEDULE_ERROR');
  });

  it('8: nextRunAt advances from original schedule, not from wall clock (no drift)', async () => {
    // Agent was scheduled for 08:00 but is running 5 minutes late (08:05 now)
    const scheduledAt = new Date('2026-10-03T08:00:00.000Z');
    const agent = makeAgent({
      cronExpression: '0 8 * * *',
      nextRunAt: scheduledAt,
    });
    const prisma = makePrisma([agent]);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = {
      add: jest.fn(async () => ({ id: 'job' })),
    } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    const updateCall = (prisma.aIScheduledAgent.update as jest.Mock).mock.calls[0][0];
    const nextRunAt: Date = updateCall.data.nextRunAt;

    // Must be exactly 08:00 the next day (no drift to 08:05)
    expect(nextRunAt.toISOString()).toBe('2026-10-04T08:00:00.000Z');
  });

  it('9: invalid cron with other valid agents — valid agents still dispatched', async () => {
    const agents = [
      makeAgent({ id: 'bad-agent', cronExpression: 'GARBAGE' }),
      makeAgent({ id: 'good-agent', cronExpression: '0 8 * * *' }),
    ];
    const prisma = makePrisma(agents);
    const config = makeConfig();

    const scheduler = new AIAgentScheduler(prisma as never, config as never);
    const add = jest.fn(async () => ({ id: 'job' }));
    (scheduler as unknown as { queue: { add: jest.Mock } }).queue = { add } as never;

    await (scheduler as unknown as { dispatchDueAgents: () => Promise<void> })
      .dispatchDueAgents();

    // Only good-agent enqueued
    expect(add).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, jobData] = (add.mock.calls as any)[0] as [string, { agentId: string }];
    expect(jobData.agentId).toBe('good-agent');
  });
});
