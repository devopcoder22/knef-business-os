'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SalesOrder {
  id: string;
  reference: string;
  status: string;
  channel: string;
  totalAmount: string;
  paidAmount: string;
  currency: string;
  createdAt: string;
  completedAt: string | null;
  customer: { id: string; firstName: string; lastName: string; phone: string } | null;
  location: { id: string; name: string };
  _count: { items: number };
}

interface OrdersResponse {
  data: SalesOrder[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-purple-100 text-purple-700',
  PARTIAL_REFUND: 'bg-orange-100 text-orange-700',
};

export default function SalesOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<OrdersResponse>({
    queryKey: ['sales-orders', page, search, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const res = await api().get<OrdersResponse>(`/sales-orders?${params}`);
      return res.data;
    },
  });

  const orders = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
          <p className="text-gray-500 text-sm mt-1">Manage all sales transactions</p>
        </div>
        <Link
          href="/sales/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Order
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search reference or customer..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Channel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Paid</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">Items</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : orders.map((order) => {
                    const balance = parseFloat(order.totalAmount) - parseFloat(order.paidAmount);
                    return (
                      <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/sales/orders/${order.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                            {order.reference}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {order.customer ? (
                            <div>
                              <p className="font-medium text-gray-900">
                                {order.customer.firstName} {order.customer.lastName}
                              </p>
                              <p className="text-xs text-gray-400">{order.customer.phone}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Walk-in</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{order.location.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {order.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600')}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {Number(order.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={balance > 0.01 ? 'text-amber-600' : 'text-green-600'}>
                            {Number(order.paidAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{order._count.items}</td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No orders found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
