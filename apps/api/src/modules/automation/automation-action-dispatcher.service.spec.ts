import { AutomationActionDispatcherService, generateEventId } from './automation-action-dispatcher.service';
import { AutomationConditionEvaluatorService } from './automation-condition-evaluator.service';
import type { AutomationEventEnvelope } from './automation-action-dispatcher.service';

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    locationId: null,
    name: 'Test Rule',
    description: null,
    trigger: 'inventory.low',
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Alert', message: 'Low' } }],
    isActive: true,
    triggerCount: 0,
    lastTriggeredAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<AutomationEventEnvelope> = {}): AutomationEventEnvelope {
  return {
    eventType: 'inventory.low',
    organizationId: 'org-1',
    locationId: null,
    occurredAt: new Date(),
    automationDepth: 0,
    causationId: null,
    data: { productId: 'p1', quantity: 3 },
    ...overrides,
  };
}

function makeQueue() {
  return { enqueue: jest.fn(async () => 'job-id') };
}

function makePrisma(createResult?: unknown, createThrows?: boolean) {
  const execution = createResult ?? { id: 'exec-1' };
  return {
    automationExecution: {
      create: createThrows
        ? jest.fn(async () => { const e = new Error('Unique constraint failed'); (e as any).code = 'P2002'; throw e; })
        : jest.fn(async () => execution),
    },
    automationRule: {
      update: jest.fn(async () => makeRule()),
    },
  };
}

function makeSvc(prismaOverrides?: { createThrows?: boolean; createResult?: unknown }) {
  const queue = makeQueue();
  const prisma = makePrisma(prismaOverrides?.createResult, prismaOverrides?.createThrows);
  const svc = new AutomationActionDispatcherService(
    queue as never,
    prisma as never,
    new AutomationConditionEvaluatorService(),
  );
  return { svc, queue, prisma };
}

