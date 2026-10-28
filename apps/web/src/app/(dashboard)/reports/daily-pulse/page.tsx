'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  AlertTriangle,
  FileText,
  Package,
  Users,
  Clock,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface DailyPulseData {
  date: string;
  sales: {
    todayRevenue: number;
    yesterdayRevenue: number;
    revenueGrowthPct: number;
    orderCount: number;
  };
  purchasing: {
    pendingPOCount: number;
    pendingPOValue: number;
    overdueDeliveries: number;
  };
  finance: {
    overdueInvoiceCount: number;
    overdueInvoiceValue: number;
  };
  inventory: {
    lowStockItems: number;
    pendingAdjustments: number;
  };
  customers: {
    newToday: number;
  };
  staff: {
    clockedInToday: number;
  };
}

function fmtKobo(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n / 100);
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border p-5 flex flex-col gap-3',
        alert ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-200'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon size={18} className={iconColor} />
        </div>
      </div>
      <p className={cn('text-2xl font-bold', alert ? 'text-orange-600' : 'text-gray-900')}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</h2>
  );
}

export default function DailyPulsePage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['daily-pulse', date],
    queryFn: async () => {
      const res = await api().get<DailyPulseData>(`/daily-pulse?date=${date}`);
      return res.data as DailyPulseData;
    },
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['daily-pulse', date] });
  }

  const growthPct = data?.sales.revenueGrowthPct ?? 0;
  const growthPositive = growthPct >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Pulse</h1>
          <p className="text-sm text-gray-500 mt-1">Operational snapshot for the business owner</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Date banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl px-6 py-4 text-white flex items-center justify-between">
        <div>
          <p className="text-sm text-indigo-200">Viewing snapshot for</p>
          <p className="text-xl font-bold mt-0.5">
            {new Date(date + 'T00:00:00').toLocaleDateString('en-NG', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        {data && !isLoading && (
          <div className="text-right">
            <p className="text-sm text-indigo-200">Revenue vs Yesterday</p>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {growthPositive ? (
                <ArrowUpRight size={18} className="text-emerald-300" />
              ) : (
                <ArrowDownRight size={18} className="text-red-300" />
              )}
              <p
                className={cn(
                  'text-xl font-bold',
                  growthPositive ? 'text-emerald-300' : 'text-red-300'
                )}
              >
                {growthPositive ? '+' : ''}
                {growthPct.toFixed(1)}%
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Failed to load daily pulse data. Please try refreshing.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, s) => (
            <div key={s} className="space-y-3">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Sales */}
          <div className="space-y-3">
            <SectionHeading>Sales</SectionHeading>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Today's Revenue"
                value={fmtKobo(data.sales.todayRevenue)}
                icon={TrendingUp}
                iconBg="bg-indigo-100"
                iconColor="text-indigo-600"
                sub={`${data.sales.orderCount} orders`}
              />
              <MetricCard
                label="Yesterday's Revenue"
                value={fmtKobo(data.sales.yesterdayRevenue)}
                icon={growthPositive ? TrendingUp : TrendingDown}
                iconBg="bg-gray-100"
                iconColor="text-gray-500"
              />
              <MetricCard
                label="Revenue Growth"
                value={`${growthPositive ? '+' : ''}${growthPct.toFixed(1)}%`}
                icon={growthPositive ? ArrowUpRight : ArrowDownRight}
                iconBg={growthPositive ? 'bg-emerald-100' : 'bg-red-100'}
                iconColor={growthPositive ? 'text-emerald-600' : 'text-red-600'}
                sub="vs yesterday"
              />
              <MetricCard
                label="Order Count"
                value={String(data.sales.orderCount)}
                icon={ShoppingCart}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                sub="orders today"
              />
            </div>
          </div>

          {/* Purchasing */}
          <div className="space-y-3">
            <SectionHeading>Purchasing</SectionHeading>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard
                label="Pending POs"
                value={String(data.purchasing.pendingPOCount)}
                icon={FileText}
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
                sub="awaiting delivery"
              />
              <MetricCard
                label="Pending PO Value"
                value={fmtKobo(data.purchasing.pendingPOValue)}
                icon={ShoppingCart}
                iconBg="bg-amber-100"
                iconColor="text-amber-600"
              />
              <MetricCard
                label="Overdue Deliveries"
                value={String(data.purchasing.overdueDeliveries)}
                icon={AlertTriangle}
                iconBg={data.purchasing.overdueDeliveries > 0 ? 'bg-orange-100' : 'bg-gray-100'}
                iconColor={data.purchasing.overdueDeliveries > 0 ? 'text-orange-600' : 'text-gray-400'}
                alert={data.purchasing.overdueDeliveries > 0}
              />
            </div>
          </div>

          {/* Finance */}
          <div className="space-y-3">
            <SectionHeading>Finance</SectionHeading>
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 max-w-lg">
              <MetricCard
                label="Overdue Invoices"
                value={String(data.finance.overdueInvoiceCount)}
                icon={FileText}
                iconBg={data.finance.overdueInvoiceCount > 0 ? 'bg-red-100' : 'bg-gray-100'}
                iconColor={data.finance.overdueInvoiceCount > 0 ? 'text-red-600' : 'text-gray-400'}
                alert={data.finance.overdueInvoiceCount > 0}
              />
              <MetricCard
                label="Overdue Invoice Value"
                value={fmtKobo(data.finance.overdueInvoiceValue)}
                icon={AlertTriangle}
                iconBg={data.finance.overdueInvoiceValue > 0 ? 'bg-red-100' : 'bg-gray-100'}
                iconColor={data.finance.overdueInvoiceValue > 0 ? 'text-red-600' : 'text-gray-400'}
                alert={data.finance.overdueInvoiceValue > 0}
              />
            </div>
          </div>

          {/* Inventory */}
          <div className="space-y-3">
            <SectionHeading>Inventory</SectionHeading>
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <MetricCard
                label="Low Stock Items"
                value={String(data.inventory.lowStockItems)}
                icon={Package}
                iconBg={data.inventory.lowStockItems > 0 ? 'bg-orange-100' : 'bg-gray-100'}
                iconColor={data.inventory.lowStockItems > 0 ? 'text-orange-600' : 'text-gray-400'}
                alert={data.inventory.lowStockItems > 0}
                sub="below reorder point"
              />
              <MetricCard
                label="Pending Adjustments"
                value={String(data.inventory.pendingAdjustments)}
                icon={AlertTriangle}
                iconBg={data.inventory.pendingAdjustments > 0 ? 'bg-amber-100' : 'bg-gray-100'}
                iconColor={data.inventory.pendingAdjustments > 0 ? 'text-amber-600' : 'text-gray-400'}
                sub="awaiting approval"
              />
            </div>
          </div>

          {/* People */}
          <div className="space-y-3">
            <SectionHeading>People</SectionHeading>
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              <MetricCard
                label="New Customers Today"
                value={String(data.customers.newToday)}
                icon={Users}
                iconBg="bg-emerald-100"
                iconColor="text-emerald-600"
                sub="registered today"
              />
              <MetricCard
                label="Staff Clocked In"
                value={String(data.staff.clockedInToday)}
                icon={Clock}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                sub="currently on shift"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
