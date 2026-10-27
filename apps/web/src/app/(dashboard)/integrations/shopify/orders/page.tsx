'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ShopifyConnection {
  id: string;
  displayName: string;
  externalAccountName: string | null;
}

interface ImportedOrder {
  id: string;
  orderNumber: string;
  externalOrderId: string;
  externalOrderName: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  customerName?: string;
  createdAt: string;
  updatedAt: string;
}

interface OrdersResponse {
  data: ImportedOrder[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  SHIPPED: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
  REFUNDED: 'bg-gray-100 text-gray-600',
};

export default function ShopifyOrdersPage() {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('connectionId'));
  const [page, setPage] = useState(1);

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

  const { data: ordersData, isLoading } = useQuery<OrdersResponse>({
    queryKey: ['shopify-orders', connectionId, page],
    queryFn: async () => {
      const res = await api().get(
        `/shopify/connections/${connectionId}/orders?page=${page}&limit=20`,
      );
      return (res.data as any)?.data ?? res.data;
    },
    enabled: !!connectionId,
  });

  const orders = ordersData?.data ?? [];
  const meta = ordersData?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/integrations/shopify" className="text-gray-400 hover:text-gray-600 text-sm">Shopify</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-700">Orders</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Shopify Orders</h1>
        <p className="text-gray-500 text-sm mt-1">Orders imported from your Shopify store</p>
      </div>

      {/* Connection selector */}
      {connections.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Store:</span>
          <select
            value={connectionId ?? ''}
            onChange={e => { setSelectedId(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {connections.map(c => (
              <option key={c.id} value={c.id}>{c.displayName ?? c.externalAccountName ?? c.id}</option>
            ))}
          </select>
        </div>
      )}

      {!connectionId ? (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <ShoppingCart size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No Shopify connection. <Link href="/integrations/connections" className="text-blue-600 underline">Connect now</Link></p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Shopify Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">KNEF #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Customer</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Imported</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : orders.map(order => (
                      <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{order.externalOrderName ?? order.externalOrderId}</p>
                          <p className="text-xs text-gray-400 font-mono">{order.externalOrderId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{order.orderNumber}</td>
                        <td className="px-4 py-3 text-gray-600">{order.customerName ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {Number(order.totalAmount).toLocaleString('en-NG', {
                            style: 'currency',
                            currency: order.currency || 'NGN',
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500')}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/sales/${order.id}`}
                            title="View order"
                            className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 inline-flex items-center"
                          >
                            <Eye size={13} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                {!isLoading && orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                      <p>No Shopify orders imported yet</p>
                      <p className="text-xs mt-1">Orders are imported automatically via webhook when placed on Shopify</p>
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
