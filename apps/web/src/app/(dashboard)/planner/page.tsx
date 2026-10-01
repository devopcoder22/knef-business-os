'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Target,
  CheckSquare,
  AlertTriangle,
  Plus,
  ChevronRight,
  Clock,
  Sparkles,
  Map,
  TrendingUp,
  ClipboardList,
  Loader2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface DailyPlanResponse {
  date: string;
  plan: string;
  rawContext: {
    overdueTasks: number;
    todayTasks: number;
    upcomingThisWeek: number;
    activePlans: number;
  };
}

interface WeeklyPlanResponse {
  weekStart: string;
  plan: string;
  rawContext: {
    tasksThisWeek: number;
    overdueCount: number;
    activeGoals: number;
    activePlans: number;
  };
}

interface Plan {
  id: string;
  title: string;
  objective: string | null;
  status: string;
  type: string;
  targetDate: string | null;
  createdAt: string;
  _count?: { steps: number; taskLinks: number };
}

interface PlansResponse {
  data: Plan[];
  meta: { total: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-500',
};

function PlanCard({ plan }: { plan: Plan }) {
  const isOverdue = plan.targetDate && plan.status === 'ACTIVE' && new Date(plan.targetDate) < new Date();
  return (
    <Link
      href={`/planner/plans/${plan.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">{plan.title}</h3>
        <span className={cn('flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[plan.status] ?? 'bg-gray-100 text-gray-600')}>
          {plan.status}
        </span>
      </div>
      {plan.objective && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{plan.objective}</p>}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className={cn('flex items-center gap-1', isOverdue ? 'text-red-500' : '')}>
          <Clock size={11} />
          {plan.targetDate
            ? (isOverdue ? 'Overdue · ' : '') + new Date(plan.targetDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
            : 'No deadline'}
        </span>
        {plan._count && (
          <span className="flex items-center gap-1">
            <CheckSquare size={11} />
            {plan._count.taskLinks} tasks
          </span>
        )}
      </div>
    </Link>
  );
}

function AskPlannerModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const res = await api().post<{ response: string }>('/planner/ask', { message });
      setResponse(res.data.response);
    } catch {
      setResponse('Sorry, I could not process your request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            <h2 className="font-semibold text-gray-900">Ask AI Planner</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask anything about your plans, tasks, or what to focus on today…"
            className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
            rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) ask(); }}
          />
          {response && (
            <div className="bg-purple-50 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {response}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button
              onClick={ask}
              disabled={loading || !message.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const [showAsk, setShowAsk] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const { data: dailyData, isLoading: dailyLoading, refetch: refetchDaily } = useQuery<DailyPlanResponse>({
    queryKey: ['planner', 'daily'],
    queryFn: async () => {
      const res = await api().post<DailyPlanResponse>('/planner/daily', {});
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: weeklyData, isLoading: weeklyLoading, refetch: refetchWeekly } = useQuery<WeeklyPlanResponse>({
    queryKey: ['planner', 'weekly'],
    queryFn: async () => {
      const res = await api().post<WeeklyPlanResponse>('/planner/weekly', {});
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
    enabled: viewMode === 'week',
  });

  const { data: plansData, isLoading: plansLoading } = useQuery<PlansResponse>({
    queryKey: ['plans', 'active'],
    queryFn: async () => {
      const res = await api().get<PlansResponse>('/plans?status=ACTIVE&limit=6');
      return res.data;
    },
  });

  const { data: pendingData } = useQuery<PlansResponse>({
    queryKey: ['plans', 'pending'],
    queryFn: async () => {
      const res = await api().get<PlansResponse>('/plans?status=REVIEW&limit=5');
      return res.data;
    },
  });

  const today = new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const ctx = dailyData?.rawContext;
  const wCtx = weeklyData?.rawContext;
  const isLoading = viewMode === 'day' ? dailyLoading : weeklyLoading;
  const planText = viewMode === 'day' ? dailyData?.plan : weeklyData?.plan;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planner</h1>
          <p className="text-gray-500 text-sm mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAsk(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            <Sparkles size={15} />
            Ask AI
          </button>
          <Link
            href="/planner/plans/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={15} />
            New Plan
          </Link>
        </div>
      </div>

      {/* Quick stats */}
      {ctx && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Overdue Tasks', value: ctx.overdueTasks, icon: AlertTriangle, color: ctx.overdueTasks > 0 ? 'text-red-500' : 'text-gray-400', bg: ctx.overdueTasks > 0 ? 'bg-red-50' : 'bg-gray-50' },
            { label: 'Due Today', value: ctx.todayTasks, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50' },
            { label: 'This Week', value: ctx.upcomingThisWeek, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50' },
            { label: 'Active Plans', value: ctx.activePlans, icon: Map, color: 'text-green-500', bg: 'bg-green-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Daily / Weekly Plan */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-500" />
                <h2 className="font-semibold text-gray-900">AI Plan</h2>
              </div>
              <div className="flex items-center gap-1">
                {(['day', 'week'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                      viewMode === m ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100',
                    )}
                  >
                    {m === 'day' ? 'My Day' : 'My Week'}
                  </button>
                ))}
                <button
                  onClick={() => viewMode === 'day' ? refetchDaily() : refetchWeekly()}
                  className="ml-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="p-5">
              {isLoading ? (
                <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Generating your plan…</span>
                </div>
              ) : planText ? (
                <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{planText}</div>
              ) : (
                <div className="py-8 text-center text-gray-400 text-sm">
                  No plan generated yet. Click Refresh to generate.
                </div>
              )}
            </div>
          </div>

          {/* Active Plans */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Active Plans</h2>
              <Link href="/planner/plans" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            {plansLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-24 animate-pulse" />
                ))}
              </div>
            ) : (plansData?.data ?? []).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(plansData?.data ?? []).map((plan) => <PlanCard key={plan.id} plan={plan} />)}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-gray-400">
                <Map size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No active plans</p>
                <p className="text-xs mt-1">Create a new plan to get started</p>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: Pending Approvals + Shortcuts */}
        <div className="space-y-4">
          {/* Pending approvals */}
          {(pendingData?.data ?? []).length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-yellow-600" />
                <h3 className="font-semibold text-yellow-800 text-sm">Awaiting Review</h3>
                <span className="ml-auto bg-yellow-200 text-yellow-800 text-xs font-medium px-2 py-0.5 rounded-full">
                  {pendingData!.data.length}
                </span>
              </div>
              <div className="space-y-2">
                {pendingData!.data.map((plan) => (
                  <Link
                    key={plan.id}
                    href={`/planner/plans/${plan.id}`}
                    className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg text-xs hover:bg-yellow-50 border border-yellow-100"
                  >
                    <span className="font-medium text-gray-800 line-clamp-1">{plan.title}</span>
                    <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'Create Business Plan', href: '/planner/plans/new?type=BUSINESS', icon: Map, color: 'text-blue-600 bg-blue-50' },
                { label: 'Create Personal Plan', href: '/planner/plans/new?type=PERSONAL', icon: Target, color: 'text-purple-600 bg-purple-50' },
                { label: 'View All Plans', href: '/planner/plans', icon: ClipboardList, color: 'text-gray-600 bg-gray-50' },
                { label: 'My Tasks', href: '/tasks', icon: CheckSquare, color: 'text-green-600 bg-green-50' },
                { label: 'Goals', href: '/goals', icon: TrendingUp, color: 'text-orange-600 bg-orange-50' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', color.split(' ')[1])}>
                    <Icon size={14} className={color.split(' ')[0]} />
                  </div>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Weekly context (if week view active) */}
          {viewMode === 'week' && wCtx && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-3">This Week</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Tasks this week', value: wCtx.tasksThisWeek },
                  { label: 'Overdue', value: wCtx.overdueCount, warn: wCtx.overdueCount > 0 },
                  { label: 'Active goals', value: wCtx.activeGoals },
                  { label: 'Active plans', value: wCtx.activePlans },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className={cn('font-semibold', warn ? 'text-red-600' : 'text-gray-900')}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAsk && <AskPlannerModal onClose={() => setShowAsk(false)} />}
    </div>
  );
}
