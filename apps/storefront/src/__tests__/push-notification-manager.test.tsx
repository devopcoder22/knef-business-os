/**
 * @jest-environment jsdom
 */
// Tests for PushNotificationManager component behaviour.
// Exercises the permission state machine, user-initiated flow, and subscription
// lifecycle without any real browser push infrastructure.

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PushNotificationManager } from '@/components/notifications/PushNotificationManager';

// ── Zustand store mock ─────────────────────────────────────────────────────────
jest.mock('@/stores/customer.store', () => ({
  useCustomerStore: jest.fn(() => ({ accessToken: 'test-token' })),
}));
import { useCustomerStore } from '@/stores/customer.store';

// ── Browser API factories ──────────────────────────────────────────────────────

function makePushSubscription(endpoint = 'https://push.example.com/sub-1') {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: 'dummyP256DH', auth: 'dummyAuth' },
    }),
    unsubscribe: jest.fn(async () => true),
  };
}

function mockNotificationAPI(permission: NotificationPermission) {
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: {
      permission,
      requestPermission: jest.fn(async () => permission),
    },
  });
}

function mockServiceWorkerReady(subscription: ReturnType<typeof makePushSubscription> | null = null) {
  const mockPushManager = {
    subscribe: jest.fn(async () => makePushSubscription()),
    getSubscription: jest.fn(async () => subscription),
  };
  const mockRegistration = {
    pushManager: mockPushManager,
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    writable: true,
    value: {
      register: jest.fn(async () => mockRegistration),
      ready: Promise.resolve(mockRegistration),
    },
  });

  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    writable: true,
    value: function PushManager() {},
  });

  return { mockPushManager, mockRegistration };
}

function mockFetchSuccess() {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: 'BNNd0Q5bAfmjuQS2DH73f4wq3MZJZ9vN1L1cNmGxQTqIfxaE4D1e3Km5hGb7F8s4E2pWrX9C0tO' }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'sub-1' }),
    } as Response);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function setupFullBrowserEnvironment(permission: NotificationPermission = 'default') {
  mockNotificationAPI(permission);
  const sw = mockServiceWorkerReady();
  mockFetchSuccess();
  return sw;
}

function removeServiceWorker() {
  // Delete the property entirely so `'X' in window` returns false
  // (setting to undefined still makes the property exist)
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (useCustomerStore as unknown as jest.Mock).mockReturnValue({ accessToken: 'test-token' });
});

afterEach(() => {
  // Reset browser API stubs between tests to prevent cross-test contamination
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
});

describe('PushNotificationManager', () => {
  describe('unsupported browser', () => {
    it('shows unsupported state when serviceWorker / PushManager / Notification are absent', () => {
      removeServiceWorker();
      render(<PushNotificationManager />);
      expect(screen.getByText(/not supported/i)).toBeInTheDocument();
    });
  });

  describe('permission: default', () => {
    beforeEach(() => setupFullBrowserEnvironment('default'));

    it('renders the Enable button (default permission — not auto-subscribed)', () => {
      render(<PushNotificationManager />);
      expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
    });

    it('does NOT call Notification.requestPermission on mount', () => {
      render(<PushNotificationManager />);
      expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('explicit user interaction → explanation screen', () => {
    beforeEach(() => setupFullBrowserEnvironment('default'));

    it('clicking Enable shows the explanation / confirmation screen', () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      expect(screen.getByText(/enable order notifications/i)).toBeInTheDocument();
    });

    it('Notification.requestPermission is NOT called until user clicks the confirm button', () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    });

    it('clicking "Not now" dismisses explanation without requesting permission', () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      fireEvent.click(screen.getByRole('button', { name: /not now/i }));
      expect(window.Notification.requestPermission).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^enable$/i })).toBeInTheDocument();
    });
  });

  describe('permission granted → subscription flow', () => {
    beforeEach(() => {
      mockNotificationAPI('granted');
      mockServiceWorkerReady();
      mockFetchSuccess();
    });

    it('requests permission only after clicking the confirm button', async () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      fireEvent.click(screen.getByRole('button', { name: /enable notifications/i }));
      await waitFor(() => expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1));
    });

    it('registers service worker at /sw.js with scope /', async () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      fireEvent.click(screen.getByRole('button', { name: /enable notifications/i }));
      await waitFor(() =>
        expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' }),
      );
    });

    it('sends subscription data to /api/push/subscribe via BFF (no userId/orgId from client)', async () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      fireEvent.click(screen.getByRole('button', { name: /enable notifications/i }));

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/push/subscribe',
          expect.objectContaining({ method: 'POST' }),
        ),
      );

      const subscribeCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url]: [string]) => url === '/api/push/subscribe',
      );
      const body = JSON.parse(subscribeCall![1].body as string);
      expect(body).toHaveProperty('endpoint');
      expect(body).toHaveProperty('p256dhKey');
      expect(body).toHaveProperty('authKey');
      // Client must NOT supply userId or organizationId
      expect(body).not.toHaveProperty('userId');
      expect(body).not.toHaveProperty('organizationId');
    });

    it('shows subscribed state after successful subscription', async () => {
      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      fireEvent.click(screen.getByRole('button', { name: /enable notifications/i }));
      await waitFor(() => expect(screen.getByText(/notifications enabled/i)).toBeInTheDocument());
    });
  });

  describe('permission denied', () => {
    beforeEach(() => {
      mockNotificationAPI('denied');
      mockServiceWorkerReady();
    });

    it('shows blocked state when permission is denied', () => {
      render(<PushNotificationManager />);
      expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument();
    });

    it('does not automatically request permission when already denied', () => {
      render(<PushNotificationManager />);
      expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    });
  });

  describe('existing subscription on mount', () => {
    it('shows subscribed state when an active subscription exists', async () => {
      mockNotificationAPI('granted');
      const existingSub = makePushSubscription();
      mockServiceWorkerReady(existingSub);

      render(<PushNotificationManager />);
      await waitFor(() => expect(screen.getByText(/notifications enabled/i)).toBeInTheDocument());
    });
  });

  describe('unsubscribe flow', () => {
    it('calls browser unsubscribe and DELETE /api/push/unsubscribe', async () => {
      mockNotificationAPI('granted');
      const existingSub = makePushSubscription();
      mockServiceWorkerReady(existingSub);

      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

      render(<PushNotificationManager />);
      await waitFor(() => screen.getByText(/notifications enabled/i));

      fireEvent.click(screen.getByRole('button', { name: /disable/i }));

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/push/unsubscribe',
          expect.objectContaining({ method: 'DELETE' }),
        ),
      );
      await waitFor(() => expect(existingSub.unsubscribe).toHaveBeenCalled());
    });
  });

  describe('no access token', () => {
    it('does not attempt subscription when accessToken is absent', async () => {
      (useCustomerStore as unknown as jest.Mock).mockReturnValue({ accessToken: null });
      mockNotificationAPI('default');
      mockServiceWorkerReady();

      render(<PushNotificationManager />);
      fireEvent.click(screen.getByRole('button', { name: /^enable$/i }));
      fireEvent.click(screen.getByRole('button', { name: /enable notifications/i }));

      // No permission request — early return due to missing token
      await act(async () => {});
      expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    });
  });
});
