import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationController } from './automation.controller';

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    name: 'Low Stock Alert',
    trigger: 'inventory.low',
    conditions: [],
    actions: [{ type: 'SEND_NOTIFICATION', params: { title: 'Alert', message: 'Low' } }],
    isActive: true,
    ...overrides,
  };
}

function makeRulesService() {
  return {
    findAll: jest.fn(async () => ({ data: [makeRule()], meta: { total: 1, page: 1, limit: 50, totalPages: 1 } })),
    findOne: jest.fn(async () => makeRule()),
    create: jest.fn(async () => makeRule()),
    update: jest.fn(async () => makeRule()),
    setActive: jest.fn(async () => makeRule()),
    delete: jest.fn(async () => undefined),
    findExecutions: jest.fn(async () => ({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } })),
    findExecution: jest.fn(async () => ({ id: 'ex-1', status: 'SUCCESS' })),
  };
}

function makeDispatcher() {
  return {
    simulateRule: jest.fn(() => ({ conditionsMet: true, actionsWouldExecute: [] })),
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', organizationId: 'org-1', locationIds: null, ...overrides };
}

function makeCtrl() {
  return new AutomationController(makeRulesService() as never, makeDispatcher() as never);
}

describe('AutomationController', () => {
  // ── Meta ───────────────────────────────────────────────────────────────────

  it('getTriggers returns trigger map', () => {
    const ctrl = makeCtrl();
    const result = ctrl.getTriggers();
    expect(Object.keys(result)).toContain('inventory.low');
  });

  it('getActions returns action map', () => {
    const ctrl = makeCtrl();
    const result = ctrl.getActions();
    expect(result).toHaveProperty('SEND_NOTIFICATION');
  });

  // ── Rules CRUD ─────────────────────────────────────────────────────────────

  it('listRules calls service with organizationId', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.listRules(makeUser() as never, {});
    expect(rulesService.findAll).toHaveBeenCalledWith('org-1', {});
  });

  it('createRule passes locationIds from user', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    const user = makeUser({ locationIds: ['loc-1'] });
    await ctrl.createRule(user as never, { name: 'Test', trigger: 'inventory.low', actions: [] } as never);
    expect(rulesService.create).toHaveBeenCalledWith('org-1', expect.anything(), 'user-1', ['loc-1']);
  });

  it('createRule passes null locationIds for org-wide user', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.createRule(makeUser() as never, { name: 'Test', trigger: 'inventory.low' } as never);
    expect(rulesService.create).toHaveBeenCalledWith('org-1', expect.anything(), 'user-1', null);
  });

  it('getRule calls findOne with correct org and id', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.getRule(makeUser() as never, 'rule-1');
    expect(rulesService.findOne).toHaveBeenCalledWith('org-1', 'rule-1');
  });

  it('getRule propagates NotFoundException', async () => {
    const rulesService = makeRulesService();
    rulesService.findOne = jest.fn(async () => { throw new NotFoundException(); });
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await expect(ctrl.getRule(makeUser() as never, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('activateRule calls setActive(true)', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.activateRule(makeUser() as never, 'rule-1');
    expect(rulesService.setActive).toHaveBeenCalledWith('org-1', 'rule-1', true, 'user-1');
  });

  it('deactivateRule calls setActive(false)', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.deactivateRule(makeUser() as never, 'rule-1');
    expect(rulesService.setActive).toHaveBeenCalledWith('org-1', 'rule-1', false, 'user-1');
  });

  it('deleteRule calls service.delete', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.deleteRule(makeUser() as never, 'rule-1');
    expect(rulesService.delete).toHaveBeenCalledWith('org-1', 'rule-1', 'user-1');
  });

  // ── Simulation ─────────────────────────────────────────────────────────────

  it('simulateRule returns dry-run result without side effects', async () => {
    const rulesService = makeRulesService();
    const dispatcher = makeDispatcher();
    const ctrl = new AutomationController(rulesService as never, dispatcher as never);
    const result = await ctrl.simulateRule(makeUser() as never, 'rule-1', { payload: { qty: 3 } });
    expect(result).toEqual(expect.objectContaining({ conditionsMet: expect.any(Boolean) }));
    expect(dispatcher.simulateRule).toHaveBeenCalled();
  });

  it('simulateRule uses correct rule from correct org', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.simulateRule(makeUser() as never, 'rule-1', { payload: {} });
    expect(rulesService.findOne).toHaveBeenCalledWith('org-1', 'rule-1');
  });

  // ── Executions ─────────────────────────────────────────────────────────────

  it('listExecutions filters by organizationId', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.listExecutions(makeUser() as never, {});
    expect(rulesService.findExecutions).toHaveBeenCalledWith('org-1', {});
  });

  it('getExecution fetches by org and id', async () => {
    const rulesService = makeRulesService();
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await ctrl.getExecution(makeUser() as never, 'ex-1');
    expect(rulesService.findExecution).toHaveBeenCalledWith('org-1', 'ex-1');
  });

  // ── Org isolation ──────────────────────────────────────────────────────────

  it('org-1 user cannot access org-2 rules (findOne called with org-1)', async () => {
    const rulesService = makeRulesService();
    (rulesService.findOne as jest.Mock).mockImplementation(async (orgId: string) => {
      if (orgId !== 'org-1') throw new NotFoundException();
      return makeRule();
    });
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    const result = await ctrl.getRule(makeUser() as never, 'rule-1');
    expect(result.organizationId).toBe('org-1');
  });

  it('validation error from service propagates to caller', async () => {
    const rulesService = makeRulesService();
    rulesService.create = jest.fn(async () => { throw new BadRequestException('Invalid'); });
    const ctrl = new AutomationController(rulesService as never, makeDispatcher() as never);
    await expect(ctrl.createRule(makeUser() as never, {} as never)).rejects.toThrow(BadRequestException);
  });
});
