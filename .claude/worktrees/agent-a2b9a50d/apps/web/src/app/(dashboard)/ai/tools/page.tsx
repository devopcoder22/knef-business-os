'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Play, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AITool {
  id: string;
  name: string;
  description: string;
  category: string | null;
  inputSchema: Record<string, unknown>;
  isActive: boolean;
  requiresApproval: boolean;
  createdAt: string;
}

interface AIAction {
  id: string;
  action: string;
  status: string;
  executedAt: string | null;
  createdAt: string;
  result: unknown;
  tool: { name: string; category: string | null } | null;
}

interface ActionsResponse {
  data: AIAction[];
  meta: { total: number };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  EXECUTING: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  REJECTED: 'bg-gray-100 text-gray-600',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircle size={13} className="text-green-600" />,
  FAILED: <XCircle size={13} className="text-red-500" />,
  PENDING: <Clock size={13} className="text-yellow-500" />,
  EXECUTING: <AlertCircle size={13} className="text-purple-500" />,
};

function ExecuteModal({
  tool,
  onClose,
}: {
  tool: AITool;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const schemaKeys = Object.keys(tool.inputSchema ?? {});
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(schemaKeys.map((k) => [k, ''])),
  );
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const executeMutation = useMutation({
    mutationFn: async () => {
      // Try to parse JSON values where applicable
      const parsed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        try {
          parsed[k] = JSON.parse(v);
        } catch {
          parsed[k] = v;
        }
      }
      const res = await api().post<{ result: unknown; status: string; requiresApproval?: boolean }>(
        `/ai/tools/${tool.id}/execute`,
        { parameters: parsed },
      );
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
    },
    onError: (err: Error) => {
      setError(err.message ?? 'Execution failed');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Execute: {tool.name}</h2>
            {tool.requiresApproval && (
              <p className="text-xs text-amber-600 mt-0.5">Requires approval before execution</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {schemaKeys.length === 0 ? (
          <p className="text-sm text-gray-500">This tool takes no parameters.</p>
        ) : (
          <div className="space-y-3">
            {schemaKeys.map((key) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{key}</label>
                <input
                  type="text"
                  value={params[key] ?? ''}
                  onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={`Enter ${key}...`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {result !== null && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Result</p>
            <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Play size={14} />
            {executeMutation.isPending ? 'Executing...' : 'Execute'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateToolModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    requiresApproval: false,
    inputSchema: '{}',
  });
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      let schema: Record<string, unknown> = {};
      try {
        schema = JSON.parse(form.inputSchema) as Record<string, unknown>;
      } catch {
        throw new Error('Invalid JSON in input schema');
      }
      await api().post('/ai/tools', {
        name: form.name,
        description: form.description,
        category: form.category || undefined,
        requiresApproval: form.requiresApproval,
        inputSchema: schema,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tools'] });
      onClose();
    },
    onError: (err: Error) => {
      setSchemaError(err.message);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New AI Tool</h2>
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
              placeholder="e.g. get_inventory_levels"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. inventory, finance"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Input Schema (JSON)</label>
            <textarea
              value={form.inputSchema}
              onChange={(e) => setForm((f) => ({ ...f, inputSchema: e.target.value }))}
              rows={4}
              placeholder='{"productId": "string", "locationId": "string"}'
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))}
              className="rounded text-blue-600"
            />
            <span className="text-sm text-gray-700">Requires approval before execution</span>
          </label>
        </div>
        {schemaError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {schemaError}
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
            disabled={createMutation.isPending || !form.name.trim() || !form.description.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Tool'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AIToolsContent() {
  const [showCreate, setShowCreate] = useState(false);
  const [executeToolId, setExecuteToolId] = useState<string | null>(null);

  const { data: tools, isLoading: toolsLoading } = useQuery<AITool[]>({
    queryKey: ['ai-tools'],
    queryFn: async () => {
      const res = await api().get<AITool[]>('/ai/tools');
      return res.data;
    },
  });

  const { data: actionsData, isLoading: actionsLoading } = useQuery<ActionsResponse>({
    queryKey: ['ai-actions'],
    queryFn: async () => {
      const res = await api().get<ActionsResponse>('/ai/tools/actions?limit=20');
      return res.data;
    },
  });

  const selectedTool = tools?.find((t) => t.id === executeToolId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Tools</h1>
          <p className="text-gray-500 text-sm mt-1">Registry of AI-callable tools and recent executions</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Tool
        </button>
      </div>

      {/* Tools grid */}
      {toolsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !tools || tools.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No tools registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm truncate">{tool.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{tool.description}</p>
                </div>
                <div
                  className={cn(
                    'flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1',
                    tool.isActive ? 'bg-green-500' : 'bg-gray-300',
                  )}
                  title={tool.isActive ? 'Active' : 'Inactive'}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tool.category && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                    {tool.category}
                  </span>
                )}
                {tool.requiresApproval && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                    Needs Approval
                  </span>
                )}
              </div>
              <button
                onClick={() => setExecuteToolId(tool.id)}
                disabled={!tool.isActive}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={12} />
                Execute
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent actions table */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Recent Actions</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {actionsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !actionsData?.data || actionsData.data.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No actions yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tool</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Executed At</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actionsData.data.map((action) => (
                  <tr key={action.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{action.action}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                          STATUS_COLORS[action.status] ?? 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {STATUS_ICONS[action.status]}
                        {action.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {action.executedAt
                        ? new Date(action.executedAt).toLocaleString('en-NG')
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs font-mono max-w-xs truncate">
                      {action.result != null
                        ? JSON.stringify(action.result).slice(0, 80)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && <CreateToolModal onClose={() => setShowCreate(false)} />}
      {selectedTool && (
        <ExecuteModal tool={selectedTool} onClose={() => setExecuteToolId(null)} />
      )}
    </div>
  );
}

export default function AIToolsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <AIToolsContent />
    </Suspense>
  );
}
