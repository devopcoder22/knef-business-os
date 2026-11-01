'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { format } from 'date-fns';

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

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'APPROVAL_REQUIRED', label: 'Pending Approval' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'APPLIED', label: 'Applied' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, string> = {
  APPROVAL_REQUIRED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  APPLIED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  DRAFT: 'bg-gray-100 text-gray-500',
  SUBMITTED: 'bg-purple-100 text-purple-700',
};

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META: 'Meta Ads',
  TIKTOK: 'TikTok Ads',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

function ValueDiff({ prev, proposed }: { prev?: Record<string, unknown>; proposed?: Record<string, unknown> }) {
  if (!prev && !proposed) return <span className="text-gray-300 text-xs">—</span>;

  const keys = [...new Set([...Object.keys(prev ?? {}), ...Object.keys(proposed ?? {})])];
  if (keys.length === 0) return <span className="text-gray-300 text-xs">—</span>;

  return (
    <div className="space-y-0.5">
      {keys.slice(0, 3).map((k) => {
        const oldVal = prev?.[k];
        const newVal = proposed?.[k];
        if (oldVal === newVal) return null;
        return (
          <p key={k} className="text-xs font-mono">
            <span className="text-gray-500">{k}:</span>{' '}
            {oldVal !== undefined && <span className="text-red-500 line-through">{String(oldVal).slice(0, 20)}</span>}
            {oldVal !== undefined && newVal !== undefined && ' → '}
            {newVal !== undefined && <span className="text-green-600">{String(newVal).slice(0, 20)}</span>}
          </p>
        );
      })}
      {keys.length > 3 && <p className="text-xs text-gray-400">+{keys.length - 3} more fields</p>}
    </div>
  );
}

export default function AdvertisingActionsPage() {
  const queryClient = useQueryClient();
  const [statusTab, setStatusTab] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: 'approve' | 'cancel' } | null>(null);

  const { data: actionsRes, isLoading } = useQuery({
    queryKey: ['advertising-actions', statusTab],
    queryFn: async () => {
      const params = new URLSearchParams(statusTab ? { status: statusTab } : {});
      const res = await api().get<{ data: AdvertisingAction[]; total: number }>(`/advertising/actions?${params}`);
      return res.data;
    },
  });

  const actions: AdvertisingAction[] = actionsRes?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/advertising/actions/${id}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising-actions'] });
      setConfirmAction(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/advertising/actions/${id}/cancel`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertising-actions'] });
      setConfirmAction(null);
    },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Advertising Actions</h1>
        <p className="text-gray-500 text-sm mt-1">Review and approve pending advertising actions before they are sent to providers.</p>
      </div>

      {/* Safety banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          <strong>Approval required:</strong> Actions that increase spend (campaign activation, budget increase, bid changes)
          always require approval before any provider API is called.
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Actions table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 font-medium">No advertising actions yet.</p>
            <p className="text-gray-400 text-sm mt-1">Actions created from the Campaigns page will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Action Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Changes</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actions.map((action) => (
                  <tr key={action.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {PROVIDER_LABELS[action.provider] ?? action.provider}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-700">
                      {action.actionType}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={action.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ValueDiff prev={action.previousValue} proposed={action.proposedValue} />
                      {action.errorMessage && (
                        <p className="text-xs text-red-500 mt-1">{action.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {format(new Date(action.createdAt), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(action.status === 'APPROVAL_REQUIRED') && (
                          <>
                            <button
                              onClick={() => setConfirmAction({ id: action.id, type: 'approve' })}
                              className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setConfirmAction({ id: action.id, type: 'cancel' })}
                              className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-red-50 hover:text-red-600 font-medium"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {action.status === 'DRAFT' && (
                          <button
                            onClick={() => setConfirmAction({ id: action.id, type: 'cancel' })}
                            className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-red-50 hover:text-red-600 font-medium"
                          >
                            Cancel
                          </button>
                        )}
                        {!['APPROVAL_REQUIRED', 'DRAFT'].includes(action.status) && (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">
              {confirmAction.type === 'approve' ? 'Approve Action' : 'Cancel Action'}
            </h3>
            <p className="text-sm text-gray-600">
              {confirmAction.type === 'approve'
                ? 'Are you sure you want to approve this action? It will be queued for execution with the provider.'
                : 'Are you sure you want to cancel this action? This cannot be undone.'}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                No, go back
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'approve') {
                    approveMutation.mutate(confirmAction.id);
                  } else {
                    cancelMutation.mutate(confirmAction.id);
                  }
                }}
                disabled={approveMutation.isPending || cancelMutation.isPending}
                className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 text-white ${
                  confirmAction.type === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {approveMutation.isPending || cancelMutation.isPending
                  ? 'Processing…'
                  : confirmAction.type === 'approve'
                  ? 'Yes, Approve'
                  : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
