'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Receipt, CreditCard, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG')}`;

const INVOICE_STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  UNPAID: 'bg-red-100 text-red-700',
  OVERDUE: 'bg-red-200 text-red-800',
};

export default function SupplierLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(threeMonthsAgo);
  const [endDate, setEndDate] = useState(today);
  const [fetchParams, setFetchParams] = useState({ startDate: threeMonthsAgo, endDate: today });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier-ledger', id, fetchParams.startDate, fetchParams.endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fetchParams.startDate) params.set('startDate', fetchParams.startDate);
      if (fetchParams.endDate) params.set('endDate', fetchParams.endDate);
      const res = await api().get<any>(`/suppliers/${id}/ledger?${params}`);
      return res.data;
    },
    enabled: !!id,
  });

  const supplier = data?.supplier;
  const invoices: any[] = data?.invoices ?? [];
  const payments: any[] = data?.payments ?? [];
  const summary = data?.summary;

  const handleApply = () => {
    setFetchParams({ startDate, endDate });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/suppliers"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Suppliers
        </Link>
        <span className="text-gray-300">/</span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isLoading ? (
              <span className="inline-block h-7 w-48 bg-gray-200 rounded animate-pulse" />
            ) : (
              supplier?.name ?? 'Supplier Ledger'
            )}
          </h1>
          {supplier?.code && (
            <p className="text-gray-400 font-mono text-xs mt-0.5">{supplier.code}</p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Invoiced</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(summary.totalInvoiced)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Paid</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(summary.totalPaid)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Outstanding</p>
            <p className={`text-2xl font-bold mt-1 ${summary.outstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {fmt(summary.outstanding)}
            </p>
          </div>
        </div>
      )}

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleApply}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle size={18} />
          Failed to load ledger. Please try again.
        </div>
      )}

      {/* Invoices table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
          <Receipt size={16} className="text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-sm">Invoices</h2>
          <span className="ml-auto text-xs text-gray-400">{invoices.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Balance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Invoice Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            INVOICE_STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800">{fmt(inv.amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{fmt(inv.paidAmount)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fmt(inv.amount - inv.paidAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {new Date(inv.invoiceDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
              {!isLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No invoices in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
          <CreditCard size={16} className="text-gray-500" />
          <h2 className="font-semibold text-gray-800 text-sm">Payments</h2>
          <span className="ml-auto text-xs text-gray-400">{payments.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Method</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : payments.map((pay: any) => (
                    <tr key={pay.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{pay.reference}</td>
                      <td className="px-4 py-3 text-gray-600">{pay.method}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(pay.amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {new Date(pay.paidAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
              {!isLoading && payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    No payments in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
