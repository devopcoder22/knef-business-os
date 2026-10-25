'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, CheckCircle, AlertCircle, Send, Users, BellOff, Shield } from 'lucide-react';
import { api } from '@/lib/api';

interface VapidKeyResponse { publicKey: string }
interface SubCountResponse { active: number; expired: number }
interface TestPushResponse { logId?: string; message?: string }

export default function PushAdminPage() {
  const [testUserId, setTestUserId] = useState('');
  const [testTitle, setTestTitle] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  const vapidQuery = useQuery<VapidKeyResponse>({
    queryKey: ['push-vapid-key'],
    queryFn: async () => {
      const res = await api().get('/communications/push/vapid-public-key');
      return (res.data as any).data ?? res.data;
    },
    retry: false,
  });

  const subCountQuery = useQuery<SubCountResponse>({
    queryKey: ['push-sub-count'],
    queryFn: async () => {
      const res = await api().get('/communications/push/subscription-count');
      return (res.data as any).data ?? res.data;
    },
    retry: false,
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post('/communications/push/test', {
        userId: testUserId,
        title: testTitle || 'Test Notification',
        body: testBody || 'This is a test push notification from KNEF.',
      });
      return (res.data as any) as TestPushResponse;
    },
    onSuccess: (d) => setTestResult(d?.message ?? `Queued (logId=${d?.logId ?? 'n/a'})`),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setTestResult(`Error: ${msg ?? 'Failed to send test push'}`);
    },
  });

  const vapidKey = vapidQuery.data?.publicKey ?? null;
  const isVapidConfigured = vapidKey !== null && vapidKey.length <= 100;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell size={24} className="text-blue-600" />
          Web Push Notifications
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Standards-compliant browser push via VAPID + RFC 8291 payload encryption.
        </p>
      </div>

      {/* VAPID Status */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Shield size={18} className="text-gray-500" />
          VAPID Configuration
        </h2>
        {vapidQuery.isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : isVapidConfigured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">VAPID keys configured (auto-generated)</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Public Key (safe to expose to browser)</p>
              <code className="text-xs bg-gray-100 rounded px-2 py-1 break-all block font-mono text-gray-700">
                {vapidKey}
              </code>
            </div>
            <p className="text-xs text-gray-400">
              Private key is encrypted at rest. Do not regenerate keys after users have subscribed — existing
              subscriptions will stop working.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            <AlertCircle size={16} />
            <span className="text-sm">
              VAPID keys not yet generated. Keys will be auto-generated on the first subscription request.
            </span>
          </div>
        )}
      </section>

      {/* Subscription Stats */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Users size={18} className="text-gray-500" />
          Subscriptions
        </h2>
        {subCountQuery.isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{subCountQuery.data?.active ?? 0}</p>
              <p className="text-sm text-blue-600 mt-1">Active subscriptions</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-gray-500">{subCountQuery.data?.expired ?? 0}</p>
              <p className="text-sm text-gray-500 mt-1">Expired / revoked</p>
            </div>
          </div>
        )}
      </section>

      {/* Test Push */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Send size={18} className="text-gray-500" />
          Test Notification
        </h2>
        <p className="text-sm text-gray-500">
          Send a test notification to a specific user ID. Only sends to active subscriptions for that user.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">User ID</label>
            <input
              type="text"
              value={testUserId}
              onChange={e => setTestUserId(e.target.value)}
              placeholder="cuid of user to notify"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={testTitle}
              onChange={e => setTestTitle(e.target.value)}
              placeholder="Test Notification"
              maxLength={100}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
            <input
              type="text"
              value={testBody}
              onChange={e => setTestBody(e.target.value)}
              placeholder="This is a test push notification."
              maxLength={200}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {testResult && (
            <div className={`rounded-lg px-4 py-2 text-sm ${testResult.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {testResult}
            </div>
          )}
          <button
            onClick={() => testMutation.mutate()}
            disabled={!testUserId.trim() || testMutation.isPending}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testMutation.isPending ? 'Sending…' : 'Send test notification'}
          </button>
        </div>
      </section>

      {/* Browser Requirements */}
      <section className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <BellOff size={18} className="text-gray-500" />
          Browser & Security Requirements
        </h2>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>HTTPS is required — push does not work over insecure HTTP in production.</li>
          <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Supported: Chrome, Firefox, Edge, Opera. Safari requires iOS 16.4+ / macOS Ventura+ with installed PWA.</li>
          <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Permission must be granted via explicit user action — never requested automatically.</li>
          <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Payloads are encrypted end-to-end (ECDH + AES-128-GCM per RFC 8291).</li>
          <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Subscriptions with 404/410 responses are automatically deactivated.</li>
          <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Marketing push requires ChannelPreference consent separate from browser permission.</li>
        </ul>
      </section>
    </div>
  );
}
