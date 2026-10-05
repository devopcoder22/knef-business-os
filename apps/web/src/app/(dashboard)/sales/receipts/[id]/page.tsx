'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { api } from '@/lib/api';

interface ReceiptItem {
  id: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  product: { id: string; name: string; sku: string };
}

interface ReceiptDetail {
  id: string;
  reference: string;
  amount: string;
  currency: string;
  method: string;
  issuedAt: string;
  notes: string | null;
  invoiceId: string;
  invoice: {
    id: string;
    reference: string;
    status: string;
    items: ReceiptItem[];
  };
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    code: string;
  } | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Transfer',
  CHEQUE: 'Cheque',
  CRYPTO: 'Crypto',
  OTHER: 'Other',
};

export default function SalesReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [printingThermal, setPrintingThermal] = useState(false);

  const { data: receipt, isLoading } = useQuery<ReceiptDetail>({
    queryKey: ['sales-receipt', id],
    queryFn: async () => {
      const res = await api().get<ReceiptDetail>(`/receipts/${id}`);
      return res.data;
    },
  });

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await api().get(`/receipts/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receipt?.reference ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function printThermal() {
    setPrintingThermal(true);
    try {
      const res = await api().get<string>(`/receipts/${id}/thermal`, { responseType: 'text' });
      const html = res.data as unknown as string;
      const win = window.open('', '_blank', 'width=400,height=600');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.print();
      }
    } finally {
      setPrintingThermal(false);
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
  if (!receipt) return <div>Receipt not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{receipt.reference}</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              {METHOD_LABELS[receipt.method] ?? receipt.method}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {receipt.customer
              ? `${receipt.customer.firstName} ${receipt.customer.lastName}`
              : 'Walk-in customer'}{' '}
            &bull; {new Date(receipt.issuedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={printThermal}
            disabled={printingThermal}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Printer size={15} />
            {printingThermal ? 'Opening…' : 'Thermal Print'}
          </button>
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
        {/* Line items */}
        <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-700">Product</th>
                <th className="text-center py-2 font-medium text-gray-700">Qty</th>
                <th className="text-right py-2 font-medium text-gray-700">Unit Price</th>
                <th className="text-right py-2 font-medium text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-3">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.product.sku}</p>
                  </td>
                  <td className="py-3 text-center">{item.quantity}</td>
                  <td className="py-3 text-right">
                    {Number(item.unitPrice).toLocaleString('en-NG', { style: 'currency', currency: receipt.currency })}
                  </td>
                  <td className="py-3 text-right font-medium">
                    {Number(item.totalPrice).toLocaleString('en-NG', { style: 'currency', currency: receipt.currency })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-semibold">
                <td colSpan={3} className="py-3 text-right text-gray-700">Amount Paid</td>
                <td className="py-3 text-right text-green-700">
                  {Number(receipt.amount).toLocaleString('en-NG', { style: 'currency', currency: receipt.currency })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {receipt.customer && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Customer</h3>
              <div>
                <p className="font-medium text-gray-900">
                  {receipt.customer.firstName} {receipt.customer.lastName}
                </p>
                <p className="text-sm text-gray-500 font-mono">{receipt.customer.code}</p>
                {receipt.customer.phone && <p className="text-sm text-gray-500">{receipt.customer.phone}</p>}
                {receipt.customer.email && <p className="text-sm text-gray-500">{receipt.customer.email}</p>}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Payment Details</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice</span>
                <Link href={`/sales/invoices/${receipt.invoiceId}`} className="font-mono text-blue-600 hover:underline">
                  {receipt.invoice.reference}
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Method</span>
                <span className="font-medium">{METHOD_LABELS[receipt.method] ?? receipt.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Issued</span>
                <span>{new Date(receipt.issuedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                <span>Amount</span>
                <span className="text-green-700">
                  {Number(receipt.amount).toLocaleString('en-NG', { style: 'currency', currency: receipt.currency })}
                </span>
              </div>
            </div>
          </div>

          {receipt.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{receipt.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
