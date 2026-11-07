'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Gift,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Ban,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GiftCardRedemption {
  id: string;
  orderId: string | null;
  amount: string;
  redeemedAt: string;
}

interface GiftCard {
  id: string;
  code: string;
  initialAmount: string;
  remainingAmount: string;
  isActive: boolean;
  expiresAt: string | null;
  issuedToEmail: string | null;
  note: string | null;
  createdAt: string;
  redemptions: GiftCardRedemption[];
  _count: { redemptions: number };
}

interface ListResponse {
  data: { items: GiftCard[]; total: number; page: number; limit: number; totalPages: number };
}

interface SingleResponse {
  data: GiftCard;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: string | number) {
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadge(card: GiftCard) {
  if (!card.isActive) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
        Inactive
      </span>
    );
  }
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
        Expired
      </span>
    );
  }
  if (Number(card.remainingAmount) <= 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
        Depleted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
      Active
    </span>
  );
}

// ─── Issue Form ───────────────────────────────────────────────────────────────

interface IssueFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

function IssueForm({ onClose, onSuccess }: IssueFormProps) {
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        amount: parseFloat(amount),
      };
      if (email.trim()) payload.issuedToEmail = email.trim();
      if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      if (note.trim()) payload.note = note.trim();

      await api().post('/gift-cards', payload);
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to issue gift card.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const val = parseFloat(amount);
    if (!amount || isNaN(val) || val <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Issue Gift Card</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (₦) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Issued To Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expires At <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Birthday gift for VIP customer"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Issue Gift Card
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Redemption History Row ───────────────────────────────────────────────────

function RedemptionHistory({ cardId }: { cardId: string }) {
  const { data, isLoading } = useQuery<SingleResponse>({
    queryKey: ['gift-card', cardId],
    queryFn: async () => {
      const res = await api().get<SingleResponse>(`/gift-cards/${cardId}`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="px-6 py-3 text-sm text-gray-400 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Loading history...
      </div>
    );
  }

  const redemptions = data?.data?.redemptions ?? [];

  if (redemptions.length === 0) {
    return (
      <div className="px-6 py-3 text-sm text-gray-400">No redemptions yet.</div>
    );
  }

  return (
    <div className="px-6 pb-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left pb-1 font-medium">Date</th>
            <th className="text-left pb-1 font-medium">Amount</th>
            <th className="text-left pb-1 font-medium">Order</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {redemptions.map((r) => (
            <tr key={r.id}>
              <td className="py-1 text-gray-700">{formatDate(r.redeemedAt)}</td>
              <td className="py-1 text-gray-900 font-medium">{fmt(r.amount)}</td>
              <td className="py-1 text-gray-500">{r.orderId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GiftCardsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ['gift-cards', page],
    queryFn: async () => {
      const res = await api().get<ListResponse>(`/gift-cards?page=${page}&limit=20`);
      return res.data;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await api().patch(`/gift-cards/${id}/deactivate`);
    },
    onMutate: (id) => setDeactivatingId(id),
    onSettled: () => {
      setDeactivatingId(null);
      queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
    },
  });

  const cards = data?.data?.items ?? [];
  const pagination = data?.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Gift Cards</h1>
            <p className="text-sm text-gray-500">Issue and manage gift cards for your customers</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Issue Gift Card
        </button>
      </div>

      {/* Issue Form Modal */}
      {showForm && (
        <IssueForm
          onClose={() => setShowForm(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['gift-cards'] })}
        />
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading gift cards...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            Failed to load gift cards.
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Gift size={36} className="mb-3 text-gray-300" />
            <p className="text-sm">No gift cards issued yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Issue your first gift card
            </button>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-6"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Initial</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Issued To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Redeemed</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cards.map((card) => (
                  <>
                    <tr
                      key={card.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {/* Expand toggle */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === card.id ? null : card.id)
                          }
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {expandedId === card.id ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 font-semibold">
                        {card.code}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmt(card.initialAmount)}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {fmt(card.remainingAmount)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {card.issuedToEmail ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {card.expiresAt ? formatDate(card.expiresAt) : (
                          <span className="text-gray-400">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{statusBadge(card)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {card._count.redemptions} time{card._count.redemptions !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-3">
                        {card.isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Deactivate gift card ${card.code}?`)) {
                                deactivateMutation.mutate(card.id);
                              }
                            }}
                            disabled={deactivatingId === card.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
                          >
                            {deactivatingId === card.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Ban size={12} />
                            )}
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expandable redemption history */}
                    {expandedId === card.id && (
                      <tr key={`${card.id}-history`}>
                        <td colSpan={9} className="bg-gray-50 border-t border-gray-100">
                          <div className="px-6 py-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                              Redemption History
                            </p>
                            {card.note && (
                              <p className="text-xs text-gray-500 mb-2">
                                Note: {card.note}
                              </p>
                            )}
                            <RedemptionHistory cardId={card.id} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Showing {((page - 1) * pagination.limit) + 1}–
                  {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-600">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
