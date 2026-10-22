'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, AlertTriangle, Info, Lock, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

interface StorefrontSetting {
  key: string;
  value: string;
}

const PUBLISHER_ID_REGEX = /^ca-pub-\d+$/;

const APPROVAL_STATUSES = [
  { value: 'NOT_CONFIGURED', label: 'Not Configured' },
  { value: 'CONFIGURED', label: 'Configured — Awaiting Google Review' },
  { value: 'PENDING_GOOGLE_APPROVAL', label: 'Pending Google Approval' },
  { value: 'ACTIVE', label: 'Active — Approved by Google' },
  { value: 'REJECTED', label: 'Rejected by Google' },
];

const MANDATORY_EXCLUDED_ROUTES = [
  '/cart',
  '/checkout',
  '/order',
  '/account',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function parseRoutes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // ignore
  }
  return [];
}

export default function MonetizationPage() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState('');
  const [publisherIdError, setPublisherIdError] = useState('');
  const [newRoute, setNewRoute] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [publisherId, setPublisherId] = useState('');
  const [autoAdsEnabled, setAutoAdsEnabled] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState('NOT_CONFIGURED');
  const [customRoutes, setCustomRoutes] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['storefront-settings'],
    queryFn: async () => {
      const res = await api().get('/settings/storefront');
      return (res.data as any).data ? res.data : (res.data as any);
    },
  });

  useEffect(() => {
    if (data) {
      const settings: StorefrontSetting[] = Array.isArray(data) ? data : (data as any).data ?? [];
      const get = (key: string) => settings.find((s) => s.key === key)?.value ?? '';

      setEnabled(get('adsense.enabled') === 'true');
      setPublisherId(get('adsense.publisherId'));
      setAutoAdsEnabled(get('adsense.autoAdsEnabled') === 'true');
      setApprovalStatus(get('adsense.approvalStatus') || 'NOT_CONFIGURED');

      const excluded = parseRoutes(get('adsense.excludedRoutes'));
      // Only keep user-added routes (not mandatory ones)
      setCustomRoutes(excluded.filter((r) => !MANDATORY_EXCLUDED_ROUTES.includes(r)));
    }
  }, [data]);

  const allExcludedRoutes = [...MANDATORY_EXCLUDED_ROUTES, ...customRoutes];

  const publisherIdValid = PUBLISHER_ID_REGEX.test(publisherId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (publisherId && !publisherIdValid) {
        throw new Error('Invalid Publisher ID format. Must be ca-pub- followed by digits only.');
      }

      const settings = [
        { key: 'adsense.enabled', value: String(enabled) },
        { key: 'adsense.publisherId', value: publisherId },
        { key: 'adsense.autoAdsEnabled', value: String(autoAdsEnabled) },
        { key: 'adsense.approvalStatus', value: approvalStatus },
        { key: 'adsense.excludedRoutes', value: JSON.stringify(allExcludedRoutes) },
      ];

      await api().post('/settings/storefront', { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storefront-settings'] });
      setSaved(true);
      setFormError('');
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: any) => {
      if (err.message === 'Invalid Publisher ID format. Must be ca-pub- followed by digits only.') {
        setPublisherIdError(err.message);
        return;
      }
      setFormError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to save');
    },
  });

  function addCustomRoute() {
    const route = newRoute.trim();
    if (!route.startsWith('/')) {
      return;
    }
    if (MANDATORY_EXCLUDED_ROUTES.includes(route) || customRoutes.includes(route)) return;
    setCustomRoutes((prev) => [...prev, route]);
    setNewRoute('');
  }

  function removeCustomRoute(route: string) {
    setCustomRoutes((prev) => prev.filter((r) => r !== route));
  }

  const pubIdForAdsTxt = publisherId.replace('ca-pub-', '');

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Storefront Monetization — Google AdSense</h1>
          <p className="text-gray-500 text-sm mt-1">Configure AdSense display advertising on your storefront.</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={15} />
          {saved ? 'Saved!' : saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* AdSense vs Google Ads clarification */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">AdSense is separate from Google Ads</p>
          <p className="text-sm text-blue-700 mt-1">
            AdSense is a Google publisher monetization product that lets you earn revenue by displaying ads on your storefront.
            It is completely separate from Google Ads (paid advertising). This page configures ad display on your storefront pages.
          </p>
        </div>
      </div>

      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Enable AdSense */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Enable AdSense</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, the AdSense script loads on eligible storefront pages.
                </p>
              </div>
              <Toggle value={enabled} onChange={setEnabled} />
            </div>
            {!enabled && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Disabling AdSense removes all ad code from your storefront immediately.
                </p>
              </div>
            )}
          </div>

          {/* Publisher ID */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Publisher ID</label>
              <input
                type="text"
                value={publisherId}
                onChange={(e) => {
                  setPublisherId(e.target.value);
                  setPublisherIdError('');
                }}
                placeholder="ca-pub-XXXXXXXXXXXXXXXX"
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  publisherIdError ? 'border-red-400 bg-red-50' : 'border-gray-200'
                }`}
              />
              {publisherIdError ? (
                <p className="text-xs text-red-600 mt-1">{publisherIdError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Must start with{' '}
                  <span className="font-mono">ca-pub-</span> followed by digits only.
                  {publisherId && !publisherIdValid && (
                    <span className="text-red-500"> — Invalid format</span>
                  )}
                  {publisherId && publisherIdValid && (
                    <span className="text-green-600"> — Valid</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Auto Ads — only shown when enabled and publisher ID is valid */}
          {enabled && publisherIdValid && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Enable Auto Ads</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Google automatically places ads in optimal positions across your storefront pages.
                  </p>
                </div>
                <Toggle value={autoAdsEnabled} onChange={setAutoAdsEnabled} />
              </div>
            </div>
          )}

          {/* Approval Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
            <label className="block text-sm font-medium text-gray-900">Site Approval Status</label>
            <select
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {APPROVAL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
              <Info size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500">
                This is an external status you must update manually after checking your AdSense dashboard.
                The system does not automatically verify site approval status with Google.
              </p>
            </div>
          </div>

          {/* Excluded Routes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Excluded Routes</label>
              <p className="text-xs text-gray-500">
                AdSense will not load on these routes. Protected routes (marked with a lock) cannot be removed.
              </p>
            </div>

            <div className="space-y-1.5">
              {MANDATORY_EXCLUDED_ROUTES.map((route) => (
                <div key={route} className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Lock size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-gray-600">{route}</span>
                  </div>
                  <span className="text-xs text-gray-400">Protected</span>
                </div>
              ))}
              {customRoutes.map((route) => (
                <div key={route} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg">
                  <span className="text-xs font-mono text-gray-700">{route}</span>
                  <button
                    onClick={() => removeCustomRoute(route)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newRoute}
                onChange={(e) => setNewRoute(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRoute(); } }}
                placeholder="/my-custom-page"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addCustomRoute}
                disabled={!newRoute.startsWith('/')}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium"
              >
                Add Route
              </button>
            </div>
            <p className="text-xs text-gray-400">Route must start with /</p>
          </div>

          {/* ads.txt status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-gray-600" />
              <h2 className="text-sm font-semibold text-gray-900">ads.txt Configuration</h2>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Expected ads.txt line</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="font-mono text-xs text-gray-700">
                  {publisherIdValid
                    ? `google.com, pub-${pubIdForAdsTxt}, DIRECT, f08c47fec0942fa0`
                    : 'Set a valid Publisher ID to see your ads.txt line'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-gray-500">ads.txt route</p>
                <p className="text-sm text-gray-800 mt-0.5">
                  <span className="font-mono text-xs">/ads.txt</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="mt-0.5">
                  {publisherIdValid ? (
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">Configured</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">Not configured</span>
                  )}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Your ads.txt file is automatically served at{' '}
              <span className="font-mono">/ads.txt</span>{' '}
              on your storefront. No additional configuration is needed.
            </p>
          </div>

          {/* Security notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <ShieldCheck size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              <strong>Security:</strong> Do not paste arbitrary JavaScript code here. AdSense configuration generates
              known-safe script markup from your Publisher ID only. The Publisher ID is validated to match the format
              <span className="font-mono"> ca-pub-</span> followed by digits before any script is rendered.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
