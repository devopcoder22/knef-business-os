'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  reference: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  dueDate: string | null;
  issuedAt: string;
  customer: { id: string; firstName: string; lastName: string; phone: string } | null;
}

interface InvoicesResponse {
  data: Invoice[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-400',
};

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<InvoicesResponse>({
    queryKey: ['invoices', page, search, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const res = await api().get<InvoicesResponse>(`/invoices?${params}`);
      return res.data;
    },
  });

  const invoices = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-1">Manage customer invoices and payments</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search invoice number or customer..."
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
            <option value="SENT">Sent</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="VOID">Void</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Balance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Due Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Issued</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : invoices.map((invoice) => {
                    const balance = parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount);
                    const isOverdue =
                      invoice.dueDate &&
                      new Date(invoice.dueDate) < new Date() &&
                      invoice.status !== 'PAID' &&
                      invoice.status !== 'VOID';
                    return (
                      <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/sales/invoices/${invoice.id}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {invoice.reference}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {invoice.customer ? (
                            <div>
                              <p className="font-medium text-gray-900">
                                {invoice.customer.firstName} {invoice.customer.lastName}
                              </p>
                              <p className="text-xs text-gray-400">{invoice.customer.phone}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Walk-in</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              STATUS_COLORS[invoice.status] ?? 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {Number(invoice.totalAmount).toLocaleString('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600">
                          {Number(invoice.paidAmount).toLocaleString('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={balance > 0.01 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                            {Number(balance).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {invoice.dueDate ? (
                            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {new Date(invoice.dueDate).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">
                          {new Date(invoice.issuedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No invoices found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of{' '}
              {meta.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
