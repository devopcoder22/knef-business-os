'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, RotateCcw, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-purple-100 text-purple-700',
  PARTIAL_REFUND: 'bg-orange-100 text-orange-700',
};

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  costPrice: string;
  discountRate: string;
  totalPrice: string;
  product: { id: string; name: string; sku: string };
  variant: { id: string; name: string; sku: string } | null;
}

interface Payment {
  id: string;
  reference: string;
  method: string;
  amount: string;
  status: string;
  receivedAt: string | null;
  createdAt: string;
}

interface SalesOrder {
  id: string;
  reference: string;
  status: string;
  channel: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  customer: { id: string; firstName: string; lastName: string; phone: string } | null;
  location: { id: string; name: string; code: string };
  items: OrderItem[];
  invoices: Array<{ id: string; reference: string; status: string; totalAmount: string }>;
  payments: Payment[];
}

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'POS_CARD', 'MOBILE_MONEY', 'CREDIT'];

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');

  const { data: order, isLoading } = useQuery<SalesOrder>({
    queryKey: ['sales-order', id],
    queryFn: async () => {
      const res = await api().get<SalesOrder>(`/sales-orders/${id}`);
      return res.data;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => api().post(`/sales-orders/${id}/confirm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-order', id] }),
  });

  const completeMutation = useMutation({
    mutationFn: () => api().post(`/sales-orders/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-order', id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api().post(`/sales-orders/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-order', id] }),
  });

  const refundMutation = useMutation({
    mutationFn: () => api().post(`/sales-orders/${id}/refund`, { reason: 'Customer request' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-order', id] }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await api().post<{ id: string }>('/invoices', {
        orderId: id,
        customerId: order?.customer?.id,
      });
      return (res.data as { id: string }).id;
    },
    onSuccess: (invId) => router.push(`/sales/invoices/${invId}`),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      // Record against first invoice or directly
      const invoiceId = order?.invoices[0]?.id;
      if (invoiceId) {
        await api().post(`/invoices/${invoiceId}/record-payment`, {
          amount: payAmount,
          method: payMethod,
          reference: payRef || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-order', id] });
      setShowPayment(false);
      setPayAmount('');
    },
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-100 rounded w-1/3" /></div>;
  if (!order) return <div>Order not found</div>;

  const balance = parseFloat(order.totalAmount) - parseFloat(order.paidAmount);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{order.reference}</h1>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[order.status])}>
              {order.status}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'Walk-in'} &bull; {order.location.name}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {order.status === 'DRAFT' && (
            <button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <CheckCircle size={14} /> Confirm
            </button>
          )}
          {(order.status === 'CONFIRMED' || order.status === 'PROCESSING' || order.status === 'DRAFT') && (
            <button onClick={() => { if (confirm('Complete this order and deduct stock?')) completeMutation.mutate(); }} disabled={completeMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <CheckCircle size={14} /> Complete
            </button>
          )}
          {order.status === 'COMPLETED' && (
            <button onClick={() => { if (confirm('Refund this order?')) refundMutation.mutate(); }} disabled={refundMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 text-sm border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 disabled:opacity-50">
              <RotateCcw size={14} /> Refund
            </button>
          )}
          {order.invoices.length === 0 && (
            <button onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <FileText size={14} /> Generate Invoice
            </button>
          )}
          {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && order.status !== 'REFUNDED' && (
            <button onClick={() => { if (confirm('Cancel this order?')) cancelMutation.mutate(); }} disabled={cancelMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
              <XCircle size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Items */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-700">Product</th>
                  <th className="text-center py-2 font-medium text-gray-700">Qty</th>
                  <th className="text-right py-2 font-medium text-gray-700">Unit Price</th>
                  <th className="text-right py-2 font-medium text-gray-700">Disc</th>
                  <th className="text-right py-2 font-medium text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3">
                      <p className="font-medium">{item.product.name}</p>
                      {item.variant && <p className="text-xs text-gray-400">{item.variant.name}</p>}
                      <p className="text-xs text-gray-400 font-mono">{item.product.sku}</p>
                    </td>
                    <td className="py-3 text-center">{item.quantity}</td>
                    <td className="py-3 text-right">{Number(item.unitPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</td>
                    <td className="py-3 text-right text-gray-400">{item.discountRate}%</td>
                    <td className="py-3 text-right font-medium">{Number(item.totalPrice).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invoices */}
          {order.invoices.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Invoices</h2>
              {order.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Link href={`/sales/invoices/${inv.id}`} className="font-mono text-sm text-blue-600 hover:underline">{inv.reference}</Link>
                    <span className="ml-2 text-xs text-gray-500">{inv.status}</span>
                  </div>
                  <span className="font-medium text-sm">
                    {Number(inv.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Payments */}
          {order.payments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Payments</h2>
              <div className="space-y-2">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{p.method}</span>
                      <span className="text-gray-400 ml-2 text-xs">{p.reference}</span>
                    </div>
                    <span className={p.amount.startsWith('-') ? 'text-red-600' : 'text-green-600'}>
                      {Number(p.amount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Summary</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{Number(order.subtotal).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span></div>
              {parseFloat(order.discountAmount) > 0 && (
                <div className="flex justify-between text-red-600"><span>Discount</span><span>-{Number(order.discountAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span></div>
              )}
              {parseFloat(order.taxAmount) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{Number(order.taxAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span></div>
              )}
              <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                <span>Total</span>
                <span className="text-blue-700">{Number(order.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
              </div>
              <div className="flex justify-between text-green-600"><span>Paid</span><span>{Number(order.paidAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span></div>
              <div className="flex justify-between font-semibold">
                <span>Balance</span>
                <span className={balance > 0.01 ? 'text-amber-600' : 'text-green-600'}>
                  {balance.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </span>
              </div>
            </div>

            {balance > 0.01 && order.invoices.length > 0 && (
              <div className="pt-3 border-t border-gray-200">
                {showPayment ? (
                  <div className="space-y-2">
                    <input
                      type="number"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="Reference (optional)"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => recordPaymentMutation.mutate()} disabled={!payAmount || recordPaymentMutation.isPending} className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                        {recordPaymentMutation.isPending ? 'Saving...' : 'Record'}
                      </button>
                      <button onClick={() => setShowPayment(false)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPayAmount(balance.toString()); setShowPayment(true); }}
                    className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Record Payment
                  </button>
                )}
              </div>
            )}
          </div>

          {order.customer && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Customer</h3>
              <Link href={`/customers/${order.customer.id}`} className="block hover:text-blue-600">
                <p className="font-medium text-gray-900">{order.customer.firstName} {order.customer.lastName}</p>
                <p className="text-sm text-gray-500">{order.customer.phone}</p>
              </Link>
            </div>
          )}

          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
