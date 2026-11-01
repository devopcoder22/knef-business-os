'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, CheckCircle, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Adjustment {
  id: string;
  reference: string;
  locationId: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  createdAt: string;
  _count?: { items: number };
}

interface AdjustmentsResponse {
  data: Adjustment[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const REASONS = [
  'DAMAGED', 'EXPIRED', 'THEFT', 'OPENING_STOCK', 'COUNT_CORRECTION', 'SYSTEM_ERROR', 'OTHER',
];

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
};

interface AdjustmentItem {
  productId: string;
  adjustedQty: number;
  notes: string;
}

export default function AdjustmentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('COUNT_CORRECTION');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<AdjustmentItem[]>([{ productId: '', adjustedQty: 0, notes: '' }]);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery<AdjustmentsResponse>({
    queryKey: ['stock-adjustments', page],
    queryFn: async () => {
      const res = await api().get<AdjustmentsResponse>(`/stock-adjustments?page=${page}&limit=20`);
      return res.data;
    },
  });

  const { data: locationsData } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await api().get('/locations');
      return (res.data as any)?.data ?? [];
    },
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: async () => {
      const res = await api().get('/products?limit=200');
      return (res.data as any)?.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/stock-adjustments', {
        locationId,
        reason,
        notes: notes || undefined,
        items: items
          .filter((i) => i.productId)
          .map((i) => ({
            productId: i.productId,
            adjustedQty: i.adjustedQty,
            notes: i.notes || undefined,
          })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      setShowForm(false);
      setLocationId('');
      setReason('COUNT_CORRECTION');
      setNotes('');
      setItems([{ productId: '', adjustedQty: 0, notes: '' }]);
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create adjustment');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-adjustments/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? 'Failed to approve');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-adjustments/${id}/reject`, { reason: 'Rejected by manager' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
    },
  });

  const adjustments = data?.data ?? [];
  const meta = data?.meta;
  const locations = locationsData ?? [];
  const products = productsData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Adjustments</h1>
            <p className="text-gray-500 text-sm mt-1">Correct inventory levels</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Adjustment
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">New Stock Adjustment</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location <span className="text-red-500">*</span></label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select location</option>
                {locations.map((loc: any) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Products</p>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={item.productId}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, j) => j === i ? { ...it, productId: e.target.value } : it),
                      )
                    }
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select product</option>
                    {products.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.adjustedQty}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((it, j) =>
                          j === i ? { ...it, adjustedQty: parseInt(e.target.value, 10) || 0 } : it,
                        ),
                      )
                    }
                    placeholder="New qty"
                    min="0"
                    className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { productId: '', adjustedQty: 0, notes: '' }])}
                className="text-sm text-blue-600 hover:underline"
              >
                + Add product
              </button>
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (!locationId) { setFormError('Location is required'); return; }
                if (items.filter((i) => i.productId).length === 0) {
                  setFormError('Add at least one product');
                  return;
                }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Adjustment'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(''); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Items</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : adjustments.map((adj) => {
                  const statusCfg = STATUS_CONFIG[adj.status];
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr key={adj.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{adj.reference}</td>
                      <td className="px-4 py-3 text-gray-600">{adj.reason.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-gray-600">{adj._count?.items ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium w-fit',
                            statusCfg.color,
                          )}
                        >
                          <StatusIcon size={10} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(adj.createdAt).toLocaleDateString('en-NG')}
                      </td>
                      <td className="px-4 py-3">
                        {adj.status === 'PENDING' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                if (confirm('Approve this adjustment? This will update stock levels.')) {
                                  approveMutation.mutate(adj.id);
                                }
                              }}
                              disabled={approveMutation.isPending}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(adj.id)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && adjustments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <p>No adjustments found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
