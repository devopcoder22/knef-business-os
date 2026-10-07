'use client';

import { useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Target, TrendingUp, CheckSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'MISSED' | 'CANCELLED' | 'PAUSED';

interface GoalKPI {
  id: string;
  name: string;
  description: string | null;
  target: string;
  current: string;
  unit: string | null;
}

interface GoalProgress {
  id: string;
  value: number;
  notes: string | null;
  recordedAt: string;
}

interface GoalTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  startDate: string;
  endDate: string;
  progress: number;
  notes: string | null;
  kpis: GoalKPI[];
  progresses: GoalProgress[];
  tasks: GoalTask[];
  parent: { id: string; title: string } | null;
  children: { id: string; title: string; status: GoalStatus; progress: number }[];
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-blue-100 text-blue-700' },
  ACHIEVED: { label: 'Achieved', className: 'bg-green-100 text-green-700' },
  MISSED: { label: 'Missed', className: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500' },
  PAUSED: { label: 'Paused', className: 'bg-yellow-100 text-yellow-700' },
};

const TASK_STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

function GoalDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  const [showAddProgress, setShowAddProgress] = useState(false);
  const [showAddKpi, setShowAddKpi] = useState(false);
  const [progressForm, setProgressForm] = useState({ value: '', notes: '' });
  const [kpiForm, setKpiForm] = useState({ name: '', target: '', unit: '', description: '' });

  const { data: goal, isLoading } = useQuery<Goal>({
    queryKey: ['goal', id],
    queryFn: async () => {
      const res = await api().get<Goal>(`/goals/${id}`);
      return res.data;
    },
  });

  const addProgressMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/goals/${id}/progress`, {
        value: Number(progressForm.value),
        notes: progressForm.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal', id] });
      setShowAddProgress(false);
      setProgressForm({ value: '', notes: '' });
    },
  });

  const addKpiMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/goals/${id}/kpis`, {
        name: kpiForm.name,
        target: kpiForm.target,
        unit: kpiForm.unit || undefined,
        description: kpiForm.description || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goal', id] });
      setShowAddKpi(false);
      setKpiForm({ name: '', target: '', unit: '', description: '' });
    },
  });

  if (isLoading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;
  if (!goal) return <div className="text-gray-500">Goal not found</div>;

  const cfg = STATUS_CONFIG[goal.status];
  const progressColor = goal.progress >= 75 ? 'bg-green-500' : goal.progress >= 40 ? 'bg-blue-500' : 'bg-orange-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <Target size={24} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{goal.title}</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {new Date(goal.startDate).toLocaleDateString('en-NG')} — {new Date(goal.endDate).toLocaleDateString('en-NG')}
            </p>
          </div>
          <span className={cn('px-3 py-1 rounded-full text-sm font-medium', cfg.className)}>{cfg.label}</span>
        </div>
      </div>

      {/* Progress section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Overall Progress</h3>
          <button onClick={() => setShowAddProgress(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <Plus size={14} /> Update Progress
          </button>
        </div>
        <div className="flex items-end gap-4 mb-4">
          <p className="text-5xl font-bold text-gray-900">{goal.progress}%</p>
          <div className="flex-1 pb-2">
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', progressColor)} style={{ width: `${goal.progress}%` }} />
            </div>
          </div>
        </div>
        {goal.progresses.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Updates</p>
            <div className="space-y-2">
              {goal.progresses.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="font-bold text-gray-900 w-12">{p.value}%</span>
                  <span className="text-gray-500 text-xs">{new Date(p.recordedAt).toLocaleDateString('en-NG')}</span>
                  {p.notes && <span className="text-gray-600">{p.notes}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Key Performance Indicators</h3>
          <button onClick={() => setShowAddKpi(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <Plus size={14} /> Add KPI
          </button>
        </div>
        {goal.kpis.length === 0 ? (
          <p className="text-gray-400 text-sm">No KPIs defined yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {goal.kpis.map((kpi) => {
              const pct = Math.min(100, (Number(kpi.current) / Number(kpi.target)) * 100);
              return (
                <div key={kpi.id} className="p-4 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-medium text-gray-900">{kpi.name}</p>
                    {kpi.unit && <span className="text-xs text-gray-400">{kpi.unit}</span>}
                  </div>
                  {kpi.description && <p className="text-xs text-gray-500">{kpi.description}</p>}
                  <div className="h-1.5 bg-gray-200 rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-gray-900">{kpi.current}</span>
                    <span className="text-gray-400">/ {kpi.target}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Linked tasks */}
      {goal.tasks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Linked Tasks ({goal.tasks.length})</h3>
          <div className="space-y-2">
            {goal.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <CheckSquare size={14} className="text-gray-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-gray-900">{task.title}</span>
                {task.dueDate && (
                  <span className="text-xs text-gray-400">{new Date(task.dueDate).toLocaleDateString('en-NG')}</span>
                )}
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', TASK_STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600')}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {goal.notes && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{goal.notes}</p>
        </div>
      )}

      {/* Add Progress Modal */}
      {showAddProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">Update Progress</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Progress (0-100%)</label>
                <input type="number" min="0" max="100" value={progressForm.value} onChange={e => setProgressForm(f => ({ ...f, value: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 65" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={progressForm.notes} onChange={e => setProgressForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAddProgress(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={() => addProgressMutation.mutate()} disabled={addProgressMutation.isPending || !progressForm.value} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                {addProgressMutation.isPending ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add KPI Modal */}
      {showAddKpi && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Add KPI</h2>
            <div className="space-y-3">
              {[
                { label: 'KPI Name', key: 'name', placeholder: 'e.g. Monthly Revenue' },
                { label: 'Target', key: 'target', placeholder: 'e.g. 5000000' },
                { label: 'Unit (optional)', key: 'unit', placeholder: 'e.g. NGN, units, %' },
                { label: 'Description (optional)', key: 'description', placeholder: 'Brief description' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={key === 'target' ? 'number' : 'text'} value={kpiForm[key as keyof typeof kpiForm]} onChange={e => setKpiForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAddKpi(false)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button onClick={() => addKpiMutation.mutate()} disabled={addKpiMutation.isPending || !kpiForm.name || !kpiForm.target} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                {addKpiMutation.isPending ? 'Adding...' : 'Add KPI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GoalDetailPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <GoalDetailContent />
    </Suspense>
  );
}
