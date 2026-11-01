'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type PriceType = 'COST' | 'SELLING';

interface PriceHistory {
  id: string;
  productId: string;
  priceType: PriceType;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  source: string | null;
  changedBy: string | null;
  product: { name: string; sku: string };
}

interface PriceHistoryResponse {
  data: PriceHistory[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(naira);
}

function pctChange(oldPrice: number, newPrice: number): number | null {
  if (!oldPrice) return null;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

export default function PriceHistoryPage() {
  const [page, setPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [priceType, setPriceType] = useState<'' | PriceType>('');

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: async () => {
      const res = await api().get('/products?limit=200');
      return (res.data as any)?.data ?? [];
    },
  });

  const products: any[] = productsData ?? [];

  const filteredProducts = productSearch
    ? products.filter(
        (p: any) =>
          p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
          p.sku?.toLowerCase().includes(productSearch.toLowerCase()),
      )
    : products;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  if (productId) queryParams.set('productId', productId);
  if (priceType) queryParams.set('priceType', priceType);

  const { data, isLoading } = useQuery<PriceHistoryResponse>({
    queryKey: ['price-history', page, productId, priceType],
    queryFn: async () => {
      const res = await api().get<PriceHistoryResponse>(`/price-history?${queryParams.toString()}`);
      return res.data;
    },
  });

  const history = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price History</h1>
          <p className="text-gray-500 text-sm mt-1">Track cost and selling price changes across products</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Product</label>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                if (!e.target.value) setProductId('');
              }}
              placeholder="Name or SKU..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {productSearch && filteredProducts.length > 0 && !productId && (
              <div className="absolute z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 10).map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id);
                      setProductSearch(`${p.name} (${p.sku})`);
                      setPage(1);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-gray-400 ml-1 text-xs">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price Type</label>
            <select
              value={priceType}
              onChange={(e) => { setPriceType(e.target.value as '' | PriceType); setPage(1); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All types</option>
              <option value="COST">Cost</option>
              <option value="SELLING">Selling</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setProductId('');
                setProductSearch('');
                setPriceType('');
                setPage(1);
              }}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Product</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">SKU</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Old Price</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">New Price</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Change</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Changed At</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : history.map((row) => {
                  const pct = pctChange(row.oldPrice, row.newPrice);
                  const isUp = pct !== null && pct > 0;
                  const isDown = pct !== null && pct < 0;
                  return (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                        {row.product?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                        {row.product?.sku ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            row.priceType === 'COST'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700',
                          )}
                        >
                          {row.priceType === 'COST' ? 'Cost' : 'Selling'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                        {formatNaira(row.oldPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                        {formatNaira(row.newPrice)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pct !== null ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 text-xs font-semibold',
                              isUp && 'text-red-600',
                              isDown && 'text-green-600',
                              !isUp && !isDown && 'text-gray-400',
                            )}
                          >
                            {isUp && <TrendingUp size={12} />}
                            {isDown && <TrendingDown size={12} />}
                            {isUp ? '+' : ''}
                            {pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(row.changedAt).toLocaleString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs capitalize">
                        {row.source ? row.source.toLowerCase().replace(/_/g, ' ') : '—'}
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && history.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No price history found</p>
                  {(productId || priceType) && (
                    <p className="text-xs mt-1">Try adjusting your filters</p>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary strip */}
      {!isLoading && history.length > 0 && (
        <div className="flex gap-6 text-sm text-gray-500 px-1">
          <span>
            Showing {history.length} of {meta?.total ?? history.length} records
          </span>
          <span>
            Price increases:{' '}
            <span className="font-medium text-red-600">
              {history.filter((r) => r.newPrice > r.oldPrice).length}
            </span>
          </span>
          <span>
            Price decreases:{' '}
            <span className="font-medium text-green-600">
              {history.filter((r) => r.newPrice < r.oldPrice).length}
            </span>
          </span>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page === meta.totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
