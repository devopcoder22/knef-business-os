'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface AdvertisingAccount {
  id: string;
  provider: 'GOOGLE_ADS' | 'META' | 'TIKTOK';
  displayName: string;
  isActive: boolean;
  accountStatus: string;
}

interface MetricSummary {
  totalSpend: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
}

const PROVIDERS = [
  {
    key: 'GOOGLE_ADS',
    name: 'Google Ads',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    badge: 'bg-blue-600',
    status: 'Pending developer token approval',
    applyUrl: 'https://ads.google.com/home/tools/manager-accounts/',
    applyLabel: 'Apply at Google Ads Manager',
    note: 'A Google Ads developer token is required to call the Google Ads API. This is separate from OAuth and requires a business-use application through Google.',
  },
  {
    key: 'META',
    name: 'Meta Ads',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    badge: 'bg-indigo-600',
    status: 'Pending app review for ads_read scope',
    applyUrl: 'https://developers.facebook.com/apps/',
    applyLabel: 'Submit at Meta for Developers',
    note: 'The ads_read and ads_management permissions require advanced app review by Meta. Standard OAuth login does not grant advertising access.',
  },
  {
    key: 'TIKTOK',
    name: 'TikTok Ads',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    badge: 'bg-pink-600',
    status: 'Pending separate developer access',
    applyUrl: 'https://business.tiktok.com/portal/docs',
    applyLabel: 'Apply at TikTok Business Center',
    note: 'TikTok Marketing API requires a separate developer application through TikTok Business. This is not included in the social content publishing approval.',
  },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AdvertisingOverviewPage() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
  const toDate = new Date().toISOString().split('T')[0];

  const { data: accountsRes, isLoading: loadingAccounts } = useQuery({
    queryKey: ['advertising-accounts'],
    queryFn: async () => {
      const res = await api().get<{ data: AdvertisingAccount[] }>('/advertising/accounts');
      return res.data;
    },
  });

  const accounts: AdvertisingAccount[] = accountsRes?.data ?? [];

  const { data: summaryRes, isLoading: loadingMetrics } = useQuery({
    queryKey: ['advertising-metrics-summary', fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await api().get<{ data: MetricSummary }>(`/advertising/metrics/summary?${params}`);
      return res.data;
    },
    enabled: accounts.length > 0,
  });

  const summary: MetricSummary | null = summaryRes?.data ?? null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Advertising Overview</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage paid advertising accounts across Google Ads, Meta Ads, and TikTok Ads.
        </p>
      </div>

      {/* Foundation notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Advertising API — Foundation Complete, Provider Approval Pending</p>
          <p className="text-sm text-amber-700 mt-1">
            The advertising integration infrastructure is technically complete. All three provider integrations require external
            approval processes before they can connect to live provider APIs. See provider status below.
          </p>
        </div>
      </div>

      {/* Provider status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROVIDERS.map((p) => (
          <div key={p.key} className={`bg-white rounded-xl border p-5 space-y-3 ${p.color.split(' ').slice(-1)[0]}`}>
            <div className="flex items-start justify-between">
              <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.color}`}>
                {p.name}
              </div>
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                Pending
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5">{p.status}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green-600 flex-shrink-0" />
                <p className="text-xs font-semibold text-green-700">TECHNICALLY COMPLETE — PROVIDER APPROVAL PENDING</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{p.note}</p>
            <a
              href={p.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <ExternalLink size={12} />
              {p.applyLabel}
            </a>
          </div>
        ))}
      </div>

      {/* Get started steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">How to Activate Advertising</h2>
        <ol className="space-y-4">
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">1</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Apply for Google Ads developer token</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Visit{' '}
                <a href="https://ads.google.com/home/tools/manager-accounts/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                  ads.google.com/home/tools/manager-accounts
                </a>{' '}
                and apply for a developer token. This can take several business days for approval.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">2</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Submit Meta app for ads_read scope review</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Visit{' '}
                <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                  developers.facebook.com
                </a>{' '}
                and submit the app for advanced access review, including ads_read and ads_management permissions.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-pink-600 text-white text-sm font-bold flex items-center justify-center">3</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Apply for TikTok Marketing API access</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Visit{' '}
                <a href="https://business.tiktok.com/portal/docs" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                  business.tiktok.com
                </a>{' '}
                and apply for TikTok Marketing API developer access. This is separate from the social publishing approval.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 text-white text-sm font-bold flex items-center justify-center">4</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Link advertising accounts</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Once external approvals are granted, visit{' '}
                <Link href="/admin/advertising/accounts" className="text-blue-500 underline">Advertising Accounts</Link>{' '}
                to connect your provider accounts.
              </p>
            </div>
          </li>
        </ol>
      </div>

      {/* Summary stats (only shown when accounts exist) */}
      {accounts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Last 30 Days Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Linked Accounts', value: loadingAccounts ? '…' : String(accounts.length) },
              {
                label: 'Total Spend',
                value: loadingMetrics ? '…' : summary ? `${summary.currency} ${summary.totalSpend.toFixed(2)}` : '—',
              },
              {
                label: 'Impressions',
                value: loadingMetrics ? '…' : summary ? formatNumber(summary.impressions) : '—',
              },
              {
                label: 'Clicks',
                value: loadingMetrics ? '…' : summary ? formatNumber(summary.clicks) : '—',
              },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Accounts', href: '/admin/advertising/accounts' },
          { label: 'Campaigns', href: '/admin/advertising/campaigns' },
          { label: 'Analytics', href: '/admin/advertising/analytics' },
          { label: 'Actions', href: '/admin/advertising/actions' },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <TrendingUp size={15} />
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
