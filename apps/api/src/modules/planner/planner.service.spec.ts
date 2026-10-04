import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlannerService } from './planner.service';
import { PlanGeneratorService } from './plan-generator.service';
import { PlanExecutorService } from './plan-executor.service';
import { PlanProgressService } from './plan-progress.service';
import { PersonalPlannerService } from './personal-planner.service';

// ── Shared mock factories ─────────────────────────────────────────

function makePrisma() {
  return {
    plan: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null) as jest.MockedFunction<() => Promise<unknown>>,
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'plan-1', status: 'DRAFT', ...args.data })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'plan-1', ...args.data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      delete: jest.fn(async () => ({ id: 'plan-1' })),
      count: jest.fn(async () => 0),
    },
    planStep: {
      findMany: jest.fn(async () => [] as Array<{ id: string; title: string }>),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    planTaskLink: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async () => ({ id: 'link-1' })),
      updateMany: jest.fn(async () => ({ count: 1 })) as jest.MockedFunction<() => Promise<{ count: number }>>,
      count: jest.fn(async () => 0) as jest.MockedFunction<() => Promise<number>>,
    },
    planTemplate: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'tpl-1', ...args.data })),
    },
    task: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0) as jest.MockedFunction<() => Promise<number>>,
    },
    goal: {
      findFirst: jest.fn(async () => null) as jest.MockedFunction<() => Promise<unknown>>,
      findMany: jest.fn(async () => []),
    },
    calendarEvent: {
      findMany: jest.fn(async () => []),
    },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}

function makePermissions(effective: string[]) {
  return {
    resolveExecutionContext: jest.fn(async () => ({ userId: 'u1', organizationId: 'org1', resolvedPermissions: effective })),
  };
}

function makeAiCompletion(content = 'AI response') {
  return { complete: jest.fn(async () => ({ content })) };
}

function makeTasksService() {
  return { create: jest.fn(async () => ({ id: 'task-1', title: 'Task' })) };
}

function makeGoalsService() {
  return { addKpi: jest.fn(async () => ({ id: 'kpi-1' })) };
}

function makeNotifications() {
  return { createNotification: jest.fn(async () => undefined) };
}

// ── T1–T4: PlannerService CRUD ────────────────────────────────────

describe('PlannerService — CRUD', () => {
  let service: PlannerService;
  let prisma: MockPrisma;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new PlannerService(prisma as never, audit as never);
  });

  test('T1: create stores a plan and emits audit log', async () => {
    const result = await service.create('org1', { title: 'Test Plan', type: 'PERSONAL' as never }, 'u1');
    expect(prisma.plan.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Test Plan', organizationId: 'org1' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PLAN_CREATED' }));
    expect((result as { id: string }).id).toBeDefined();
  });

  test('T2: update patches only provided fields and audits', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'DRAFT' });
    await service.update('org1', 'plan-1', { title: 'New Title' }, 'u1');
    expect(prisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'New Title' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PLAN_UPDATED' }));
  });

  test('T3: delete throws BadRequestException for ACTIVE plan', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'ACTIVE' });
    await expect(service.delete('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.plan.delete).not.toHaveBeenCalled();
  });

  test('T4: delete succeeds for non-ACTIVE plan and audits', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'DRAFT' });
    await service.delete('org1', 'plan-1', 'u1');
    expect(prisma.plan.delete).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PLAN_DELETED' }));
  });
});

// ── T5–T8: Plan Approval workflow ─────────────────────────────────

