'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Star, Zap, Bot, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'mistral';

interface AIProvider {
  id: string;
  name: string;
  provider: ProviderType;
  baseUrl: string | null;
  isDefault: boolean;
  isActive: boolean;
  routes: { id: string; taskType: string; model: string }[];
}

interface UsageSummary {
  totalTokens: number;
  totalCost: string;
  byProvider: { provider: string; tokens: number; cost: string }[];
}

interface Budget {
  id: string;
  limitType: string;
  limitValue: string;
  currentUsage: string;
  isActive: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-100 text-green-700',
  anthropic: 'bg-orange-100 text-orange-700',
  gemini: 'bg-blue-100 text-blue-700',
  mistral: 'bg-purple-100 text-purple-700',
};

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
};

export default function AdminAIPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    provider: 'openai' as ProviderType,
    apiKey: '',
    baseUrl: '',
    isDefault: false,
  });

  const { data: providers = [], isLoading } = useQuery<AIProvider[]>({
    queryKey: ['admin-ai-providers'],
    queryFn: async () => {
      const res = await api().get('/ai/providers');
      return (res.data as any).data ?? res.data;
    },
  });

  const { data: summary } = useQuery<UsageSummary>({
    queryKey: ['admin-ai-usage-summary'],
    queryFn: async () => {
      const res = await api().get('/ai/usage/summary');
      return (res.data as any).data ?? res.data;
    },
  });

  const { data: budgets = [] } = useQuery<Budget[]>({
    queryKey: ['admin-ai-budgets'],
    queryFn: async () => {
      const res = await api().get('/ai/usage/budgets');
      return (res.data as any).data ?? res.data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await api().post('/ai/providers', {
        name: form.name,
        provider: form.provider,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl || undefined,
        isDefault: form.isDefault,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-ai-providers'] });
      setShowAdd(false);
      setForm({ name: '', provider: 'openai', apiKey: '', baseUrl: '', isDefault: false });
      setAddError(null);
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? 'Failed to add provider');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api().delete(`/ai/providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-ai-providers'] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => api().post(`/ai/providers/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-ai-providers'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Manage AI providers, models, and usage budgets</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setAddError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Provider
        </button>
      </div>

      {/* Usage summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Zap size={14} />Total Tokens</div>
            <p className="text-2xl font-bold text-gray-900">{summary.totalTokens?.toLocaleString() ?? '0'}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><DollarSign size={14} />Estimated Cost</div>
            <p className="text-2xl font-bold text-gray-900">${Number(summary.totalCost ?? 0).toFixed(4)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1"><Bot size={14} />Active Budgets</div>
            <p className="text-2xl font-bold text-gray-900">{budgets.filter((b) => b.isActive).length}</p>
          </div>
        </div>
      )}

      {/* Providers */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">AI Providers</h2>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[0, 1].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : providers.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Bot size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No AI providers configured</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', PROVIDER_COLORS[p.provider] ?? 'bg-gray-100 text-gray-600')}>
                      {p.provider}
                    </span>
                    {p.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                        <Star size={10} /> Default
                      </span>
                    )}
                    {!p.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                    )}
                  </div>
                  {p.routes.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Routes: {p.routes.map((r) => r.taskType).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!p.isDefault && (
                    <button
                      onClick={() => setDefaultMutation.mutate(p.id)}
                      disabled={setDefaultMutation.isPending}
                      className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(p.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Budgets */}
      {budgets.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Usage Budgets</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {budgets.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{b.limitType}</span>
                  <span className="text-gray-400 ml-2">limit: {b.limitValue}</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-600">{b.currentUsage} used</span>
                  <span className={cn('ml-2 text-xs px-2 py-0.5 rounded-full', b.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {b.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Add AI Provider</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My OpenAI Provider"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as ProviderType }))}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="mistral">Mistral</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Base URL <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
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
            {addError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{addError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowAdd(false); setAddError(null); }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !form.name.trim() || !form.apiKey.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {addMutation.isPending ? 'Adding...' : 'Add Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
