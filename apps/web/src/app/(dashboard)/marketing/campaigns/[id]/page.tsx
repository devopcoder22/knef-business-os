'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  objective: string;
  status: string;
  channels: string[];
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  targetSegment: { id: string; name: string } | null;
  contentDrafts: Array<{ id: string; title: string; status: string; targetChannel: string; scheduledAt: string | null }>;
  _count: { contentDrafts: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-teal-100 text-teal-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const DRAFT_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'text-gray-500',
  REVIEW: 'text-amber-600',
  APPROVED: 'text-blue-600',
  SCHEDULED: 'text-purple-600',
  PUBLISHED: 'text-green-600',
  ARCHIVED: 'text-gray-400',
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: campaign, isLoading } = useQuery<Campaign>({
    queryKey: ['marketing-campaign', id],
    queryFn: async () => {
      const res = await api().get<Campaign>(`/marketing/campaigns/${id}`);
      return res.data;
    },
  });

  function makeAction(action: string) {
    return useMutation({
      mutationFn: () => api().post(`/marketing/campaigns/${id}/${action}`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-campaign', id] }),
    });
  }

  const submitMutation = makeAction('submit-review');
  const approveMutation = makeAction('approve');
  const activateMutation = makeAction('activate');
  const pauseMutation = makeAction('pause');
  const cancelMutation = makeAction('cancel');

  if (isLoading) return <div className="text-gray-400 text-sm">Loading...</div>;
  if (!campaign) return <div className="text-gray-400 text-sm">Campaign not found</div>;

  const canSubmit = campaign.status === 'DRAFT';
  const canApprove = campaign.status === 'REVIEW';
  const canActivate = campaign.status === 'APPROVED';
  const canPause = campaign.status === 'ACTIVE';
  const canCancel = !['CANCELLED', 'COMPLETED'].includes(campaign.status);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{campaign.name}</h1>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[campaign.status])}>
                {campaign.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm">{campaign.objective.replace(/_/g, ' ')}</p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {canSubmit && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              Submit for Review
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Approve
            </button>
          )}
          {canActivate && (
            <button
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Activate
            </button>
          )}
          {canPause && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => canCancel && cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg font-medium hover:bg-red-200 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {campaign.description && (
            <p className="text-sm text-gray-700">{campaign.description}</p>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {campaign.channels.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Channels</p>
                <div className="flex flex-wrap gap-1">
                  {campaign.channels.map((ch) => (
                    <span key={ch} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{ch}</span>
                  ))}
                </div>
              </div>
            )}
            {campaign.targetSegment && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Audience</p>
                <p className="text-gray-800 font-medium">{campaign.targetSegment.name}</p>
              </div>
            )}
            {campaign.startDate && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Start Date</p>
                <p className="text-gray-800">{new Date(campaign.startDate).toLocaleDateString()}</p>
              </div>
            )}
            {campaign.endDate && (
              <div>
                <p className="text-xs text-gray-400 mb-1">End Date</p>
                <p className="text-gray-800">{new Date(campaign.endDate).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {campaign.notes && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-600">{campaign.notes}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 mb-2">Content Pieces</p>
          <p className="text-3xl font-bold text-gray-900">{campaign._count.contentDrafts}</p>
          <Link
            href={`/marketing/content?campaignId=${campaign.id}`}
            className="block mt-3 text-xs text-blue-600 hover:underline"
          >
            View all content →
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Content Drafts</h2>
          <Link
            href={`/marketing/content/new?campaignId=${campaign.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            <Plus size={13} />
            Add Content
          </Link>
        </div>

        {campaign.contentDrafts.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <FileText size={28} className="text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No content drafts yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaign.contentDrafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/marketing/content/${draft.id}`}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{draft.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{draft.targetChannel}</p>
                </div>
                <span className={cn('text-xs font-medium', DRAFT_STATUS_COLORS[draft.status] ?? 'text-gray-500')}>
                  {draft.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
