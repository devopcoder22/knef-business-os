'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(n);
}

interface PurchasingSummary {
  totalOrders: number;
  totalValue: number;
  totalPaid: number;
  totalOutstanding: number;
  bySupplier: { supplierId: string; name: string; orders: number; value: number; paid: number; outstanding: number }[];
  byStatus: { status: string; count: number; value: number }[];
  avgLeadDays: number;
}

interface SupplierReport {
  supplierId: string;
  name: string;
  orders: number;
  value: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  rating: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-indigo-100 text-indigo-700',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

function PurchasingReportContent() {
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? monthStart);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? today);
  const [supplierId, setSupplierId] = useState('');

  const dateParams = `startDate=${startDate}&endDate=${endDate}`;

  const { data: summaryRes, isLoading: summaryLoading } = useQuery<{ data: PurchasingSummary }>({
    queryKey: ['reports-purchasing-summary', startDate, endDate, supplierId],
    queryFn: () => {
      const p = new URLSearchParams({ startDate, endDate });
      if (supplierId) p.set('supplierId', supplierId);
      return api().get<{ data: PurchasingSummary }>(`/reports/purchasing/summary?${p}`).then(r => r.data);
    },
  });

  const { data: suppliersRes, isLoading: suppliersLoading } = useQuery<{ data: SupplierReport[] }>({
    queryKey: ['reports-purchasing-suppliers', startDate, endDate],
    queryFn: () =>
      api().get<{ data: SupplierReport[] }>(`/reports/purchasing/suppliers?${dateParams}`).then(r => r.data),
  });

  const summary = summaryRes?.data;
  const suppliers = suppliersRes?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchasing Report</h1>
        <div className="flex gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: String(summary?.totalOrders ?? 0) },
          { label: 'Total Value', value: fmt(summary?.totalValue ?? 0) },
          { label: 'Total Paid', value: fmt(summary?.totalPaid ?? 0) },
          { label: 'Outstanding', value: fmt(summary?.totalOutstanding ?? 0) },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-500">Avg Lead Time</p>
        <p className="text-xl font-bold text-gray-900 mt-1">{summary?.avgLeadDays ?? 0} days</p>
      </div>

      {/* By Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Orders by Status</h3>
        <div className="flex flex-wrap gap-3">
          {(summary?.byStatus ?? []).map(s => (
            <div key={s.status} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-700')}>
                {s.status}
              </span>
              <span className="text-sm font-medium text-gray-900">{s.count}</span>
              <span className="text-xs text-gray-400">{fmt(s.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By Supplier table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">By Supplier</h3>
        {summaryLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 font-medium text-right">Orders</th>
                  <th className="pb-2 font-medium text-right">Value</th>
                  <th className="pb-2 font-medium text-right">Paid</th>
                  <th className="pb-2 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(summary?.bySupplier ?? []).map(s => (
                  <tr key={s.supplierId} className="hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{s.name}</td>
                    <td className="py-2.5 text-right">{s.orders}</td>
                    <td className="py-2.5 text-right">{fmt(s.value)}</td>
                    <td className="py-2.5 text-right text-emerald-600">{fmt(s.paid)}</td>
                    <td className="py-2.5 text-right text-red-600">{fmt(s.outstanding)}</td>
                  </tr>
                ))}
                {(summary?.bySupplier ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                      No purchasing data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Performance */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Supplier Performance</h3>
        {suppliersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 font-medium text-right">Orders</th>
                  <th className="pb-2 font-medium text-right">Value</th>
                  <th className="pb-2 font-medium text-right">On Time</th>
                  <th className="pb-2 font-medium text-right">Late</th>
                  <th className="pb-2 font-medium text-right">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {suppliers.map(s => (
                  <tr key={s.supplierId} className="hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{s.name}</td>
                    <td className="py-2.5 text-right">{s.orders}</td>
                    <td className="py-2.5 text-right">{fmt(s.value)}</td>
                    <td className="py-2.5 text-right text-emerald-600">{s.onTimeDeliveries}</td>
                    <td className="py-2.5 text-right text-red-600">{s.lateDeliveries}</td>
                    <td className="py-2.5 text-right">
                      {s.rating !== null ? (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          {s.rating}/5
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                      No supplier data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PurchasingReportPage() {
  return (
    <Suspense fallback={<div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />}>
      <PurchasingReportContent />
    </Suspense>
  );
}
