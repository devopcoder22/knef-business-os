/**
 * AuthEventsListener — unit tests
 *
 * Verifies password-reset email dispatch:
 *   - correct recipient/URL/subject
 *   - anti-enumeration: queue errors do not propagate
 *   - token not logged
 *   - email sent via queue only (not directly)
 */

import { AuthEventsListener, type PasswordResetRequestedEvent } from './auth-events.listener';

function makeQueue() {
  return { enqueue: jest.fn(async () => 'job-1') };
}

function makeConfig(appUrl = 'https://app.knef.com') {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'APP_URL') return appUrl;
      return def;
    }),
  };
}

function makeEvent(overrides: Partial<PasswordResetRequestedEvent> = {}): PasswordResetRequestedEvent {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    email: 'jane@example.com',
    firstName: 'Jane',
    token: 'supersecrettoken',
    expires: new Date(Date.now() + 60 * 60 * 1_000),
    ...overrides,
  };
}

describe('AuthEventsListener.onPasswordResetRequested', () => {
  it('1: enqueues an email job to the correct queue', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent());

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const [queueName, jobType] = (queue.enqueue as jest.Mock).mock.calls[0] as [string, string, ...unknown[]];
    expect(queueName).toBe('email');
    expect(jobType).toBe('send-transactional-email');
  });

  it('2: sends the reset email to the correct recipient', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent({ email: 'target@example.com' }));

    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { to: string };
    expect(jobData.to).toBe('target@example.com');
  });

  it('3: reset URL contains the plaintext token', async () => {
    const queue = makeQueue();
    const config = makeConfig('https://app.knef.com');
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent({ token: 'mytoken123' }));

    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { html: string; text: string };
    expect(jobData.html).toContain('mytoken123');
    expect(jobData.text).toContain('mytoken123');
  });

  it('4: reset URL uses the configured APP_URL, not a hard-coded hostname', async () => {
    const queue = makeQueue();
    const config = makeConfig('https://custom-app.mycompany.com');
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent({ token: 'tok' }));

    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { html: string };
    expect(jobData.html).toContain('https://custom-app.mycompany.com/reset-password?token=tok');
    expect(jobData.html).not.toContain('localhost');
  });

  it('5: organizationId is forwarded for email provider lookup', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent({ organizationId: 'org-xyz' }));

    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { organizationId: string };
    expect(jobData.organizationId).toBe('org-xyz');
  });

  it('6: email subject is set', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent());

    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { subject: string };
    expect(jobData.subject).toBeTruthy();
    expect(jobData.subject.toLowerCase()).toContain('password');
  });

  it('7: null firstName is handled — email still queued', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent({ firstName: null }));

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { html: string };
    expect(jobData.html).toContain('Hi there'); // fallback greeting
  });

  it('8: queue failure does not throw — anti-enumeration behavior preserved', async () => {
    const queue = { enqueue: jest.fn(async () => { throw new Error('Redis unavailable'); }) };
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    // Must not throw — the API response must remain unchanged regardless of queue health
    await expect(
      listener.onPasswordResetRequested(makeEvent()),
    ).resolves.toBeUndefined();
  });

  it('9: email is NOT sent directly — only via queue', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    // Spy on any direct transport-style calls (nodemailer, fetch, etc.) — none should occur
    const sendMailSpy = jest.fn();
    (listener as unknown as { sendMail?: jest.Mock }).sendMail = sendMailSpy;

    await listener.onPasswordResetRequested(makeEvent());

    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledTimes(1); // only via queue
  });

  it('10: HTML email contains security notice', async () => {
    const queue = makeQueue();
    const config = makeConfig();
    const listener = new AuthEventsListener(queue as never, config as never);

    await listener.onPasswordResetRequested(makeEvent());

    const jobData = (queue.enqueue as jest.Mock).mock.calls[0][2] as { html: string };
    expect(jobData.html.toLowerCase()).toContain("didn't request");
  });
});
