'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Webhook, RotateCcw, Trash2, CheckCircle, XCircle, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS } from '@knef/constants';

interface ExternalAgent {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  scopes: string[];
  allowedTools: string[];
  autonomyLevel: string;
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface AgentsResponse {
  data: ExternalAgent[];
}

interface Tool {
  name: string;
  category: string;
  description?: string;
}

interface ToolsResponse {
  data: Tool[];
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
};

export default function AgentsPage() {
  const { hasPermission } = useAuthStore();
  const queryClient = useQueryClient();
  const canView = hasPermission(PERMISSIONS.EXTERNAL_AGENTS.VIEW);
  const canManage = hasPermission(PERMISSIONS.EXTERNAL_AGENTS.MANAGE);

  const [newKey, setNewKey] = useState<{ agentId: string; key: string } | null>(null);

  const { data, isLoading } = useQuery<AgentsResponse>({
    queryKey: ['external-agents'],
    queryFn: async () => {
      const res = await api().get<AgentsResponse>('/external-agents');
      return res.data;
    },
    enabled: canView,
  });

  const { data: toolsData } = useQuery<ToolsResponse>({
    queryKey: ['external-agents-tools'],
    queryFn: async () => {
      const res = await api().get<ToolsResponse>('/external-agents/tools');
      return res.data;
    },
    enabled: canView,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await api().patch(`/external-agents/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-agents'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/external-agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-agents'] });
    },
  });

  const rotateKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api().post<{ data: { rawApiKey: string } }>(
        `/external-agents/${id}/rotate-key`,
      );
      return { id, key: res.data.data.rawApiKey };
    },
    onSuccess: (result) => {
      setNewKey({ agentId: result.id, key: result.key });
      queryClient.invalidateQueries({ queryKey: ['external-agents'] });
    },
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">You do not have permission to view external agents.</p>
      </div>
    );
  }

  const toolsByCategory = (toolsData?.data ?? []).reduce<Record<string, Tool[]>>((acc, tool) => {
    const cat = tool.category ?? 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tool);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">External Agents</h1>
        <p className="text-gray-500 text-sm mt-1">
          API agents with programmatic access to the platform
        </p>
      </div>

      {newKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">New API Key Generated</p>
          <p className="text-xs text-amber-700 mb-2">
            Copy this key now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-amber-300 rounded px-3 py-2 font-mono break-all">
              {newKey.key}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKey.key);
              }}
              className="text-xs px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              Copy
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs px-3 py-2 border border-amber-300 rounded-lg hover:bg-amber-100 text-amber-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Agent Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))
        ) : data?.data.length === 0 ? (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Webhook size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-gray-400 text-sm">No external agents configured</p>
          </div>
        ) : (
          data?.data.map((agent) => (
            <div key={agent.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Webhook size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{agent.name}</h3>
                    {agent.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{agent.description}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    STATUS_STYLES[agent.status] ?? 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {agent.status === 'ACTIVE' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                  {agent.status}
                </span>
              </div>

              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex flex-wrap gap-1">
                  {agent.scopes.slice(0, 4).map((scope) => (
                    <span
                      key={scope}
                      className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium"
                    >
                      {scope}
                    </span>
                  ))}
                  {agent.scopes.length > 4 && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      +{agent.scopes.length - 4}
                    </span>
                  )}
                </div>
                <div className="flex gap-4">
                  <span>
                    Rate limit: <span className="font-medium text-gray-700">{agent.rateLimitPerMinute}/min</span>
                  </span>
                  <span>
                    Autonomy: <span className="font-medium text-gray-700">{agent.autonomyLevel}</span>
                  </span>
                </div>
                <p>
                  Last used:{' '}
                  <span className="font-medium text-gray-700">
                    {agent.lastUsedAt
                      ? format(new Date(agent.lastUsedAt), 'MMM d, yyyy HH:mm')
                      : 'Never'}
                  </span>
                </p>
              </div>

              {canManage && (
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() =>
                      updateMutation.mutate({
                        id: agent.id,
                        status: agent.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                      })
                    }
                    disabled={updateMutation.isPending}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      agent.status === 'ACTIVE'
                        ? 'text-red-600 border border-red-200 hover:bg-red-50'
                        : 'text-green-600 border border-green-200 hover:bg-green-50'
                    }`}
                  >
                    {agent.status === 'ACTIVE' ? (
                      <>
                        <XCircle size={12} /> Suspend
                      </>
                    ) : (
                      <>
                        <CheckCircle size={12} /> Activate
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Rotate API key for "${agent.name}"? The old key will be immediately invalidated.`)) {
                        rotateKeyMutation.mutate(agent.id);
                      }
                    }}
                    disabled={rotateKeyMutation.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <RotateCcw size={12} /> Rotate Key
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate(agent.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Exposed Tools */}
      {Object.keys(toolsByCategory).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Exposed Tools</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(toolsByCategory).map(([category, tools]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {category}
                </h3>
                <div className="space-y-1">
                  {tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50"
                    >
                      <span className="text-xs font-mono text-gray-700">{tool.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
