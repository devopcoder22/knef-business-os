'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Printer, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';

interface SalesReceipt {
  id: string;
  reference: string;
  amount: string;
  currency: string;
  method: string;
  issuedAt: string;
  notes: string | null;
  invoiceId: string;
  customerId: string | null;
  invoice: { id: string; reference: string; status: string };
}

interface ReceiptsResponse {
  data: SalesReceipt[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface Invoice {
  id: string;
  reference: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  customer: { firstName: string; lastName: string } | null;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'POS_CARD', label: 'Card / POS' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CHEQUE', label: 'Cheque' },
];

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  POS_CARD: 'Card / POS',
  BANK_TRANSFER: 'Bank Transfer',
  MOBILE_MONEY: 'Mobile Money',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

function IssueReceiptModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: invoicesData } = useQuery<{ data: Invoice[] }>({
    queryKey: ['unpaid-invoices-for-receipt'],
    queryFn: async () => {
      const res = await api().get('/invoices?limit=100&status=UNPAID');
      const unpaid: Invoice[] = (res.data as any).data ?? [];
      const res2 = await api().get('/invoices?limit=100&status=PARTIAL');
      const partial: Invoice[] = (res2.data as any).data ?? [];
      const all = [...unpaid, ...partial];
      const seen = new Set<string>();
      return { data: all.filter((o) => { if (seen.has(o.id)) return false; seen.add(o.id); return true; }) };
    },
  });

  const selectedInvoice = invoicesData?.data?.find((i) => i.id === invoiceId);

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post(`/invoices/${invoiceId}/payments`, { amount, method, notes: notes || undefined });
      return res.data;
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? 'Failed to record payment';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const handleSubmit = () => {
    if (!invoiceId) { setError('Please select an invoice'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    setError('');
    payMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Issue Receipt</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice <span className="text-red-500">*</span></label>
            <select
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const inv = invoicesData?.data?.find((i) => i.id === e.target.value);
                if (inv) {
                  const outstanding = parseFloat(inv.totalAmount) - parseFloat(inv.paidAmount || '0');
                  setAmount(outstanding > 0 ? outstanding.toFixed(2) : '');
                }
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select unpaid/partial invoice...</option>
              {invoicesData?.data?.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.reference}
                  {inv.customer ? ` — ${inv.customer.firstName} ${inv.customer.lastName}` : ''}
                  {' '}({inv.status})
                </option>
              ))}
            </select>
            {selectedInvoice && (
              <p className="mt-1 text-xs text-gray-500">
                Outstanding: {(parseFloat(selectedInvoice.totalAmount) - parseFloat(selectedInvoice.paidAmount || '0')).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method <span className="text-red-500">*</span></label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₦) <span className="text-red-500">*</span></label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cash collected at store"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={payMutation.isPending}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {payMutation.isPending ? 'Processing...' : 'Record Payment & Issue Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalesReceiptsPage() {
  const [page, setPage] = useState(1);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ReceiptsResponse>({
    queryKey: ['sales-receipts', page],
    queryFn: async () => {
      const res = await api().get<ReceiptsResponse>(`/receipts?page=${page}&limit=20`);
      return res.data;
    },
  });

  const receipts = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {showIssueModal && (
        <IssueReceiptModal
          onClose={() => setShowIssueModal(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['sales-receipts'] })}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
          <p className="text-gray-500 text-sm mt-1">Payment receipts issued to customers</p>
        </div>
        <button
          onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Issue Receipt
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Invoice</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Method</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Issued</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : receipts.map((receipt) => (
                    <tr key={receipt.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/sales/receipts/${receipt.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {receipt.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {receipt.invoice ? (
                          <Link href={`/sales/invoices/${receipt.invoiceId}`} className="font-mono text-xs text-blue-600 hover:underline">
                            {receipt.invoice.reference}
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {METHOD_LABELS[receipt.method] ?? receipt.method}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {Number(receipt.amount).toLocaleString('en-NG', { style: 'currency', currency: receipt.currency })}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {new Date(receipt.issuedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/sales/receipts/${receipt.id}`}
                          title="Print / Download"
                          className="inline-flex p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                        >
                          <Printer size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
              {!isLoading && receipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Receipt size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No receipts found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} className="px-3 py-1 text-sm border border-gray-200 rounded-lg disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
