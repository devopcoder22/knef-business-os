import { AutomationProcessor } from './automation.processor';
import { UnrecoverableError } from 'bullmq';

// ── Shared fakes ─────────────────────────────────────────────────────────────

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    organizationId: 'org-1',
    ruleId: 'rule-1',
    status: 'PENDING',
    ...overrides,
  };
}

function makeJobData(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'exec-1',
    ruleId: 'rule-1',
    organizationId: 'org-1',
    eventId: 'evt-1',
    eventType: 'inventory.low',
    locationId: null,
    actionType: 'SEND_NOTIFICATION',
    actionIndex: 0,
    actionParams: { userId: 'user-1', title: 'Alert', message: 'Low stock', type: 'WARNING' },
    eventData: {},
    automationDepth: 0,
    causationId: null,
    ...overrides,
  };
}

function makePrisma() {
  return {
    automationExecution: {
      update: jest.fn(async () => makeExecution()),
    },
    telegramConfig: {
      findUnique: jest.fn(async () => null),
    },
    user: {
      findFirst: jest.fn(async () => ({ id: 'user-owner-1', organizationId: 'org-1' })),
    },
    aIScheduledAgent: {
      findFirst: jest.fn(async () => ({ id: 'agent-1', organizationId: 'org-1' })),
      update: jest.fn(async () => ({})),
    },
    task: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'task-new', title: args.data['title'] })),
    },
  };
}

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    REDIS_URL: 'redis://localhost:6379',
    ENCRYPTION_KEY: 'a'.repeat(64),
    ...overrides,
  };
  return { get: jest.fn((key: string, def?: string) => values[key] ?? def) };
}

