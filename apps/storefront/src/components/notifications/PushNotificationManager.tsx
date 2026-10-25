'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, BellRing, AlertCircle, CheckCircle } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store';

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';
type SubscribeState = 'idle' | 'loading' | 'subscribed' | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(Array.from(raw).map(char => char.charCodeAt(0)));
}

export function PushNotificationManager() {
  const { accessToken } = useCustomerStore();
  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [subscribeState, setSubscribeState] = useState<SubscribeState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PermissionState);
  }, []);

  const handleEnableClick = useCallback(() => {
    setShowExplanation(true);
  }, []);

  const handleConfirmEnable = useCallback(async () => {
    if (!accessToken) return;
    setShowExplanation(false);
    setSubscribeState('loading');
    setErrorMsg(null);

    try {
      // 1. Request permission — only on explicit user action
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== 'granted') {
        setSubscribeState('idle');
        return;
      }

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // 3. Fetch VAPID public key from BFF
      const vapidRes = await fetch('/api/push/vapid-key', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!vapidRes.ok) throw new Error('Failed to fetch VAPID key');
      const { publicKey } = await vapidRes.json() as { publicKey: string };

      // 4. Subscribe via PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      const sub = subscription.toJSON();
      const p256dhKey = sub.keys?.p256dh;
      const authKey = sub.keys?.auth;
      if (!sub.endpoint || !p256dhKey || !authKey) throw new Error('Incomplete subscription keys');

      // 5. Send subscription to BFF → API
      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dhKey,
          authKey,
          userAgent: navigator.userAgent,
        }),
      });
      if (!subRes.ok) throw new Error('Failed to register subscription with server');

      setSubscribeState('subscribed');
    } catch (err) {
      setSubscribeState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to enable notifications');
    }
  }, [accessToken]);

  const handleDisable = useCallback(async () => {
    if (!accessToken) return;
    setSubscribeState('loading');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribeState('idle');
    } catch {
      setSubscribeState('idle');
    }
  }, [accessToken]);

  // Check existing subscription on mount
  useEffect(() => {
    if (permission !== 'granted') return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        if (sub) setSubscribeState('subscribed');
      }),
    ).catch(() => {});
  }, [permission]);

  if (permission === 'unsupported') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <BellOff size={16} />
        <span>Push notifications are not supported in this browser.</span>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">Notifications are blocked</p>
          <p className="text-xs text-amber-700 mt-1">
            To enable push notifications, allow them in your browser settings for this site.
          </p>
        </div>
      </div>
    );
  }

  if (subscribeState === 'subscribed') {
    return (
      <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3">
          <CheckCircle size={18} className="text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Notifications enabled</p>
            <p className="text-xs text-green-700 mt-0.5">You will receive order updates on this device.</p>
          </div>
        </div>
        <button
          onClick={handleDisable}
          className="text-xs text-gray-500 hover:text-red-600 transition-colors ml-4 shrink-0"
        >
          Disable
        </button>
      </div>
    );
  }

  if (showExplanation) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3 mb-4">
          <BellRing size={18} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Enable order notifications</p>
            <p className="text-sm text-blue-700 mt-1">
              Get notified when your order is confirmed, dispatched, and delivered — directly in your browser.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleConfirmEnable}
            className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Enable notifications
          </button>
          <button
            onClick={() => setShowExplanation(false)}
            className="flex-1 bg-white text-gray-700 text-sm font-medium py-2 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center gap-3">
        <Bell size={18} className="text-gray-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-900">Push notifications</p>
          <p className="text-xs text-gray-500 mt-0.5">Get order updates directly in your browser.</p>
        </div>
      </div>
      <div className="ml-4 shrink-0">
        {subscribeState === 'error' && (
          <p className="text-xs text-red-600 mb-2">{errorMsg}</p>
        )}
        <button
          onClick={handleEnableClick}
          disabled={subscribeState === 'loading'}
          className="bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {subscribeState === 'loading' ? 'Enabling…' : 'Enable'}
        </button>
      </div>
    </div>
  );
}
