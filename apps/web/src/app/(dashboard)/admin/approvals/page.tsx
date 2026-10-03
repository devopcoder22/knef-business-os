'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Clock, CheckSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface AIAction {
  id: string;
  toolName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  riskLevel: string;
  arguments: Record<string, unknown>;
  result: unknown;
  createdAt: string;
  approvedAt: string | null;
  triggeredBy: string;
  callerType: string;
  requestId: string;
}

interface AIActionsResponse {
  data: AIAction[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const TABS = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
type Tab = (typeof TABS)[number];

const RISK_STYLES: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
  CRITICAL: 'bg-red-200 text-red-800',
};

const STATUS_STYLES: Record<Tab, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export default function ApprovalsPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const canApprove = hasPermission(PERMISSIONS.AI.APPROVALS);

  const [tab, setTab] = useState<Tab>('PENDING');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<AIActionsResponse>({
    queryKey: ['ai-actions', tab, page],
    queryFn: async () => {
      const params = new URLSearchParams({ status: tab, page: String(page), limit: '20' });
      const res = await api().get<AIActionsResponse>(`/ai-actions?${params}`);
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/ai-actions/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().post(`/ai-actions/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Action Approvals</h1>
        <p className="text-gray-500 text-sm mt-1">
          Review and approve high-risk AI-initiated actions
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))
        ) : data?.data.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <CheckSquare size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400 text-sm">
              No {tab.toLowerCase()} actions
            </p>
          </div>
        ) : (
          data?.data.map((action) => (
            <div
              key={action.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-900 text-sm font-mono">
                      {action.toolName}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        RISK_STYLES[action.riskLevel] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {action.riskLevel} risk
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[action.status]
                      }`}
                    >
                      {action.status === 'PENDING' && <Clock size={10} className="inline mr-1" />}
                      {action.status === 'APPROVED' && <CheckCircle size={10} className="inline mr-1" />}
                      {action.status === 'REJECTED' && <XCircle size={10} className="inline mr-1" />}
                      {action.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500 mb-3">
                    <span>
                      Triggered by: <span className="font-medium text-gray-700">{action.triggeredBy}</span>
                    </span>
                    <span>
                      Caller: <span className="font-medium text-gray-700">{action.callerType}</span>
                    </span>
                    <span>
                      Requested:{' '}
                      <span className="font-medium text-gray-700">
                        {format(new Date(action.createdAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    </span>
                    {action.approvedAt && (
                      <span>
                        Resolved:{' '}
                        <span className="font-medium text-gray-700">
                          {format(new Date(action.approvedAt), 'MMM d, yyyy HH:mm')}
                        </span>
                      </span>
                    )}
                  </div>

                  {Object.keys(action.arguments).length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
                        Arguments
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-700 overflow-x-auto text-xs">
                        {JSON.stringify(action.arguments, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>

                {canApprove && action.status === 'PENDING' && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => approveMutation.mutate(action.id)}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button
                      onClick={() => rejectMutation.mutate(action.id)}
                      disabled={rejectMutation.isPending}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {data.meta.total} total
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
              disabled={page === data.meta.totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
