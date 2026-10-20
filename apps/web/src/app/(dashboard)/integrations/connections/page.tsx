'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Link2,
  Link2Off,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Plus,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProviderInfo {
  name: string;
  capabilities: {
    supportsOAuth: boolean;
    supportsApiKey: boolean;
    supportsRefreshToken: boolean;
    supportsWebhook: boolean;
    supportsPublishing: boolean;
    supportsAds: boolean;
  };
}

interface ExternalConnection {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  externalAccountId: string | null;
  externalAccountName: string | null;
  externalAccountEmail: string | null;
  tokenStatus: string | null;
  tokenExpiresAt: string | null;
  healthStatus: string | null;
  lastHealthCheckAt: string | null;
  errorCount: number;
  connectedAt: string | null;
  createdAt: string;
}

interface InitiateOAuthResponse {
  url: string;
  state: string;
}

// ── Provider meta ──────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; color: string; initial: string }> = {
  google: { label: 'Google', color: 'bg-red-500', initial: 'G' },
  meta: { label: 'Meta (Facebook / Instagram)', color: 'bg-blue-600', initial: 'M' },
  tiktok: { label: 'TikTok', color: 'bg-black', initial: 'T' },
  shopify: { label: 'Shopify', color: 'bg-green-600', initial: 'S' },
};

// ── Health badge ───────────────────────────────────────────────────────────────

function HealthBadge({ status }: { status: string | null }) {
  if (!status) return null;
  if (status === 'healthy')
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle2 size={13} /> Healthy
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
      <XCircle size={13} /> Unhealthy
    </span>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    disconnected: 'bg-gray-100 text-gray-500',
    pending: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-600',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', map[status] ?? 'bg-gray-100 text-gray-500')}>
      {status}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [connectProvider, setConnectProvider] = useState<string | null>(null);
  const [shopDomain, setShopDomain] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Show success banner when OAuth callback redirects back with ?connected=
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected) {
      const label = PROVIDER_META[connected]?.label ?? connected;
      setSuccessMsg(`${label} connected successfully.`);
      const t = setTimeout(() => setSuccessMsg(null), 6000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const { data: providersData } = useQuery<{ data: ProviderInfo[] }>({
    queryKey: ['integration-providers'],
    queryFn: async () => {
      const res = await api().get<{ data: ProviderInfo[] }>('/integrations/providers');
      return res.data;
    },
  });

  const { data: connectionsData, isLoading } = useQuery<{ data: ExternalConnection[] }>({
    queryKey: ['integration-connections'],
    queryFn: async () => {
      const res = await api().get<{ data: ExternalConnection[] }>('/integrations/connections');
      return res.data;
    },
  });

  const initiateMutation = useMutation({
    mutationFn: async ({
      provider,
      shopDomain: domain,
    }: {
      provider: string;
      shopDomain?: string;
    }) => {
      const res = await api().post<{ data: InitiateOAuthResponse }>(
        '/integrations/connections/oauth/initiate',
        { provider, shopDomain: domain },
      );
      return (res.data as unknown as { data: InitiateOAuthResponse }).data ?? res.data;
    },
    onSuccess: (data) => {
      window.location.href = (data as unknown as InitiateOAuthResponse).url;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/integrations/connections/${id}?revoke=true`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    },
  });

  const healthCheckMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api().post<{ data: { healthy: boolean; message: string } }>(
        `/integrations/connections/${id}/health-check`,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-connections'] });
    },
  });

  const providers = providersData?.data ?? (providersData as unknown as ProviderInfo[]) ?? [];
  const connections =
    connectionsData?.data ?? (connectionsData as unknown as ExternalConnection[]) ?? [];

  const handleConnect = () => {
    if (!connectProvider) return;
    initiateMutation.mutate({
      provider: connectProvider,
      shopDomain: connectProvider === 'shopify' ? shopDomain : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">External Connections</h1>
          <p className="text-gray-500 text-sm mt-1">
            Connect Google, Meta, TikTok, Shopify, and more via OAuth
          </p>
        </div>
        <button
          onClick={() => setConnectProvider('google')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Connection
        </button>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 size={16} className="text-green-600" />
          <p className="text-sm text-green-800">{successMsg}</p>
        </div>
      )}

      {/* Active connections */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Connected Accounts</h2>

        {isLoading ? (
          <div className="text-gray-400 text-sm">Loading connections...</div>
        ) : connections.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <Link2 size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No external accounts connected yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click "Add Connection" to link a provider.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => {
              const meta = PROVIDER_META[conn.provider];
              return (
                <div
                  key={conn.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0',
                      meta?.color ?? 'bg-gray-400',
                    )}
                  >
                    {meta?.initial ?? conn.provider[0]?.toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">
                        {meta?.label ?? conn.provider}
                      </span>
                      <StatusBadge status={conn.status} />
                      <HealthBadge status={conn.healthStatus} />
                    </div>
                    {conn.externalAccountName && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {conn.externalAccountName}
                        {conn.externalAccountEmail ? ` · ${conn.externalAccountEmail}` : ''}
                      </p>
                    )}
                    {conn.connectedAt && (
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock size={11} />
                        Connected {new Date(conn.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                    {conn.errorCount > 0 && (
                      <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                        <AlertTriangle size={11} />
                        {conn.errorCount} error{conn.errorCount !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => healthCheckMutation.mutate(conn.id)}
                      disabled={healthCheckMutation.isPending}
                      title="Run health check"
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ShieldCheck size={15} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Disconnect ${meta?.label ?? conn.provider}?`)) {
                          disconnectMutation.mutate(conn.id);
                        }
                      }}
                      disabled={disconnectMutation.isPending}
                      title="Disconnect"
                      className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Link2Off size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available providers */}
      {providers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Available Providers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {providers.map((p) => {
              const meta = PROVIDER_META[p.name];
              const isConnected = connections.some(
                (c) => c.provider === p.name && c.status === 'active',
              );
              return (
                <div
                  key={p.name}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0',
                      meta?.color ?? 'bg-gray-400',
                    )}
                  >
                    {meta?.initial ?? p.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {meta?.label ?? p.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[
                        p.capabilities.supportsAds && 'Ads',
                        p.capabilities.supportsPublishing && 'Publishing',
                        p.capabilities.supportsWebhook && 'Webhooks',
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'OAuth'}
                    </p>
                  </div>
                  {isConnected ? (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 size={13} /> Connected
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setConnectProvider(p.name);
                        setShopDomain('');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink size={13} />
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Connect modal */}
      {connectProvider && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-5">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
                  PROVIDER_META[connectProvider]?.color ?? 'bg-gray-400',
                )}
              >
                {PROVIDER_META[connectProvider]?.initial ?? connectProvider[0]?.toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Connect {PROVIDER_META[connectProvider]?.label ?? connectProvider}
                </h3>
                <p className="text-xs text-gray-400">You will be redirected to authorize</p>
              </div>
            </div>

            {connectProvider === 'shopify' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shopify Store Domain
                </label>
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {initiateMutation.isError && (
              <p className="mb-3 text-sm text-red-600">
                Failed to start OAuth flow. Please try again.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConnectProvider(null)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={
                  initiateMutation.isPending ||
                  (connectProvider === 'shopify' && !shopDomain.trim())
                }
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {initiateMutation.isPending ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <ExternalLink size={14} />
                    Authorize
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
