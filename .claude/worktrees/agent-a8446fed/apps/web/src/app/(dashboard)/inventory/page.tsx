'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Warehouse,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Package,
  ArrowRight,
  Download,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface InventoryLevel {
  id: string;
  productId: string;
  quantity: number;
  reserved: number;
  incoming: number;
  product: {
    id: string;
    name: string;
    sku: string;
    lowStockAlert: number;
    status: string;
  };
  location: {
    id: string;
    name: string;
    code: string;
  };
  variant?: {
    id: string;
    name: string;
    sku: string;
  } | null;
}

interface DashboardSummary {
  totalProducts: number;
  totalSKUs: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalInventoryValue: number;
  recentMovements: any[];
}

export default function InventoryPage() {
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 30;

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ['inventory-summary', locationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (locationId) params.set('locationId', locationId);
      const res = await api().get<DashboardSummary>(`/inventory/summary?${params}`);
      return (res.data as any);
    },
  });

  const { data: levelsData, isLoading: levelsLoading } = useQuery<InventoryLevel[]>({
    queryKey: ['inventory-levels', locationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (locationId) params.set('locationId', locationId);
      const res = await api().get<InventoryLevel[]>(`/inventory?${params}`);
      return (res.data as any);
    },
  });

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await api().get('/locations');
      return (res.data as any)?.data ?? [];
    },
  });

  const levels = levelsData ?? [];
  const filtered = levels.filter((l) => {
    if (!search) return true;
    return (
      l.product.name.toLowerCase().includes(search.toLowerCase()) ||
      l.product.sku.toLowerCase().includes(search.toLowerCase())
    );
  });

  const paginatedLevels = filtered.slice((page - 1) * LIMIT, page * LIMIT);
  const totalPages = Math.ceil(filtered.length / LIMIT);

  const getStockStatus = (level: InventoryLevel) => {
    if (level.quantity === 0) return 'out';
    if (level.quantity <= level.product.lowStockAlert) return 'low';
    return 'ok';
  };

  const exportCSV = () => {
    const rows = [
      ['Product', 'SKU', 'Location', 'Stock', 'Reserved', 'Incoming', 'Status'],
      ...filtered.map((l) => [
        l.product.name,
        l.product.sku,
        l.location.name,
        l.quantity,
        l.reserved,
        l.incoming,
        getStockStatus(l),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-1">Stock levels across all locations</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={15} />
            Export CSV
          </button>
          <div className="flex gap-2">
            <Link
              href="/inventory/transfers"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Transfers
              <ArrowRight size={13} />
            </Link>
            <Link
              href="/inventory/adjustments"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Adjustments
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Products',
            value: summary?.totalProducts ?? 0,
            icon: Package,
            color: 'bg-blue-500',
          },
          {
            label: 'Total SKUs',
            value: summary?.totalSKUs ?? 0,
            icon: Warehouse,
            color: 'bg-purple-500',
          },
          {
            label: 'Low Stock',
            value: summary?.lowStockCount ?? 0,
            icon: AlertTriangle,
            color: 'bg-amber-500',
          },
          {
            label: 'Out of Stock',
            value: summary?.outOfStockCount ?? 0,
            icon: TrendingDown,
            color: 'bg-red-500',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', card.color)}>
                <card.icon size={18} className="text-white" />
              </div>
            </div>
            {summaryLoading ? (
              <div className="h-7 bg-gray-100 rounded animate-pulse w-16" />
            ) : (
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Inventory value */}
      {summary && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 text-white">
          <div className="flex items-center gap-3">
            <DollarSign size={20} className="opacity-80" />
            <div>
              <p className="text-sm opacity-80">Total Inventory Value (at cost)</p>
              <p className="text-3xl font-bold mt-0.5">
                {summary.totalInventoryValue.toLocaleString('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search product or SKU..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Locations</option>
          {(locationsData ?? []).map((loc: any) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      </div>

      {/* Levels table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Available</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Reserved</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Incoming</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {levelsLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : paginatedLevels.map((level) => {
                    const stockStatus = getStockStatus(level);
                    return (
                      <tr
                        key={level.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${level.productId}`}
                            className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            {level.product.name}
                          </Link>
                          {level.variant && (
                            <p className="text-xs text-gray-400">{level.variant.name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {level.variant?.sku ?? level.product.sku}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {level.location.name}{' '}
                          <span className="text-xs text-gray-400">({level.location.code})</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {level.quantity - level.reserved}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-600">
                          {level.reserved}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          {level.incoming}
                        </td>
                        <td className="px-4 py-3">
                          {stockStatus === 'out' ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              Out of stock
                            </span>
                          ) : stockStatus === 'low' ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 w-fit">
                              <AlertTriangle size={10} />
                              Low
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              {!levelsLoading && paginatedLevels.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Warehouse size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No inventory levels found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {filtered.length} records
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
