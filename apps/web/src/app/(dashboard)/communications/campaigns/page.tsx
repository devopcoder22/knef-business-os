'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Mail, Users, MousePointerClick, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  SENDING: 'bg-yellow-100 text-yellow-700',
  SENT: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
  FAILED: 'bg-red-200 text-red-800',
};

export default function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ['email-campaigns'],
    queryFn: async () => {
      const res = await api().get('/email-campaigns');
      const body = res.data as { data: Campaign[] | { data: Campaign[] } };
      const inner = body.data;
      if (Array.isArray(inner)) return inner;
      if (inner && Array.isArray((inner as { data: Campaign[] }).data)) {
        return (inner as { data: Campaign[] }).data;
      }
      return [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Send bulk email campaigns to your customers.</p>
        </div>
        <Link
          href="/communications/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Campaign
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No campaigns yet.{' '}
          <Link href="/communications/campaigns/new" className="text-blue-600 hover:underline">
            Create your first one.
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign: Campaign) => {
            const openRate = campaign.sentCount > 0
              ? Math.round((campaign.openCount / campaign.sentCount) * 100)
              : 0;
            const clickRate = campaign.sentCount > 0
              ? Math.round((campaign.clickCount / campaign.sentCount) * 100)
              : 0;

            return (
              <Link
                key={campaign.id}
                href={`/communications/campaigns/${campaign.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', STATUS_STYLES[campaign.status])}>
                        {campaign.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{campaign.subject}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-gray-500 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Users size={14} />
                      <span>{campaign.totalRecipients.toLocaleString()}</span>
                    </div>
                    {campaign.status === 'SENT' && (
                      <>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Mail size={14} />
                          <span>{campaign.sentCount.toLocaleString()} sent</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <TrendingUp size={14} />
                          <span>{openRate}% open</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <MousePointerClick size={14} />
                          <span>{clickRate}% click</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
