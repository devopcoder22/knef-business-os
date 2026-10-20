'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Draft {
  id: string;
  title: string;
  status: string;
  targetChannel: string;
  scheduledAt: string | null;
  campaign: { id: string; name: string } | null;
  _count: { variants: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-50 text-gray-400',
};

const STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];
const CHANNELS = ['EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'WEB_PUSH', 'SOCIAL', 'STOREFRONT', 'IN_APP'];

export default function ContentPage() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaignId') ?? '';

  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  const { data, isLoading } = useQuery<{ items: Draft[]; total: number }>({
    queryKey: ['marketing-content', campaignId, statusFilter, channelFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (campaignId) params.set('campaignId', campaignId);
      if (statusFilter) params.set('status', statusFilter);
      if (channelFilter) params.set('channel', channelFilter);
      const res = await api().get<{ items: Draft[]; total: number }>(
        `/marketing/content?${params}`,
      );
      return res.data;
    },
  });

  const newHref = campaignId
    ? `/marketing/content/new?campaignId=${campaignId}`
    : '/marketing/content/new';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total ?? 0} content drafts</p>
        </div>
        <Link
          href={newHref}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Content
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Channels</option>
          {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading content...</div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText size={32} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No content drafts found</p>
          <Link href={newHref} className="mt-3 text-sm text-blue-600 hover:underline">
            Create your first content draft
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.items ?? []).map((draft) => (
            <Link
              key={draft.id}
              href={`/marketing/content/${draft.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{draft.title}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[draft.status] ?? 'bg-gray-100 text-gray-600')}>
                      {draft.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {draft.targetChannel}
                    {draft.campaign && ` · ${draft.campaign.name}`}
                    {draft._count.variants > 0 && ` · ${draft._count.variants} variant${draft._count.variants !== 1 ? 's' : ''}`}
                  </p>
                </div>
                {draft.scheduledAt && (
                  <p className="text-xs text-purple-600 shrink-0">
                    {new Date(draft.scheduledAt).toLocaleString()}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
