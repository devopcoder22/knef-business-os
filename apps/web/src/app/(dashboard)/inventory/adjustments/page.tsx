'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, CheckCircle, Clock, XCircle, X } from 'lucide-react';
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

interface AdjustmentDetail {
  id: string;
  reference: string;
  locationId: string;
  location?: { id: string; name: string };
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes: string | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string };
  items: Array<{
    id: string;
    productId: string;
    product?: { name: string; sku: string };
    previousQty: number;
    adjustedQty: number;
    notes: string | null;
  }>;
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
  const [detailId, setDetailId] = useState<string | null>(null);

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
      setFormError(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to create adjustment');
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
      alert(err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to approve');
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

  const { data: detailData, isLoading: detailLoading } = useQuery<{ data: AdjustmentDetail }>({
    queryKey: ['stock-adjustment-detail', detailId],
    queryFn: async () => {
      const res = await api().get<{ data: AdjustmentDetail }>(`/stock-adjustments/${detailId}`);
      return res.data;
    },
    enabled: !!detailId,
  });
  const detail = detailData ? (detailData as any).data as AdjustmentDetail : null;

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
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailId(adj.id)}
                          className="font-mono font-medium text-blue-600 hover:underline text-sm"
                        >
                          {adj.reference}
                        </button>
                      </td>
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

      {/* Detail side panel */}
      {detailId && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Adjustment Detail</h3>
            <button onClick={() => setDetailId(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          {detailLoading || !detail ? (
            <div className="flex-1 p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reference</p>
                  <p className="font-mono font-semibold text-gray-900">{detail.reference}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CONFIG[detail.status].color)}>
                    {STATUS_CONFIG[detail.status].label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reason</p>
                  <p className="text-gray-800">{detail.reason.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date</p>
                  <p className="text-gray-800">{new Date(detail.createdAt).toLocaleDateString('en-NG')}</p>
                </div>
                {detail.location && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Location</p>
                    <p className="text-gray-800">{detail.location.name}</p>
                  </div>
                )}
                {detail.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-gray-700 bg-gray-50 rounded-lg p-3 text-sm">{detail.notes}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Items ({detail.items.length})
                </p>
                <div className="space-y-2">
                  {detail.items.map((item) => (
                    <div key={item.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{item.product?.name ?? item.productId}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{item.product?.sku}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                        <span>Before: <strong>{item.previousQty}</strong></span>
                        <span>→</span>
                        <span>After: <strong className={item.adjustedQty > item.previousQty ? 'text-green-600' : item.adjustedQty < item.previousQty ? 'text-red-600' : ''}>{item.adjustedQty}</strong></span>
                        <span className={cn('font-semibold', item.adjustedQty - item.previousQty >= 0 ? 'text-green-600' : 'text-red-600')}>
                          ({item.adjustedQty - item.previousQty >= 0 ? '+' : ''}{item.adjustedQty - item.previousQty})
                        </span>
                      </div>
                      {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {detail.status === 'PENDING' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { if (confirm('Approve this adjustment?')) { approveMutation.mutate(detail.id); setDetailId(null); } }}
                    className="flex-1 py-2 bg-green-600 text-white text-sm rounded-lg font-medium hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { rejectMutation.mutate(detail.id); setDetailId(null); }}
                    className="flex-1 py-2 bg-red-100 text-red-700 text-sm rounded-lg font-medium hover:bg-red-200"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
