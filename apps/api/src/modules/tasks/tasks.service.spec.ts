/**
 * TasksService — unit tests
 *
 * Covers:
 * 1. findAll() returns org-scoped tasks
 * 2. create() creates a task with correct data
 * 3. update() updates an existing task
 * 4. update() throws NotFoundException for wrong org (isolation)
 * 5. softDelete() cancels an existing task
 * 6. softDelete() throws NotFoundException when task not found
 */

import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

function makePrisma(overrides: Partial<{
  taskFindMany: jest.Mock;
  taskFindFirst: jest.Mock;
  taskCreate: jest.Mock;
  taskUpdate: jest.Mock;
  taskCount: jest.Mock;
  customerFindFirst: jest.Mock;
}> = {}) {
  return {
    task: {
      findMany: overrides.taskFindMany ?? jest.fn(async () => []),
      findFirst: overrides.taskFindFirst ?? jest.fn(async () => null),
      create: overrides.taskCreate ?? jest.fn(async (args: { data: unknown }) => ({ id: 't-1', ...(args.data as object) })),
      update: overrides.taskUpdate ?? jest.fn(async (args: { data: unknown }) => ({ id: 't-1', ...(args.data as object) })),
      count: overrides.taskCount ?? jest.fn(async () => 0),
    },
    customer: {
      findFirst: overrides.customerFindFirst ?? jest.fn(async () => null),
    },
    taskComment: {
      create: jest.fn(async () => ({})),
    },
    taskChecklist: {
      create: jest.fn(async () => ({})),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
    },
    telegramUserLink: {
      findFirst: jest.fn(async () => null),
    },
    user: {
      findUnique: jest.fn(async () => null),
    },
  };
}

const makeEventEmitter = () => ({ emit: jest.fn() });
const makeEmailService = () => ({ sendEmail: jest.fn(), sendSms: jest.fn() });
const makeTelegramService = () => ({ sendMessage: jest.fn() });
const makeConfig = () => ({ get: jest.fn() });

function makeService(prismaOverrides: Parameters<typeof makePrisma>[0] = {}) {
  const prisma = makePrisma(prismaOverrides);
  const service = new TasksService(
    prisma as never,
    makeEventEmitter() as never,
    makeEmailService() as never,
    makeTelegramService() as never,
    makeConfig() as never,
  );
  return { service, prisma };
}

const BASE_TASK = {
  id: 't-1',
  organizationId: 'org-1',
  title: 'Fix login bug',
  status: 'TODO',
  priority: 'HIGH',
};

describe('TasksService', () => {
  it('1: findAll() returns tasks scoped to the organization', async () => {
    const tasks = [BASE_TASK];
    const { service, prisma } = makeService({
      taskFindMany: jest.fn(async () => tasks),
      taskCount: jest.fn(async () => 1),
    });

    const result = await service.findAll('org-1', {});

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
    expect(result.data).toEqual(tasks);
    expect(result.meta.total).toBe(1);
  });

  it('2: findAll() does not return tasks from other orgs (isolation)', async () => {
    const { service, prisma } = makeService({
      taskFindMany: jest.fn(async () => []),
      taskCount: jest.fn(async () => 0),
    });

    await service.findAll('org-2', {});

    const callArg = (prisma.task.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where.organizationId).toBe('org-2');
  });

  it('3: create() creates a task with correct data', async () => {
    const createdTask = { ...BASE_TASK, id: 't-new' };
    const { service, prisma } = makeService({
      taskCreate: jest.fn(async () => createdTask),
    });

    const result = await service.create(
      'org-1',
      { title: BASE_TASK.title },
      'creator-1',
    );

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          title: BASE_TASK.title,
          creatorId: 'creator-1',
        }),
      }),
    );
    expect(result.id).toBe('t-new');
  });

  it('4: update() updates an existing task', async () => {
    const existingTask = { ...BASE_TASK };
    const { service, prisma } = makeService({
      taskFindFirst: jest.fn(async () => existingTask),
      taskUpdate: jest.fn(async () => ({ ...existingTask, title: 'Updated Title' })),
    });

    const result = await service.update('org-1', 't-1', { title: 'Updated Title' });

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't-1' },
        data: expect.objectContaining({ title: 'Updated Title' }),
      }),
    );
    expect(result.title).toBe('Updated Title');
  });

  it('5: update() throws NotFoundException when task not in org (isolation)', async () => {
    const { service, prisma } = makeService({
      taskFindFirst: jest.fn(async () => null),
    });

    await expect(service.update('org-1', 't-other-org', { title: 'Hijack' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('6: softDelete() cancels an existing task', async () => {
    const existingTask = { ...BASE_TASK };
    const { service, prisma } = makeService({
      taskFindFirst: jest.fn(async () => existingTask),
      taskUpdate: jest.fn(async () => ({ ...existingTask, status: 'CANCELLED' })),
    });

    await service.softDelete('org-1', 't-1');

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't-1' },
        data: { status: 'CANCELLED' },
      }),
    );
  });

  it('7: softDelete() throws NotFoundException when task not found', async () => {
    const { service, prisma } = makeService({
      taskFindFirst: jest.fn(async () => null),
    });

    await expect(service.softDelete('org-1', 't-missing')).rejects.toThrow(NotFoundException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('8: update() query is scoped with organizationId (IDOR protection)', async () => {
    const { service, prisma } = makeService({
      taskFindFirst: jest.fn(async () => null),
    });

    await expect(service.update('org-evil', 't-1', { title: 'Attack' })).rejects.toThrow(NotFoundException);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: 't-1', organizationId: 'org-evil' },
    });
  });
});
