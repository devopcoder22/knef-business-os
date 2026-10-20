'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Megaphone, FileText, Calendar, Users, Image, Clock, CheckCircle2, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface DashboardData {
  campaigns: { active: number; draft: number; scheduled: number; awaitingReview: number };
  content: { drafts: number; awaitingApproval: number; scheduled: number; upcomingInWeek: number };
  audienceSegments: number;
}

const STAT_CARDS = [
  { label: 'Active Campaigns', key: 'campaigns.active', icon: PlayCircle, color: 'text-green-600', bg: 'bg-green-50' },
  { label: 'Awaiting Review', key: 'campaigns.awaitingReview', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { label: 'Drafts', key: 'content.drafts', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  { label: 'Scheduled Content', key: 'content.scheduled', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
];

function getNestedValue(obj: DashboardData, key: string): number {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return 0;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' ? current : 0;
}

export default function MarketingDashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['marketing-dashboard'],
    queryFn: async () => {
      const res = await api().get<DashboardData>('/marketing/dashboard');
      return res.data;
    },
  });

  const QUICK_LINKS = [
    { label: 'New Campaign', href: '/marketing/campaigns/new', icon: Megaphone },
    { label: 'New Content', href: '/marketing/content/new', icon: FileText },
    { label: 'View Calendar', href: '/marketing/calendar', icon: Calendar },
    { label: 'Audiences', href: '/marketing/audiences', icon: Users },
    { label: 'Media Library', href: '/marketing/media', icon: Image },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
        <p className="text-gray-500 text-sm mt-1">Campaign management, content scheduling, and audience targeting</p>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading dashboard...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STAT_CARDS.map((card) => {
              const Icon = card.icon;
              const value = data ? getNestedValue(data, card.key) : 0;
              return (
                <div key={card.key} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                    <Icon size={18} className={card.color} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
                </div>
              );
            })}
          </div>

          {data && data.content.upcomingInWeek > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                <strong>{data.content.upcomingInWeek}</strong> piece{data.content.upcomingInWeek !== 1 ? 's' : ''} scheduled to publish in the next 7 days.{' '}
                <Link href="/marketing/calendar" className="underline">View calendar</Link>
              </span>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Links</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {QUICK_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <Icon size={20} className="text-blue-600" />
                    <span className="text-xs text-gray-700 text-center">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">Campaigns</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span className="text-gray-500">Draft</span><span className="font-medium">{data?.campaigns.draft ?? 0}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Awaiting Review</span><span className="font-medium text-amber-600">{data?.campaigns.awaitingReview ?? 0}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Scheduled</span><span className="font-medium text-purple-600">{data?.campaigns.scheduled ?? 0}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Active</span><span className="font-medium text-green-600">{data?.campaigns.active ?? 0}</span></li>
              </ul>
              <Link href="/marketing/campaigns" className="block mt-3 text-xs text-blue-600 hover:underline">View all campaigns →</Link>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3 text-sm">Content</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span className="text-gray-500">Drafts</span><span className="font-medium">{data?.content.drafts ?? 0}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Awaiting Approval</span><span className="font-medium text-amber-600">{data?.content.awaitingApproval ?? 0}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Scheduled</span><span className="font-medium text-purple-600">{data?.content.scheduled ?? 0}</span></li>
                <li className="flex justify-between"><span className="text-gray-500">Audience Segments</span><span className="font-medium">{data?.audienceSegments ?? 0}</span></li>
              </ul>
              <Link href="/marketing/content" className="block mt-3 text-xs text-blue-600 hover:underline">View all content →</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
