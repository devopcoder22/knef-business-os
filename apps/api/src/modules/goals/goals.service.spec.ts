/**
 * GoalsService — unit tests
 *
 * Covers:
 * 1. list() returns org-scoped goals
 * 2. create() creates a goal with correct data
 * 3. update() updates an existing goal
 * 4. update() throws NotFoundException for wrong org (isolation)
 * 5. findOne() throws NotFoundException when goal not found
 */

import { NotFoundException } from '@nestjs/common';
import { GoalsService } from './goals.service';

function makePrisma(overrides: Partial<{
  goalFindMany: jest.Mock;
  goalFindFirst: jest.Mock;
  goalCreate: jest.Mock;
  goalUpdate: jest.Mock;
  goalCount: jest.Mock;
}> = {}) {
  return {
    goal: {
      findMany: overrides.goalFindMany ?? jest.fn(async () => []),
      findFirst: overrides.goalFindFirst ?? jest.fn(async () => null),
      create: overrides.goalCreate ?? jest.fn(async (args: { data: unknown }) => ({ id: 'g-1', ...(args.data as object) })),
      update: overrides.goalUpdate ?? jest.fn(async (args: { data: unknown }) => ({ id: 'g-1', ...(args.data as object) })),
      count: overrides.goalCount ?? jest.fn(async () => 0),
    },
    goalProgress: {
      create: jest.fn(async () => ({})),
    },
    goalKPI: {
      create: jest.fn(async () => ({})),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

const BASE_GOAL = {
  id: 'g-1',
  organizationId: 'org-1',
  title: 'Increase Q4 Sales',
  status: 'ACTIVE',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
  ownerId: 'user-1',
  progress: 0,
};

describe('GoalsService', () => {
  it('1: list() returns goals scoped to the organization', async () => {
    const goals = [BASE_GOAL];
    const prisma = makePrisma({
      goalFindMany: jest.fn(async () => goals),
      goalCount: jest.fn(async () => 1),
    });
    const service = new GoalsService(prisma as never);

    const result = await service.findAll('org-1', {});

    expect(prisma.goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
    expect(result.data).toEqual(goals);
    expect(result.meta.total).toBe(1);
  });

  it('2: list() does not return goals from other orgs (isolation)', async () => {
    const prisma = makePrisma({
      goalFindMany: jest.fn(async () => []),
      goalCount: jest.fn(async () => 0),
    });
    const service = new GoalsService(prisma as never);

    await service.findAll('org-2', {});

    const callArg = (prisma.goal.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where.organizationId).toBe('org-2');
  });

  it('3: create() creates a goal with correct data', async () => {
    const createdGoal = { ...BASE_GOAL, id: 'g-new' };
    const prisma = makePrisma({
      goalCreate: jest.fn(async () => createdGoal),
    });
    const service = new GoalsService(prisma as never);

    const result = await service.create('org-1', {
      title: BASE_GOAL.title,
      startDate: BASE_GOAL.startDate,
      endDate: BASE_GOAL.endDate,
      ownerId: BASE_GOAL.ownerId,
    });

    expect(prisma.goal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          title: BASE_GOAL.title,
          ownerId: BASE_GOAL.ownerId,
        }),
      }),
    );
    expect(result.id).toBe('g-new');
  });

  it('4: update() updates an existing goal', async () => {
    const existingGoal = { id: 'g-1', organizationId: 'org-1', title: 'Old Title' };
    const prisma = makePrisma({
      goalFindFirst: jest.fn(async () => existingGoal),
      goalUpdate: jest.fn(async () => ({ ...existingGoal, title: 'New Title' })),
    });
    const service = new GoalsService(prisma as never);

    const result = await service.update('org-1', 'g-1', { title: 'New Title' });

    expect(prisma.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g-1' },
        data: expect.objectContaining({ title: 'New Title' }),
      }),
    );
    expect(result.title).toBe('New Title');
  });

  it('5: update() throws NotFoundException when goal does not exist in org (isolation)', async () => {
    const prisma = makePrisma({
      goalFindFirst: jest.fn(async () => null),
    });
    const service = new GoalsService(prisma as never);

    await expect(service.update('org-1', 'g-wrong-org', { title: 'Attack' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('6: findOne() throws NotFoundException when goal not found', async () => {
    const prisma = makePrisma({
      goalFindFirst: jest.fn(async () => null),
    });
    const service = new GoalsService(prisma as never);

    await expect(service.findOne('org-1', 'g-missing')).rejects.toThrow(NotFoundException);
  });

  it('7: update() with wrong organizationId enforces isolation — query scoped to org', async () => {
    const prisma = makePrisma({
      goalFindFirst: jest.fn(async () => null),
    });
    const service = new GoalsService(prisma as never);

    await expect(service.update('org-evil', 'g-1', { title: 'Hijack' })).rejects.toThrow(NotFoundException);

    expect(prisma.goal.findFirst).toHaveBeenCalledWith({
      where: { id: 'g-1', organizationId: 'org-evil' },
    });
  });
});
