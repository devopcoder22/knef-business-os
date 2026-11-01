'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Target, TrendingUp, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'MISSED' | 'CANCELLED' | 'PAUSED';

interface GoalKPI {
  id: string;
  name: string;
  target: string;
  current: string;
  unit: string | null;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  startDate: string;
  endDate: string;
  progress: number;
  ownerId: string | null;
  kpis: GoalKPI[];
  _count: { tasks: number; progresses: number };
}

interface GoalsResponse {
  data: Goal[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-blue-100 text-blue-700' },
  ACHIEVED: { label: 'Achieved', className: 'bg-green-100 text-green-700' },
  MISSED: { label: 'Missed', className: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500' },
  PAUSED: { label: 'Paused', className: 'bg-yellow-100 text-yellow-700' },
};

function GoalCard({ goal }: { goal: Goal }) {
  const cfg = STATUS_CONFIG[goal.status];
  const isOverdue = goal.status === 'ACTIVE' && new Date(goal.endDate) < new Date();
  const progressColor = goal.progress >= 75 ? 'bg-green-500' : goal.progress >= 40 ? 'bg-blue-500' : 'bg-orange-400';

  return (
    <Link href={`/goals/${goal.id}`} className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Target size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{goal.title}</h3>
            {goal.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{goal.description}</p>}
          </div>
        </div>
        <span className={cn('flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', cfg.className)}>
          {cfg.label}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500">Progress</span>
          <span className="font-semibold text-gray-900">{goal.progress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', progressColor)}
            style={{ width: `${goal.progress}%` }}
          />
        </div>
      </div>

      {/* KPIs summary */}
      {goal.kpis.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {goal.kpis.slice(0, 3).map((kpi) => (
            <div key={kpi.id} className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg text-xs">
              <TrendingUp size={10} className="text-gray-400" />
              <span className="text-gray-500">{kpi.name}:</span>
              <span className="font-medium text-gray-900">{kpi.current}/{kpi.target}{kpi.unit ? ` ${kpi.unit}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
        <span className={cn('flex items-center gap-1', isOverdue ? 'text-red-500' : '')}>
          <Clock size={11} />
          {isOverdue ? 'Overdue · ' : ''}
          Ends {new Date(goal.endDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <span>{goal._count.tasks} tasks</span>
      </div>
    </Link>
  );
}

export default function GoalsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<GoalsResponse>({
    queryKey: ['goals', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api().get<GoalsResponse>(`/goals?${params}`);
      return res.data;
    },
  });

  const goals = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
          <p className="text-gray-500 text-sm mt-1">Track organisational and team objectives</p>
        </div>
        <Link
          href="/goals/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Goal
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-2">
          {(['', 'ACTIVE', 'ACHIEVED', 'MISSED', 'PAUSED', 'CANCELLED'] as string[]).map((s) => {
            const cfg = s ? STATUS_CONFIG[s as GoalStatus] : null;
            return (
              <button
                key={s || 'all'}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-lg font-medium border transition-colors',
                  statusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                )}
              >
                {s ? cfg?.label : 'All'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Goals grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-48 animate-pulse" />
            ))
          : goals.map((goal) => <GoalCard key={goal.id} goal={goal} />)}
        {!isLoading && goals.length === 0 && (
          <div className="col-span-3 py-16 text-center text-gray-400">
            <Target size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No goals found</p>
            <p className="text-sm mt-1">Create your first goal to get started</p>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
            <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