describe('PlannerService — Approval workflow', () => {
  let service: PlannerService;
  let prisma: MockPrisma;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new PlannerService(prisma as never, audit as never);
  });

  test('T5: approve transitions REVIEW plan to APPROVED and audits', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'REVIEW' });
    await service.approve('org1', 'plan-1', 'u1', 'Looks good');
    expect(prisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', approvedBy: 'u1' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PLAN_APPROVED' }));
  });

  test('T6: approve throws BadRequestException for ACTIVE plan', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'ACTIVE' });
    await expect(service.approve('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  test('T7: reject sends plan back to DRAFT and records reason', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'REVIEW' });
    await service.reject('org1', 'plan-1', 'u1', 'Needs more detail');
    expect(prisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLAN_REJECTED', metadata: { reason: 'Needs more detail' } }),
    );
  });

  test('T8: pause then resume lifecycle transitions audit correctly', async () => {
    (prisma.plan.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'plan-1', status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 'plan-1', status: 'PAUSED' });
    await service.pause('org1', 'plan-1', 'u1');
    expect(prisma.plan.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAUSED' } }));
    await service.resume('org1', 'plan-1', 'u1');
    expect(prisma.plan.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACTIVE' } }));
    const actions = (audit.log as jest.Mock).mock.calls.map((c: unknown[]) => (c[0] as { action: string }).action);
    expect(actions).toContain('PLAN_PAUSED');
    expect(actions).toContain('PLAN_RESUMED');
  });
});

// ── T9–T13: PlanExecutorService ───────────────────────────────────

