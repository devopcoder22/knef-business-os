'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertTriangle, Mail } from 'lucide-react';
import { publicApiClient } from '@/lib/api';

const LIST_LABELS: Record<string, string> = {
  GENERAL_MARKETING: 'General Marketing',
  NEWSLETTERS: 'Newsletters',
  PROMOTIONS: 'Promotions',
  PRODUCT_UPDATES: 'Product Updates',
};

interface Preferences {
  email: string;
  subscriptions: Record<string, string>;
}

type PageState = 'loading' | 'loaded' | 'error' | 'saved' | 'unsubscribed_all';

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<PageState>('loading');
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [localPrefs, setLocalPrefs] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    publicApiClient.get(`/email/preferences/${token}`)
      .then((res) => {
        const data = (res.data as { data?: Preferences }).data ?? res.data as Preferences;
        setPrefs(data);
        const initial: Record<string, boolean> = {};
        for (const [list, status] of Object.entries(data.subscriptions)) {
          initial[list] = status === 'SUBSCRIBED';
        }
        setLocalPrefs(initial);
        setState('loaded');
      })
      .catch(() => {
        setState('error');
        setErrorMsg('This unsubscribe link is invalid or has expired. Please contact support.');
      });
  }, [token]);

  const handleUnsubscribeAll = async () => {
    setSaving(true);
    try {
      await publicApiClient.post(`/email/unsubscribe/${token}`);
      setState('unsubscribed_all');
    } catch {
      setErrorMsg('Failed to unsubscribe. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      await publicApiClient.post(`/email/preferences/${token}`, { preferences: localPrefs });
      setState('saved');
    } catch {
      setErrorMsg('Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <span className="text-white font-black text-lg">K</span>
          </div>
          <div>
            <p className="font-bold text-sm">KNEF Gadgets</p>
            <p className="text-xs text-gray-400">Email Preferences</p>
          </div>
        </div>

        {state === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
        )}

        {state === 'error' && (
          <div className="text-center">
            <AlertTriangle size={40} className="text-red-400 mx-auto mb-3" />
            <h2 className="font-semibold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-sm text-gray-500">{errorMsg}</p>
          </div>
        )}

        {(state === 'saved' || state === 'unsubscribed_all') && (
          <div className="text-center">
            <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
            <h2 className="font-semibold text-gray-900 mb-2">
              {state === 'unsubscribed_all' ? 'Unsubscribed' : 'Preferences Saved'}
            </h2>
            <p className="text-sm text-gray-500">
              {state === 'unsubscribed_all'
                ? 'You have been removed from all marketing lists.'
                : 'Your email preferences have been updated.'}
            </p>
            {prefs && (
              <p className="text-xs text-gray-400 mt-2">
                Email: {prefs.email}
              </p>
            )}
          </div>
        )}

        {state === 'loaded' && prefs && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Email Preferences</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Mail size={13} />
                {prefs.email}
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Choose which emails you'd like to receive:
            </p>

            <div className="space-y-3 mb-6">
              {Object.entries(LIST_LABELS).map(([list, label]) => (
                <label key={list} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={localPrefs[list] ?? false}
                    onChange={(e) => setLocalPrefs((p) => ({ ...p, [list]: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</p>
                  </div>
                </label>
              ))}
            </div>

            {errorMsg && (
              <p className="text-sm text-red-600 mb-3">{errorMsg}</p>
            )}

            <button
              onClick={handleSavePreferences}
              disabled={saving}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Save Preferences
            </button>

            <button
              onClick={handleUnsubscribeAll}
              disabled={saving}
              className="w-full py-2 text-red-600 text-sm font-medium hover:underline disabled:opacity-50"
            >
              Unsubscribe from all marketing emails
            </button>
          </>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">
          Note: Unsubscribing from marketing will not affect order confirmations, receipts, or security emails.
        </p>
      </div>
    </div>
  );
}
