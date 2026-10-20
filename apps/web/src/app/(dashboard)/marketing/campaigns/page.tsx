'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search, Megaphone, Sparkles, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CampaignIdea {
  name: string;
  concept: string;
  objective: string;
  keyMessage: string;
  recommendedChannels: string[];
  contentIdeas: string[];
  callToAction: string;
}

interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  channels: string[];
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  targetSegment: { id: string; name: string } | null;
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

const STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  // AI ideas state
  const [showIdeasPanel, setShowIdeasPanel] = useState(false);
  const [ideasObjective, setIdeasObjective] = useState('');
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideas, setIdeas] = useState<CampaignIdea[]>([]);
  const [ideasError, setIdeasError] = useState('');

  const { data, isLoading } = useQuery<{ items: Campaign[]; total: number }>({
    queryKey: ['marketing-campaigns', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api().get<{ items: Campaign[]; total: number }>(
        `/marketing/campaigns?${params}`,
      );
      return res.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api().post(`/marketing/campaigns/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] }),
  });

  const items = (data?.items ?? []).filter((c) =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total ?? 0} total campaigns</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowIdeasPanel((v) => !v); setIdeas([]); setIdeasError(''); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              showIdeasPanel
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50',
            )}
          >
            <Sparkles size={15} />
            AI Ideas
          </button>
          <Link
            href="/marketing/campaigns/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} />
            New Campaign
          </Link>
        </div>
      </div>

      {/* ── AI Campaign Ideas Panel ── */}
      {showIdeasPanel && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-violet-600" />
              <p className="text-sm font-semibold text-violet-800">AI Campaign Ideas</p>
              <span className="text-xs text-violet-500 bg-violet-100 px-1.5 py-0.5 rounded">Suggestions for review — not auto-created</span>
            </div>
            <button onClick={() => setShowIdeasPanel(false)} className="text-gray-400 hover:text-gray-600">
              <X size={15} />
            </button>
          </div>
          <div className="flex gap-3">
            <input
              value={ideasObjective}
              onChange={(e) => setIdeasObjective(e.target.value)}
              placeholder="Campaign objective (e.g. product launch, seasonal sale, re-engagement...)"
              className="flex-1 px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none bg-white"
            />
            <button
              disabled={ideasLoading}
              onClick={async () => {
                setIdeasError('');
                setIdeas([]);
                setIdeasLoading(true);
                try {
                  const res = await api().post<{ ideas: CampaignIdea[] }>('/marketing/ai/campaign-ideas', {
                    objective: ideasObjective || undefined,
                  });
                  setIdeas(Array.isArray(res.data.ideas) ? res.data.ideas : []);
                } catch (e: unknown) {
                  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                  setIdeasError(typeof msg === 'string' ? msg : 'AI unavailable — check provider configuration.');
                } finally {
                  setIdeasLoading(false);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50 shrink-0"
            >
              {ideasLoading ? <><RotateCcw size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> Generate</>}
            </button>
          </div>

          {ideasError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{ideasError}</p>
          )}

          {ideas.length > 0 && (
            <div className="space-y-3">
              {ideas.map((idea, i) => (
                <div key={i} className="bg-white border border-violet-100 rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{idea.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{idea.concept}</p>
                    </div>
                    <Link
                      href={`/marketing/campaigns/new`}
                      className="shrink-0 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Use this
                    </Link>
                  </div>
                  <p className="text-xs text-gray-700"><span className="font-medium">Key message:</span> {idea.keyMessage}</p>
                  {idea.contentIdeas.length > 0 && (
                    <ul className="text-xs text-gray-600 list-disc list-inside space-y-0.5">
                      {idea.contentIdeas.slice(0, 3).map((ci, j) => <li key={j}>{ci}</li>)}
                    </ul>
                  )}
                  {idea.recommendedChannels.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {idea.recommendedChannels.map((ch) => (
                        <span key={ch} className="text-xs px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded">{ch}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading campaigns...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <Megaphone size={32} className="text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">No campaigns found</p>
          <Link href="/marketing/campaigns/new" className="mt-3 text-sm text-blue-600 hover:underline">
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/marketing/campaigns/${campaign.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{campaign.name}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_COLORS[campaign.status] ?? 'bg-gray-100 text-gray-600')}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {campaign.objective.replace(/_/g, ' ')}
                    {campaign.targetSegment && ` · ${campaign.targetSegment.name}`}
                    {campaign.channels.length > 0 && ` · ${campaign.channels.join(', ')}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{campaign._count.contentDrafts} draft{campaign._count.contentDrafts !== 1 ? 's' : ''}</p>
                  {(campaign.startDate || campaign.endDate) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : '—'}
                      {' → '}
                      {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'ongoing'}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
