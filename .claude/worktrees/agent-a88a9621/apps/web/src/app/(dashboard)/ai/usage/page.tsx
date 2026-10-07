'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Plus, DollarSign, Zap, Activity, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  topModel: string | null;
  byDay: { date: string; cost: number; tokens: number }[];
  byModel: Record<string, { cost: number; tokens: number; count: number }>;
}

interface UsageLog {
  id: string;
  model: string;
  taskType: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | string;
  latencyMs: number;
  createdAt: string;
  provider?: { name: string; provider: string };
}

interface Budget {
  id: string;
  period: string;
  limitUsd: number | string;
  spentUsd: number | string;
  alertAt: number | string;
  isActive: boolean;
  provider?: { name: string } | null;
}

interface AddBudgetForm {
  period: string;
  limitUsd: string;
  alertAt: string;
}

const defaultBudgetForm: AddBudgetForm = {
  period: 'MONTHLY',
  limitUsd: '',
  alertAt: '',
};

export default function AIUsagePage() {
  const qc = useQueryClient();
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState<AddBudgetForm>(defaultBudgetForm);

  const { data: summary, isLoading: loadingSummary } = useQuery<UsageSummary>({
    queryKey: ['ai-usage-summary'],
    queryFn: () => api().get('/ai/usage/summary').then((r) => r.data),
  });

  const { data: logsData } = useQuery<{ data: UsageLog[] }>({
    queryKey: ['ai-usage-logs'],
    queryFn: () => api().get('/ai/usage/logs?limit=50').then((r) => r.data),
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['ai-budgets'],
    queryFn: () => api().get('/ai/usage/budgets').then((r) => r.data),
  });

  const createBudget = useMutation({
    mutationFn: (data: { period: string; limitUsd: number; alertAt?: number }) =>
      api().post('/ai/usage/budgets', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-budgets'] });
      setShowAddBudget(false);
      setBudgetForm(defaultBudgetForm);
    },
  });

  const toggleBudget = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api().patch(`/ai/usage/budgets/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-budgets'] }),
  });

  const logs = logsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Usage & Cost</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor token usage, costs, and manage budgets.</p>
      </div>

      {/* Summary cards */}
      {loadingSummary ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign size={18} className="text-green-600" />
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Spend</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">${(summary?.totalCost ?? 0).toFixed(4)}</p>
            <p className="text-xs text-gray-400 mt-1">Last 30 days</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                <Zap size={18} className="text-blue-600" />
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Tokens</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{(summary?.totalTokens ?? 0).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">Last 30 days</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                <Activity size={18} className="text-purple-600" />
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Requests</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary?.requestCount ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">Last 30 days</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <Zap size={18} className="text-amber-600" />
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top Model</p>
            </div>
            <p className="text-lg font-bold text-gray-900 truncate">{summary?.topModel ?? '—'}</p>
          </div>
        </div>
      )}

      {/* Daily spend chart */}
      {summary && summary.byDay.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Daily Spend (USD)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.byDay} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(5)}`, 'Cost']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budgets section */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Budgets</h2>
          <button
            onClick={() => setShowAddBudget(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            Add Budget
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {budgets.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">No budgets configured.</p>
          ) : (
            budgets.map((b) => {
              const spent = Number(b.spentUsd);
              const limit = Number(b.limitUsd);
              const alert = Number(b.alertAt);
              const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
              const isWarning = spent >= alert;
              const isOver = spent >= limit;
              return (
                <div key={b.id} className="px-5 py-4">
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">
                          {b.provider?.name ?? 'All Providers'}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{b.period}</span>
                        {isOver && (
                          <span className="flex items-center gap-1 text-xs text-red-600">
                            <AlertCircle size={12} /> Over budget
                          </span>
                        )}
                        {!isOver && isWarning && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle size={12} /> Near limit
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      ${spent.toFixed(4)} / ${Number(limit).toFixed(2)}
                    </span>
                    <button
                      onClick={() => toggleBudget.mutate({ id: b.id, isActive: !b.isActive })}
                      className={cn(
                        'text-xs px-2 py-1 rounded border transition-colors',
                        b.isActive
                          ? 'border-green-300 text-green-700 hover:bg-green-50'
                          : 'border-gray-300 text-gray-500 hover:bg-gray-50',
                      )}
                    >
                      {b.isActive ? 'Active' : 'Paused'}
                    </button>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        isOver ? 'bg-red-500' : isWarning ? 'bg-amber-400' : 'bg-blue-500',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Recent usage logs */}
      {logs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Usage Logs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-left">Task</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Latency</th>
                  <th className="px-4 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 text-sm">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{log.model}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{log.taskType}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{log.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">${Number(log.costUsd).toFixed(6)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{log.latencyMs}ms</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Budget Modal */}
      {showAddBudget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add Budget</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Period</label>
                <select
                  value={budgetForm.period}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, period: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Limit (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetForm.limitUsd}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, limitUsd: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 50.00"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Alert threshold (USD, optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetForm.alertAt}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, alertAt: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 40.00 (default: 80% of limit)"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAddBudget(false); setBudgetForm(defaultBudgetForm); }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createBudget.mutate({
                    period: budgetForm.period,
                    limitUsd: parseFloat(budgetForm.limitUsd),
                    alertAt: budgetForm.alertAt ? parseFloat(budgetForm.alertAt) : undefined,
                  })
                }
                disabled={!budgetForm.limitUsd || createBudget.isPending}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {createBudget.isPending ? 'Creating…' : 'Create Budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
