'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

const fmt = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG')}`;

export default function ApAgingPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ap-aging'],
    queryFn: async () => {
      const res = await api().get<any>('/suppliers/ap-aging');
      return res.data;
    },
  });

  const rows: any[] = data?.rows ?? [];
  const totals = data?.totals;
  const asOf = data?.asOf ? new Date(data.asOf).toLocaleDateString('en-NG', { dateStyle: 'long' }) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AP Aging Report</h1>
          <p className="text-gray-500 text-sm mt-1">
            Outstanding supplier invoices by age
            {asOf && <span className="ml-2 text-gray-400">— As of {asOf}</span>}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Printer size={16} />
          Print / Export
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Supplier</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Current</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">1–30 Days</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">31–60 Days</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">61–90 Days</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">90+ Days</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
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
                : rows.map((row: any) => (
                    <tr key={row.supplierId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.supplierName}</p>
                        <p className="text-xs text-gray-400 font-mono">{row.supplierCode}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(row.amounts.current)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{fmt(row.amounts.days1_30)}</td>
                      <td className="px-4 py-3 text-right text-orange-700">{fmt(row.amounts.days31_60)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{fmt(row.amounts.days61_90)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-700">{fmt(row.amounts.over90)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(row.amounts.total)}</td>
                    </tr>
                  ))}

              {/* Totals row */}
              {!isLoading && totals && (
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-gray-900">Totals</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmt(totals.current)}</td>
                  <td className="px-4 py-3 text-right text-amber-800">{fmt(totals.days1_30)}</td>
                  <td className="px-4 py-3 text-right text-orange-800">{fmt(totals.days31_60)}</td>
                  <td className="px-4 py-3 text-right text-red-700">{fmt(totals.days61_90)}</td>
                  <td className="px-4 py-3 text-right text-red-800">{fmt(totals.over90)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmt(totals.total)}</td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && !isError && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No outstanding payables found.
                  </td>
                </tr>
              )}

              {isError && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-red-500">
                    <AlertCircle size={32} className="mx-auto mb-2 opacity-60" />
                    <p>Failed to load AP aging data.</p>
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
