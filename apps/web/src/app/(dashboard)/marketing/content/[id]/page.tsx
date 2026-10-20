'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Draft {
  id: string;
  title: string;
  body: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  targetChannel: string;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  campaign: { id: string; name: string } | null;
  variants: Array<{
    id: string;
    platform: string;
    body: string | null;
    callToAction: string | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-50 text-gray-400',
};

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'SNAPCHAT', 'WHATSAPP', 'SMS', 'EMAIL', 'WEB_PUSH', 'STOREFRONT', 'TELEGRAM'];

export default function ContentDraftDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showVariantForm, setShowVariantForm] = useState(false);
  const [variantPlatform, setVariantPlatform] = useState('INSTAGRAM');
  const [variantBody, setVariantBody] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const { data: draft, isLoading } = useQuery<Draft>({
    queryKey: ['marketing-draft', id],
    queryFn: async () => {
      const res = await api().get<Draft>(`/marketing/content/${id}`);
      return res.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['marketing-draft', id] });

  const submitMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/submit-review`),
    onSuccess: invalidate,
  });

  const approveMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/approve`),
    onSuccess: invalidate,
  });

  const rejectMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/reject`),
    onSuccess: invalidate,
  });

  const scheduleMutation = useMutation({
    mutationFn: () =>
      api().post(`/marketing/content/${id}/schedule`, { scheduledAt, timezone: 'UTC' }),
    onSuccess: () => { invalidate(); setShowScheduleForm(false); },
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/cancel-schedule`),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: () => api().post(`/marketing/content/${id}/archive`),
    onSuccess: () => router.push('/marketing/content'),
  });

  const addVariantMutation = useMutation({
    mutationFn: () =>
      api().post(`/marketing/content/${id}/variants`, { platform: variantPlatform, body: variantBody }),
    onSuccess: () => { invalidate(); setShowVariantForm(false); setVariantBody(''); },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (variantId: string) =>
      api().delete(`/marketing/content/${id}/variants/${variantId}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <div className="text-gray-400 text-sm">Loading...</div>;
  if (!draft) return <div className="text-gray-400 text-sm">Draft not found</div>;

  const existingPlatforms = new Set(draft.variants.map((v) => v.platform));
  const availablePlatforms = PLATFORMS.filter((p) => !existingPlatforms.has(p));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{draft.title}</h1>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[draft.status])}>
                {draft.status}
              </span>
            </div>
            <p className="text-gray-500 text-sm">
              {draft.targetChannel}
              {draft.campaign && ` · ${draft.campaign.name}`}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end shrink-0">
          {draft.status === 'DRAFT' && (
            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
              className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
              Submit for Review
            </button>
          )}
          {draft.status === 'REVIEW' && (<>
            <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50">
              Reject
            </button>
          </>)}
          {draft.status === 'APPROVED' && (
            <button onClick={() => setShowScheduleForm(true)}
              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700">
              Schedule
            </button>
          )}
          {draft.status === 'SCHEDULED' && (
            <button onClick={() => cancelScheduleMutation.mutate()} disabled={cancelScheduleMutation.isPending}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50">
              Cancel Schedule
            </button>
          )}
          {!['PUBLISHED', 'ARCHIVED'].includes(draft.status) && (
            <button onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 font-medium">
              Archive
            </button>
          )}
        </div>
      </div>

      {showScheduleForm && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-purple-800">Schedule Publication</p>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="px-3 py-2 text-sm border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <div className="flex gap-2">
            <button onClick={() => scheduledAt && scheduleMutation.mutate()} disabled={!scheduledAt || scheduleMutation.isPending}
              className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
              Confirm
            </button>
            <button onClick={() => setShowScheduleForm(false)} className="px-3 py-1.5 text-xs text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {draft.scheduledAt && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-800">
          Scheduled: {new Date(draft.scheduledAt).toLocaleString()} ({draft.timezone})
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">Content</h2>
        {draft.body ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{draft.body}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No body written yet</p>
        )}
        {draft.callToAction && (
          <p className="text-xs text-blue-600 font-medium">CTA: {draft.callToAction}</p>
        )}
        {draft.destinationUrl && (
          <p className="text-xs text-gray-400 truncate">URL: {draft.destinationUrl}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Platform Variants</h2>
          {availablePlatforms.length > 0 && (
            <button onClick={() => { setVariantPlatform(availablePlatforms[0]!); setShowVariantForm(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              <Plus size={13} />
              Add Variant
            </button>
          )}
        </div>

        {showVariantForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
            <select value={variantPlatform} onChange={(e) => setVariantPlatform(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none">
              {availablePlatforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <textarea value={variantBody} onChange={(e) => setVariantBody(e.target.value)}
              rows={3} placeholder={`Write ${variantPlatform} specific copy...`}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={() => addVariantMutation.mutate()} disabled={addVariantMutation.isPending}
                className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Add
              </button>
              <button onClick={() => setShowVariantForm(false)} className="px-3 py-1.5 text-xs text-gray-500">
                Cancel
              </button>
            </div>
          </div>
        )}

        {draft.variants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No platform variants yet</p>
        ) : (
          <div className="space-y-3">
            {draft.variants.map((variant) => (
              <div key={variant.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-600 mb-1">{variant.platform}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{variant.body ?? '—'}</p>
                  {variant.callToAction && (
                    <p className="text-xs text-blue-600 mt-1">{variant.callToAction}</p>
                  )}
                </div>
                <button onClick={() => deleteVariantMutation.mutate(variant.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
