'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AIScheduledAgent {
  id: string;
  name: string;
  description: string | null;
  taskType: string;
  parameters: Record<string, unknown>;
  cronExpression: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
}

const TASK_TYPES = [
  { value: 'inventory_check', label: 'Inventory Check' },
  { value: 'sales_summary', label: 'Sales Summary' },
  { value: 'expense_review', label: 'Expense Review' },
  { value: 'customer_followup', label: 'Customer Follow-up' },
];

const TASK_TYPE_COLORS: Record<string, string> = {
  inventory_check: 'bg-blue-50 text-blue-700',
  sales_summary: 'bg-green-50 text-green-700',
  expense_review: 'bg-amber-50 text-amber-700',
  customer_followup: 'bg-purple-50 text-purple-700',
};

function StatusDot({ status }: { status: string | null }) {
  if (!status) return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="Never run" />;
  if (status === 'SUCCESS')
    return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Last run succeeded" />;
  if (status === 'FAILED')
    return <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Last run failed" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />;
}

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    taskType: 'inventory_check',
    cronExpression: '0 9 * * 1',
    parameters: '{}',
    isActive: true,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(form.parameters) as Record<string, unknown>;
      } catch {
        throw new Error('Invalid JSON in parameters');
      }
      await api().post('/ai/agents', {
        name: form.name,
        description: form.description || undefined,
        taskType: form.taskType,
        cronExpression: form.cronExpression,
        parameters: params,
        isActive: form.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      onClose();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Scheduled Agent</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Daily Inventory Check"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.taskType}
              onChange={(e) => setForm((f) => ({ ...f, taskType: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cron Expression <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.cronExpression}
              onChange={(e) => setForm((f) => ({ ...f, cronExpression: e.target.value }))}
              placeholder="0 9 * * 1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">5 parts: minute hour day month weekday. Example: 0 9 * * 1 = Mon 9am</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parameters (JSON)</label>
            <textarea
              value={form.parameters}
              onChange={(e) => setForm((f) => ({ ...f, parameters: e.target.value }))}
              rows={3}
              placeholder="{}"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded text-blue-600"
            />
            <span className="text-sm text-gray-700">Active on creation</span>
          </label>
        </div>
        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {formError}
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.name.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AIScheduledAgent }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/ai/agents/${agent.id}/toggle`, { isActive: !agent.isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ result?: string; error?: string }>(
        `/ai/agents/${agent.id}/run`,
        {},
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setRunResult(data.result ?? data.error ?? 'Done');
      setExpanded(true);
    },
  });

  const taskLabel =
    TASK_TYPES.find((t) => t.value === agent.taskType)?.label ?? agent.taskType;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <StatusDot status={agent.lastStatus} />
            <h3 className="font-semibold text-gray-900 text-sm truncate">{agent.name}</h3>
          </div>
          {agent.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{agent.description}</p>
          )}
        </div>
        {/* Toggle */}
        <button
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
            agent.isActive ? 'bg-blue-600' : 'bg-gray-200',
          )}
          role="switch"
          aria-checked={agent.isActive}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              agent.isActive ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            TASK_TYPE_COLORS[agent.taskType] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {taskLabel}
        </span>
        <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs font-mono">
          {agent.cronExpression}
        </span>
      </div>

      {agent.lastRunAt && (
        <p className="text-xs text-gray-400">
          Last run: {new Date(agent.lastRunAt).toLocaleString('en-NG')}
        </p>
      )}

      {/* Run now button */}
      <button
        onClick={() => runMutation.mutate()}
        disabled={runMutation.isPending}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {runMutation.isPending ? (
          <>
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play size={12} />
            Run Now
          </>
        )}
      </button>

      {/* Expandable result */}
      {runResult !== null && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700"
          >
            <span className="font-medium">Result</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <pre className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap max-h-40">
              {runResult}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function AgentsContent() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: agents, isLoading } = useQuery<AIScheduledAgent[]>({
    queryKey: ['ai-agents'],
    queryFn: async () => {
      const res = await api().get<AIScheduledAgent[]>('/ai/agents');
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled Agents</h1>
          <p className="text-gray-500 text-sm mt-1">AI agents that run on a schedule</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Agent
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !agents || agents.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">No scheduled agents yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {showCreate && <CreateAgentModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

export default function AIAgentsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <AgentsContent />
    </Suspense>
  );
}
