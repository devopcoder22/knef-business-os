'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Search, Shield, UserX, RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface EmailSubscription {
  id: string;
  email: string;
  subscriptionList: string;
  status: string;
  source: string | null;
  consentAt: string | null;
  unsubscribedAt: string | null;
  suppressedAt: string | null;
  suppressionReason: string | null;
  updatedAt: string;
}

interface SubscriptionsResponse {
  data: EmailSubscription[];
  meta: { total: number; page: number; limit: number };
}

const LIST_LABELS: Record<string, string> = {
  GENERAL_MARKETING: 'General Marketing',
  NEWSLETTERS: 'Newsletters',
  PROMOTIONS: 'Promotions',
  PRODUCT_UPDATES: 'Product Updates',
};

const STATUS_STYLES: Record<string, string> = {
  SUBSCRIBED: 'bg-green-100 text-green-700',
  UNSUBSCRIBED: 'bg-gray-100 text-gray-600',
  SUPPRESSED: 'bg-red-100 text-red-600',
  BOUNCED: 'bg-orange-100 text-orange-700',
  COMPLAINED: 'bg-red-200 text-red-800',
};

export default function SubscriptionsPage() {
  const qc = useQueryClient();
  const [emailFilter, setEmailFilter] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery<SubscriptionsResponse>({
    queryKey: ['email-subscriptions', emailFilter, listFilter, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (emailFilter) params.set('email', emailFilter);
      if (listFilter) params.set('list', listFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api().get(`/email-subscriptions?${params}`);
      return (res.data as { data: SubscriptionsResponse }).data ?? res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ email, list, status }: { email: string; list: string; status: string }) =>
      api().patch(`/email-subscriptions/${encodeURIComponent(email)}?list=${list}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-subscriptions'] }),
  });

  const subscriptions = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit };
  const totalPages = Math.ceil(meta.total / limit);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Email Subscriptions</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage subscriber lists, suppression, and opt-out records.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Object.entries(LIST_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setListFilter(listFilter === key ? '' : key); setPage(1); }}
            className={cn(
              'bg-white border rounded-xl p-4 text-left hover:border-blue-300 transition-colors',
              listFilter === key ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200',
            )}
          >
            <Mail size={16} className="text-gray-400 mb-1" />
            <p className="text-xs text-gray-500">{label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by email..."
            value={emailFilter}
            onChange={(e) => { setEmailFilter(e.target.value); setPage(1); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={listFilter}
          onChange={(e) => { setListFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2"
        >
          <option value="">All Lists</option>
          {Object.entries(LIST_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2"
        >
          <option value="">All Statuses</option>
          <option value="SUBSCRIBED">Subscribed</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="SUPPRESSED">Suppressed</option>
          <option value="BOUNCED">Bounced</option>
          <option value="COMPLAINED">Complained</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-gray-400" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No subscriptions found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">List</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Updated</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">{sub.email}</td>
                    <td className="px-4 py-3 text-gray-600">{LIST_LABELS[sub.subscriptionList] ?? sub.subscriptionList}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', STATUS_STYLES[sub.status] ?? 'bg-gray-100 text-gray-600')}>
                        {sub.status}
                      </span>
                      {sub.suppressionReason && (
                        <p className="text-xs text-gray-400 mt-0.5">{sub.suppressionReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(sub.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {sub.status !== 'SUBSCRIBED' && (
                          <button
                            onClick={() => updateMutation.mutate({ email: sub.email, list: sub.subscriptionList, status: 'SUBSCRIBED' })}
                            disabled={updateMutation.isPending}
                            className="text-xs px-2 py-1 text-green-600 border border-green-200 rounded hover:bg-green-50"
                            title="Re-subscribe"
                          >
                            <RefreshCw size={11} className="inline mr-1" />
                            Re-subscribe
                          </button>
                        )}
                        {sub.status === 'SUBSCRIBED' && (
                          <button
                            onClick={() => updateMutation.mutate({ email: sub.email, list: sub.subscriptionList, status: 'SUPPRESSED' })}
                            disabled={updateMutation.isPending}
                            className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50"
                            title="Suppress"
                          >
                            <UserX size={11} className="inline mr-1" />
                            Suppress
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">{meta.total} records</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-600">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Suppression note */}
      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <p className="font-medium flex items-center gap-2 mb-1"><Shield size={14} />Suppression policy</p>
        <p>
          Hard bounces and spam complaints automatically suppress an address across all marketing lists.
          Suppressed addresses are excluded from all marketing sends at send time, even if a campaign was
          already scheduled. Transactional emails (invoices, receipts, security alerts) are not affected.
        </p>
      </div>
    </div>
  );
}
