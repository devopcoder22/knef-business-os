'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '@/lib/api';
import { format } from 'date-fns';

interface AdvertisingAccount {
  id: string;
  provider: string;
  displayName: string;
}

interface AdvertisingCampaign {
  id: string;
  organizationId: string;
  advertisingAccountId: string;
  provider: string;
  providerCampaignId: string;
  name: string;
  status: string;
  objective?: string;
  budgetType?: string;
  budgetAmountMicros?: string;
  currency?: string;
  startDate?: string;
  endDate?: string;
  providerStatus?: string;
  lastSyncedAt?: string;
}

interface AdvertisingAction {
  id: string;
  provider: string;
  advertisingAccountId: string;
  campaignId?: string;
  actionType: string;
  status: string;
  requestPayload: Record<string, unknown>;
  previousValue?: Record<string, unknown>;
  proposedValue?: Record<string, unknown>;
  errorMessage?: string;
  requestedById: string;
  approvedById?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
  REMOVED: 'bg-red-100 text-red-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
  UNKNOWN: 'bg-gray-100 text-gray-400',
};

const PROVIDER_COLORS: Record<string, string> = {
  GOOGLE_ADS: 'bg-blue-100 text-blue-700',
  META: 'bg-indigo-100 text-indigo-700',
  TIKTOK: 'bg-pink-100 text-pink-700',
};

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META: 'Meta Ads',
  TIKTOK: 'TikTok Ads',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

function ProviderBadge({ provider }: { provider: string }) {
  const cls = PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {PROVIDER_LABELS[provider] ?? provider}
    </span>
  );
}

function formatBudget(micros?: string, currency?: string): string {
  if (!micros) return '—';
  const amount = (parseInt(micros, 10) / 1_000_000).toFixed(2);
  return currency ? `${currency} ${amount}` : amount;
}

const PAGE_SIZE = 20;

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showActionPanel, setShowActionPanel] = useState(false);
  const [actionType, setActionType] = useState('CAMPAIGN_PAUSE');
  const [actionError, setActionError] = useState('');

  const { data: accountsRes } = useQuery({
    queryKey: ['advertising-accounts'],
    queryFn: async () => {
      const res = await api().get<{ data: AdvertisingAccount[] }>('/advertising/accounts');
      return res.data;
    },
  });

  const accounts: AdvertisingAccount[] = accountsRes?.data ?? [];

  const params = new URLSearchParams({
    skip: String(page * PAGE_SIZE),
    take: String(PAGE_SIZE),
    ...(providerFilter && { provider: providerFilter }),
    ...(statusFilter && { status: statusFilter }),
    ...(accountFilter && { accountId: accountFilter }),
  });

  const { data: campaignsRes, isLoading } = useQuery({
    queryKey: ['advertising-campaigns', providerFilter, statusFilter, accountFilter, page],
    queryFn: async () => {
      const res = await api().get<{ data: AdvertisingCampaign[]; total: number }>(`/advertising/campaigns?${params}`);
      return res.data;
    },
  });

  const campaigns: AdvertisingCampaign[] = campaignsRes?.data ?? [];
  const total: number = campaignsRes?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  const createActionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCampaign) return;
      await api().post('/advertising/actions', {
        provider: selectedCampaign.provider,
        advertisingAccountId: selectedCampaign.advertisingAccountId,
        campaignId: selectedCampaign.id,
        actionType,
        requestPayload: { campaignId: selectedCampaign.id, actionType },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising-actions'] });
      setShowActionPanel(false);
      setActionError('');
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to create action');
    },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <p className="text-gray-500 text-sm mt-1">View synced advertising campaigns across all linked accounts.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        <select
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Providers</option>
          <option value="GOOGLE_ADS">Google Ads</option>
          <option value="META">Meta Ads</option>
          <option value="TIKTOK">TikTok Ads</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="REMOVED">Removed</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <select
          value={accountFilter}
          onChange={(e) => { setAccountFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName}</option>
          ))}
        </select>
      </div>

      {/* Campaigns table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 font-medium">No campaigns synced yet.</p>
            <p className="text-gray-400 text-sm mt-1">Link an advertising account and trigger a sync to see campaigns.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Account</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Budget</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Budget Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.map((c) => {
                  const acct = accounts.find((a) => a.id === c.advertisingAccountId);
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3"><ProviderBadge provider={c.provider} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{acct?.displayName ?? c.advertisingAccountId}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-gray-600">{formatBudget(c.budgetAmountMicros, c.currency)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.budgetType ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {c.lastSyncedAt ? format(new Date(c.lastSyncedAt), 'MMM d, HH:mm') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">{total} total campaigns</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-500">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Campaign detail panel */}
      {selectedCampaign && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Campaign Detail — {selectedCampaign.name}</h2>
            <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Provider', value: <ProviderBadge provider={selectedCampaign.provider} /> },
              { label: 'Status', value: <StatusBadge status={selectedCampaign.status} /> },
              { label: 'Provider Campaign ID', value: <span className="font-mono text-xs">{selectedCampaign.providerCampaignId}</span> },
              { label: 'Objective', value: selectedCampaign.objective ?? '—' },
              { label: 'Budget', value: formatBudget(selectedCampaign.budgetAmountMicros, selectedCampaign.currency) },
              { label: 'Budget Type', value: selectedCampaign.budgetType ?? '—' },
              { label: 'Start Date', value: selectedCampaign.startDate ?? '—' },
              { label: 'End Date', value: selectedCampaign.endDate ?? '—' },
              { label: 'Provider Status', value: selectedCampaign.providerStatus ?? '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className="text-gray-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Request Action */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Request Campaign Action</h3>
              <button
                onClick={() => setShowActionPanel(!showActionPanel)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {showActionPanel ? 'Cancel' : 'New Action'}
              </button>
            </div>

            {showActionPanel && (
              <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500">
                  Actions that activate or modify campaigns require approval before any provider API call is made.
                </p>

                {actionError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{actionError}</div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">Action Type</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CAMPAIGN_PAUSE">Pause Campaign</option>
                    <option value="CAMPAIGN_ENABLE">Enable Campaign (requires approval)</option>
                  </select>
                </div>

                <button
                  onClick={() => createActionMutation.mutate()}
                  disabled={createActionMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {createActionMutation.isPending ? 'Submitting…' : 'Submit Action Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
