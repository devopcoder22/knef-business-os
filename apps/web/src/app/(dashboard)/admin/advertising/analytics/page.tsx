'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { format, subDays } from 'date-fns';

interface MetricSummary {
  totalSpend: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
}

interface MetricSnapshot {
  id: string;
  date: string;
  provider: string;
  impressions: number;
  clicks: number;
  spend: string;
  currency: string;
  conversions?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  roas?: string;
}

interface AdvertisingAccount {
  id: string;
  provider: string;
  displayName: string;
}

function formatMetric(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

function formatLargeNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META: 'Meta Ads',
  TIKTOK: 'TikTok Ads',
};

export default function AdvertisingAnalyticsPage() {
  const defaultTo = format(new Date(), 'yyyy-MM-dd');
  const defaultFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd');

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [providerFilter, setProviderFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');

  const { data: accountsRes } = useQuery({
    queryKey: ['advertising-accounts'],
    queryFn: async () => {
      const res = await api().get<{ data: AdvertisingAccount[] }>('/advertising/accounts');
      return res.data;
    },
  });

  const accounts: AdvertisingAccount[] = accountsRes?.data ?? [];

  const summaryParams = new URLSearchParams({
    from: fromDate,
    to: toDate,
    ...(providerFilter && { provider: providerFilter }),
    ...(accountFilter && { accountId: accountFilter }),
  });

  const { data: summaryRes, isLoading: loadingSummary } = useQuery({
    queryKey: ['advertising-summary', fromDate, toDate, providerFilter, accountFilter],
    queryFn: async () => {
      const res = await api().get<{ data: MetricSummary }>(`/advertising/metrics/summary?${summaryParams}`);
      return res.data;
    },
  });

  const metricsParams = new URLSearchParams({
    from: fromDate,
    to: toDate,
    groupBy: 'date',
    ...(providerFilter && { provider: providerFilter }),
    ...(accountFilter && { accountId: accountFilter }),
  });

  const { data: metricsRes, isLoading: loadingMetrics } = useQuery({
    queryKey: ['advertising-metrics', fromDate, toDate, providerFilter, accountFilter],
    queryFn: async () => {
      const res = await api().get<{ data: MetricSnapshot[] }>(`/advertising/metrics?${metricsParams}`);
      return res.data;
    },
  });

  const summary: MetricSummary | null = summaryRes?.data ?? null;
  const metrics: MetricSnapshot[] = metricsRes?.data ?? [];

  const currencies = [...new Set(metrics.map((m) => m.currency))];
  const hasMultipleCurrencies = currencies.length > 1;

  const kpis = [
    { label: 'Total Spend', value: loadingSummary ? '…' : summary ? `${summary.currency} ${summary.totalSpend.toFixed(2)}` : '—' },
    { label: 'Impressions', value: loadingSummary ? '…' : summary ? formatLargeNum(summary.impressions) : '—' },
    { label: 'Clicks', value: loadingSummary ? '…' : summary ? formatLargeNum(summary.clicks) : '—' },
    { label: 'Conversions', value: loadingSummary ? '…' : summary ? String(summary.conversions) : '—' },
    { label: 'CTR', value: loadingSummary ? '…' : summary ? (summary.ctr != null ? `${(summary.ctr * 100).toFixed(2)}%` : '—') : '—' },
    { label: 'CPC', value: loadingSummary ? '…' : summary ? (summary.cpc != null ? `${summary.currency} ${summary.cpc.toFixed(4)}` : '—') : '—' },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Advertising Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">View performance metrics across all advertising accounts.</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Provider</label>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Providers</option>
            <option value="GOOGLE_ADS">Google Ads</option>
            <option value="META">Meta Ads</option>
            <option value="TIKTOK">TikTok Ads</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Account</label>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Multi-currency warning */}
      {hasMultipleCurrencies && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            Totals not shown — multiple currencies detected ({currencies.join(', ')}). Values displayed in their original currency.
          </p>
        </div>
      )}

      {/* Metrics table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Daily Metrics</h2>
        </div>
        {loadingMetrics ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : metrics.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 font-medium">No metric data available.</p>
            <p className="text-gray-400 text-sm mt-1">Metrics will appear after accounts are synced.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Provider</th>
                  {hasMultipleCurrencies && <th className="px-4 py-3 text-left font-medium text-gray-600">Currency</th>}
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Impressions</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Spend</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">CTR</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">CPC</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {format(new Date(m.date), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {PROVIDER_LABELS[m.provider] ?? m.provider}
                    </td>
                    {hasMultipleCurrencies && (
                      <td className="px-4 py-3 text-xs text-gray-500">{m.currency}</td>
                    )}
                    <td className="px-4 py-3 text-right text-gray-700">{formatLargeNum(m.impressions)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatLargeNum(m.clicks)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {m.currency} {parseFloat(m.spend).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {m.ctr ? `${(parseFloat(m.ctr) * 100).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {m.cpc ? parseFloat(m.cpc).toFixed(4) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {m.roas ? parseFloat(m.roas).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attribution disclaimer */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <strong>Attribution disclaimer:</strong> Metrics are provider-reported. Conversions reflect provider attribution
          which may differ from actual storefront orders. Do not interpret as verified sales.
        </p>
      </div>
    </div>
  );
}