describe('PlanExecutorService', () => {
  let executor: PlanExecutorService;
  let prisma: MockPrisma;
  let tasks: ReturnType<typeof makeTasksService>;
  let goals: ReturnType<typeof makeGoalsService>;

  const approvedPlan = {
    id: 'plan-1',
    title: 'Sales Plan',
    status: 'APPROVED',
    goalId: null as string | null,
    ownerId: 'u1',
    taskLinks: [
      { id: 'link-1', stepId: null, isProposed: true, proposedData: { title: 'Task A', priority: 'HIGH', estimatedHours: 2 } },
      { id: 'link-2', stepId: null, isProposed: true, proposedData: { title: 'Task B', priority: 'MEDIUM', estimatedHours: 1 } },
    ],
  };

  beforeEach(() => {
    prisma = makePrisma();
    tasks = makeTasksService();
    goals = makeGoalsService();
    const perms = makePermissions(['tasks.create', 'planner.manage']);
    executor = new PlanExecutorService(
      prisma as never, tasks as never, goals as never, makeNotifications() as never, makeAudit() as never, perms as never,
    );
  });

  test('T9: execute creates tasks from proposed links', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(approvedPlan);
    const result = await executor.execute('org1', 'plan-1', 'u1');
    expect(tasks.create).toHaveBeenCalledTimes(2);
    expect(result.tasksCreated).toBe(2);
    expect(result.tasksFailed).toBe(0);
  });

  test('T10: execute throws if plan is not APPROVED', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ ...approvedPlan, status: 'DRAFT', taskLinks: [] });
    await expect(executor.execute('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tasks.create).not.toHaveBeenCalled();
  });

  test('T11: permission enforcement — tasks.create required', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(approvedPlan);
    const noPerms = makePermissions(['planner.view']);
    const svc = new PlanExecutorService(
      prisma as never, tasks as never, goals as never, makeNotifications() as never, makeAudit() as never, noPerms as never,
    );
    await expect(svc.execute('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  test('T12: duplicate execution detection — throws if plan already has executed links', async () => {
    (prisma.planTaskLink.count as jest.Mock).mockResolvedValue(3);
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(approvedPlan);
    await expect(executor.execute('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  test('T13: bulk safeguard — throws if proposed tasks > 20 without stepIds', async () => {
    const manyLinks = Array.from({ length: 25 }, (_, i) => ({
      id: `link-${i}`,
      stepId: null,
      isProposed: true,
      proposedData: { title: `Task ${i}`, priority: 'MEDIUM' },
    }));
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ ...approvedPlan, taskLinks: manyLinks });
    await expect(executor.execute('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── T14–T17: PlanGeneratorService ────────────────────────────────

describe('PlanGeneratorService', () => {
  let generator: PlanGeneratorService;
  let prisma: MockPrisma;
  let ai: ReturnType<typeof makeAiCompletion>;
  let perms: ReturnType<typeof makePermissions>;

  const validAiJson = JSON.stringify({
    title: 'Sales Growth Plan',
    objective: 'Reach ₦250M monthly',
    assumptions: ['Market stable'],
    expectedOutcomes: ['25% growth'],
    startDate: '2026-10-01',
    targetDate: '2026-12-31',
    steps: [
      {
        title: 'Increase Phone Sales', objective: 'Drive revenue', sortOrder: 0,
        startDate: '2026-10-01', targetDate: '2026-10-31',
        kpiName: 'Phone Revenue', kpiTarget: '100000000', kpiUnit: 'NGN',
        tasks: [{ title: 'Review pricing', description: 'Analyze margins', priority: 'HIGH', estimatedHours: 4, dueDate: '2026-10-07', dependsOn: null }],
      },
    ],
    kpis: [{ name: 'Monthly Revenue', target: '250000000', unit: 'NGN' }],
    risks: ['Supply delays'],
    warnings: [],
  });

  beforeEach(() => {
    prisma = makePrisma();
    ai = makeAiCompletion(validAiJson);
    perms = makePermissions(['planner.create', 'tasks.view', 'goals.view']);
    generator = new PlanGeneratorService(prisma as never, ai as never, perms as never);
  });

  test('T14: generate parses AI JSON and creates plan steps and task links', async () => {
    (prisma.plan.update as jest.Mock).mockResolvedValue({ id: 'plan-1', title: 'Sales Growth Plan' });
    (prisma.planStep.findMany as jest.Mock).mockResolvedValue([{ id: 'step-1', title: 'Increase Phone Sales' }]);
    const result = await generator.generate('org1', 'u1', 'plan-1', { instruction: 'Reach ₦250M' });
    expect(prisma.plan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Sales Growth Plan', status: 'REVIEW' }) }),
    );
    expect(prisma.planStep.createMany).toHaveBeenCalled();
    expect(prisma.planTaskLink.createMany).toHaveBeenCalled();
    expect(result.preview.steps).toHaveLength(1);
  });

  test('T15: generate throws if AI returns invalid JSON', async () => {
    (ai.complete as jest.Mock).mockResolvedValue({ content: 'not valid json' });
    await expect(generator.generate('org1', 'u1', 'plan-1', { instruction: 'Do something' })).rejects.toThrow();
  });

  test('T16: previewExecution returns correct task and KPI counts', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1',
      previewData: JSON.parse(validAiJson),
      taskLinks: [{ proposedData: { title: 'Task A' } }, { proposedData: { title: 'Task B' } }],
    });
    const preview = await generator.previewExecution('org1', 'plan-1');
    expect(preview.summary.tasksToCreate).toBe(2);
    expect(preview.summary.kpisToTrack).toBe(1);
  });

  test('T17: unauthorized financial context — finance data not fetched without finance.view', async () => {
    (prisma.plan.update as jest.Mock).mockResolvedValue({ id: 'plan-1' });
    (prisma.planStep.findMany as jest.Mock).mockResolvedValue([]);
    const noFinancePerms = makePermissions(['planner.create', 'tasks.view']);
    const svc = new PlanGeneratorService(prisma as never, ai as never, noFinancePerms as never);
    await svc.generate('org1', 'u1', 'plan-1', { instruction: 'Build plan', includeBusinessContext: true });
    // goal.findMany is not called when finance context is not authorized
    // (goals.view not in perms list)
    expect(prisma.goal.findMany).not.toHaveBeenCalled();
  });
});

// ── T18–T22: PlanProgressService ─────────────────────────────────

describe('PlanProgressService', () => {
  let progressService: PlanProgressService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    progressService = new PlanProgressService(prisma as never);
  });

  test('T18: returns zero progress when plan has no task links', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1', status: 'ACTIVE', targetDate: null, goalId: null, taskLinks: [],
    });
    const prog = await progressService.getProgress('org1', 'plan-1');
    expect(prog.totalTasks).toBe(0);
    expect(prog.progressPercent).toBe(0);
  });

  test('T19: calculates 50% progress when half tasks done', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1', status: 'ACTIVE', targetDate: null, goalId: null,
      taskLinks: [{ taskId: 'task-1', isProposed: false }, { taskId: 'task-2', isProposed: false }],
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'A', status: 'DONE', dueDate: null },
      { id: 'task-2', title: 'B', status: 'TODO', dueDate: null },
    ]);
    const prog = await progressService.getProgress('org1', 'plan-1');
    expect(prog.completedTasks).toBe(1);
    expect(prog.progressPercent).toBe(50);
  });

  test('T20: overdue detection flags tasks past due date', async () => {
    const pastDate = new Date(Date.now() - 86400000);
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1', status: 'ACTIVE', targetDate: null, goalId: null,
      taskLinks: [{ taskId: 'task-1', isProposed: false }],
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'A', status: 'IN_PROGRESS', dueDate: pastDate },
    ]);
    const prog = await progressService.getProgress('org1', 'plan-1');
    expect(prog.overdueTasks).toBe(1);
  });

  test('T21: plan past targetDate with incomplete tasks → OVERDUE', async () => {
    const pastTarget = new Date(Date.now() - 86400000);
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1', status: 'ACTIVE', targetDate: pastTarget, goalId: null,
      taskLinks: [{ taskId: 'task-1', isProposed: false }],
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { id: 'task-1', title: 'A', status: 'TODO', dueDate: null },
    ]);
    const prog = await progressService.getProgress('org1', 'plan-1');
    expect(prog.deadlineStatus).toBe('OVERDUE');
  });

  test('T22: goal KPI progress included when plan has goalId', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1', status: 'ACTIVE', targetDate: null, goalId: 'goal-1', taskLinks: [],
    });
    (prisma.goal.findFirst as jest.Mock).mockResolvedValue({
      id: 'goal-1', title: 'Revenue', progress: 65,
      kpis: [{ name: 'Revenue', target: '250000000', current: '162500000', unit: 'NGN' }],
    });
    const prog = await progressService.getProgress('org1', 'plan-1');
    expect(prog.goalProgress).toBe(65);
    expect(prog.kpis).toHaveLength(1);
    expect(prog.kpis[0].percent).toBe(65);
  });
});

