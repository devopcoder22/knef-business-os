import { WebPushSenderService } from './web-push-sender.service';

// Mock web-push at module level
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    sendNotification: jest.fn(async () => ({ statusCode: 201 })),
  },
}));
import webpush from 'web-push';

function makeConfig(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    ENCRYPTION_KEY: 'a'.repeat(64),
    WEB_PUSH_DELIVERY_ENABLED: 'true',
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
  const merged = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string, def?: unknown) => merged[key] ?? def),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in merged)) throw new Error(`Missing config: ${key}`);
      return merged[key];
    }),
  };
}

function makeEncryptedPrivateKey() {
  // Encrypt a dummy private key using the same test ENCRYPTION_KEY
  // We use the encrypt util; for tests we can just return a known encrypted value
  // Instead, we test with a mocked systemSetting that provides a known value
  return 'encrypted-private-key';
}

// A minimal valid VAPID private key in base64url (32 bytes)
const DUMMY_PRIVATE_KEY_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
// A minimal valid VAPID public key (87 chars, simulates proper format)
const DUMMY_PUBLIC_KEY_B64 = 'BNNd0Q5bAfmjuQS2DH73f4wq3MZJZ9vN1L1cNmGxQTqIfxaE4D1e3Km5hGb7F8s4E2pWrX9C0tO';

function makePrisma(subs = [makeSubscription()], vapidValue: string | null = null) {
  return {
    pushSubscription: {
      findMany: jest.fn(async () => subs),
      update: jest.fn(async () => ({})),
    },
    systemSetting: {
      findFirst: jest.fn(async () =>
        vapidValue ? { value: vapidValue } : null,
      ),
    },
    communicationLog: {
      update: jest.fn(async () => ({})),
    },
  };
}

function makeSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    userId: 'user-1',
    endpoint: 'https://push.example.com/sub-1',
    p256dhKey: DUMMY_PUBLIC_KEY_B64,
    authKey: 'AAAAAAAAAAAAA',
    isActive: true,
    failureCount: 0,
    ...overrides,
  };
}

function makeValidVapidJson() {
  const { encrypt } = jest.requireActual('@knef/utils') as { encrypt: (v: string, k: string) => string };
  const encryptedPriv = encrypt(DUMMY_PRIVATE_KEY_B64, 'a'.repeat(64));
  return JSON.stringify({
    format: 'v2',
    publicKey: DUMMY_PUBLIC_KEY_B64,
    privateKeyEncrypted: encryptedPriv,
  });
}

describe('WebPushSenderService', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeService(
    configOverrides: Record<string, string> = {},
    subs = [makeSubscription()],
    vapidJson: string | null = makeValidVapidJson(),
  ) {
    const prisma = makePrisma(subs, vapidJson);
    const config = makeConfig(configOverrides);
    const service = new WebPushSenderService(prisma as never, config as never);
    return { service, prisma };
  }

  it('skips send when WEB_PUSH_DELIVERY_ENABLED=false', async () => {
    const { service } = makeService({ WEB_PUSH_DELIVERY_ENABLED: 'false' });
    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B' });
    expect((webpush.sendNotification as jest.Mock)).not.toHaveBeenCalled();
  });

  it('marks log failed when no subscriptions found', async () => {
    const { service, prisma } = makeService({}, []);
    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B', logId: 'log-1' });
    expect((prisma.communicationLog.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('marks log failed when VAPID keys not configured', async () => {
    const { service, prisma } = makeService({}, [makeSubscription()], null);
    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B', logId: 'log-1' });
    expect((prisma.communicationLog.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect((webpush.sendNotification as jest.Mock)).not.toHaveBeenCalled();
  });

  it('calls webpush.sendNotification with correct subscription and payload', async () => {
    const { service } = makeService();
    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'Order shipped', body: 'On the way', url: '/account/orders' });

    expect((webpush.sendNotification as jest.Mock)).toHaveBeenCalledTimes(1);
    const [sub, payload] = (webpush.sendNotification as jest.Mock).mock.calls[0];
    expect(sub.endpoint).toBe('https://push.example.com/sub-1');
    expect(sub.keys.p256dh).toBe(DUMMY_PUBLIC_KEY_B64);
    const parsed = JSON.parse(payload as string);
    expect(parsed.title).toBe('Order shipped');
    expect(parsed.url).toBe('/account/orders');
  });

  it('deactivates subscription on 410 Gone response', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const { service, prisma } = makeService();

    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B', logId: 'log-1' });

    const updateCall = (prisma.pushSubscription.update as jest.Mock).mock.calls[0];
    expect(updateCall[0].data.isActive).toBe(false);
    expect(updateCall[0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('deactivates subscription on 404 Not Found response', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Not Found'), { statusCode: 404 }));
    const { service, prisma } = makeService();

    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B' });

    const updateCall = (prisma.pushSubscription.update as jest.Mock).mock.calls[0];
    expect(updateCall[0].data.isActive).toBe(false);
  });

  it('throws on 429 (transient) so BullMQ retries', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { statusCode: 429 }));
    const { service } = makeService();

    await expect(
      service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B' }),
    ).rejects.toThrow(/429/);
  });

  it('throws on 500 (transient) so BullMQ retries', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { statusCode: 500 }));
    const { service } = makeService();

    await expect(
      service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B' }),
    ).rejects.toThrow(/500/);
  });

  it('increments failureCount on permanent error', async () => {
    (webpush.sendNotification as jest.Mock).mockRejectedValueOnce(new Error('Some permanent error'));
    const { service, prisma } = makeService();

    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B' });

    const updateCall = (prisma.pushSubscription.update as jest.Mock).mock.calls[0];
    expect(updateCall[0].data.failureCount).toEqual({ increment: 1 });
  });

  it('queries subscriptions with failureCount lt MAX_FAILURE_COUNT filter', async () => {
    const { service, prisma } = makeService({}, []);

    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B', logId: 'log-1' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryWhere = (prisma.pushSubscription.findMany as jest.Mock).mock.calls[0]![0] as any;
    expect(queryWhere.where.failureCount).toEqual({ lt: 5 });
    expect((webpush.sendNotification as jest.Mock)).not.toHaveBeenCalled();
  });

  it('updates log status to sent when push succeeds', async () => {
    const { service, prisma } = makeService();
    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B', logId: 'log-1' });

    expect((prisma.communicationLog.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
    );
  });

  it('rejects old DER-format VAPID keys (length > 100)', async () => {
    const badVapidJson = JSON.stringify({
      format: 'v1', // old format
      publicKey: 'A'.repeat(122), // DER-encoded length
      privateKeyEncrypted: 'something',
    });
    const { service, prisma } = makeService({}, [makeSubscription()], badVapidJson);

    await service.sendPush({ organizationId: 'org-1', userId: 'user-1', title: 'T', body: 'B', logId: 'log-1' });

    // Should fail because old format is rejected
    expect((webpush.sendNotification as jest.Mock)).not.toHaveBeenCalled();
    expect((prisma.communicationLog.update as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('org isolation: does not fetch subscriptions from other orgs', async () => {
    const { service, prisma } = makeService();
    await service.sendPush({ organizationId: 'org-2', userId: 'user-2', title: 'T', body: 'B' });

    const findManyCall = (prisma.pushSubscription.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.organizationId).toBe('org-2');
    expect(findManyCall.where.userId).toBe('user-2');
  });
});
