/**
 * QueueService — unit tests
 *
 * Verifies that jobs are enqueued to the correct queues and
 * bulk enqueueing works. Uses a mock Queue implementation.
 */

import { QUEUES, JOB_TYPES } from '@knef/constants';

// Mock bullmq before imports
const mockAdd = jest.fn(async () => ({ id: 'job-1' }));
const mockAddBulk = jest.fn(async () => [{ id: 'job-1' }]);
const mockClose = jest.fn(async () => undefined);
const mockWaitingCount = jest.fn(async () => 0);
const mockActiveCount = jest.fn(async () => 0);
const mockCompletedCount = jest.fn(async () => 0);
const mockFailedCount = jest.fn(async () => 0);
const mockDelayedCount = jest.fn(async () => 0);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    addBulk: mockAddBulk,
    close: mockClose,
    getWaitingCount: mockWaitingCount,
    getActiveCount: mockActiveCount,
    getCompletedCount: mockCompletedCount,
    getFailedCount: mockFailedCount,
    getDelayedCount: mockDelayedCount,
  })),
}));

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn(async () => 'OK'),
  })),
);

import { QueueService } from './queue.service';

function makeService() {
  const config = { get: jest.fn((key: string, def?: unknown) => def ?? 'redis://localhost:6379') };
  const svc = new QueueService(config as never);
  svc.onModuleInit();
  return svc;
}

describe('QueueService.enqueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('1: enqueues job to the correct queue with correct job type', async () => {
    const svc = makeService();

    await svc.enqueue(QUEUES.EMAIL, JOB_TYPES.SEND_CAMPAIGN_EMAIL, { to: 'a@b.com' });

    expect(mockAdd).toHaveBeenCalledWith(
      JOB_TYPES.SEND_CAMPAIGN_EMAIL,
      { to: 'a@b.com' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('2: enqueueing to an unknown queue throws', async () => {
    const svc = makeService();

    await expect(
      svc.enqueue('nonexistent-queue', 'some-job', {}),
    ).rejects.toThrow("Unknown queue: nonexistent-queue");
  });

  it('3: enqueueBulk calls addBulk with correct shape', async () => {
    const svc = makeService();

    await svc.enqueueBulk(QUEUES.EMAIL, JOB_TYPES.SEND_CAMPAIGN_EMAIL, [
      { to: 'a@b.com' },
      { to: 'b@c.com' },
    ]);

    expect(mockAddBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: JOB_TYPES.SEND_CAMPAIGN_EMAIL }),
      ]),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bulkJobs = (mockAddBulk.mock.calls as any)[0][0] as unknown[];
    expect(bulkJobs).toHaveLength(2);
  });

  it('4: getAllQueueStats returns entry for every queue', async () => {
    const svc = makeService();

    const stats = await svc.getAllQueueStats();

    for (const queueName of Object.values(QUEUES)) {
      expect(stats).toHaveProperty(queueName);
    }
  });

  it('5: getQueueStats for unknown queue returns null', async () => {
    const svc = makeService();

    const result = await svc.getQueueStats('unknown-queue');
    expect(result).toBeNull();
  });
});
