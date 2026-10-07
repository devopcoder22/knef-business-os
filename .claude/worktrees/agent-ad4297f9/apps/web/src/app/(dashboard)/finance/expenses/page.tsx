'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, MoreHorizontal, CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';

interface Expense {
  id: string;
  reference: string;
  description: string;
  amount: string;
  currency: string;
  status: ExpenseStatus;
  vendor: string | null;
  date: string;
  category: { id: string; name: string } | null;
  submittedBy: string | null;
  approvedBy: string | null;
  paidAt: string | null;
}

interface ExpensesResponse {
  data: Expense[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; className: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700', icon: XCircle },
  PAID: { label: 'Paid', className: 'bg-green-100 text-green-700', icon: DollarSign },
};

function fmt(amount: string, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function ExpensesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery<ExpensesResponse>({
    queryKey: ['expenses', page, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await api().get<ExpensesResponse>(`/expenses?${params}`);
      return res.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => { await api().post(`/expenses/${id}/approve`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setActiveMenu(null); },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api().post(`/expenses/${id}/reject`, { reason });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setRejectModal(null); setRejectReason(''); },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => { await api().post(`/expenses/${id}/mark-paid`, {}); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); setActiveMenu(null); },
  });

  const expenses = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500 text-sm mt-1">Manage and approve expense requests</p>
        </div>
        <Link
          href="/finance/expenses/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          New Expense
        </Link>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-2">
          {['', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'].map((s) => {
            const cfg = s ? STATUS_CONFIG[s as ExpenseStatus] : null;
            return (
              <button
                key={s || 'all'}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-lg font-medium border transition-colors',
                  statusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                )}
              >
                {s ? cfg?.label : 'All'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Vendor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : expenses.map((expense) => {
                    const cfg = STATUS_CONFIG[expense.status];
                    const StatusIcon = cfg.icon;
                    return (
                      <tr key={expense.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{expense.reference}</td>
                        <td className="px-4 py-3 text-gray-900">{expense.description}</td>
                        <td className="px-4 py-3 text-gray-500">{expense.category?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{expense.vendor ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(expense.date).toLocaleDateString('en-NG')}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(expense.amount, expense.currency)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.className)}>
                            <StatusIcon size={11} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <button
                              onClick={() => setActiveMenu(activeMenu === expense.id ? null : expense.id)}
                              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {activeMenu === expense.id && (
                              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                                {expense.status === 'PENDING' && (
                                  <>
                                    <button onClick={() => approveMutation.mutate(expense.id)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50">
                                      <CheckCircle size={14} /> Approve
                                    </button>
                                    <button onClick={() => { setRejectModal({ id: expense.id }); setActiveMenu(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                      <XCircle size={14} /> Reject
                                    </button>
                                  </>
                                )}
                                {expense.status === 'APPROVED' && (
                                  <button onClick={() => markPaidMutation.mutate(expense.id)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">
                                    <DollarSign size={14} /> Mark Paid
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && expenses.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No expenses found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">{(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Reject Expense</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Explain why this expense is being rejected..."
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700">Cancel</button>
              <button
                onClick={() => rejectMutation.mutate({ id: rejectModal.id, reason: rejectReason })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 bg-gray-100 rounded-xl" />}>
      <ExpensesContent />
    </Suspense>
  );
}
