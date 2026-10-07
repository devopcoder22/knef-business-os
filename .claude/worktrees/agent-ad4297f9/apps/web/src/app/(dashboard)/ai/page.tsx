'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MessageSquare, Server, BookOpen, BarChart3, CheckCircle, XCircle, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AIProvider {
  id: string;
  name: string;
  provider: string;
  isDefault: boolean;
  isActive: boolean;
  routes: { id: string }[];
}

interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  topModel: string | null;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-100 text-green-700',
  anthropic: 'bg-orange-100 text-orange-700',
  gemini: 'bg-blue-100 text-blue-700',
  mistral: 'bg-purple-100 text-purple-700',
};

const QUICK_LINKS = [
  {
    title: 'AI Chat',
    description: 'Chat with AI using your configured providers.',
    href: '/ai/chat',
    icon: MessageSquare,
    color: 'bg-blue-500',
  },
  {
    title: 'Providers',
    description: 'Configure OpenAI, Anthropic, Gemini and other LLM providers.',
    href: '/ai/providers',
    icon: Server,
    color: 'bg-green-500',
  },
  {
    title: 'Knowledge Base',
    description: 'Upload documents and search your knowledge base with RAG.',
    href: '/ai/knowledge',
    icon: BookOpen,
    color: 'bg-purple-500',
  },
  {
    title: 'Usage & Cost',
    description: 'Monitor token usage, costs, and set spending budgets.',
    href: '/ai/usage',
    icon: BarChart3,
    color: 'bg-amber-500',
  },
];

export default function AIHubPage() {
  const { data: providers = [], isLoading: loadingProviders } = useQuery<AIProvider[]>({
    queryKey: ['ai-providers'],
    queryFn: () => api().get('/ai/providers').then((r) => r.data),
  });

  const { data: summary } = useQuery<UsageSummary>({
    queryKey: ['ai-usage-summary'],
    queryFn: () => api().get('/ai/usage/summary').then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Core</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage AI providers, chat, knowledge base and usage monitoring.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow group"
          >
            <div
              className={cn(
                link.color,
                'w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform',
              )}
            >
              <link.icon className="text-white" size={24} />
            </div>
            <h2 className="font-semibold text-gray-900 mb-1">{link.title}</h2>
            <p className="text-sm text-gray-500">{link.description}</p>
          </Link>
        ))}
      </div>

      {/* Usage summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Spend (30d)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">${summary.totalCost.toFixed(4)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Tokens (30d)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalTokens.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top Model</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.topModel ?? '—'}</p>
          </div>
        </div>
      )}

      {/* Provider status */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Configured Providers</h2>
          <Link href="/ai/providers" className="text-sm text-blue-600 hover:underline">
            Manage →
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {loadingProviders ? (
            <p className="px-6 py-8 text-sm text-gray-400 text-center">Loading providers…</p>
          ) : providers.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-gray-500">No providers configured yet.</p>
              <Link
                href="/ai/providers"
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Provider
              </Link>
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="px-6 py-3 flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {p.isActive ? (
                    <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-red-400 flex-shrink-0" />
                  )}
                  <span className="font-medium text-gray-900 text-sm truncate">{p.name}</span>
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    PROVIDER_COLORS[p.provider] ?? 'bg-gray-100 text-gray-700',
                  )}
                >
                  {p.provider}
                </span>
                {p.isDefault && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                    <Star size={10} /> Default
                  </span>
                )}
                <span className="text-xs text-gray-400">{p.routes?.length ?? 0} routes</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