// Build the processor in "test mode" without actually starting BullMQ workers or queues
function makeProcessor() {
  const prisma = makePrisma();
  const config = makeConfig();
  const proc = new AutomationProcessor(prisma as never, config as never);

  // Replace the private BullMQ queues with jest mocks
  const notifQueue = { add: jest.fn(async () => ({ id: 'j1' })) };
  const emailQueue = { add: jest.fn(async () => ({ id: 'j2' })) };
  const reportsQueue = { add: jest.fn(async () => ({ id: 'j3' })) };

  (proc as any).connection = { quit: jest.fn() };
  (proc as any).worker = { close: jest.fn(), on: jest.fn() };
  (proc as any).notificationsQueue = notifQueue;
  (proc as any).emailQueue = emailQueue;
  (proc as any).reportsQueue = reportsQueue;

  return { proc, prisma, config, notifQueue, emailQueue, reportsQueue };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AutomationProcessor', () => {
  // ── SEND_NOTIFICATION ──────────────────────────────────────────────────────

  it('SEND_NOTIFICATION: enqueues to notifications queue', async () => {
    const { proc, notifQueue } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_NOTIFICATION', actionParams: { userId: 'u1', title: 'Hi', message: 'Msg' } });
    await (proc as any).executeAction(data);
    expect(notifQueue.add).toHaveBeenCalledWith('send-notification', expect.objectContaining({ userId: 'u1', title: 'Hi' }), expect.anything());
  });

  it('SEND_NOTIFICATION: skips gracefully when no userId', async () => {
    const { proc, notifQueue } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_NOTIFICATION', actionParams: { title: 'Hi', message: 'Msg' } });
    await (proc as any).executeAction(data);
    expect(notifQueue.add).not.toHaveBeenCalled();
  });

  it('SEND_NOTIFICATION: marks execution SUCCESS', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_NOTIFICATION', actionParams: { userId: 'u1', title: 'T', message: 'M' } });
    await (proc as any).executeAction(data);
    const calls = (prisma.automationExecution.update as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.data.status).toBe('SUCCESS');
  });

  // ── SEND_EMAIL ─────────────────────────────────────────────────────────────

  it('SEND_EMAIL: enqueues to email queue', async () => {
    const { proc, emailQueue } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_EMAIL', actionParams: { to: 'test@test.com', subject: 'Hi', body: 'Hello' } });
    await (proc as any).executeAction(data);
    expect(emailQueue.add).toHaveBeenCalledWith('send-transactional-email', expect.objectContaining({ to: 'test@test.com' }), expect.anything());
  });

  it('SEND_EMAIL: throws UnrecoverableError when params missing', async () => {
    const { proc } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_EMAIL', actionParams: {} });
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  // ── SEND_TELEGRAM ──────────────────────────────────────────────────────────

  it('SEND_TELEGRAM: skips gracefully when no telegram config', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_TELEGRAM', actionParams: { message: 'Alert!' } });
    await (proc as any).executeAction(data);
    // No telegram config set → skips, does not throw
    expect((prisma.telegramConfig.findUnique as jest.Mock)).toHaveBeenCalled();
  });

  it('SEND_TELEGRAM: throws UnrecoverableError when message missing', async () => {
    const { proc } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_TELEGRAM', actionParams: {} });
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  // ── CREATE_TASK ────────────────────────────────────────────────────────────

  it('CREATE_TASK: creates task via prisma with correct fields', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'CREATE_TASK', actionParams: { title: 'Reorder SKU-001', priority: 'HIGH' } });
    await (proc as any).executeAction(data);
    expect((prisma.task.create as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: 'Reorder SKU-001' }),
    }));
  });

  it('CREATE_TASK: throws UnrecoverableError when title missing', async () => {
    const { proc } = makeProcessor();
    const data = makeJobData({ actionType: 'CREATE_TASK', actionParams: {} });
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('CREATE_TASK: uses org-scoped owner user for creatorId', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'CREATE_TASK', actionParams: { title: 'Reorder' } });
    await (proc as any).executeAction(data);
    const userQuery = (prisma.user.findFirst as jest.Mock).mock.calls[0][0];
    expect(userQuery.where.organizationId).toBe('org-1');
  });

  // ── GENERATE_REPORT ────────────────────────────────────────────────────────

  it('GENERATE_REPORT: enqueues to reports queue', async () => {
    const { proc, reportsQueue } = makeProcessor();
    const data = makeJobData({ actionType: 'GENERATE_REPORT', actionParams: { reportType: 'sales_summary' } });
    await (proc as any).executeAction(data);
    expect(reportsQueue.add).toHaveBeenCalledWith('generate-report', expect.objectContaining({ reportType: 'sales_summary' }), expect.anything());
  });

  it('GENERATE_REPORT: throws UnrecoverableError when reportType missing', async () => {
    const { proc } = makeProcessor();
    const data = makeJobData({ actionType: 'GENERATE_REPORT', actionParams: {} });
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  // ── REQUEST_AI_ANALYSIS ────────────────────────────────────────────────────

  it('REQUEST_AI_ANALYSIS: skips gracefully when no agentId', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'REQUEST_AI_ANALYSIS', actionParams: { prompt: 'Analyze reorder' } });
    await (proc as any).executeAction(data);
    expect((prisma.aIScheduledAgent.update as jest.Mock)).not.toHaveBeenCalled();
  });

  it('REQUEST_AI_ANALYSIS: triggers agent when agentId provided and belongs to org', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'REQUEST_AI_ANALYSIS', actionParams: { prompt: 'Reorder?', agentId: 'agent-1' } });
    await (proc as any).executeAction(data);
    expect((prisma.aIScheduledAgent.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'agent-1' } }),
    );
  });

  it('REQUEST_AI_ANALYSIS: throws UnrecoverableError when agent not found for org', async () => {
    const { proc, prisma } = makeProcessor();
    (prisma.aIScheduledAgent.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const data = makeJobData({ actionType: 'REQUEST_AI_ANALYSIS', actionParams: { prompt: 'x', agentId: 'agent-other-org' } });
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  // ── Unknown action ─────────────────────────────────────────────────────────

  it('unknown action type throws UnrecoverableError', async () => {
    const { proc } = makeProcessor();
    const data = makeJobData({ actionType: 'HACK_THE_PLANET' });
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  // ── Org isolation (security) ───────────────────────────────────────────────

  it('CREATE_TASK: queries user from correct organization only', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ organizationId: 'org-X', actionType: 'CREATE_TASK', actionParams: { title: 'T' } });
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'u-x', organizationId: 'org-X' });
    await (proc as any).executeAction(data);
    const userCall = (prisma.user.findFirst as jest.Mock).mock.calls[0][0];
    expect(userCall.where.organizationId).toBe('org-X');
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('transient error marks execution as RETRYING', async () => {
    const { proc, prisma, emailQueue } = makeProcessor();
    emailQueue.add = jest.fn(async () => { throw new Error('Connection refused'); });
    const data = makeJobData({ actionType: 'SEND_EMAIL', actionParams: { to: 'x@x.com', subject: 'S', body: 'B' } });
    await expect((proc as any).executeAction(data)).rejects.toThrow('Connection refused');
    const calls = (prisma.automationExecution.update as jest.Mock).mock.calls;
    const failCall = calls.find((c: any[]) => c[0].data?.status === 'RETRYING');
    expect(failCall).toBeDefined();
  });

  it('UnrecoverableError marks execution as FAILED with PERMANENT category', async () => {
    const { proc, prisma } = makeProcessor();
    const data = makeJobData({ actionType: 'SEND_EMAIL', actionParams: {} }); // missing required
    await expect((proc as any).executeAction(data)).rejects.toBeInstanceOf(UnrecoverableError);
    const calls = (prisma.automationExecution.update as jest.Mock).mock.calls;
    const failCall = calls.find((c: any[]) => c[0].data?.status === 'FAILED');
    expect(failCall).toBeDefined();
    expect(failCall[0].data.failureCategory).toBe('PERMANENT');
  });

  // ── process(): unknown job name ignored ────────────────────────────────────

  it('process(): ignores jobs with unknown name', async () => {
    const { proc, prisma } = makeProcessor();
    await (proc as any).process({ name: 'some-other-job', data: {} });
    expect((prisma.automationExecution.update as jest.Mock)).not.toHaveBeenCalled();
  });
});
