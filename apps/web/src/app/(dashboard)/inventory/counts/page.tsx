'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface StockCount {
  id: string;
  reference: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'POSTED' | 'CANCELLED';
  createdAt: string;
  notes: string | null;
  location: { id: string; name: string; code: string };
  _count?: { items: number };
}

interface CountsResponse {
  data: StockCount[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_CONFIG: Record<StockCount['status'], { label: string; color: string }> = {
  DRAFT:        { label: 'Draft',        color: 'bg-gray-100 text-gray-600' },
  IN_PROGRESS:  { label: 'In Progress',  color: 'bg-blue-100 text-blue-700' },
  SUBMITTED:    { label: 'Submitted',    color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { label: 'Under Review', color: 'bg-purple-100 text-purple-700' },
  APPROVED:     { label: 'Approved',     color: 'bg-green-100 text-green-700' },
  REJECTED:     { label: 'Rejected',     color: 'bg-red-100 text-red-700' },
  POSTED:       { label: 'Posted',       color: 'bg-emerald-100 text-emerald-700' },
  CANCELLED:    { label: 'Cancelled',    color: 'bg-red-100 text-red-700' },
};

export default function StockCountsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Submit modal state
  const [submitCountId, setSubmitCountId] = useState<string | null>(null);
  const [submitItems, setSubmitItems] = useState<{ stockCountItemId: string; countedQty: number; notes?: string }[]>([]);

  // Reject modal state
  const [rejectCountId, setRejectCountId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery<CountsResponse>({
    queryKey: ['stock-counts', page],
    queryFn: async () => {
      const res = await api().get<CountsResponse>(`/stock-counts?page=${page}&limit=20`);
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

  const createMutation = useMutation({
    mutationFn: async () => {
      await api().post('/stock-counts', {
        locationId,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      setShowForm(false);
      setLocationId('');
      setNotes('');
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to create count');
    },
  });

  const beginMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-counts/${id}/begin`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-counts'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to begin count'),
  });

  const submitMutation = useMutation({
    mutationFn: async ({ id, items }: { id: string; items: typeof submitItems }) => {
      await api().patch(`/stock-counts/${id}/submit`, { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      setSubmitCountId(null);
      setSubmitItems([]);
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to submit count'),
  });

  const reviewMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-counts/${id}/review`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-counts'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to send to review'),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-counts/${id}/approve`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-counts'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api().patch(`/stock-counts/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      setRejectCountId(null);
      setRejectReason('');
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to reject'),
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-counts/${id}/post`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-counts'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to post'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().delete(`/stock-counts/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-counts'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Failed to cancel'),
  });

  const counts = data?.data ?? [];
  const meta = data?.meta;
  const locations = locationsData ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Counts</h1>
            <p className="text-gray-500 text-sm mt-1">Full-cycle physical inventory counts</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Count
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Create Stock Count</h3>
          <p className="text-sm text-gray-500">
            A draft count will be created for the selected location. Begin it to load inventory items.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location <span className="text-red-500">*</span>
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (!locationId) { setFormError('Location is required'); return; }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Count'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(''); setLocationId(''); setNotes(''); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectCountId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-semibold text-gray-900">Reject Count</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this count is being rejected..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (!rejectReason.trim()) { alert('Reason is required'); return; }
                  rejectMutation.mutate({ id: rejectCountId, reason: rejectReason });
                }}
                disabled={rejectMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject Count'}
              </button>
              <button
                onClick={() => { setRejectCountId(null); setRejectReason(''); }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit count modal — placeholder for item entry */}
      {submitCountId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <h3 className="font-semibold text-gray-900">Submit Count</h3>
            <p className="text-sm text-gray-500">
              Enter counted quantities for items in this count. Items not listed will retain their expected quantity.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {submitItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={item.stockCountItemId}
                    onChange={(e) =>
                      setSubmitItems((prev) =>
                        prev.map((it, j) => j === i ? { ...it, stockCountItemId: e.target.value } : it),
                      )
                    }
                    placeholder="Item ID"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    value={item.countedQty}
                    onChange={(e) =>
                      setSubmitItems((prev) =>
                        prev.map((it, j) => j === i ? { ...it, countedQty: parseInt(e.target.value, 10) || 0 } : it),
                      )
                    }
                    placeholder="Qty"
                    min="0"
                    className="w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSubmitItems((prev) => prev.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 text-xs px-1"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSubmitItems((prev) => [...prev, { stockCountItemId: '', countedQty: 0 }])
                }
                className="text-sm text-blue-600 hover:underline"
              >
                + Add item
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  submitMutation.mutate({ id: submitCountId, items: submitItems });
                }}
                disabled={submitMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitMutation.isPending ? 'Submitting...' : 'Submit Count'}
              </button>
              <button
                onClick={() => { setSubmitCountId(null); setSubmitItems([]); }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Items</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Created</th>
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
              : counts.map((count) => {
                  const statusCfg = STATUS_CONFIG[count.status] ?? STATUS_CONFIG.CANCELLED;
                  return (
                    <tr key={count.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">{count.reference}</td>
                      <td className="px-4 py-3 text-gray-600">{count.location?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{count._count?.items ?? 0}</td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.color)}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(count.createdAt).toLocaleDateString('en-NG')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {count.status === 'DRAFT' && (
                            <button
                              onClick={() => {
                                if (confirm('Begin this count? Inventory items will be loaded.')) {
                                  beginMutation.mutate(count.id);
                                }
                              }}
                              disabled={beginMutation.isPending}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                            >
                              Begin Count
                            </button>
                          )}
                          {count.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => {
                                setSubmitCountId(count.id);
                                setSubmitItems([]);
                              }}
                              className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                            >
                              Submit Count
                            </button>
                          )}
                          {count.status === 'SUBMITTED' && (
                            <button
                              onClick={() => {
                                if (confirm('Send this count to review?')) {
                                  reviewMutation.mutate(count.id);
                                }
                              }}
                              disabled={reviewMutation.isPending}
                              className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                            >
                              Send to Review
                            </button>
                          )}
                          {count.status === 'UNDER_REVIEW' && (
                            <>
                              <button
                                onClick={() => {
                                  if (confirm('Approve this count?')) {
                                    approveMutation.mutate(count.id);
                                  }
                                }}
                                disabled={approveMutation.isPending}
                                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectCountId(count.id)}
                                className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {count.status === 'APPROVED' && (
                            <button
                              onClick={() => {
                                if (confirm('Post this count? Stock corrections will be applied permanently.')) {
                                  postMutation.mutate(count.id);
                                }
                              }}
                              disabled={postMutation.isPending}
                              className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-50"
                            >
                              Post
                            </button>
                          )}
                          {(count.status === 'DRAFT' || count.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => {
                                if (confirm('Cancel this count? This cannot be undone.')) {
                                  cancelMutation.mutate(count.id);
                                }
                              }}
                              disabled={cancelMutation.isPending}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && counts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <ClipboardList size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No stock counts yet</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