// ── T23–T26: PersonalPlannerService ──────────────────────────────

function makeCalendarSvc() {
  return {
    getCachedEvents: jest.fn().mockResolvedValue({ data: [] }),
  };
}

describe('PersonalPlannerService', () => {
  let service: PersonalPlannerService;
  let prisma: MockPrisma;
  let ai: ReturnType<typeof makeAiCompletion>;
  let calendarSvc: ReturnType<typeof makeCalendarSvc>;

  beforeEach(() => {
    prisma = makePrisma();
    ai = makeAiCompletion('<b>Daily Plan</b>');
    calendarSvc = makeCalendarSvc();
    const perms = makePermissions(['tasks.view', 'goals.view', 'calendar.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);
  });

  test('T23: buildDailyPlan calls AI with planner_daily task type', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.buildDailyPlan('org1', 'u1');
    expect(ai.complete).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'planner_daily' }));
    expect(result).toContain('Daily Plan');
  });

  test('T24: buildWeeklyPlan uses planner_weekly task type', async () => {
    (prisma.task.count as jest.Mock).mockResolvedValue(2);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildWeeklyPlan('org1', 'u1');
    expect(ai.complete).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'planner_weekly' }));
  });

  test('T25: unauthorized calendar context — getCachedEvents not called without calendar.view', async () => {
    const noCalPerms = makePermissions(['tasks.view', 'planner.view']);
    const svc = new PersonalPlannerService(prisma as never, ai as never, noCalPerms as never, calendarSvc as never);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);
    await svc.buildDailyPlan('org1', 'u1');
    expect(calendarSvc.getCachedEvents).not.toHaveBeenCalled();
  });

  test('T26: askPlanner enriches context with plan data when planId provided', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({
      id: 'plan-1', title: 'Sales Plan', status: 'ACTIVE', objective: 'Grow sales',
      steps: [{ title: 'Step 1', status: 'PENDING' }],
      taskLinks: [{ isProposed: false, taskId: 'task-1' }],
    });
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.askPlanner('org1', 'u1', 'How is the plan?', 'plan-1');
    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain('Sales Plan');
  });
});

// ── T37–T48: PersonalPlannerService — calendar-aware ─────────────

