'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Mail, Users, TrendingUp, MousePointerClick, AlertTriangle, Send, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type CampaignStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'PAUSED' | 'CANCELLED' | 'FAILED';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  fromEmail: string | null;
  fromName: string | null;
  htmlContent: string | null;
  totalRecipients: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-teal-100 text-teal-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENDING: 'bg-yellow-100 text-yellow-700',
  SENT: 'bg-green-100 text-green-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-red-100 text-red-600',
  FAILED: 'bg-red-200 text-red-800',
};

const RECIPIENT_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  SENT: 'bg-green-100 text-green-700',
  OPENED: 'bg-blue-100 text-blue-700',
  CLICKED: 'bg-purple-100 text-purple-700',
  BOUNCED: 'bg-red-100 text-red-700',
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ['email-campaign', id],
    queryFn: async () => {
      const res = await api().get<{ data: Campaign }>(`/email-campaigns/${id}`);
      return res.data.data ?? (res.data as unknown as Campaign);
    },
  });

  interface RecipientsResponse {
    data: Recipient[];
    meta: { total: number };
  }

  const { data: recipientsData } = useQuery<RecipientsResponse>({
    queryKey: ['email-campaign-recipients', id],
    queryFn: async () => {
      const res = await api().get(`/email-campaigns/${id}/recipients`);
      const body = res.data as { data: RecipientsResponse | Recipient[] };
      const inner = body.data;
      if (Array.isArray(inner)) return { data: inner, meta: { total: inner.length } };
      return inner as RecipientsResponse;
    },
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: () => api().post(`/email-campaigns/${id}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaign', id] }),
  });

  const submitMutation = useMutation({
    mutationFn: () => api().post(`/email-campaigns/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaign', id] }),
  });

  const approveMutation = useMutation({
    mutationFn: () => api().post(`/email-campaigns/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaign', id] }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api().post(`/email-campaigns/${id}/reject`, { reason: 'Rejected by reviewer' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaign', id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api().post(`/email-campaigns/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaign', id] }),
  });

  if (isLoading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  if (!campaign) {
    return <div className="text-center py-12 text-gray-400">Campaign not found.</div>;
  }

  const openRate = campaign.sentCount > 0
    ? Math.round((campaign.openCount / campaign.sentCount) * 100)
    : 0;
  const clickRate = campaign.sentCount > 0
    ? Math.round((campaign.clickCount / campaign.sentCount) * 100)
    : 0;
  const bounceRate = campaign.sentCount > 0
    ? Math.round((campaign.bounceCount / campaign.sentCount) * 100)
    : 0;

  const recipients = recipientsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={cn('text-sm px-2 py-0.5 rounded-full font-medium', STATUS_STYLES[campaign.status])}>
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">{campaign.subject}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {campaign.status === 'DRAFT' && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-purple-300 text-purple-700 text-sm rounded-lg hover:bg-purple-50 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}
          {campaign.status === 'REVIEW' && (
            <>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-700 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </>
          )}
          {(campaign.status === 'APPROVED' || campaign.status === 'SCHEDULED') && (
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={16} />
              {sendMutation.isPending ? 'Sending...' : 'Send Now'}
            </button>
          )}
          {['DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED'].includes(campaign.status) && (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Users size={14} />
            Total Recipients
          </div>
          <p className="text-2xl font-bold text-gray-900">{campaign.totalRecipients.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Mail size={14} />
            Sent
          </div>
          <p className="text-2xl font-bold text-gray-900">{campaign.sentCount.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingUp size={14} />
            Open Rate
          </div>
          <p className="text-2xl font-bold text-gray-900">{openRate}%</p>
          <p className="text-xs text-gray-400">{campaign.openCount.toLocaleString()} opens</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <MousePointerClick size={14} />
            Click Rate
          </div>
          <p className="text-2xl font-bold text-gray-900">{clickRate}%</p>
          <p className="text-xs text-gray-400">{campaign.clickCount.toLocaleString()} clicks</p>
        </div>
      </div>

      {/* Recipients table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Recipients ({(recipientsData as RecipientsResponse | undefined)?.meta?.total ?? 0})
          </h2>
        </div>
        {recipients.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No recipients added yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recipients.map((r: Recipient) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-gray-900">{r.email}</td>
                  <td className="px-5 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', RECIPIENT_STATUS_STYLES[r.status] ?? 'bg-gray-100 text-gray-600')}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {r.sentAt ? new Date(r.sentAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
