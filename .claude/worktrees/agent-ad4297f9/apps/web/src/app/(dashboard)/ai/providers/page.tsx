'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Star, Zap, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'mistral';

interface Route {
  id: string;
  taskType: string;
  model: string;
  priority: number;
  maxTokens: number | null;
  temperature: number | null;
  isActive: boolean;
}

interface AIProvider {
  id: string;
  name: string;
  provider: ProviderType;
  baseUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
  routes: Route[];
}

const PROVIDER_BADGES: Record<ProviderType, string> = {
  openai: 'bg-green-100 text-green-700',
  anthropic: 'bg-orange-100 text-orange-700',
  gemini: 'bg-blue-100 text-blue-700',
  mistral: 'bg-purple-100 text-purple-700',
};

const DEFAULT_MODELS: Record<ProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
};

interface AddProviderForm {
  name: string;
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  isDefault: boolean;
}

interface AddRouteForm {
  taskType: string;
  model: string;
  priority: string;
  maxTokens: string;
  temperature: string;
}

const defaultProviderForm: AddProviderForm = {
  name: '',
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  isDefault: false,
};

const defaultRouteForm: AddRouteForm = {
  taskType: 'chat',
  model: '',
  priority: '0',
  maxTokens: '',
  temperature: '',
};

export default function AIProvidersPage() {
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<AddProviderForm>(defaultProviderForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingRouteFor, setAddingRouteFor] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<AddRouteForm>(defaultRouteForm);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs: number; error?: string }>>({});

  const { data: providers = [], isLoading } = useQuery<AIProvider[]>({
    queryKey: ['ai-providers'],
    queryFn: () => api().get('/ai/providers').then((r) => r.data),
  });

  const createProvider = useMutation({
    mutationFn: (data: AddProviderForm) => api().post('/ai/providers', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-providers'] });
      setShowAddModal(false);
      setForm(defaultProviderForm);
    },
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => api().delete(`/ai/providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api().post(`/ai/providers/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  });

  const testProvider = useMutation({
    mutationFn: (id: string) => api().post(`/ai/providers/${id}/test`).then((r) => r.data as { success: boolean; latencyMs: number; error?: string }),
    onSuccess: (data, id) => {
      setTestResults((prev) => ({ ...prev, [id]: data }));
    },
  });

  const addRoute = useMutation({
    mutationFn: ({ providerId, data }: { providerId: string; data: AddRouteForm }) =>
      api().post(`/ai/providers/${providerId}/routes`, {
        taskType: data.taskType,
        model: data.model,
        priority: parseInt(data.priority) || 0,
        maxTokens: data.maxTokens ? parseInt(data.maxTokens) : undefined,
        temperature: data.temperature ? parseFloat(data.temperature) : undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-providers'] });
      setAddingRouteFor(null);
      setRouteForm(defaultRouteForm);
    },
  });

  const deleteRoute = useMutation({
    mutationFn: ({ providerId, routeId }: { providerId: string; routeId: string }) =>
      api().delete(`/ai/providers/${providerId}/routes/${routeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Providers</h1>
          <p className="text-sm text-gray-500 mt-1">Configure LLM providers and routing rules.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Provider
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No AI providers configured yet.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add First Provider
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Provider header */}
              <div className="px-5 py-4 flex items-center gap-4">
                {p.isActive ? (
                  <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle size={18} className="text-red-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', PROVIDER_BADGES[p.provider])}>
                      {p.provider}
                    </span>
                    {p.isDefault && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                        <Star size={10} /> Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{p.routes.length} route{p.routes.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {testResults[p.id] && (
                    <span className={cn('text-xs', testResults[p.id].success ? 'text-green-600' : 'text-red-500')}>
                      {testResults[p.id].success
                        ? `✓ ${testResults[p.id].latencyMs}ms`
                        : `✗ ${testResults[p.id].error ?? 'Failed'}`}
                    </span>
                  )}
                  <button
                    onClick={() => testProvider.mutate(p.id)}
                    disabled={testProvider.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Zap size={12} />
                    Test
                  </button>
                  {!p.isDefault && (
                    <button
                      onClick={() => setDefault.mutate(p.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Star size={12} />
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {expandedId === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this provider?')) deleteProvider.mutate(p.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Routes (expandable) */}
              {expandedId === p.id && (
                <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Routing Rules</h3>
                    <button
                      onClick={() => { setAddingRouteFor(p.id); setRouteForm({ ...defaultRouteForm, model: DEFAULT_MODELS[p.provider][0] ?? '' }); }}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={12} />
                      Add Route
                    </button>
                  </div>

                  {p.routes.length === 0 ? (
                    <p className="text-xs text-gray-400">No routes configured. Using provider default routing.</p>
                  ) : (
                    <div className="space-y-2">
                      {p.routes.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{r.taskType}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-medium text-gray-800">{r.model}</span>
                          {r.priority !== 0 && <span className="text-xs text-gray-400">priority:{r.priority}</span>}
                          {r.maxTokens && <span className="text-xs text-gray-400">max:{r.maxTokens}</span>}
                          <div className="flex-1" />
                          <button
                            onClick={() => deleteRoute.mutate({ providerId: p.id, routeId: r.id })}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {addingRouteFor === p.id && (
                    <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-600">Task Type</label>
                          <input
                            value={routeForm.taskType}
                            onChange={(e) => setRouteForm((f) => ({ ...f, taskType: e.target.value }))}
                            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="e.g. chat, summarize"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Model</label>
                          <input
                            value={routeForm.model}
                            onChange={(e) => setRouteForm((f) => ({ ...f, model: e.target.value }))}
                            list={`models-${p.id}`}
                            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <datalist id={`models-${p.id}`}>
                            {DEFAULT_MODELS[p.provider].map((m) => <option key={m} value={m} />)}
                          </datalist>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Max Tokens</label>
                          <input
                            type="number"
                            value={routeForm.maxTokens}
                            onChange={(e) => setRouteForm((f) => ({ ...f, maxTokens: e.target.value }))}
                            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="2048"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Temperature</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={routeForm.temperature}
                            onChange={(e) => setRouteForm((f) => ({ ...f, temperature: e.target.value }))}
                            className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="0.7"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setAddingRouteFor(null)}
                          className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => addRoute.mutate({ providerId: p.id, data: routeForm })}
                          disabled={!routeForm.model || addRoute.isPending}
                          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          Add Route
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add AI Provider</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Production OpenAI"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Provider Type</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as ProviderType }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="mistral">Mistral</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">API Key</label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="sk-… or key-…"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Base URL (optional)</label>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://api.openai.com"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Set as default provider</span>
              </label>
            </div>
            {createProvider.isError && (
              <p className="mt-3 text-sm text-red-500">
                {(createProvider.error as Error)?.message ?? 'Failed to create provider'}
              </p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAddModal(false); setForm(defaultProviderForm); }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createProvider.mutate(form)}
                disabled={!form.name || !form.apiKey || createProvider.isPending}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {createProvider.isPending ? 'Adding…' : 'Add Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
