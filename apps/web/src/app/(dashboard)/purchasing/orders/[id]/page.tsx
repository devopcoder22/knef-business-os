'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Send, Package, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
  CLOSED: 'bg-purple-100 text-purple-700',
};

interface POItem {
  id: string;
  productId: string;
  quantity: number;
  receivedQty: number;
  unitCost: string;
  totalCost: string;
  product: { id: string; name: string; sku: string };
}

interface GoodsReceipt {
  id: string;
  reference: string;
  receivedAt: string;
  items: Array<{ quantityReceived: number; productId: string }>;
}

interface PurchaseOrder {
  id: string;
  reference: string;
  status: string;
  currency: string;
  subtotal: string;
  taxAmount: string;
  shippingCost: string;
  discountAmount: string;
  totalAmount: string;
  paidAmount: string;
  expectedDate: string | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  supplier: { id: string; name: string; code: string; phone: string | null; email: string | null };
  location: { id: string; name: string; code: string };
  items: POItem[];
  receipts: GoodsReceipt[];
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await api().get(`/purchase-orders/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `po-${order?.reference ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const { data: order, isLoading } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const res = await api().get<PurchaseOrder>(`/purchase-orders/${id}`);
      return res.data;
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => api().post(`/purchase-orders/${id}/submit`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }),
  });

  const approveMutation = useMutation({
    mutationFn: () => api().post(`/purchase-orders/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api().post(`/purchase-orders/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }),
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-100 rounded w-1/3" /></div>;
  if (!order) return <div>Order not found</div>;

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
              {order.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {order.supplier.name} &bull; {order.location.name}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {order.status === 'DRAFT' && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send size={15} />
              Submit
            </button>
          )}
          {order.status === 'SUBMITTED' && (
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={15} />
              Approve
            </button>
          )}
          {(order.status === 'APPROVED' || order.status === 'PARTIALLY_RECEIVED') && (
            <Link
              href={`/purchasing/receipts/new?poId=${order.id}`}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              <Package size={15} />
              Receive Goods
            </Link>
          )}
          {order.status !== 'CANCELLED' && order.status !== 'RECEIVED' && order.status !== 'CLOSED' && (
            <button
              onClick={() => { if (confirm('Cancel this purchase order?')) cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle size={15} />
              Cancel
            </button>
          )}
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={15} />
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Order Info */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Line Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-700">Product</th>
                <th className="text-center py-2 font-medium text-gray-700">Ordered</th>
                <th className="text-center py-2 font-medium text-gray-700">Received</th>
                <th className="text-right py-2 font-medium text-gray-700">Unit Cost</th>
                <th className="text-right py-2 font-medium text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-3">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.product.sku}</p>
                  </td>
                  <td className="py-3 text-center">{item.quantity}</td>
                  <td className="py-3 text-center">
                    <span className={cn('font-medium', item.receivedQty >= item.quantity ? 'text-green-600' : item.receivedQty > 0 ? 'text-amber-600' : 'text-gray-500')}>
                      {item.receivedQty}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {Number(item.unitCost).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {Number(item.totalCost).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold">
                <td colSpan={4} className="py-3 text-right text-gray-700">Total</td>
                <td className="py-3 text-right text-blue-700">
                  {Number(order.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Supplier</h3>
            <div>
              <p className="font-medium text-gray-900">{order.supplier.name}</p>
              <p className="text-sm text-gray-500 font-mono">{order.supplier.code}</p>
              {order.supplier.phone && <p className="text-sm text-gray-500">{order.supplier.phone}</p>}
              {order.supplier.email && <p className="text-sm text-gray-500">{order.supplier.email}</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Summary</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{Number(order.subtotal).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
              </div>
              {parseFloat(order.shippingCost) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Shipping</span>
                  <span>{Number(order.shippingCost).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
                </div>
              )}
              {parseFloat(order.discountAmount) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount</span>
                  <span>-{Number(order.discountAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                <span>Total</span>
                <span className="text-blue-700">
                  {Number(order.totalAmount).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                </span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{order.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Receipts */}
      {order.receipts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Goods Receipts ({order.receipts.length})
          </h2>
          <div className="space-y-2">
            {order.receipts.map((receipt) => (
              <div key={receipt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-mono text-sm font-medium text-blue-600">{receipt.reference}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(receipt.receivedAt).toLocaleDateString()} &bull; {receipt.items.length} items
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Received</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
