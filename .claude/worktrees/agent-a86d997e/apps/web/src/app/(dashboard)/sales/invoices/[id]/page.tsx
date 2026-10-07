'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Download, CreditCard, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  VOID: 'bg-gray-100 text-gray-400',
};

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'POS_TERMINAL', 'USSD', 'CRYPTO', 'OTHER'];

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  taxRate: string;
  totalPrice: string;
  product: { id: string; name: string; sku: string } | null;
}

interface Payment {
  id: string;
  reference: string;
  amount: string;
  method: string;
  status: string;
  gatewayRef: string | null;
  receivedAt: string;
  notes: string | null;
}

interface Invoice {
  id: string;
  reference: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  notes: string | null;
  terms: string | null;
  dueDate: string | null;
  issuedAt: string;
  customer: { id: string; firstName: string; lastName: string; phone: string; email: string | null } | null;
  order: { id: string; reference: string } | null;
  items: InvoiceItem[];
  payments: Payment[];
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await api().get<Invoice>(`/invoices/${id}`);
      return res.data;
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      await api().post(`/invoices/${id}/record-payment`, {
        amount: payAmount,
        method: payMethod,
        reference: payRef || undefined,
        notes: payNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      setShowPaymentForm(false);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
    },
  });

  const downloadPdf = async () => {
    try {
      const res = await api().get(`/invoices/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.reference ?? 'invoice'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF download failed. The invoice HTML can be viewed in the browser.');
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-100 rounded w-1/3" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!invoice) return <div className="text-gray-500">Invoice not found</div>;

  const balance = parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount);
  const isPaid = invoice.status === 'PAID';
  const isVoid = invoice.status === 'VOID';
  const canRecordPayment = !isPaid && !isVoid && balance > 0.001;
  const isOverdue =
    invoice.dueDate &&
    new Date(invoice.dueDate) < new Date() &&
    !isPaid &&
    !isVoid;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{invoice.reference}</h1>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                STATUS_COLORS[invoice.status] ?? 'bg-gray-100 text-gray-600',
              )}
            >
              {invoice.status}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                OVERDUE
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Issued {new Date(invoice.issuedAt).toLocaleDateString()}
            {invoice.dueDate && ` · Due ${new Date(invoice.dueDate).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={16} />
            Download PDF
          </button>
          {canRecordPayment && (
            <button
              onClick={() => setShowPaymentForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <CreditCard size={16} />
              Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Payment Form */}
      {showPaymentForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-4">Record Payment</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount (NGN)</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={balance.toFixed(2)}
                min="0.01"
                step="0.01"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => recordPaymentMutation.mutate()}
              disabled={!payAmount || recordPaymentMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle size={14} />
              {recordPaymentMutation.isPending ? 'Recording...' : 'Confirm Payment'}
            </button>
            <button
              onClick={() => setShowPaymentForm(false)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <XCircle size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Item</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Qty</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Unit Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Discount</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{item.description}</p>
                      {item.product && (
                        <p className="text-xs text-gray-400 font-mono">{item.product.sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(item.unitPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {parseFloat(item.discount) > 0
                        ? Number(item.discount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {Number(item.totalPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payments */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Payment History</h2>
            </div>
            {invoice.payments.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-400">No payments recorded yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Reference</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Method</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((pay) => (
                    <tr key={pay.id} className="border-b border-gray-100">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {pay.reference}
                        {pay.gatewayRef && (
                          <span className="ml-2 text-gray-400">({pay.gatewayRef})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {pay.method.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            pay.status === 'CONFIRMED'
                              ? 'bg-green-100 text-green-700'
                              : pay.status === 'REVERSED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {pay.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={parseFloat(pay.amount) < 0 ? 'text-red-600' : 'text-green-600'}>
                          {Number(pay.amount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {new Date(pay.receivedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Notes and Terms */}
          {(invoice.notes || invoice.terms) && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              {invoice.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Notes</h3>
                  <p className="text-sm text-gray-600">{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Terms</h3>
                  <p className="text-sm text-gray-600">{invoice.terms}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Financial Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>
                  {Number(invoice.subtotal).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </span>
              </div>
              {parseFloat(invoice.discountAmount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>
                    -{Number(invoice.discountAmount).toLocaleString('en-NG', {
                      style: 'currency',
                      currency: 'NGN',
                    })}
                  </span>
                </div>
              )}
              {parseFloat(invoice.taxAmount) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax</span>
                  <span>
                    {Number(invoice.taxAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span>
                  {Number(invoice.totalAmount).toLocaleString('en-NG', {
                    style: 'currency',
                    currency: 'NGN',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Paid</span>
                <span>
                  {Number(invoice.paidAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </span>
              </div>
              <div
                className={cn(
                  'flex justify-between font-bold text-base border-t border-gray-200 pt-2',
                  balance > 0.001 ? 'text-amber-600' : 'text-green-600',
                )}
              >
                <span>Balance Due</span>
                <span>
                  {Number(balance).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </span>
              </div>
            </div>
          </div>

          {/* Customer */}
          {invoice.customer && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Customer</h3>
              <p className="font-medium text-gray-900">
                {invoice.customer.firstName} {invoice.customer.lastName}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{invoice.customer.phone}</p>
              {invoice.customer.email && (
                <p className="text-sm text-gray-500">{invoice.customer.email}</p>
              )}
              <Link
                href={`/customers/${invoice.customer.id}`}
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
              >
                View customer profile
              </Link>
            </div>
          )}

          {/* Linked Order */}
          {invoice.order && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Linked Order</h3>
              <Link
                href={`/sales/orders/${invoice.order.id}`}
                className="font-mono text-sm text-blue-600 hover:underline"
              >
                {invoice.order.reference}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
