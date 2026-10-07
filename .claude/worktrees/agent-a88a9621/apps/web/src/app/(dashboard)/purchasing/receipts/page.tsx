'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Package } from 'lucide-react';
import { api } from '@/lib/api';

interface GoodsReceipt {
  id: string;
  reference: string;
  receivedAt: string;
  createdAt: string;
  notes: string | null;
  purchaseOrder: {
    id: string;
    reference: string;
    supplier: { id: string; name: string };
  };
  items: Array<{ quantityReceived: number }>;
}

interface ReceiptsResponse {
  data: GoodsReceipt[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function GoodsReceiptsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<ReceiptsResponse>({
    queryKey: ['goods-receipts', page],
    queryFn: async () => {
      const res = await api().get<ReceiptsResponse>(`/goods-receipts?page=${page}&limit=20`);
      return res.data;
    },
  });

  const receipts = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goods Receipts</h1>
          <p className="text-gray-500 text-sm mt-1">Track received inventory from suppliers</p>
        </div>
        <Link
          href="/purchasing/receipts/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Receive Goods
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Purchase Order</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Supplier</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">Items</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Received Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : receipts.map((receipt) => (
                    <tr key={receipt.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-blue-600">{receipt.reference}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/purchasing/orders/${receipt.purchaseOrder.id}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {receipt.purchaseOrder.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{receipt.purchaseOrder.supplier.name}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {receipt.items.reduce((sum, i) => sum + i.quantityReceived, 0)} units
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {new Date(receipt.receivedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
              {!isLoading && receipts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No goods receipts found</p>
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
