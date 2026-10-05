'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Download, Package } from 'lucide-react';
import { api } from '@/lib/api';

interface GrnItem {
  id: string;
  productId: string;
  quantityReceived: number;
  unitCost: string;
  totalCost: string;
  product: { id: string; name: string; sku: string };
}

interface GoodsReceiptDetail {
  id: string;
  reference: string;
  receivedAt: string;
  createdAt: string;
  notes: string | null;
  purchaseOrder: {
    id: string;
    reference: string;
    supplier: {
      id: string;
      name: string;
      code: string;
      phone: string | null;
      email: string | null;
    };
    location: { id: string; name: string };
  };
  items: GrnItem[];
}

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  const { data: grn, isLoading } = useQuery<GoodsReceiptDetail>({
    queryKey: ['goods-receipt', id],
    queryFn: async () => {
      const res = await api().get<GoodsReceiptDetail>(`/goods-receipts/${id}`);
      return res.data;
    },
  });

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await api().get(`/goods-receipts/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `grn-${grn?.reference ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-100 rounded w-1/3" />
        <div className="h-48 bg-gray-100 rounded" />
      </div>
    );
  }
  if (!grn) return <div>Goods receipt not found</div>;

  const totalQty = grn.items.reduce((s, i) => s + i.quantityReceived, 0);
  const totalValue = grn.items.reduce((s, i) => s + Number(i.totalCost), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{grn.reference}</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              Received
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {grn.purchaseOrder.supplier.name} &bull; {grn.purchaseOrder.location.name}
          </p>
        </div>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <Download size={15} />
          {downloading ? 'Downloading…' : 'Download PDF'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Line items */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Items Received</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-700">Product</th>
                <th className="text-center py-2 font-medium text-gray-700">Qty Received</th>
                <th className="text-right py-2 font-medium text-gray-700">Unit Cost</th>
                <th className="text-right py-2 font-medium text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {grn.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-3">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.product.sku}</p>
                  </td>
                  <td className="py-3 text-center font-medium text-green-700">{item.quantityReceived}</td>
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
                <td className="py-3 text-gray-700">Total</td>
                <td className="py-3 text-center text-green-700">{totalQty} units</td>
                <td />
                <td className="py-3 text-right text-blue-700">
                  {totalValue.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
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
              <p className="font-medium text-gray-900">{grn.purchaseOrder.supplier.name}</p>
              <p className="text-sm text-gray-500 font-mono">{grn.purchaseOrder.supplier.code}</p>
              {grn.purchaseOrder.supplier.phone && (
                <p className="text-sm text-gray-500">{grn.purchaseOrder.supplier.phone}</p>
              )}
              {grn.purchaseOrder.supplier.email && (
                <p className="text-sm text-gray-500">{grn.purchaseOrder.supplier.email}</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Details</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Purchase Order</span>
                <Link
                  href={`/purchasing/orders/${grn.purchaseOrder.id}`}
                  className="font-mono text-blue-600 hover:underline"
                >
                  {grn.purchaseOrder.reference}
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Location</span>
                <span className="font-medium">{grn.purchaseOrder.location.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Received</span>
                <span>{new Date(grn.receivedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>{new Date(grn.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {grn.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{grn.notes}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Package size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{totalQty} units received</p>
                <p className="text-xs text-gray-500">across {grn.items.length} product{grn.items.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
