'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Webhook,
  Package,
  MapPin,
  ShoppingCart,
  BarChart2,
  ExternalLink,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ShopifyConnection {
  id: string;
  displayName: string;
  status: string;
  healthStatus: string | null;
  externalAccountName: string | null;
  externalAccountEmail: string | null;
  connectedAt: string | null;
  errorCount: number;
  metadata: Record<string, unknown> | null;
}

interface ShopifyOverview {
  shopName: string;
  shopDomain: string;
  plan: string;
  currency: string;
  timezone: string;
  syncedProducts: number;
  importedOrders: number;
  locationMappings: number;
  lastProductSync: string | null;
  lastOrderImport: string | null;
}

function StatCard({ label, value, icon: Icon, href }: { label: string; value: string | number; icon: React.ElementType; href?: string }) {
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:border-blue-300 transition-colors">
      <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
        <Icon size={18} className="text-blue-600" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      {href && <ChevronRight size={16} className="ml-auto text-gray-300" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function ShopifyPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const { data: connectionsData, isLoading: loadingConns } = useQuery<{ data: ShopifyConnection[] }>({
    queryKey: ['shopify-connections'],
    queryFn: async () => {
      const res = await api().get<{ data: ShopifyConnection[] }>('/integrations/connections?provider=shopify');
      const all = (res.data as unknown as ShopifyConnection[]) ?? res.data?.data ?? [];
      const shopify = Array.isArray(all) ? all.filter((c: ShopifyConnection) => (c as any).provider === 'shopify') : all;
      return { data: shopify } as { data: ShopifyConnection[] };
    },
  });

  const connections = connectionsData?.data ?? [];
  const connectionId = selectedId ?? connections[0]?.id ?? null;
  const activeConn = connections.find(c => c.id === connectionId) ?? connections[0] ?? null;

  const { data: overviewData, isLoading: loadingOverview } = useQuery<ShopifyOverview>({
    queryKey: ['shopify-overview', connectionId],
    queryFn: async () => {
      const res = await api().get<ShopifyOverview>(`/shopify/connections/${connectionId}/overview`);
      return (res.data as any)?.data ?? res.data;
    },
    enabled: !!connectionId,
  });

  const healthMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post(`/shopify/connections/${connectionId}/health-check`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopify-connections'] });
      setActionMsg('Health check completed');
      setTimeout(() => setActionMsg(null), 4000);
    },
  });

  const webhookMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post(`/shopify/connections/${connectionId}/webhooks/register`);
      return res.data;
    },
    onSuccess: () => {
      setActionMsg('Webhooks registered successfully');
      setTimeout(() => setActionMsg(null), 4000);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post(`/shopify/connections/${connectionId}/reconcile`);
      return res.data;
    },
    onSuccess: () => {
      setActionMsg('Reconciliation complete');
      setTimeout(() => setActionMsg(null), 4000);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <ShoppingBag size={16} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Shopify</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">Manage your Shopify store integration</p>
        </div>
        <Link
          href="/integrations/connections"
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
        >
          <ExternalLink size={14} />
          Manage Connections
        </Link>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 size={14} />
          {actionMsg}
        </div>
      )}

      {loadingConns ? (
        <div className="text-sm text-gray-400">Loading connections...</div>
      ) : connections.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <ShoppingBag size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">No Shopify store connected</p>
          <p className="text-gray-400 text-sm mt-1">Go to Connections to authorize your Shopify store.</p>
          <Link
            href="/integrations/connections"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
          >
            <ExternalLink size={14} /> Connect Shopify
          </Link>
        </div>
      ) : (
        <>
          {/* Connection selector (if multiple) */}
          {connections.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Store:</span>
              <select
                value={connectionId ?? ''}
                onChange={e => setSelectedId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {connections.map(c => (
                  <option key={c.id} value={c.id}>{c.displayName ?? c.externalAccountName ?? c.id}</option>
                ))}
              </select>
            </div>
          )}

          {/* Connection health card */}
          {activeConn && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <ShoppingBag size={20} className="text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {activeConn.externalAccountName ?? activeConn.displayName}
                    </p>
                    {activeConn.externalAccountEmail && (
                      <p className="text-xs text-gray-400">{activeConn.externalAccountEmail}</p>
                    )}
                    {activeConn.connectedAt && (
                      <p className="text-xs text-gray-400">
                        Connected {new Date(activeConn.connectedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activeConn.healthStatus === 'healthy' ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle2 size={13} /> Healthy
                    </span>
                  ) : activeConn.healthStatus === 'degraded' ? (
                    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                      <XCircle size={13} /> Unhealthy
                    </span>
                  ) : null}
                  {activeConn.errorCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                      <AlertTriangle size={13} /> {activeConn.errorCount} errors
                    </span>
                  )}
                </div>
              </div>

              {/* Overview stats */}
              {loadingOverview ? (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : overviewData && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Synced Products" value={overviewData.syncedProducts} icon={Package} href={`/integrations/shopify/products?connectionId=${connectionId}`} />
                  <StatCard label="Imported Orders" value={overviewData.importedOrders} icon={ShoppingCart} href={`/integrations/shopify/orders?connectionId=${connectionId}`} />
                  <StatCard label="Location Mappings" value={overviewData.locationMappings} icon={MapPin} href={`/integrations/shopify/locations?connectionId=${connectionId}`} />
                  <StatCard label="Currency" value={overviewData.currency} icon={BarChart2} />
                </div>
              )}

              {/* Shop info */}
              {overviewData && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
                  <p><span className="font-medium text-gray-700">Shop:</span> {overviewData.shopName}</p>
                  <p><span className="font-medium text-gray-700">Domain:</span> {overviewData.shopDomain}</p>
                  <p><span className="font-medium text-gray-700">Plan:</span> {overviewData.plan}</p>
                  <p><span className="font-medium text-gray-700">Timezone:</span> {overviewData.timezone}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {connectionId && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => healthMutation.mutate()}
                  disabled={healthMutation.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} className={cn(healthMutation.isPending && 'animate-spin')} />
                  Health Check
                </button>
                <button
                  onClick={() => webhookMutation.mutate()}
                  disabled={webhookMutation.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Webhook size={14} className={cn(webhookMutation.isPending && 'animate-spin')} />
                  Register Webhooks
                </button>
                <button
                  onClick={() => reconcileMutation.mutate()}
                  disabled={reconcileMutation.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={cn(reconcileMutation.isPending && 'animate-spin')} />
                  Reconcile Now
                </button>
                <Link
                  href={`/integrations/shopify/products?connectionId=${connectionId}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <Package size={14} /> Product Mappings
                </Link>
                <Link
                  href={`/integrations/shopify/locations?connectionId=${connectionId}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <MapPin size={14} /> Location Mappings
                </Link>
                <Link
                  href={`/integrations/shopify/orders?connectionId=${connectionId}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <ShoppingCart size={14} /> View Orders
                </Link>
                <Link
                  href={`/integrations/shopify/reconciliation?connectionId=${connectionId}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <BarChart2 size={14} /> Reconciliation
                </Link>
              </div>

              {(healthMutation.isError || webhookMutation.isError || reconcileMutation.isError) && (
                <p className="mt-2 text-xs text-red-600">
                  Action failed. Please try again.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
