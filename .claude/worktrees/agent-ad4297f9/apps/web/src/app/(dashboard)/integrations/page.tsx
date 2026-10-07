'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plug,
  RefreshCw,
  Settings,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MarketplaceStatus {
  name: 'jumia' | 'konga';
  isConfigured: boolean;
  isActive: boolean;
  lastSync: string | null;
}

interface StatusResponse {
  data: MarketplaceStatus[];
}

interface ConfigDto {
  apiKey: string;
  secretKey: string;
  sellerId: string;
}

interface SyncResponse {
  queued: boolean;
  message: string;
}

const MARKETPLACE_INFO: Record<
  string,
  { label: string; description: string; color: string }
> = {
  jumia: {
    label: 'Jumia',
    description: "Africa's leading e-commerce marketplace",
    color: 'bg-orange-500',
  },
  konga: {
    label: 'Konga',
    description: "Nigeria's trusted online shopping destination",
    color: 'bg-blue-600',
  },
};

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [configModal, setConfigModal] = useState<'jumia' | 'konga' | null>(null);
  const [form, setForm] = useState<ConfigDto>({ apiKey: '', secretKey: '', sellerId: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data: statusData, isLoading } = useQuery<StatusResponse>({
    queryKey: ['marketplace-status'],
    queryFn: async () => {
      const res = await api().get<StatusResponse>('/integrations/marketplace/status');
      return res.data;
    },
  });

  const configureMutation = useMutation({
    mutationFn: async ({ provider, data }: { provider: string; data: ConfigDto }) => {
      const res = await api().post<{ message: string }>(
        `/integrations/marketplace/${provider}/configure`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      setConfigModal(null);
      setForm({ apiKey: '', secretKey: '', sellerId: '' });
      queryClient.invalidateQueries({ queryKey: ['marketplace-status'] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await api().post<SyncResponse>(
        `/integrations/marketplace/${provider}/sync-products`,
      );
      return res.data;
    },
    onSuccess: (data) => {
      setSyncMessage(data.message);
      setTimeout(() => setSyncMessage(null), 5000);
    },
  });

  const marketplaces = statusData?.data ?? [];

  const handleConfigure = () => {
    if (!configModal) return;
    configureMutation.mutate({ provider: configModal, data: form });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-500 text-sm mt-1">
          Connect your store to external marketplaces and services
        </p>
      </div>

      {/* Sync notification */}
      {syncMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw size={16} className="text-blue-600 animate-spin" />
          <p className="text-sm text-blue-800">{syncMessage}</p>
        </div>
      )}

      {/* Marketplace Cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Marketplace Integrations</h2>

        {isLoading ? (
          <div className="text-gray-400 text-sm">Loading integrations...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['jumia', 'konga'] as const).map((provider) => {
              const status = marketplaces.find((m) => m.name === provider);
              const info = MARKETPLACE_INFO[provider];

              return (
                <div
                  key={provider}
                  className="bg-white rounded-xl border border-gray-200 p-5"
                >
                  {/* Marketplace Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg',
                        info.color,
                      )}
                    >
                      {info.label[0]}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{info.label}</h3>
                      <p className="text-xs text-gray-400">{info.description}</p>
                    </div>
                    {status?.isConfigured ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <CheckCircle size={14} />
                        {status.isActive ? 'Active' : 'Inactive'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                        <AlertCircle size={14} />
                        Not configured
                      </span>
                    )}
                  </div>

                  {/* Last sync */}
                  {status?.lastSync && (
                    <p className="text-xs text-gray-400 mb-4">
                      Last sync: {new Date(status.lastSync).toLocaleString()}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setConfigModal(provider);
                        setForm({ apiKey: '', secretKey: '', sellerId: '' });
                        setShowSecret(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      <Settings size={14} />
                      {status?.isConfigured ? 'Reconfigure' : 'Configure'}
                    </button>
                    {status?.isConfigured && (
                      <button
                        onClick={() => syncMutation.mutate(provider)}
                        disabled={syncMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
                        Sync Products
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Configuration Modal */}
      {configModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-5">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
                  MARKETPLACE_INFO[configModal].color,
                )}
              >
                {MARKETPLACE_INFO[configModal].label[0]}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Configure {MARKETPLACE_INFO[configModal].label}
                </h3>
                <p className="text-xs text-gray-400">Credentials are stored encrypted</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="text"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="Enter API key"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Secret Key
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={form.secretKey}
                    onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                    placeholder="Enter secret key"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seller ID
                </label>
                <input
                  type="text"
                  value={form.sellerId}
                  onChange={(e) => setForm({ ...form, sellerId: e.target.value })}
                  placeholder="Enter seller ID"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {configureMutation.isError && (
              <p className="mt-3 text-sm text-red-600">
                Failed to save credentials. Please try again.
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfigModal(null)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfigure}
                disabled={
                  !form.apiKey || !form.secretKey || !form.sellerId || configureMutation.isPending
                }
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {configureMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