describe('AutomationActionDispatcherService', () => {
  // ── generateEventId ────────────────────────────────────────────────────────

  it('generateEventId produces deterministic 24-char hex (same inputs = same id)', () => {
    // Mock Date.now to a fixed minute so both calls produce same bucket
    const original = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const id1 = generateEventId('inventory.low', 'org-1', 'product-1');
      const id2 = generateEventId('inventory.low', 'org-1', 'product-1');
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(24);
    } finally {
      Date.now = original;
    }
  });

  it('generateEventId differs for different entity', () => {
    const original = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const id1 = generateEventId('inventory.low', 'org-1', 'product-A');
      const id2 = generateEventId('inventory.low', 'org-1', 'product-B');
      expect(id1).not.toBe(id2);
    } finally {
      Date.now = original;
    }
  });

  it('generateEventId differs across minutes', () => {
    const original = Date.now;
    Date.now = () => 1_700_000_000_000;
    const id1 = generateEventId('inventory.low', 'org-1', 'p1');
    Date.now = () => 1_700_000_060_001;
    const id2 = generateEventId('inventory.low', 'org-1', 'p1');
    Date.now = original;
    expect(id1).not.toBe(id2);
  });

  // ── dispatchForEvent ───────────────────────────────────────────────────────

  it('dispatches matching rule and enqueues job', async () => {
    const { svc, queue } = makeSvc();
    const rules = [makeRule()];
    await svc.dispatchForEvent(rules, makeEnvelope());
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const [queueName, jobType, , opts] = (queue.enqueue as jest.Mock).mock.calls[0];
    expect(queueName).toBe('automation');
    expect(jobType).toBe('automation-execute');
    expect(opts.jobId).toMatch(/^auto:/);
  });

  it('skips rule with conditions not met', async () => {
    const { svc, queue } = makeSvc();
    const rules = [makeRule({
      conditions: [{ field: 'data.quantity', operator: 'lessThan', value: 1 }],
    })];
    await svc.dispatchForEvent(rules, makeEnvelope({ data: { quantity: 5 } }));
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues multiple actions for same rule', async () => {
    const { svc, queue } = makeSvc();
    const rules = [makeRule({
      actions: [
        { type: 'SEND_NOTIFICATION', params: { title: 'T', message: 'M' } },
        { type: 'SEND_TELEGRAM', params: { message: 'Alert' } },
      ],
    })];
    await svc.dispatchForEvent(rules, makeEnvelope());
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });

  it('enqueues actions for multiple matching rules', async () => {
    const { svc, queue } = makeSvc();
    const rules = [makeRule({ id: 'rule-1' }), makeRule({ id: 'rule-2' })];
    await svc.dispatchForEvent(rules, makeEnvelope());
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('skips silently when unique constraint violation (duplicate event)', async () => {
    const { svc, queue } = makeSvc({ createThrows: true });
    const rules = [makeRule()];
    await expect(svc.dispatchForEvent(rules, makeEnvelope())).resolves.toBeUndefined();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('job ID is deterministic (auto:ruleId:eventId:actionIndex)', async () => {
    const { svc, queue } = makeSvc();
    await svc.dispatchForEvent([makeRule()], makeEnvelope());
    const opts = (queue.enqueue as jest.Mock).mock.calls[0][3];
    expect(opts.jobId).toMatch(/^auto:rule-1:/);
    expect(opts.jobId).toMatch(/:0$/);
  });

  // ── Loop prevention ────────────────────────────────────────────────────────

  it('stops at MAX_AUTOMATION_DEPTH', async () => {
    const { svc, queue } = makeSvc();
    const deepEnvelope = makeEnvelope({ automationDepth: 3 });
    await svc.dispatchForEvent([makeRule()], deepEnvelope);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('depth 2 is still processed (below MAX)', async () => {
    const { svc, queue } = makeSvc();
    const envelope = makeEnvelope({ automationDepth: 2 });
    await svc.dispatchForEvent([makeRule()], envelope);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('causationId is forwarded in job data', async () => {
    const { svc, queue } = makeSvc();
    const envelope = makeEnvelope({ causationId: 'exec-parent-123' });
    await svc.dispatchForEvent([makeRule()], envelope);
    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2];
    expect(jobData.causationId).toBe('exec-parent-123');
  });

  // ── Template rendering ─────────────────────────────────────────────────────

  it('renders {{field}} templates in action params', async () => {
    const { svc, queue } = makeSvc();
    const rules = [makeRule({
      actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Stock: {{data.productId}}', message: 'Qty: {{data.quantity}}' } }],
    })];
    await svc.dispatchForEvent(rules, makeEnvelope({ data: { productId: 'SKU-001', quantity: 3 } }));
    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2];
    expect(jobData.actionParams.title).toBe('Stock: SKU-001');
    expect(jobData.actionParams.message).toBe('Qty: 3');
  });

  // ── simulateRule ───────────────────────────────────────────────────────────

  it('simulateRule returns conditionsMet and actionsWouldExecute without side effects', () => {
    const { svc } = makeSvc();
    const rule = makeRule() as any;
    const result = svc.simulateRule(rule, { quantity: 3 });
    expect(result.conditionsMet).toBe(true);
    expect(Array.isArray(result.actionsWouldExecute)).toBe(true);
  });

  it('simulateRule returns empty actionsWouldExecute when conditions fail', () => {
    const { svc } = makeSvc();
    const rule = makeRule({
      conditions: [{ field: 'data.quantity', operator: 'lessThan', value: 1 }],
    }) as any;
    const result = svc.simulateRule(rule, { quantity: 100 });
    expect(result.conditionsMet).toBe(false);
    expect(result.actionsWouldExecute).toHaveLength(0);
  });

  // ── Security: org isolation ────────────────────────────────────────────────

  it('job data carries organizationId from rule', async () => {
    const { svc, queue } = makeSvc();
    await svc.dispatchForEvent([makeRule({ organizationId: 'org-1' })], makeEnvelope({ organizationId: 'org-1' }));
    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2];
    expect(jobData.organizationId).toBe('org-1');
  });
});
