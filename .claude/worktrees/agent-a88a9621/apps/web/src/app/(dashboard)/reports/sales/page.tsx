'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { Download, TrendingUp, ShoppingCart, Tag, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalDiscount: number;
  completedOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  revenueByDay: { date: string; revenue: number; orders: number }[];
  revenueByChannel: { channel: string; revenue: number; orders: number }[];
  revenueByLocation: { locationId: string; locationName: string; revenue: number }[];
  topProducts: { productId: string; name: string; sku: string; quantitySold: number; revenue: number }[];
  paymentMethodBreakdown: { method: string; amount: number; count: number }[];
}

interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  quantitySold: number;
  revenue: number;
  costTotal: number;
  grossProfit: number;
  grossMargin: number;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  iconClass,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconClass: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconClass)}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SalesReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? monthStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? today);
  const [locationId, setLocationId] = useState(searchParams.get('locationId') ?? '');
  const [channel, setChannel] = useState(searchParams.get('channel') ?? '');

  const params = new URLSearchParams({
    startDate,
    endDate,
    ...(locationId ? { locationId } : {}),
    ...(channel ? { channel } : {}),
  });

  const { data: summaryRes, isLoading } = useQuery<{ data: SalesSummary }>({
    queryKey: ['reports-sales-summary', startDate, endDate, locationId, channel],
    queryFn: () => api().get<{ data: SalesSummary }>(`/reports/sales/summary?${params}`).then(r => r.data),
  });

  const { data: productsRes } = useQuery<{ data: TopProduct[] }>({
    queryKey: ['reports-sales-products', startDate, endDate],
    queryFn: () =>
      api()
        .get<{ data: TopProduct[] }>(`/reports/sales/products?startDate=${startDate}&endDate=${endDate}&limit=10`)
        .then(r => r.data),
  });

  const summary = summaryRes?.data;
  const topProducts = productsRes?.data ?? [];

  async function handleExport() {
    const url = `/reports/sales/export?startDate=${startDate}&endDate=${endDate}&format=csv&type=orders`;
    const res = await api().get(url, { responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales-export.csv';
    a.click();
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  const revenueByDay = summary?.revenueByDay ?? [];
  const revenueByChannel = summary?.revenueByChannel ?? [];
  const paymentMethods = summary?.paymentMethodBreakdown ?? [];

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          />
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All Channels</option>
            {['IN_STORE', 'POS', 'ONLINE', 'PHONE', 'WHATSAPP', 'INSTAGRAM', 'OTHER'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Revenue"
          value={fmt(summary?.totalRevenue ?? 0)}
          icon={TrendingUp}
          iconClass="bg-indigo-100 text-indigo-600"
          sub={`${summary?.completedOrders ?? 0} completed orders`}
        />
        <KpiCard
          label="Total Orders"
          value={String(summary?.totalOrders ?? 0)}
          icon={ShoppingCart}
          iconClass="bg-emerald-100 text-emerald-600"
          sub={`${summary?.cancelledOrders ?? 0} cancelled`}
        />
        <KpiCard
          label="Avg Order Value"
          value={fmt(summary?.avgOrderValue ?? 0)}
          icon={Receipt}
          iconClass="bg-amber-100 text-amber-600"
        />
        <KpiCard
          label="Total Discount"
          value={fmt(summary?.totalDiscount ?? 0)}
          icon={Tag}
          iconClass="bg-red-100 text-red-600"
        />
      </div>

      {/* Revenue over time line chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueByDay} margin={{ left: -10 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Line type="monotone" dataKey="revenue" stroke={COLORS[0]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue by channel doughnut */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue by Channel</h3>
          {revenueByChannel.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
              No data
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={250}>
                <PieChart>
                  <Pie
                    data={revenueByChannel}
                    dataKey="revenue"
                    nameKey="channel"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {revenueByChannel.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {revenueByChannel.map((c, i) => (
                  <div key={c.channel} className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-600 truncate">{c.channel}</span>
                    <span className="ml-auto font-medium text-gray-900">{fmt(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Payment method bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment Methods</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={paymentMethods} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="method" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="amount" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 10 products table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Top 10 Products</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Product</th>
                <th className="pb-2 font-medium text-right">Qty Sold</th>
                <th className="pb-2 font-medium text-right">Revenue</th>
                <th className="pb-2 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Gross Profit</th>
                <th className="pb-2 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {topProducts.map(p => (
                <tr key={p.productId} className="hover:bg-gray-50">
                  <td className="py-2.5">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.sku}</p>
                  </td>
                  <td className="py-2.5 text-right">{p.quantitySold}</td>
                  <td className="py-2.5 text-right font-medium">{fmt(p.revenue)}</td>
                  <td className="py-2.5 text-right text-gray-500">{fmt(p.costTotal ?? 0)}</td>
                  <td className="py-2.5 text-right text-emerald-600 font-medium">{fmt(p.grossProfit ?? 0)}</td>
                  <td className="py-2.5 text-right">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      (p.grossMargin ?? 0) >= 30 ? 'bg-emerald-100 text-emerald-700' :
                      (p.grossMargin ?? 0) >= 15 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {(p.grossMargin ?? 0).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                    No product data for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SalesReportPage() {
  return (
    <Suspense fallback={<div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />}>
      <SalesReportContent />
    </Suspense>
  );
}
