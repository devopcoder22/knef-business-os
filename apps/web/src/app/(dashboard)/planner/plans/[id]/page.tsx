'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Map,
  CheckSquare,
  Clock,
  Target,
  TrendingUp,
  AlertTriangle,
  ChevronLeft,
  Play,
  ThumbsUp,
  ThumbsDown,
  Pause,
  RotateCcw,
  Trash2,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PlanStep {
  id: string;
  title: string;
  objective: string | null;
  status: string;
  sortOrder: number;
  targetDate: string | null;
  kpiName: string | null;
  kpiTarget: string | null;
  kpiUnit: string | null;
}

interface PlanTaskLink {
  id: string;
  stepId: string | null;
  taskId: string | null;
  isProposed: boolean;
  proposedData: {
    title: string;
    description?: string;
    priority?: string;
    estimatedHours?: number;
    dueDate?: string | null;
  } | null;
}

interface PlanDetail {
  id: string;
  title: string;
  objective: string | null;
  description: string | null;
  status: string;
  type: string;
  startDate: string | null;
  targetDate: string | null;
  goalId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  metadata: {
    assumptions?: string[];
    expectedOutcomes?: string[];
    kpis?: Array<{ name: string; target: string; unit: string }>;
    risks?: string[];
    warnings?: string[];
  } | null;
  steps: PlanStep[];
  taskLinks: PlanTaskLink[];
  _count?: { steps: number; taskLinks: number };
}

interface PreviewResult {
  summary: {
    tasksToCreate: number;
    stepsToCreate: number;
    kpisToTrack: number;
    warnings: string[];
    risks: string[];
  };
  proposedTasks: Array<{ title: string; priority?: string; estimatedHours?: number; dueDate?: string | null }>;
  proposedKpis: Array<{ name: string; target: string; unit: string }>;
}

