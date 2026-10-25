import { WebPushService } from './web-push.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

// Mock web-push at module level
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    generateVAPIDKeys: jest.fn(() => ({
      publicKey: 'B'.repeat(87),
      privateKey: 'C'.repeat(43),
    })),
    sendNotification: jest.fn(async () => ({ statusCode: 201 })),
  },
}));

function makeConfig(overrides: Record<string, string> = {}) {
  const merged: Record<string, string> = { ENCRYPTION_KEY: 'a'.repeat(64), ...overrides };
  return { get: jest.fn((k: string) => merged[k]) };
}

function makePrisma(overrides: Partial<Record<string, Record<string, jest.Mock>>> = {}) {
  return {
    systemSetting: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
      ...overrides.systemSetting,
    },
    pushSubscription: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'sub-new', ...args.data })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      ...overrides.pushSubscription,
    },
    communicationLog: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'log-1', ...args.data })),
      update: jest.fn(async () => ({})),
      ...overrides.communicationLog,
    },
  };
}

function makeQueue() {
  return { enqueue: jest.fn(async () => {}) };
}

describe('WebPushService', () => {
  function makeService(prismaOverrides: Partial<Record<string, Record<string, jest.Mock>>> = {}) {
    const prisma = makePrisma(prismaOverrides);
    const queue = makeQueue();
    const config = makeConfig();
    const service = new WebPushService(prisma as never, queue as never, config as never);
    return { service, prisma, queue };
  }

  // ── VAPID ──────────────────────────────────────────────────────────────────

  describe('getVapidPublicKey', () => {
    it('generates v2 keys when none exist', async () => {
      const { service, prisma } = makeService();
      const result = await service.getVapidPublicKey('org-1');

      expect(result.publicKey).toBe('B'.repeat(87));
      expect((prisma.systemSetting.create as jest.Mock)).toHaveBeenCalledTimes(1);
      const storedValue = JSON.parse((prisma.systemSetting.create as jest.Mock).mock.calls[0][0].data.value);
      expect(storedValue.format).toBe('v2');
    });

    it('returns cached v2 key without regenerating', async () => {
      const import_encrypt = jest.requireActual<typeof import('@knef/utils')>('@knef/utils').encrypt;
      const cachedJson = JSON.stringify({
        format: 'v2',
        publicKey: 'D'.repeat(87),
        privateKeyEncrypted: import_encrypt('E'.repeat(43), 'a'.repeat(64)),
      });

      const { service, prisma } = makeService({
        systemSetting: { findFirst: jest.fn(async () => ({ id: 'ss-1', value: cachedJson })) },
      });
      const result = await service.getVapidPublicKey('org-1');

      expect(result.publicKey).toBe('D'.repeat(87));
      expect((prisma.systemSetting.create as jest.Mock)).not.toHaveBeenCalled();
    });

    it('regenerates keys when stored key is in old DER format (length > 100)', async () => {
      const oldFormatJson = JSON.stringify({
        format: 'v1',
        publicKey: 'A'.repeat(122),
        privateKeyEncrypted: 'old-encrypted',
      });

      const { service, prisma } = makeService({
        systemSetting: {
          findFirst: jest.fn(async () => ({ id: 'ss-old', value: oldFormatJson })),
          update: jest.fn(async () => ({})),
        },
      });
      const result = await service.getVapidPublicKey('org-1');

      // Should regenerate using web-push.generateVAPIDKeys
      expect(result.publicKey).toBe('B'.repeat(87));
      // Should update existing setting
      expect((prisma.systemSetting.update as jest.Mock)).toHaveBeenCalledTimes(1);
    });

    it('does not expose privateKeyEncrypted in getVapidPublicKey response', async () => {
      const { service } = makeService();
      const result = await service.getVapidPublicKey('org-1');

      expect(Object.keys(result)).toEqual(['publicKey']);
      expect((result as Record<string, unknown>).privateKeyEncrypted).toBeUndefined();
    });
  });

  // ── Subscribe ──────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('creates a new subscription', async () => {
      const { service, prisma } = makeService();
      const result = await service.subscribe('user-1', 'org-1', {
        endpoint: 'https://push.example.com/sub',
        p256dhKey: 'key',
        authKey: 'auth',
        userAgent: 'Chrome/120',
      });

      expect(result.id).toBeTruthy();
      expect((prisma.pushSubscription.create as jest.Mock)).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException for missing endpoint', async () => {
      const { service } = makeService();
      await expect(
        service.subscribe('user-1', 'org-1', { endpoint: '', p256dhKey: 'k', authKey: 'a' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for non-HTTPS endpoint', async () => {
      const { service } = makeService();
      await expect(
        service.subscribe('user-1', 'org-1', { endpoint: 'http://insecure.example.com/sub', p256dhKey: 'k', authKey: 'a' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reactivates existing subscription with same endpoint', async () => {
      const { service, prisma } = makeService({
        pushSubscription: {
          findFirst: jest.fn(async () => ({ id: 'sub-existing', userId: 'user-1', userAgent: 'Firefox' })),
          update: jest.fn(async () => ({})),
          create: jest.fn(async () => ({})),
          findMany: jest.fn(async () => []),
          count: jest.fn(async () => 0),
          updateMany: jest.fn(async () => ({})),
        },
      });

      const result = await service.subscribe('user-1', 'org-1', {
        endpoint: 'https://push.example.com/sub',
        p256dhKey: 'newkey',
        authKey: 'newauth',
      });

      expect(result.id).toBe('sub-existing');
      expect((prisma.pushSubscription.create as jest.Mock)).not.toHaveBeenCalled();
      const updateData = (prisma.pushSubscription.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData.isActive).toBe(true);
      expect(updateData.failureCount).toBe(0);
      expect(updateData.revokedAt).toBeNull();
    });
  });

  // ── Unsubscribe ────────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('marks subscription inactive and sets revokedAt', async () => {
      const mockUpdateMany = jest.fn(async () => ({}));
      const { service } = makeService({
        pushSubscription: {
          updateMany: mockUpdateMany,
          findFirst: jest.fn(async () => null),
          findMany: jest.fn(async () => []),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn(async () => 0),
        },
      });

      await service.unsubscribe('user-1', 'https://push.example.com/sub');

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', endpoint: 'https://push.example.com/sub' },
        data: expect.objectContaining({ isActive: false, revokedAt: expect.any(Date) }),
      });
    });
  });

  // ── IDOR ───────────────────────────────────────────────────────────────────

  describe('revokeSubscription', () => {
    it('throws ForbiddenException when userId does not match subscription owner', async () => {
      const { service } = makeService({
        pushSubscription: {
          findFirst: jest.fn(async () => ({ id: 'sub-1', organizationId: 'org-1', userId: 'other-user' })),
          update: jest.fn(),
          findMany: jest.fn(async () => []),
          create: jest.fn(),
          count: jest.fn(async () => 0),
          updateMany: jest.fn(),
        },
      });

      await expect(
        service.revokeSubscription('attacker-user', 'org-1', 'sub-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows owner to revoke their own subscription', async () => {
      const mockUpdate = jest.fn(async () => ({}));
      const { service } = makeService({
        pushSubscription: {
          findFirst: jest.fn(async () => ({ id: 'sub-1', organizationId: 'org-1', userId: 'user-1' })),
          update: mockUpdate,
          findMany: jest.fn(async () => []),
          create: jest.fn(),
          count: jest.fn(async () => 0),
          updateMany: jest.fn(),
        },
      });

      await service.revokeSubscription('user-1', 'org-1', 'sub-1');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ isActive: false, revokedAt: expect.any(Date) }),
      });
    });
  });

  // ── Multiple devices ───────────────────────────────────────────────────────

  describe('listSubscriptions', () => {
    it('scopes subscriptions to userId and organizationId', async () => {
      const mockFindMany = jest.fn(async () => []);
      const { service } = makeService({
        pushSubscription: {
          findMany: mockFindMany,
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn(async () => 0),
          updateMany: jest.fn(),
        },
      });

      await service.listSubscriptions('user-1', 'org-1');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = (mockFindMany.mock.calls as any)[0][0] as { where: Record<string, string> };
      expect(call.where.userId).toBe('user-1');
      expect(call.where.organizationId).toBe('org-1');
    });
  });

  // ── queuePush ──────────────────────────────────────────────────────────────

  describe('queuePush', () => {
    it('returns empty logId when no active subscriptions', async () => {
      const { service } = makeService();
      const result = await service.queuePush('user-1', 'org-1', { title: 'T', body: 'B' });
      expect(result.logId).toBe('');
    });

    it('creates log and enqueues job when subscriptions exist', async () => {
      const { service, queue } = makeService({
        pushSubscription: {
          count: jest.fn(async () => 2),
          findFirst: jest.fn(async () => null),
          findMany: jest.fn(async () => []),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      });

      const result = await service.queuePush('user-1', 'org-1', {
        title: 'Order shipped',
        body: 'Your order is on the way',
        url: '/account/orders',
        tag: 'order-1-shipped',
        idempotencyKey: 'push:org-1:order-1:shipped',
      });

      expect(result.logId).toBeTruthy();
      expect((queue.enqueue as jest.Mock)).toHaveBeenCalledTimes(1);
      const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2];
      expect(jobData.title).toBe('Order shipped');
      expect(jobData.tag).toBe('order-1-shipped');
      expect(jobData.idempotencyKey).toBe('push:org-1:order-1:shipped');
    });
  });

  // ── Org subscription count ─────────────────────────────────────────────────

  describe('listOrgSubscriptions', () => {
    it('returns active and expired counts', async () => {
      const { service } = makeService({
        pushSubscription: {
          count: jest.fn()
            .mockResolvedValueOnce(5)
            .mockResolvedValueOnce(3),
          findFirst: jest.fn(),
          findMany: jest.fn(async () => []),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      });

      const result = await service.listOrgSubscriptions('org-1');
      expect(result.active).toBe(5);
      expect(result.expired).toBe(3);
    });
  });
});
