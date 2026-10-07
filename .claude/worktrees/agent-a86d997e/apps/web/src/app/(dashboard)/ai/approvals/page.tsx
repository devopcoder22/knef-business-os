'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, AlertCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ApprovalAction {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  status: string;
  userId: string;
  tool: { name: string; category: string | null } | null;
}

interface Approval {
  id: string;
  decision: string | null;
  reason: string | null;
  requestedBy: string;
  reviewedBy: string | null;
  expiresAt: string;
  reviewedAt: string | null;
  createdAt: string;
  action: ApprovalAction;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
}

interface ApprovalsHistoryResponse {
  data: Approval[];
  meta: { total: number };
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function RejectModal({
  approvalId,
  onClose,
}: {
  approvalId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const rejectMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/ai/approvals/${approvalId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-approvals-pending'] });
      queryClient.invalidateQueries({ queryKey: ['ai-approvals-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ai-approvals-history'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Reject Action</h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this action is being rejected..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending || !reason.trim()}
            className="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalsContent() {
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const { data: stats } = useQuery<ApprovalStats>({
    queryKey: ['ai-approvals-stats'],
    queryFn: async () => {
      const res = await api().get<ApprovalStats>('/ai/approvals/stats');
      return res.data;
    },
  });

  const { data: pending, isLoading: pendingLoading } = useQuery<Approval[]>({
    queryKey: ['ai-approvals-pending'],
    queryFn: async () => {
      const res = await api().get<Approval[]>('/ai/approvals');
      return res.data;
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<ApprovalsHistoryResponse>({
    queryKey: ['ai-approvals-history'],
    queryFn: async () => {
      const res = await api().get<ApprovalsHistoryResponse>('/ai/approvals/history?limit=20');
      return res.data;
    },
    enabled: activeTab === 'history',
  });

  const approveMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      await api().post(`/ai/approvals/${approvalId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-approvals-pending'] });
      queryClient.invalidateQueries({ queryKey: ['ai-approvals-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ai-approvals-history'] });
    },
  });

  const DECISION_COLORS: Record<string, string> = {
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Approvals</h1>
        <p className="text-gray-500 text-sm mt-1">Review and approve AI tool executions</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Pending"
          value={stats?.pending ?? 0}
          color="bg-yellow-50"
          icon={<Clock size={20} className="text-yellow-600" />}
        />
        <StatCard
          label="Approved"
          value={stats?.approved ?? 0}
          color="bg-green-50"
          icon={<CheckCircle size={20} className="text-green-600" />}
        />
        <StatCard
          label="Rejected"
          value={stats?.rejected ?? 0}
          color="bg-red-50"
          icon={<XCircle size={20} className="text-red-500" />}
        />
        <StatCard
          label="Expired"
          value={stats?.expired ?? 0}
          color="bg-gray-50"
          icon={<AlertCircle size={20} className="text-gray-400" />}
        />
      </div>

      {/* Tab switch */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['pending', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors',
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Pending approvals table */}
      {activeTab === 'pending' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {pendingLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !pending || pending.length === 0 ? (
            <div className="py-14 text-center text-gray-400">
              <CheckCircle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pending approvals</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tool</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Parameters</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Requested By</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires At</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {approval.action.tool?.name ?? approval.action.action}
                      {approval.action.tool?.category && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                          {approval.action.tool.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono max-w-xs truncate">
                      {JSON.stringify(approval.action.parameters).slice(0, 60)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{approval.requestedBy.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(approval.expiresAt).toLocaleString('en-NG')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => approveMutation.mutate(approval.id)}
                          disabled={approveMutation.isPending}
                          className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectId(approval.id)}
                          className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg font-medium hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {historyLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !historyData?.data || historyData.data.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No history yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tool</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Decision</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reason</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reviewed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historyData.data.map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {approval.action.tool?.name ?? approval.action.action}
                    </td>
                    <td className="px-4 py-2.5">
                      {approval.decision ? (
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            DECISION_COLORS[approval.decision] ?? 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {approval.decision}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{approval.reason ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {approval.reviewedAt
                        ? new Date(approval.reviewedAt).toLocaleString('en-NG')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {rejectId && <RejectModal approvalId={rejectId} onClose={() => setRejectId(null)} />}
    </div>
  );
}

export default function AIApprovalsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <ApprovalsContent />
    </Suspense>
  );
}