interface PlanProgress {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  progressPercent: number;
  deadlineStatus: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'COMPLETED';
  upcomingDeadlines: Array<{ title: string; dueDate: string; isOverdue: boolean }>;
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

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-blue-600',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-600',
};

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-100"
      >
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [approveComment, setApproveComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: plan, isLoading } = useQuery<PlanDetail>({
    queryKey: ['plan', id],
    queryFn: async () => {
      const res = await api().get<PlanDetail>(`/plans/${id}`);
      return res.data;
    },
  });

  const { data: progress } = useQuery<PlanProgress>({
    queryKey: ['plan-progress', id],
    queryFn: async () => {
      const res = await api().get<PlanProgress>(`/plans/${id}/progress`);
      return res.data;
    },
    enabled: plan?.status === 'ACTIVE',
  });

  const approveMutation = useMutation({
    mutationFn: () => api().post(`/plans/${id}/approve`, { comment: approveComment }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', id] }); setShowApprove(false); },
  });

  const rejectMutation = useMutation({
    mutationFn: () => api().post(`/plans/${id}/reject`, { reason: rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', id] }); setShowReject(false); },
  });

  const executeMutation = useMutation({
    mutationFn: () => api().post(`/plans/${id}/execute`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', id] }); },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api().post(`/plans/${id}/pause`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', id] }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => api().post(`/plans/${id}/resume`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api().delete(`/plans/${id}`),
    onSuccess: () => router.push('/planner/plans'),
  });

  const loadPreview = async () => {
    setPreviewLoading(true);
    setShowPreview(true);
    try {
      const res = await api().get<PreviewResult>(`/plans/${id}/preview-execution`);
      setPreview(res.data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading plan…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Map size={40} className="mx-auto mb-3 opacity-40" />
        <p className="font-medium">Plan not found</p>
        <Link href="/planner/plans" className="text-blue-600 text-sm mt-2 inline-block">Back to plans</Link>
      </div>
    );
  }

  const meta = plan.metadata;
  const canApprove = plan.status === 'REVIEW' || plan.status === 'DRAFT';
  const canExecute = plan.status === 'APPROVED';
  const canPause = plan.status === 'ACTIVE';
  const canResume = plan.status === 'PAUSED';
  const canDelete = plan.status !== 'ACTIVE';

  const deadlineColor = progress?.deadlineStatus === 'OVERDUE' ? 'text-red-600' :
    progress?.deadlineStatus === 'AT_RISK' ? 'text-orange-500' :
    progress?.deadlineStatus === 'COMPLETED' ? 'text-emerald-600' : 'text-green-600';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/planner/plans" className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <ChevronLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{plan.title}</h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[plan.status] ?? 'bg-gray-100 text-gray-600')}>
              {plan.status}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">{plan.type}</span>
          </div>
          {plan.objective && <p className="text-gray-500 text-sm mt-1">{plan.objective}</p>}
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {canApprove && (
            <>
              <button
                onClick={() => setShowApprove(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <ThumbsUp size={13} /> Approve
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50"
              >
                <ThumbsDown size={13} /> Reject
              </button>
            </>
          )}
          {canExecute && (
            <>
              <button
                onClick={loadPreview}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50"
              >
                <Eye size={13} /> Preview
              </button>
              <button
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {executeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                Execute
              </button>
            </>
          )}
          {canPause && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-300 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-50"
            >
              <Pause size={13} /> Pause
            </button>
          )}
          {canResume && (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              <RotateCcw size={13} /> Resume
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => { if (confirm('Delete this plan?')) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Execution result toast */}
      {executeMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          Plan executed successfully. Tasks have been created and the plan is now ACTIVE.
        </div>
      )}
      {executeMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {(executeMutation.error as Error)?.message ?? 'Execution failed. Please try again.'}
        </div>
      )}

      {/* Preview modal */}
      {showPreview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-900">Execution Preview</h3>
            <button onClick={() => setShowPreview(false)} className="text-blue-400 hover:text-blue-600 text-xs">Close</button>
          </div>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-blue-600 text-sm"><Loader2 size={14} className="animate-spin" /> Loading preview…</div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Tasks to create', value: preview.summary.tasksToCreate },
                  { label: 'Steps', value: preview.summary.stepsToCreate },
                  { label: 'KPIs to track', value: preview.summary.kpisToTrack },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-2xl font-bold text-blue-700">{value}</p>
                    <p className="text-xs text-blue-500">{label}</p>
                  </div>
                ))}
              </div>
              {preview.summary.warnings.length > 0 && (
                <div className="space-y-1">
                  {preview.summary.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-yellow-800 bg-yellow-50 rounded-lg px-3 py-2">
                      <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {preview.proposedTasks.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-blue-100">
                    <span className="font-medium text-gray-800">{t.title}</span>
                    <span className={cn('font-semibold', PRIORITY_COLORS[t.priority ?? 'MEDIUM'])}>{t.priority ?? 'MEDIUM'}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">Could not load preview.</p>
          )}
        </div>
      )}

      {/* Approve dialog */}
      {showApprove && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-green-900">Approve Plan</h3>
          <textarea
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
            placeholder="Optional comment…"
            className="w-full border border-green-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
            rows={2}
          />
          <div className="flex gap-2">
            <button onClick={() => setShowApprove(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              {approveMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Approve
            </button>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {showReject && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-red-900">Reject Plan</h3>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection…"
            className="w-full border border-red-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
            rows={2}
          />
          <div className="flex gap-2">
            <button onClick={() => setShowReject(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {rejectMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Steps */}
          {plan.steps.length > 0 && (
            <Section title={`Steps (${plan.steps.length})`}>
              <div className="space-y-3">
                {[...plan.steps].sort((a, b) => a.sortOrder - b.sortOrder).map((step) => (
                  <div key={step.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 text-sm">{step.title}</h3>
                      <span className={cn('flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium',
                        step.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                        step.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500',
                      )}>
                        {step.status}
                      </span>
                    </div>
                    {step.objective && <p className="text-xs text-gray-500 mb-2">{step.objective}</p>}
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      {step.targetDate && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(step.targetDate).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {step.kpiName && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <TrendingUp size={10} />
                          {step.kpiName}: {step.kpiTarget} {step.kpiUnit}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Task links */}
          {plan.taskLinks.length > 0 && (
            <Section title={`Tasks (${plan.taskLinks.length})`}>
              <div className="space-y-2">
                {plan.taskLinks.map((link) => {
                  const d = link.proposedData;
                  if (!d) return null;
                  return (
                    <div key={link.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <CheckSquare size={14} className={link.isProposed ? 'text-gray-300' : 'text-green-500'} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', link.isProposed ? 'text-gray-600' : 'text-gray-900')}>{d.title}</p>
                        {d.description && <p className="text-xs text-gray-400 truncate">{d.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-shrink-0">
                        {d.priority && <span className={cn('font-medium', PRIORITY_COLORS[d.priority])}>{d.priority}</span>}
                        {d.estimatedHours && <span className="text-gray-400">{d.estimatedHours}h</span>}
                        {link.isProposed && <span className="bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded text-xs">proposed</span>}
                        {!link.isProposed && link.taskId && (
                          <Link href={`/tasks/${link.taskId}`} className="text-blue-600 hover:underline text-xs">view task</Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Assumptions / outcomes */}
          {(meta?.assumptions?.length || meta?.expectedOutcomes?.length) ? (
            <Section title="Plan Details" defaultOpen={false}>
              {meta?.assumptions && meta.assumptions.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assumptions</h4>
                  <ul className="space-y-1">
                    {meta.assumptions.map((a, i) => <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-gray-300">•</span>{a}</li>)}
                  </ul>
                </div>
              )}
              {meta?.expectedOutcomes && meta.expectedOutcomes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Expected Outcomes</h4>
                  <ul className="space-y-1">
                    {meta.expectedOutcomes.map((o, i) => <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-green-400">✓</span>{o}</li>)}
                  </ul>
                </div>
              )}
            </Section>
          ) : null}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Progress */}
          {progress && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-3">Progress</h3>
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Tasks completed</span>
                  <span className="font-semibold text-gray-900">{progress.progressPercent}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', progress.progressPercent >= 75 ? 'bg-green-500' : progress.progressPercent >= 40 ? 'bg-blue-500' : 'bg-orange-400')}
                    style={{ width: `${progress.progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="font-medium">{progress.completedTasks}/{progress.totalTasks}</span></div>
                {progress.overdueTasks > 0 && <div className="flex justify-between"><span className="text-red-500">Overdue tasks</span><span className="font-medium text-red-600">{progress.overdueTasks}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={cn('font-medium', deadlineColor)}>{progress.deadlineStatus.replace('_', ' ')}</span></div>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 text-xs">
            <h3 className="font-semibold text-gray-900 text-sm">Details</h3>
            {[
              { label: 'Type', value: plan.type },
              { label: 'Status', value: plan.status },
              { label: 'Start', value: plan.startDate ? new Date(plan.startDate).toLocaleDateString('en-NG') : '—' },
              { label: 'Target', value: plan.targetDate ? new Date(plan.targetDate).toLocaleDateString('en-NG') : '—' },
              { label: 'Created', value: new Date(plan.createdAt).toLocaleDateString('en-NG') },
              { label: 'Approved', value: plan.approvedAt ? new Date(plan.approvedAt).toLocaleDateString('en-NG') : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-800">{value}</span>
              </div>
            ))}
          </div>

          {/* KPIs */}
          {meta?.kpis && meta.kpis.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-3">KPIs</h3>
              <div className="space-y-2">
                {meta.kpis.map((kpi, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{kpi.name}</span>
                    <span className="font-semibold text-purple-700">{kpi.target} {kpi.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {meta?.risks && meta.risks.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <h3 className="font-semibold text-red-800 text-sm mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Risks
              </h3>
              <ul className="space-y-1">
                {meta.risks.map((r, i) => <li key={i} className="text-xs text-red-700 flex gap-2"><span className="text-red-300">•</span>{r}</li>)}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {meta?.warnings && meta.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <h3 className="font-semibold text-yellow-800 text-sm mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Warnings
              </h3>
              <ul className="space-y-1">
                {meta.warnings.map((w, i) => <li key={i} className="text-xs text-yellow-800 flex gap-2"><span className="text-yellow-400">!</span>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
