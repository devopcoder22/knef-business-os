'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { format } from 'date-fns';

interface AdvertisingAccount {
  id: string;
  organizationId: string;
  connectionId: string;
  provider: 'GOOGLE_ADS' | 'META' | 'TIKTOK';
  providerAccountId: string;
  displayName: string;
  currency: string;
  timezone: string;
  accountStatus: string;
  capabilities: string[];
  approvalStatus: string;
  lastSyncedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExternalConnection {
  id: string;
  provider: string;
  displayName: string;
  status: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META: 'Meta Ads',
  TIKTOK: 'TikTok Ads',
};

const PROVIDER_COLORS: Record<string, string> = {
  GOOGLE_ADS: 'bg-blue-100 text-blue-700',
  META: 'bg-indigo-100 text-indigo-700',
  TIKTOK: 'bg-pink-100 text-pink-700',
};

function ProviderBadge({ provider }: { provider: string }) {
  const cls = PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {PROVIDER_LABELS[provider] ?? provider}
    </span>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  const base = active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${base}`}>
      {active ? status || 'Active' : 'Inactive'}
    </span>
  );
}

export default function AdvertisingAccountsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    connectionId: '',
    provider: 'GOOGLE_ADS' as 'GOOGLE_ADS' | 'META' | 'TIKTOK',
    providerAccountId: '',
    displayName: '',
    currency: 'USD',
    timezone: 'UTC',
  });

  const { data: accountsRes, isLoading } = useQuery({
    queryKey: ['advertising-accounts'],
    queryFn: async () => {
      const res = await api().get<{ data: AdvertisingAccount[] }>('/advertising/accounts');
      return res.data;
    },
  });

  const { data: connectionsRes } = useQuery({
    queryKey: ['external-connections'],
    queryFn: async () => {
      const res = await api().get<{ data: ExternalConnection[] }>('/integrations/connections');
      return res.data;
    },
    enabled: showModal,
  });

  const accounts: AdvertisingAccount[] = accountsRes?.data ?? [];
  const connections: ExternalConnection[] = connectionsRes?.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/advertising/accounts', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising-accounts'] });
      setShowModal(false);
      resetForm();
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to link account');
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/advertising/accounts/${id}/sync`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising-accounts'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api().patch(`/advertising/accounts/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising-accounts'] });
    },
  });

  function resetForm() {
    setForm({ connectionId: '', provider: 'GOOGLE_ADS', providerAccountId: '', displayName: '', currency: 'USD', timezone: 'UTC' });
    setFormError('');
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Advertising Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">Link and manage your paid advertising accounts across providers.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          Link Account
        </button>
      </div>

      {/* Accounts list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 font-medium">No advertising accounts linked yet.</p>
            <p className="text-gray-400 text-sm mt-1">Link a connection to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Account</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Account ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Currency</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Approval</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Last Synced</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((acct) => (
                  <tr key={acct.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{acct.displayName}</td>
                    <td className="px-4 py-3"><ProviderBadge provider={acct.provider} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{acct.providerAccountId}</td>
                    <td className="px-4 py-3 text-gray-600">{acct.currency}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{acct.approvalStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={acct.accountStatus} active={acct.isActive} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {acct.lastSyncedAt ? format(new Date(acct.lastSyncedAt), 'MMM d, HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => syncMutation.mutate(acct.id)}
                          disabled={syncMutation.isPending}
                          title="Sync account"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate({ id: acct.id, isActive: !acct.isActive })}
                          disabled={toggleMutation.isPending}
                          className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                            acct.isActive
                              ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {acct.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Link Advertising Account</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Advertising accounts require separate OAuth scopes from social connections. Ensure your connection has
                  the correct advertising permissions before linking.
                </p>
              </div>

              {formError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{formError}</div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Connection</label>
                <select
                  value={form.connectionId}
                  onChange={(e) => setForm((f) => ({ ...f, connectionId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a connection…</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Ad Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as typeof form.provider }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="GOOGLE_ADS">Google Ads</option>
                  <option value="META">Meta Ads</option>
                  <option value="TIKTOK">TikTok Ads</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Provider Account ID</label>
                <input
                  type="text"
                  value={form.providerAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, providerAccountId: e.target.value }))}
                  placeholder="e.g. 123-456-7890 (Google), act_12345678 (Meta)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Display Name</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. KNEF Google Ads Account"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Currency</label>
                  <input
                    type="text"
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    placeholder="USD"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Timezone</label>
                  <input
                    type="text"
                    value={form.timezone}
                    onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                    placeholder="UTC"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.connectionId || !form.providerAccountId || !form.displayName}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Linking…' : 'Link Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