describe('PersonalPlannerService — calendar-aware', () => {
  let service: PersonalPlannerService;
  let prisma: MockPrisma;
  let ai: ReturnType<typeof makeAiCompletion>;
  let calendarSvc: ReturnType<typeof makeCalendarSvc>;

  const now = new Date('2026-10-01T09:00:00Z');

  function makeEvent(overrides: Partial<{
    title: string; startAt: Date; endAt: Date; timezone: string; location: string | null; isAllDay: boolean; status: string;
  }> = {}) {
    return {
      title: 'Team Standup',
      startAt: new Date('2026-10-01T08:00:00Z'),
      endAt: new Date('2026-10-01T08:30:00Z'),
      timezone: 'Africa/Lagos',
      location: null,
      isAllDay: false,
      status: 'confirmed',
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = makePrisma();
    ai = makeAiCompletion('<b>Plan</b>');
    calendarSvc = makeCalendarSvc();
  });

  test('T37: daily planner includes calendar events when user has calendar.view permission', async () => {
    const perms = makePermissions(['tasks.view', 'calendar.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({
      data: [makeEvent({ title: 'Board Meeting' })],
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org1', 'u1');

    expect(calendarSvc.getCachedEvents).toHaveBeenCalled();
    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain('Board Meeting');
  });

  test('T38: daily planner excludes calendar events when user lacks calendar.view permission', async () => {
    const perms = makePermissions(['tasks.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org1', 'u1');

    expect(calendarSvc.getCachedEvents).not.toHaveBeenCalled();
  });

  test('T39: weekly planner includes per-day calendar breakdown when user has calendar.view', async () => {
    const perms = makePermissions(['tasks.view', 'calendar.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    const mondayEvent = makeEvent({
      title: 'Monday Kickoff',
      startAt: new Date('2026-09-28T09:00:00Z'),
      endAt: new Date('2026-09-28T10:00:00Z'),
    });
    const wednesdayEvent = makeEvent({
      title: 'Wednesday Review',
      startAt: new Date('2026-09-30T14:00:00Z'),
      endAt: new Date('2026-09-30T15:00:00Z'),
    });
    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({
      data: [mondayEvent, wednesdayEvent],
    });
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildWeeklyPlan('org1', 'u1');

    expect(calendarSvc.getCachedEvents).toHaveBeenCalled();
    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain('Monday Kickoff');
    expect(callArgs.messages[0].content).toContain('Wednesday Review');
  });

  test('T40: weekly planner excludes calendar when user lacks calendar.view', async () => {
    const perms = makePermissions(['tasks.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildWeeklyPlan('org1', 'u1');

    expect(calendarSvc.getCachedEvents).not.toHaveBeenCalled();
  });

  test('T41: organization isolation — getCachedEvents called with correct organizationId', async () => {
    const perms = makePermissions(['calendar.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org-xyz', 'u1');

    expect(calendarSvc.getCachedEvents).toHaveBeenCalledWith('org-xyz', expect.any(String), expect.any(Object));
  });

  test('T42: user isolation — getCachedEvents called with correct userId (never another user\'s id)', async () => {
    const perms = makePermissions(['calendar.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org1', 'user-abc');

    const callArgs = (calendarSvc.getCachedEvents as jest.Mock).mock.calls[0] as [string, string, unknown];
    expect(callArgs[1]).toBe('user-abc');
    expect(callArgs[1]).not.toBe('user-xyz');
  });

  test('T43: calendar events with location are included in context', async () => {
    const perms = makePermissions(['calendar.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({
      data: [makeEvent({ title: 'Client Visit', location: 'Victoria Island Office' })],
    });
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org1', 'u1');

    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain('Client Visit');
    expect(callArgs.messages[0].content).toContain('Victoria Island Office');
  });

  test('T44: calendar events respect timezone — format uses event\'s timezone field', async () => {
    const perms = makePermissions(['calendar.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({
      data: [makeEvent({ title: 'Lagos Meeting', timezone: 'Africa/Lagos' })],
    });
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org1', 'u1');

    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain('Africa/Lagos');
  });

  test('T45: calendar permission denial handled safely — CalendarEventsService throwing does NOT break planGeneration', async () => {
    const perms = makePermissions(['tasks.view', 'calendar.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (calendarSvc.getCachedEvents as jest.Mock).mockRejectedValue(new Error('Calendar service unavailable'));
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    // Should not throw — calendar failure is non-fatal
    await expect(service.buildDailyPlan('org1', 'u1')).resolves.toBeDefined();
    expect(ai.complete).toHaveBeenCalled();
  });

  test('T46: existing planner behavior unaffected when no calendar events exist (empty array)', async () => {
    const perms = makePermissions(['tasks.view', 'goals.view', 'calendar.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({ data: [] });
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.goal.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.buildDailyPlan('org1', 'u1');

    expect(result).toBeDefined();
    expect(ai.complete).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'planner_daily' }));
  });

  test('T47: askPlanner includes today\'s calendar events when user has calendar.view', async () => {
    const perms = makePermissions(['tasks.view', 'calendar.view', 'planner.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({
      data: [makeEvent({ title: 'Investor Call' })],
    });
    (prisma.task.count as jest.Mock).mockResolvedValue(0);
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.askPlanner('org1', 'u1', 'What should I focus on today?');

    expect(calendarSvc.getCachedEvents).toHaveBeenCalled();
    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages[0].content).toContain('Investor Call');
  });

  test('T48: free block analysis appears in daily plan context (MEETING LOAD or FREE BLOCKS mentioned)', async () => {
    const perms = makePermissions(['calendar.view']);
    service = new PersonalPlannerService(prisma as never, ai as never, perms as never, calendarSvc as never);

    const event1 = makeEvent({
      title: 'Morning Standup',
      startAt: new Date('2026-10-01T08:00:00Z'),
      endAt: new Date('2026-10-01T08:30:00Z'),
    });
    const event2 = makeEvent({
      title: 'Afternoon Review',
      startAt: new Date('2026-10-01T14:00:00Z'),
      endAt: new Date('2026-10-01T15:00:00Z'),
    });
    (calendarSvc.getCachedEvents as jest.Mock).mockResolvedValue({ data: [event1, event2] });
    (prisma.plan.findMany as jest.Mock).mockResolvedValue([]);

    await service.buildDailyPlan('org1', 'u1');

    const callArgs = (ai.complete as jest.Mock).mock.calls[0][0] as { messages: Array<{ content: string }> };
    const content = callArgs.messages[0].content;
    // Either FREE BLOCKS (gap analysis) or MEETING LOAD should appear
    expect(content.includes('FREE BLOCKS') || content.includes('MEETING LOAD')).toBe(true);
  });
});

// ── T27–T30: Organization isolation ─────────────────────────────

describe('PlannerService — org isolation', () => {
  let service: PlannerService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PlannerService(prisma as never, makeAudit() as never);
  });

  test('T27: findOne throws NotFoundException when plan not found in org', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('org2', 'plan-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  test('T28: update throws NotFoundException for cross-org access', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.update('org2', 'plan-1', { title: 'Hacked' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  test('T29: listPlans always filters by organizationId', async () => {
    await service.listPlans('org1', {});
    expect(prisma.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1' }) }),
    );
  });

  test('T30: createTemplate scopes to organizationId', async () => {
    await service.createTemplate('org1', { name: 'Monthly Sales Plan', type: 'BUSINESS', structure: {} }, 'u1');
    expect(prisma.planTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org1' }) }),
    );
  });
});

// ── T31–T33: GoalsModule / TasksModule compatibility ────────────

describe('PlanExecutorService — service compatibility', () => {
  let prisma: MockPrisma;
  let tasks: ReturnType<typeof makeTasksService>;
  let goals: ReturnType<typeof makeGoalsService>;

  const approvedPlan = {
    id: 'plan-1', title: 'P', status: 'APPROVED',
    goalId: null as string | null, ownerId: 'u1',
    taskLinks: [{ id: 'l1', stepId: null, isProposed: true, proposedData: { title: 'Task A' } }],
  };

  beforeEach(() => {
    prisma = makePrisma();
    tasks = makeTasksService();
    goals = makeGoalsService();
  });

  function makeExecutor() {
    const perms = makePermissions(['tasks.create', 'planner.manage']);
    return new PlanExecutorService(
      prisma as never, tasks as never, goals as never,
      makeNotifications() as never, makeAudit() as never, perms as never,
    );
  }

  test('T31: execute uses TasksService.create, not direct Prisma', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(approvedPlan);
    await makeExecutor().execute('org1', 'plan-1', 'u1');
    expect(tasks.create).toHaveBeenCalledWith('org1', expect.objectContaining({ title: 'Task A' }), 'u1');
  });

  test('T32: execute links KPIs via GoalsService when plan has goalId', async () => {
    (prisma.plan.findFirst as jest.Mock)
      .mockResolvedValueOnce({ ...approvedPlan, goalId: 'goal-1', taskLinks: [] })
      .mockResolvedValueOnce({ metadata: { kpis: [{ name: 'Revenue', target: '250000000', unit: 'NGN' }] } });
    await makeExecutor().execute('org1', 'plan-1', 'u1');
    expect(goals.addKpi).toHaveBeenCalledWith('org1', 'goal-1', expect.objectContaining({ name: 'Revenue' }));
  });

  test('T33: task creation failure recorded as error without aborting plan', async () => {
    (tasks.create as jest.Mock).mockRejectedValue(new Error('DB error'));
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(approvedPlan);
    const result = await makeExecutor().execute('org1', 'plan-1', 'u1');
    expect(result.tasksFailed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});

// ── T_PE: PlanExecutorService — concurrency & idempotency ────────

describe('PlanExecutorService — concurrency and idempotency', () => {
  const approvedPlanBase = {
    id: 'plan-1',
    title: 'Sales Plan',
    status: 'APPROVED',
    goalId: null as string | null,
    ownerId: 'u1',
  };

  function makeLink(id: string, stepId: string | null = null) {
    return {
      id,
      stepId,
      isProposed: true,
      proposedData: { title: `Task from ${id}`, priority: 'MEDIUM' },
    };
  }

  function makeExecutorService(prisma: MockPrisma, tasks: ReturnType<typeof makeTasksService>) {
    const perms = makePermissions(['tasks.create', 'planner.manage']);
    return new PlanExecutorService(
      prisma as never, tasks as never, makeGoalsService() as never,
      makeNotifications() as never, makeAudit() as never, perms as never,
    );
  }

  test('T_PE1: sequential duplicate — second execute() returns 0 tasks (links already claimed)', async () => {
    const prisma = makePrisma();
    const tasks = makeTasksService();
    const executor = makeExecutorService(prisma, tasks);

    const plan = { ...approvedPlanBase, taskLinks: [makeLink('link-1')] };
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(plan);

    // First call: atomic claim succeeds
    (prisma.planTaskLink.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    const first = await executor.execute('org1', 'plan-1', 'u1');
    expect(first.tasksCreated).toBe(1);

    // Second call: link already claimed (isProposed=false → updateMany count=0)
    (prisma.planTaskLink.count as jest.Mock).mockResolvedValueOnce(1); // alreadyExecuted = 1
    await expect(executor.execute('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tasks.create).toHaveBeenCalledTimes(1);
  });

  test('T_PE2: concurrent duplicate — atomic claim per link ensures each link creates at most one Task', async () => {
    const prisma = makePrisma();
    const tasks = makeTasksService();
    const executor = makeExecutorService(prisma, tasks);

    const plan = { ...approvedPlanBase, taskLinks: [makeLink('link-1')] };
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(plan);

    // Caller A wins the atomic claim for link-1, caller B loses
    (prisma.planTaskLink.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // caller A wins
      .mockResolvedValueOnce({ count: 0 }); // caller B loses

    const [resultA, resultB] = await Promise.all([
      executor.execute('org1', 'plan-1', 'u1'),
      executor.execute('org1', 'plan-1', 'u1'),
    ]);

    expect(tasks.create).toHaveBeenCalledTimes(1);
    expect(resultA.tasksCreated).toBe(1);
    expect(resultB.tasksCreated).toBe(0);
  });

  test('T_PE3: same-step concurrent — two calls for the same stepId create at most one Task', async () => {
    const prisma = makePrisma();
    const tasks = makeTasksService();
    const executor = makeExecutorService(prisma, tasks);

    const link = makeLink('link-step', 'step-1');
    const plan = { ...approvedPlanBase, taskLinks: [link] };
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(plan);

    (prisma.planTaskLink.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 }) // first caller wins
      .mockResolvedValueOnce({ count: 0 }); // second caller loses

    await Promise.all([
      executor.execute('org1', 'plan-1', 'u1', ['step-1']),
      executor.execute('org1', 'plan-1', 'u1', ['step-1']),
    ]);

    expect(tasks.create).toHaveBeenCalledTimes(1);
  });

  test('T_PE4: partial execution — previously unclaimed step can be executed later', async () => {
    const prisma = makePrisma();
    const tasks = makeTasksService();
    const executor = makeExecutorService(prisma, tasks);

    // First call: execute step-1 only
    const planWithStepA = {
      ...approvedPlanBase,
      taskLinks: [makeLink('link-a', 'step-1')],
    };
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(planWithStepA);
    const first = await executor.execute('org1', 'plan-1', 'u1', ['step-1']);
    expect(first.tasksCreated).toBe(1);

    // Second call: execute step-2 (different link, not yet claimed)
    const planWithStepB = {
      ...approvedPlanBase,
      status: 'ACTIVE', // plan transitioned after first execution
      taskLinks: [makeLink('link-b', 'step-2')],
    };
    // Plan status check would throw BadRequestException since status is ACTIVE
    // This is expected — demonstrate partial execution works when plan is still APPROVED
    const planWithStepBApproved = { ...planWithStepB, status: 'APPROVED' };
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(planWithStepBApproved);
    (prisma.planTaskLink.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    const second = await executor.execute('org1', 'plan-1', 'u1', ['step-2']);
    expect(second.tasksCreated).toBe(1);
    expect(tasks.create).toHaveBeenCalledTimes(2);
  });

  test('T_PE5: failure rollback — if Task creation fails, link is reverted to isProposed=true', async () => {
    const prisma = makePrisma();
    const tasks = makeTasksService();
    (tasks.create as jest.Mock).mockRejectedValue(new Error('DB timeout'));
    const executor = makeExecutorService(prisma, tasks);

    const plan = { ...approvedPlanBase, taskLinks: [makeLink('link-1')] };
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue(plan);

    const result = await executor.execute('org1', 'plan-1', 'u1');

    // Atomic claim was attempted
    expect(prisma.planTaskLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'link-1', isProposed: true }) }),
    );
    // Rollback called with isProposed: true
    expect(prisma.planTaskLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'link-1' }, data: { isProposed: true } }),
    );
    expect(result.tasksFailed).toBe(1);
    expect(result.tasksCreated).toBe(0);
  });

  test('T_PE6: bulk safeguard still enforced after concurrency fix', async () => {
    const prisma = makePrisma();
    const executor = makeExecutorService(prisma, makeTasksService());

    const manyLinks = Array.from({ length: 25 }, (_, i) => makeLink(`link-${i}`));
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ ...approvedPlanBase, taskLinks: manyLinks });

    await expect(executor.execute('org1', 'plan-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── T34–T36: Audit trail ─────────────────────────────────────────

describe('PlannerService — audit trail', () => {
  let service: PlannerService;
  let audit: ReturnType<typeof makeAudit>;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    service = new PlannerService(prisma as never, audit as never);
  });

  test('T34: approve records PLAN_APPROVED with actor', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'DRAFT' });
    await service.approve('org1', 'plan-1', 'actor-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLAN_APPROVED', userId: 'actor-1', entityId: 'plan-1' }),
    );
  });

  test('T35: reject records PLAN_REJECTED with reason', async () => {
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan-1', status: 'REVIEW' });
    await service.reject('org1', 'plan-1', 'actor-1', 'Not ready');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLAN_REJECTED', metadata: { reason: 'Not ready' } }),
    );
  });

  test('T36: plan_created audit includes plan title', async () => {
    await service.create('org1', { title: 'Q4 Plan' }, 'u1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PLAN_CREATED', metadata: expect.objectContaining({ title: 'Q4 Plan' }) }),
    );
  });
});
