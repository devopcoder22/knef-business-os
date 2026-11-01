'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Users, ArrowUpDown } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CustomerTag {
  id: string;
  name: string;
  color: string;
}

interface Customer {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  city: string | null;
  state: string | null;
  loyaltyPoints: number;
  totalSpent: string;
  outstandingBalance: string;
  isActive: boolean;
  createdAt: string;
  tags: CustomerTag[];
  segments: string[];
}

interface CustomersResponse {
  data: Customer[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const SEGMENT_BADGE: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'bg-blue-100 text-blue-700' },
  ACTIVE: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  REPEAT: { label: 'Repeat', cls: 'bg-indigo-100 text-indigo-700' },
  HIGH_VALUE: { label: 'High Value', cls: 'bg-amber-100 text-amber-700' },
  AT_RISK: { label: 'At Risk', cls: 'bg-orange-100 text-orange-700' },
  INACTIVE: { label: 'Inactive', cls: 'bg-gray-100 text-gray-500' },
  OUTSTANDING_BALANCE: { label: 'Balance Due', cls: 'bg-red-100 text-red-700' },
};

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hasOutstanding, setHasOutstanding] = useState(false);

  const { data, isLoading } = useQuery<CustomersResponse>({
    queryKey: ['customers', page, search, isActiveFilter, sortBy, sortDir, hasOutstanding],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20', sortBy, sortDir });
      if (search) params.set('search', search);
      if (isActiveFilter !== '') params.set('isActive', isActiveFilter);
      if (hasOutstanding) params.set('hasOutstanding', 'true');
      const res = await api().get<CustomersResponse>(`/customers?${params}`);
      return res.data;
    },
  });

  const customers = data?.data ?? [];
  const meta = data?.meta;

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm mt-1">
            {meta ? `${meta.total.toLocaleString()} total` : 'Manage your customer base'}
          </p>
        </div>
        <Link
          href="/customers/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Customer
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search name, phone, email, code..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={isActiveFilter}
            onChange={(e) => { setIsActiveFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <label className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={hasOutstanding}
              onChange={(e) => { setHasOutstanding(e.target.checked); setPage(1); }}
              className="rounded"
            />
            Balance due
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-700 cursor-pointer hover:text-blue-600 select-none"
                  onClick={() => toggleSort('totalSpent')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Total Spent
                    <ArrowUpDown size={12} className={cn(sortBy === 'totalSpent' ? 'text-blue-500' : 'text-gray-300')} />
                  </span>
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-700 cursor-pointer hover:text-blue-600 select-none"
                  onClick={() => toggleSort('outstandingBalance')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Outstanding
                    <ArrowUpDown size={12} className={cn(sortBy === 'outstandingBalance' ? 'text-blue-500' : 'text-gray-300')} />
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Segments</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
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
                : customers.map((customer) => (
                    <tr key={customer.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/customers/${customer.id}`} className="flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-700">
                            {customer.firstName[0]}{customer.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 group-hover:text-blue-600">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">{customer.code}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{customer.phone}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {[customer.city, customer.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {Number(customer.totalSpent).toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Number(customer.outstandingBalance) > 0 ? (
                          <span className="font-semibold text-red-600">
                            {Number(customer.outstandingBalance).toLocaleString('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {customer.segments.slice(0, 2).map((seg) => {
                            const badge = SEGMENT_BADGE[seg];
                            return badge ? (
                              <span key={seg} className={cn('px-1.5 py-0.5 rounded text-xs font-medium', badge.cls)}>
                                {badge.label}
                              </span>
                            ) : null;
                          })}
                          {customer.tags.slice(0, 2).map((tag) => (
                            <span key={tag.id} className="px-1.5 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', customer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {customer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
              {!isLoading && customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Users size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No customers found</p>
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
