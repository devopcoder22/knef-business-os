'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  RefreshCw,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ShopifyConnection {
  id: string;
  displayName: string;
  externalAccountName: string | null;
}

interface ProductMapping {
  id: string;
  productId: string;
  shopifyProductId: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    status: string;
  };
}

interface MappingsResponse {
  data: ProductMapping[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  synced: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-600',
  archived: 'bg-gray-100 text-gray-500',
};

export default function ShopifyProductsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('connectionId'));
  const [page, setPage] = useState(1);
  const [actionProduct, setActionProduct] = useState<string | null>(null);
  const [publishProductId, setPublishProductId] = useState('');
  const [showPublishForm, setShowPublishForm] = useState(false);

  const { data: connectionsData } = useQuery<{ data: ShopifyConnection[] }>({
    queryKey: ['shopify-connections'],
    queryFn: async () => {
      const res = await api().get('/integrations/connections');
      const all = (res.data as any)?.data ?? res.data ?? [];
      const shopify = Array.isArray(all) ? all.filter((c: any) => c.provider === 'shopify') : [];
      return { data: shopify };
    },
  });

  const connections = connectionsData?.data ?? [];
  const connectionId = selectedId ?? connections[0]?.id ?? null;

  const { data: mappingsData, isLoading } = useQuery<MappingsResponse>({
    queryKey: ['shopify-product-mappings', connectionId, page],
    queryFn: async () => {
      const res = await api().get(
        `/shopify/connections/${connectionId}/products/mappings?page=${page}&limit=20`,
      );
      return (res.data as any)?.data ?? res.data;
    },
    enabled: !!connectionId,
  });

  const syncMutation = useMutation({
    mutationFn: async (productId: string) => {
      setActionProduct(productId);
      const res = await api().post(
        `/shopify/connections/${connectionId}/products/${productId}/sync`,
      );
      return res.data;
    },
    onSettled: () => {
      setActionProduct(null);
      queryClient.invalidateQueries({ queryKey: ['shopify-product-mappings', connectionId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await api().post(
        `/shopify/connections/${connectionId}/products/${productId}/publish`,
      );
      return res.data;
    },
    onSuccess: () => {
      setShowPublishForm(false);
      setPublishProductId('');
      queryClient.invalidateQueries({ queryKey: ['shopify-product-mappings', connectionId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      setActionProduct(productId);
      await api().delete(
        `/shopify/connections/${connectionId}/products/${productId}/mapping`,
      );
    },
    onSettled: () => {
      setActionProduct(null);
      queryClient.invalidateQueries({ queryKey: ['shopify-product-mappings', connectionId] });
    },
  });

  const mappings = mappingsData?.data ?? [];
  const meta = mappingsData?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/integrations/shopify"
              className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm"
            >
              Shopify
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-medium text-gray-700">Products</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Product Mappings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Products synced between KNEF and your Shopify store
          </p>
        </div>
        <button
          onClick={() => setShowPublishForm(true)}
          disabled={!connectionId}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <Plus size={16} /> Publish Product
        </button>
      </div>

      {/* Connection selector */}
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

      {/* Publish form modal */}
      {showPublishForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Publish Product to Shopify</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
              <input
                type="text"
                value={publishProductId}
                onChange={e => setPublishProductId(e.target.value)}
                placeholder="KNEF product ID"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Find the product ID on the{' '}
                <Link href="/products" className="text-blue-600 underline">Products page</Link>.
              </p>
            </div>
            {publishMutation.isError && (
              <p className="text-sm text-red-600 mb-3">Publish failed. Check the product ID and try again.</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowPublishForm(false); setPublishProductId(''); }}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => publishMutation.mutate(publishProductId)}
                disabled={!publishProductId.trim() || publishMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {publishMutation.isPending ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mappings table */}
      {!connectionId ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No Shopify connection. <Link href="/integrations/connections" className="text-blue-600 underline">Connect now</Link></p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Product</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Shopify ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Last Synced</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : mappings.map(m => (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-[200px]">{m.product.name}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{m.product.sku}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs truncate max-w-[130px]">{m.shopifyProductId}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[m.syncStatus] ?? 'bg-gray-100 text-gray-500')}>
                            {m.syncStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {m.lastSyncedAt ? new Date(m.lastSyncedAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => syncMutation.mutate(m.product.id)}
                              disabled={actionProduct === m.product.id}
                              title="Sync to Shopify"
                              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <RefreshCw size={13} className={cn(actionProduct === m.product.id && 'animate-spin')} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Remove this product mapping?')) {
                                  deleteMutation.mutate(m.product.id);
                                }
                              }}
                              disabled={actionProduct === m.product.id}
                              title="Remove mapping"
                              className="p-1.5 rounded border border-red-200 text-red-400 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                {!isLoading && mappings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <Package size={28} className="mx-auto mb-2 opacity-40" />
                      <p>No product mappings yet</p>
                      <p className="text-xs mt-1">Use "Publish Product" to sync your first product</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                  className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
