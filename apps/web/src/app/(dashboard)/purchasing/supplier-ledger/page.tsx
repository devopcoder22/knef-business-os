'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, BookOpen, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

export default function SupplierLedgerListPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers-list-ledger'],
    queryFn: async () => {
      const res = await api().get<any>('/suppliers?page=1&limit=50');
      return res.data;
    },
  });

  const suppliers: any[] = data?.data ?? [];

  const filtered = suppliers.filter((s: any) => {
    const q = search.toLowerCase();
    return (
      !q ||
      s.name?.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supplier Ledgers</h1>
        <p className="text-gray-500 text-sm mt-1">
          Select a supplier to view their invoice and payment history
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Suppliers table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Code</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 3 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((s: any) => (
                    <tr
                      key={s.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <BookOpen size={14} className="text-blue-600" />
                          </div>
                          <span className="font-medium text-gray-900">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.code ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/suppliers/${s.id}/ledger`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View Ledger
                          <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-gray-400">
                    <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                    <p>No suppliers found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && data?.meta && (
          <div className="px-4 py-2.5 border-t border-gray-200 text-xs text-gray-400">
            Showing {filtered.length} of {suppliers.length} suppliers
          </div>
        )}
      </div>
    </div>
  );
}
