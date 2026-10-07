import { NotificationsProcessor } from './notifications.processor';
import { JOB_TYPES } from '@knef/constants';
import type { Job } from 'bullmq';

function makePrisma() {
  return {
    notification: { create: jest.fn(async () => ({})) },
  };
}

function makeConfig() {
  return { get: jest.fn((_k: string, def?: unknown) => def) };
}

function makeJob(data: unknown): Job {
  return { id: 'j-1', name: JOB_TYPES.SEND_NOTIFICATION, data } as Job;
}

function makeNotificationData(overrides: Partial<{
  organizationId: string;
  userId: string;
  title: string;
  message: string;
  entityId: string;
  entityType: string;
  metadata: Record<string, unknown>;
}> = {}) {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    title: 'Test Notification',
    message: 'Something happened',
    entityId: 'entity-1',
    entityType: 'Order',
    metadata: {},
    ...overrides,
  };
}

describe('NotificationsProcessor', () => {
  function makeProcessor() {
    const prisma = makePrisma();
    const config = makeConfig();
    const processor = new NotificationsProcessor(prisma as never, config as never);
    return { processor, prisma };
  }

  it('creates notification with correct fields', async () => {
    const { processor, prisma } = makeProcessor();
    const data = makeNotificationData({ userId: 'user-42', title: 'Order Shipped' });
    const job = makeJob(data);

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    const created = (prisma.notification.create as jest.Mock).mock.calls[0][0].data;
    expect(created.organizationId).toBe('org-1');
    expect(created.userId).toBe('user-42');
    expect(created.title).toBe('Order Shipped');
    expect(created.body).toBe('Something happened');
    expect(created.isRead).toBe(false);
  });

  it('sets type to INFO', async () => {
    const { processor, prisma } = makeProcessor();
    const job = makeJob(makeNotificationData());

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    const created = (prisma.notification.create as jest.Mock).mock.calls[0][0].data;
    expect(created.type).toBe('INFO');
  });

  it('includes entityId and entityType in notification data field', async () => {
    const { processor, prisma } = makeProcessor();
    const job = makeJob(makeNotificationData({ entityId: 'order-99', entityType: 'Order' }));

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    const created = (prisma.notification.create as jest.Mock).mock.calls[0][0].data;
    expect(created.data.entityId).toBe('order-99');
    expect(created.data.entityType).toBe('Order');
  });

  it('merges extra metadata into the data field', async () => {
    const { processor, prisma } = makeProcessor();
    const job = makeJob(makeNotificationData({ metadata: { customKey: 'customValue' } }));

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    const created = (prisma.notification.create as jest.Mock).mock.calls[0][0].data;
    expect(created.data.customKey).toBe('customValue');
  });

  it('generates a non-empty id for the notification', async () => {
    const { processor, prisma } = makeProcessor();
    const job = makeJob(makeNotificationData());

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    const created = (prisma.notification.create as jest.Mock).mock.calls[0][0].data;
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
  });

  it('ignores unknown job types without creating a notification', async () => {
    const { processor, prisma } = makeProcessor();
    const job = { id: 'j-1', name: 'UNKNOWN', data: {} } as Job;

    await (processor as unknown as { process: (j: Job) => Promise<void> }).process(job);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});
