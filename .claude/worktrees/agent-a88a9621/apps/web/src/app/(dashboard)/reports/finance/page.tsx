'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = ['P&L', 'Cash Flow', 'Expenses'] as const;
type Tab = (typeof TABS)[number];

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

interface PLData {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingExpenses: number;
  netProfit: number;
  netMarginPct: number;
  expenseBreakdown: { category: string; amount: number; pct: number }[];
}

interface CashflowData {
  inflows: { date: string; source: string; amount: number }[];
  outflows: { date: string; category: string; amount: number }[];
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
}

interface ExpenseItem {
  id: string;
  reference: string;
  description: string;
  category: string;
  amount: number;
  status: string;
  vendor: string | null;
  date: string;
}

function PLRow({
  label,
  value,
  indent = false,
  bold = false,
  positive,
  pct,
}: {
  label: string;
  value: number;
  indent?: boolean;
  bold?: boolean;
  positive?: boolean;
  pct?: number;
}) {
  const isPositive = positive !== undefined ? positive : value >= 0;
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2 border-b border-gray-50',
        indent && 'pl-4',
        bold && 'bg-gray-50 rounded px-3 -mx-3',
      )}
    >
      <span className={cn('text-sm', bold ? 'font-semibold text-gray-900' : 'text-gray-600')}>
        {label}
      </span>
      <div className="flex items-center gap-4">
        {pct !== undefined && (
          <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
        )}
        <span
          className={cn(
            'text-sm font-medium',
            bold ? 'text-gray-900' : isPositive ? 'text-gray-900' : 'text-red-600',
          )}
        >
          {fmt(value)}
        </span>
      </div>
    </div>
  );
}

function FinanceReportContent() {
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [activeTab, setActiveTab] = useState<Tab>('P&L');
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? monthStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? today);
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseStatus, setExpenseStatus] = useState('');

  const dateParams = `startDate=${startDate}&endDate=${endDate}`;

  const { data: plRes, isLoading: plLoading } = useQuery<{ data: PLData }>({
    queryKey: ['reports-finance-pl', startDate, endDate],
    queryFn: () =>
      api().get<{ data: PLData }>(`/reports/finance/pl?${dateParams}`).then(r => r.data),
    enabled: activeTab === 'P&L',
  });

  const { data: cashflowRes, isLoading: cashflowLoading } = useQuery<{ data: CashflowData }>({
    queryKey: ['reports-finance-cashflow', startDate, endDate],
    queryFn: () =>
      api().get<{ data: CashflowData }>(`/reports/finance/cashflow?${dateParams}`).then(r => r.data),
    enabled: activeTab === 'Cash Flow',
  });

  const { data: expensesRes, isLoading: expensesLoading } = useQuery<{ data: ExpenseItem[]; total: number }>({
    queryKey: ['reports-finance-expenses', startDate, endDate, expenseCategoryId, expenseStatus],
    queryFn: () => {
      const p = new URLSearchParams({ startDate, endDate });
      if (expenseCategoryId) p.set('categoryId', expenseCategoryId);
      if (expenseStatus) p.set('status', expenseStatus);
      return api()
        .get<{ data: ExpenseItem[]; total: number }>(`/reports/finance/expenses?${p}`)
        .then(r => r.data);
    },
    enabled: activeTab === 'Expenses',
  });

  const pl = plRes?.data;
  const cashflow = cashflowRes?.data;
  const expenses = expensesRes?.data ?? [];

  async function handleExport(type: 'pl' | 'cashflow' | 'expenses') {
    const url = `/reports/finance/export?${dateParams}&format=csv&type=${type}`;
    const res = await api().get(url, { responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-${type}-export.csv`;
    a.click();
  }

  const STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    PAID: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Finance Report</h1>
        <div className="flex gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <button
            onClick={() => {
              const t = activeTab === 'P&L' ? 'pl' : activeTab === 'Cash Flow' ? 'cashflow' : 'expenses';
              void handleExport(t as 'pl' | 'cashflow' | 'expenses');
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-indigo-700"
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* P&L Tab */}
      {activeTab === 'P&L' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Profit & Loss Statement</h3>
          {plLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <PLRow label="Revenue" value={pl?.revenue ?? 0} bold />
              <PLRow label="Cost of Goods Sold" value={-(pl?.costOfGoods ?? 0)} indent />
              <PLRow label="Gross Profit" value={pl?.grossProfit ?? 0} bold pct={pl?.grossMarginPct} />
              <div className="pt-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Operating Expenses</p>
                {(pl?.expenseBreakdown ?? []).map(e => (
                  <PLRow key={e.category} label={e.category} value={-e.amount} indent pct={e.pct} />
                ))}
              </div>
              <PLRow label="Total Operating Expenses" value={-(pl?.operatingExpenses ?? 0)} indent bold />
              <div className="border-t border-gray-200 pt-2 mt-2">
                <PLRow
                  label="Net Profit"
                  value={pl?.netProfit ?? 0}
                  bold
                  pct={pl?.netMarginPct}
                  positive={(pl?.netProfit ?? 0) >= 0}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cash Flow Tab */}
      {activeTab === 'Cash Flow' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Opening Balance', value: cashflow?.openingBalance ?? 0 },
              { label: 'Net Cash Flow', value: cashflow?.netCashFlow ?? 0 },
              { label: 'Closing Balance', value: cashflow?.closingBalance ?? 0 },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className={cn('text-xl font-bold mt-1', kpi.value >= 0 ? 'text-gray-900' : 'text-red-600')}>
                  {fmt(kpi.value)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-emerald-600 mb-3">
                Inflows ({cashflow?.inflows.length ?? 0})
              </h3>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cashflowLoading ? (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-sm">Loading...</td></tr>
                    ) : (cashflow?.inflows ?? []).map((inf, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 text-gray-500">{inf.date}</td>
                        <td className="py-2">{inf.source}</td>
                        <td className="py-2 text-right text-emerald-600 font-medium">{fmt(inf.amount)}</td>
                      </tr>
                    ))}
                    {!cashflowLoading && (cashflow?.inflows ?? []).length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-sm">No inflows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-red-600 mb-3">
                Outflows ({cashflow?.outflows.length ?? 0})
              </h3>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cashflowLoading ? (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-sm">Loading...</td></tr>
                    ) : (cashflow?.outflows ?? []).map((out, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 text-gray-500">{out.date}</td>
                        <td className="py-2">{out.category}</td>
                        <td className="py-2 text-right text-red-600 font-medium">{fmt(out.amount)}</td>
                      </tr>
                    ))}
                    {!cashflowLoading && (cashflow?.outflows ?? []).length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-sm">No outflows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === 'Expenses' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Expenses</h3>
            <select
              value={expenseStatus}
              onChange={e => setExpenseStatus(e.target.value)}
              className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          {expensesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Reference</th>
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium">Vendor</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="py-2.5 font-mono text-xs text-gray-500">{e.reference}</td>
                      <td className="py-2.5">{e.description}</td>
                      <td className="py-2.5 text-gray-600">{e.category}</td>
                      <td className="py-2.5 text-gray-500">{e.vendor ?? '—'}</td>
                      <td className="py-2.5 text-right font-medium">{fmt(e.amount)}</td>
                      <td className="py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-700')}>
                          {e.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-gray-400">{e.date}</td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                        No expenses for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FinanceReportPage() {
  return (
    <Suspense fallback={<div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />}>
      <FinanceReportContent />
    </Suspense>
  );
}
