'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface StockCount {
  id: string;
  reference: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED' | 'CANCELLED';
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  location: { id: string; name: string; code: string };
  _count?: { items: number };
}

interface CountsResponse {
  data: StockCount[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_CONFIG = {
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Completed', color: 'bg-yellow-100 text-yellow-700' },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

export default function StockCountsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

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

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post('/stock-counts/start', {
        locationId,
        notes: notes || undefined,
      });
      return (res.data as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      setShowForm(false);
      setLocationId('');
      setNotes('');
      setFormError('');
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to start count');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/stock-counts/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? 'Failed to approve');
    },
  });

  const counts = data?.data ?? [];
  const meta = data?.meta;
  const locations = locationsData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Counts</h1>
            <p className="text-gray-500 text-sm mt-1">Physical inventory counts</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Start Count
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Start Stock Count</h3>
          <p className="text-sm text-gray-500">
            A count will be started for the selected location. All current inventory levels will be loaded as starting quantities.
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
                startMutation.mutate();
              }}
              disabled={startMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {startMutation.isPending ? 'Starting...' : 'Start Count'}
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
              <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Items</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Started</th>
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
                  const statusCfg = STATUS_CONFIG[count.status];
                  return (
                    <tr key={count.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-gray-900">
                        {count.reference}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{count.location.name}</td>
                      <td className="px-4 py-3 text-gray-600">{count._count?.items ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            statusCfg.color,
                          )}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(count.startedAt).toLocaleDateString('en-NG')}
                      </td>
                      <td className="px-4 py-3">
                        {count.status === 'COMPLETED' && (
                          <button
                            onClick={() => {
                              if (confirm('Approve this count? Stock corrections will be applied.')) {
                                approveMutation.mutate(count.id);
                              }
                            }}
                            disabled={approveMutation.isPending}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            {!isLoading && counts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <CheckCircle size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No stock counts yet</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
