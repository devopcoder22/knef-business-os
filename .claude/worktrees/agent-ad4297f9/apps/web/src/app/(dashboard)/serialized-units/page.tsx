'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Smartphone, Plus, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SerializedUnit {
  id: string;
  imei1: string;
  imei2: string | null;
  serialNumber: string | null;
  status: 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'RETURNED' | 'DEFECTIVE' | 'TRANSFERRED';
  warrantyExpiry: string | null;
  costPrice: string;
  sellingPrice: string | null;
  notes: string | null;
  locationId: string | null;
  product: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
}

interface UnitsResponse {
  data: SerializedUnit[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: 'bg-green-100 text-green-700',
  RESERVED: 'bg-yellow-100 text-yellow-700',
  SOLD: 'bg-blue-100 text-blue-700',
  RETURNED: 'bg-purple-100 text-purple-700',
  DEFECTIVE: 'bg-red-100 text-red-700',
  TRANSFERRED: 'bg-gray-100 text-gray-600',
};

export default function SerializedUnitsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [productId, setProductId] = useState('');
  const [page, setPage] = useState(1);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    imei1: '',
    imei2: '',
    serialNumber: '',
    costPrice: '',
    warrantyExpiry: '',
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery<UnitsResponse>({
    queryKey: ['serialized-units', page, search, status, productId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (productId) params.set('productId', productId);
      const res = await api().get<UnitsResponse>(`/serialized-units?${params}`);
      return res.data;
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-serialized'],
    queryFn: async () => {
      const res = await api().get('/products?limit=200');
      return (res.data as any)?.data ?? [];
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      await api().post('/serialized-units', {
        productId: form.productId,
        imei1: form.imei1,
        imei2: form.imei2 || undefined,
        serialNumber: form.serialNumber || undefined,
        costPrice: form.costPrice,
        warrantyExpiry: form.warrantyExpiry || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serialized-units'] });
      setShowRegister(false);
      setForm({ productId: '', imei1: '', imei2: '', serialNumber: '', costPrice: '', warrantyExpiry: '' });
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to register unit');
    },
  });

  const units = data?.data ?? [];
  const meta = data?.meta;
  const products = productsData ?? [];

  const isWarrantyExpired = (expiry: string | null) => {
    if (!expiry) return false;
    return new Date(expiry) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IMEI / Serials</h1>
          <p className="text-gray-500 text-sm mt-1">Individually tracked serialized units</p>
        </div>
        <button
          onClick={() => setShowRegister(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Register Unit
        </button>
      </div>

      {showRegister && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Register Serialized Unit</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product <span className="text-red-500">*</span>
              </label>
              <select
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select product</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IMEI 1 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.imei1}
                onChange={(e) => setForm((f) => ({ ...f, imei1: e.target.value }))}
                placeholder="15-digit IMEI"
                maxLength={15}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IMEI 2</label>
              <input
                type="text"
                value={form.imei2}
                onChange={(e) => setForm((f) => ({ ...f, imei2: e.target.value }))}
                placeholder="Second IMEI (dual-SIM)"
                maxLength={15}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                placeholder="Serial / SN"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Price (NGN) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label>
              <input
                type="date"
                value={form.warrantyExpiry}
                onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (!form.productId || !form.imei1 || !form.costPrice) {
                  setFormError('Product, IMEI1, and Cost Price are required');
                  return;
                }
                if (form.imei1.length !== 15) {
                  setFormError('IMEI1 must be exactly 15 digits');
                  return;
                }
                registerMutation.mutate();
              }}
              disabled={registerMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {registerMutation.isPending ? 'Registering...' : 'Register Unit'}
            </button>
            <button
              onClick={() => { setShowRegister(false); setFormError(''); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search IMEI or serial..."
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
          <option value="IN_STOCK">In Stock</option>
          <option value="RESERVED">Reserved</option>
          <option value="SOLD">Sold</option>
          <option value="RETURNED">Returned</option>
          <option value="DEFECTIVE">Defective</option>
          <option value="TRANSFERRED">Transferred</option>
        </select>
        <select
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Products</option>
          {products.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">IMEI 1</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">IMEI 2</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Warranty</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Cost</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : units.map((unit) => {
                    const warrantyExpired = isWarrantyExpired(unit.warrantyExpiry);
                    return (
                      <tr key={unit.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-900">{unit.imei1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">
                          {unit.imei2 ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900">{unit.product.name}</p>
                          {unit.variant && (
                            <p className="text-xs text-gray-400">{unit.variant.name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              STATUS_COLORS[unit.status],
                            )}
                          >
                            {unit.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {unit.warrantyExpiry ? (
                            <span className={warrantyExpired ? 'text-red-600' : 'text-gray-600'}>
                              {new Date(unit.warrantyExpiry).toLocaleDateString('en-NG')}
                              {warrantyExpired && ' (Expired)'}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          {Number(unit.costPrice).toLocaleString('en-NG', {
                            style: 'currency',
                            currency: 'NGN',
                          })}
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && units.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Smartphone size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No serialized units found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {meta.total} units total
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
