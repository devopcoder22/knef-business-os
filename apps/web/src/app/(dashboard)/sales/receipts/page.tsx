'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { api } from '@/lib/api';

interface SalesReceipt {
  id: string;
  reference: string;
  amount: string;
  currency: string;
  method: string;
  issuedAt: string;
  notes: string | null;
  invoiceId: string;
  customerId: string | null;
  invoice: { id: string; reference: string; status: string };
}

interface ReceiptsResponse {
  data: SalesReceipt[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Transfer',
  CHEQUE: 'Cheque',
  CRYPTO: 'Crypto',
  OTHER: 'Other',
};

export default function SalesReceiptsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<ReceiptsResponse>({
    queryKey: ['sales-receipts', page],
    queryFn: async () => {
      const res = await api().get<ReceiptsResponse>(`/receipts?page=${page}&limit=20`);
      return res.data;
    },
  });

  const receipts = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
          <p className="text-gray-500 text-sm mt-1">Payment receipts issued to customers</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Invoice</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Method</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Issued</th>
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
                        <Link href={`/sales/receipts/${receipt.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {receipt.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/sales/invoices/${receipt.invoiceId}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {receipt.invoice.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {METHOD_LABELS[receipt.method] ?? receipt.method}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {Number(receipt.amount).toLocaleString('en-NG', { style: 'currency', currency: receipt.currency })}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {new Date(receipt.issuedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
              {!isLoading && receipts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No receipts found</p>
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
