'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search, Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
        <Link
          href="/marketing/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Campaign
        </Link>
      </div>

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
