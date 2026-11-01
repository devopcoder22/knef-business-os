'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Banknote, Receipt, CreditCard, PiggyBank } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MonthData {
  revenue: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
}

interface DashboardSummary {
  currentMonth: MonthData;
  previousMonth: MonthData;
  ytd: { revenue: number; expenses: number; grossProfit: number };
  cashPosition: { totalBankBalance: number; pendingExpenses: number };
  topExpenseCategories: { name: string; amount: number }[];
  revenueByMonth: { month: string; revenue: number }[];
  expensesByCategory: { category: string; amount: number }[];
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  const pct = pctChange(current, prev);
  if (pct === null) return <span className="text-gray-400 text-xs">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        up ? 'text-green-600' : 'text-red-600',
      )}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function SummaryCard({
  label,
  value,
  prev,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: number;
  prev: number;
  icon: React.ElementType;
  iconClass: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconClass)}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{fmt(value)}</p>
      <div className="mt-1">
        <TrendBadge current={value} prev={prev} />
      </div>
    </div>
  );
}

export default function FinanceDashboardPage() {
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['finance-dashboard'],
    queryFn: async () => {
      const res = await api().get<DashboardSummary>('/finance/dashboard/summary');
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const cur = data?.currentMonth ?? { revenue: 0, expenses: 0, grossProfit: 0, netProfit: 0 };
  const prev = data?.previousMonth ?? { revenue: 0, expenses: 0, grossProfit: 0, netProfit: 0 };
  const ytd = data?.ytd ?? { revenue: 0, expenses: 0, grossProfit: 0 };
  const cash = data?.cashPosition ?? { totalBankBalance: 0, pendingExpenses: 0 };
  const revenueByMonth = data?.revenueByMonth ?? [];
  const expenseCategories = data?.topExpenseCategories ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financial Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Current month performance overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Revenue (This Month)"
          value={cur.revenue}
          prev={prev.revenue}
          icon={TrendingUp}
          iconClass="bg-green-100 text-green-600"
        />
        <SummaryCard
          label="Expenses (This Month)"
          value={cur.expenses}
          prev={prev.expenses}
          icon={Receipt}
          iconClass="bg-red-100 text-red-600"
        />
        <SummaryCard
          label="Net Profit (This Month)"
          value={cur.netProfit}
          prev={prev.netProfit}
          icon={TrendingDown}
          iconClass="bg-blue-100 text-blue-600"
        />
        <SummaryCard
          label="Cash Position"
          value={cash.totalBankBalance}
          prev={cash.totalBankBalance}
          icon={Banknote}
          iconClass="bg-amber-100 text-amber-600"
        />
      </div>

      {/* YTD Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'YTD Revenue', value: ytd.revenue },
          { label: 'YTD Expenses', value: ytd.expenses },
          { label: 'YTD Gross Profit', value: ytd.grossProfit },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fmt(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue by Month Bar Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue — Last 12 Months</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueByMonth} margin={{ left: -10 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => fmt(v)}
                labelFormatter={(l: string) => `Month: ${l}`}
              />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expense Breakdown Pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Expenses by Category (YTD)</h3>
          {expenseCategories.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
              No expense data
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={220}>
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {expenseCategories.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {expenseCategories.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-gray-600 truncate">{cat.name}</span>
                    <span className="ml-auto font-medium text-gray-900">{fmt(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cash Position */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Cash Position</h3>
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-gray-500">Total Bank Balance</p>
            <p className="text-lg font-bold text-green-600">{fmt(cash.totalBankBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Pending Expenses</p>
            <p className="text-lg font-bold text-orange-600">{fmt(cash.pendingExpenses)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Available Cash</p>
            <p className="text-lg font-bold text-blue-600">
              {fmt(cash.totalBankBalance - cash.pendingExpenses)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
