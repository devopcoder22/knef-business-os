'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Map,
  Plus,
  Clock,
  CheckSquare,
  Search,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type PlanStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
type PlanType = 'PERSONAL' | 'BUSINESS' | 'PROJECT' | 'CAMPAIGN' | 'OPERATIONAL' | 'STRATEGIC';

interface Plan {
  id: string;
  title: string;
  objective: string | null;
  status: PlanStatus;
  type: PlanType;
  targetDate: string | null;
  createdAt: string;
  _count?: { steps: number; taskLinks: number };
}

interface PlansResponse {
  data: Plan[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_COLORS: Record<PlanStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-500',
};

const ALL_STATUSES: PlanStatus[] = ['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const ALL_TYPES: PlanType[] = ['PERSONAL', 'BUSINESS', 'PROJECT', 'CAMPAIGN', 'OPERATIONAL', 'STRATEGIC'];

export default function PlansPage() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PlansResponse>({
    queryKey: ['plans', status, type, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const res = await api().get<PlansResponse>(`/plans?${params}`);
      return res.data;
    },
  });

  const plans = (data?.data ?? []).filter((p) =>
    search ? p.title.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plans</h1>
          <p className="text-gray-500 text-sm mt-1">All business and personal plans</p>
        </div>
        <Link
          href="/planner/plans/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          New Plan
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plans…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setStatus(''); setPage(1); }}
            className={cn('px-3 py-1 text-xs rounded-lg font-medium border transition-colors', !status ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
          >
            All Status
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={cn('px-3 py-1 text-xs rounded-lg font-medium border transition-colors', status === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setType(''); setPage(1); }}
            className={cn('px-3 py-1 text-xs rounded-lg font-medium border transition-colors', !type ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
          >
            All Types
          </button>
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setPage(1); }}
              className={cn('px-3 py-1 text-xs rounded-lg font-medium border transition-colors', type === t ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Plans list */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-20 animate-pulse" />
            ))
          : plans.map((plan) => {
              const isOverdue = plan.targetDate && plan.status === 'ACTIVE' && new Date(plan.targetDate) < new Date();
              return (
                <Link
                  key={plan.id}
                  href={`/planner/plans/${plan.id}`}
                  className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Map size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{plan.title}</h3>
                      <span className={cn('flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[plan.status])}>
                        {plan.status}
                      </span>
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        {plan.type}
                      </span>
                    </div>
                    {plan.objective && (
                      <p className="text-xs text-gray-500 truncate">{plan.objective}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-400">
                    {plan._count && (
                      <span className="flex items-center gap-1">
                        <CheckSquare size={11} />
                        {plan._count.taskLinks}
                      </span>
                    )}
                    <span className={cn('flex items-center gap-1', isOverdue ? 'text-red-500' : '')}>
                      <Clock size={11} />
                      {plan.targetDate
                        ? new Date(plan.targetDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: '2-digit' })
                        : '—'}
                    </span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </Link>
              );
            })}

        {!isLoading && plans.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
            <Map size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium text-sm">No plans found</p>
            <p className="text-xs mt-1">Adjust the filters or create a new plan</p>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
