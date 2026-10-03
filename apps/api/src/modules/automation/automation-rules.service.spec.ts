import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationConditionEvaluatorService } from './automation-condition-evaluator.service';

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    locationId: null,
    name: 'Low Stock Alert',
    description: null,
    trigger: 'inventory.low',
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Alert', message: 'Low stock' } }],
    isActive: true,
    lastTriggeredAt: null,
    triggerCount: 0,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    automationRule: {
      findMany: jest.fn(async () => [makeRule()]),
      findFirst: jest.fn(async () => makeRule()),
      count: jest.fn(async () => 1),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => makeRule(args.data)),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => makeRule(args.data)),
      delete: jest.fn(async () => makeRule()),
    },
    automationExecution: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
    },
    ...overrides,
  };
}

function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}

function makeSvc(prismaOverrides: Record<string, unknown> = {}) {
  return new AutomationRulesService(
    makePrisma(prismaOverrides) as never,
    makeAudit() as never,
    new AutomationConditionEvaluatorService(),
  );
}

describe('AutomationRulesService', () => {
  // ── findAll ────────────────────────────────────────────────────────────────

  it('findAll returns paginated results', async () => {
    const svc = makeSvc();
    const result = await svc.findAll('org-1', {});
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  it('findOne returns rule for correct org', async () => {
    const svc = makeSvc();
    const result = await svc.findOne('org-1', 'rule-1');
    expect(result.id).toBe('rule-1');
  });

  it('findOne throws NotFoundException when rule missing', async () => {
    const svc = makeSvc({ automationRule: { ...makePrisma().automationRule, findFirst: jest.fn(async () => null) } });
    await expect(svc.findOne('org-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  it('create rejects unknown trigger', async () => {
    const svc = makeSvc();
    await expect(
      svc.create('org-1', {
        name: 'Test',
        trigger: 'not.a.trigger',
        actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'x', message: 'y' } }],
      } as never, 'user-1', null)
    ).rejects.toThrow(BadRequestException);
  });

  it('create rejects invalid action type', async () => {
    const svc = makeSvc();
    await expect(
      svc.create('org-1', {
        name: 'Test',
        trigger: 'inventory.low',
        actions: [{ type: 'HACK_THE_PLANET', params: {} }],
      } as never, 'user-1', null)
    ).rejects.toThrow(BadRequestException);
  });

  it('create rejects action with missing required params', async () => {
    const svc = makeSvc();
    await expect(
      svc.create('org-1', {
        name: 'Test',
        trigger: 'inventory.low',
        actions: [{ type: 'SEND_NOTIFICATION', params: {} }], // missing title/message
      } as never, 'user-1', null)
    ).rejects.toThrow(BadRequestException);
  });

  it('create rejects location for unauthorized location-scoped user', async () => {
    const svc = makeSvc();
    await expect(
      svc.create('org-1', {
        name: 'Test',
        trigger: 'inventory.low',
        locationId: 'loc-forbidden',
        actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'x', message: 'y' } }],
      } as never, 'user-1', ['loc-allowed'])
    ).rejects.toThrow(ForbiddenException);
  });

  it('create succeeds with valid trigger and action', async () => {
    const svc = makeSvc();
    const rule = await svc.create('org-1', {
      name: 'Low Stock Alert',
      trigger: 'inventory.low',
      actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Alert', message: 'Low stock' } }],
    } as never, 'user-1', null);
    expect(rule).toBeDefined();
  });

  // ── update ─────────────────────────────────────────────────────────────────

  it('update rejects unknown trigger', async () => {
    const svc = makeSvc();
    await expect(
      svc.update('org-1', 'rule-1', { trigger: 'bad.trigger' }, 'user-1', null)
    ).rejects.toThrow(BadRequestException);
  });

  it('update succeeds with valid partial payload', async () => {
    const svc = makeSvc();
    const updated = await svc.update('org-1', 'rule-1', { name: 'New Name' }, 'user-1', null);
    expect(updated).toBeDefined();
  });

  // ── setActive ─────────────────────────────────────────────────────────────

  it('setActive toggles isActive and logs audit', async () => {
    const audit = makeAudit();
    const svc = new AutomationRulesService(makePrisma() as never, audit as never, new AutomationConditionEvaluatorService());
    await svc.setActive('org-1', 'rule-1', false, 'user-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTOMATION_RULE_DEACTIVATED' }));
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  it('delete calls prisma.delete and logs audit', async () => {
    const prisma = makePrisma();
    const audit = makeAudit();
    const svc = new AutomationRulesService(prisma as never, audit as never, new AutomationConditionEvaluatorService());
    await svc.delete('org-1', 'rule-1', 'user-1');
    expect((prisma.automationRule.delete as jest.Mock)).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTOMATION_RULE_DELETED' }));
  });

  // ── findMatchingRules ─────────────────────────────────────────────────────

  it('findMatchingRules queries active rules for org + trigger', async () => {
    const prisma = makePrisma();
    const svc = new AutomationRulesService(prisma as never, makeAudit() as never, new AutomationConditionEvaluatorService());
    await svc.findMatchingRules('org-1', 'inventory.low', 'loc-1');
    const call = (prisma.automationRule.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.organizationId).toBe('org-1');
    expect(call.where.trigger).toBe('inventory.low');
    expect(call.where.isActive).toBe(true);
  });

  it('findMatchingRules excludes rules for wrong org', async () => {
    const prisma = makePrisma({ automationRule: { ...makePrisma().automationRule, findMany: jest.fn(async () => []) } });
    const svc = new AutomationRulesService(prisma as never, makeAudit() as never, new AutomationConditionEvaluatorService());
    const result = await svc.findMatchingRules('org-99', 'inventory.low');
    expect(result).toHaveLength(0);
  });

  // ── findExecutions ────────────────────────────────────────────────────────

  it('findExecutions filters by organizationId', async () => {
    const prisma = makePrisma();
    const svc = new AutomationRulesService(prisma as never, makeAudit() as never, new AutomationConditionEvaluatorService());
    await svc.findExecutions('org-1', {});
    const call = (prisma.automationExecution.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.organizationId).toBe('org-1');
  });
});
