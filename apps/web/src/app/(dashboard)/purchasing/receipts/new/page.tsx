'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface POItem {
  id: string;
  productId: string;
  quantity: number;
  receivedQty: number;
  unitCost: string;
  product: { id: string; name: string; sku: string };
}

interface PurchaseOrder {
  id: string;
  reference: string;
  status: string;
  locationId: string;
  supplier: { name: string };
  items: POItem[];
}

interface ReceiptItem {
  productId: string;
  productName: string;
  productSku: string;
  quantityOrdered: number;
  quantityPrevReceived: number;
  quantityReceived: string;
  unitCost: string;
}

export default function NewGoodsReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPoId = searchParams.get('poId') ?? '';

  const [purchaseOrderId, setPurchaseOrderId] = useState(preselectedPoId);
  const [notes, setNotes] = useState('');
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch approved/partially_received POs
  const { data: posData } = useQuery<{ data: PurchaseOrder[] }>({
    queryKey: ['pos-for-receipt'],
    queryFn: async () => {
      const res = await api().get<{ data: PurchaseOrder[] }>(
        '/purchase-orders?limit=100&status=APPROVED',
      );
      return res.data;
    },
  });

  const { data: selectedPO } = useQuery<PurchaseOrder>({
    queryKey: ['po-detail-for-receipt', purchaseOrderId],
    queryFn: async () => {
      const res = await api().get<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`);
      return res.data;
    },
    enabled: !!purchaseOrderId,
  });

  useEffect(() => {
    if (selectedPO) {
      setReceiptItems(
        selectedPO.items.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          productSku: item.product.sku,
          quantityOrdered: item.quantity,
          quantityPrevReceived: item.receivedQty,
          quantityReceived: String(Math.max(0, item.quantity - item.receivedQty)),
          unitCost: item.unitCost,
        })),
      );
    }
  }, [selectedPO]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const items = receiptItems
        .filter((i) => parseInt(i.quantityReceived, 10) > 0)
        .map((item) => ({
          productId: item.productId,
          quantityReceived: parseInt(item.quantityReceived, 10),
          unitCost: item.unitCost,
        }));

      if (items.length === 0) {
        throw new Error('No items to receive');
      }

      const res = await api().post<{ id: string }>('/goods-receipts', {
        purchaseOrderId,
        notes: notes || undefined,
        items,
      });
      return (res.data as { id: string }).id;
    },
    onSuccess: () => router.push('/purchasing/receipts'),
    onError: (err: { message?: string; response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message ?? err.message ?? 'Failed to create receipt';
      setErrors({ submit: Array.isArray(msg) ? msg.join(', ') : msg });
    },
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!purchaseOrderId) errs['po'] = 'Purchase order is required';
    const hasAny = receiptItems.some((i) => parseInt(i.quantityReceived, 10) > 0);
    if (!hasAny) errs['items'] = 'Enter received quantities for at least one item';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receive Goods</h1>
          <p className="text-gray-500 text-sm mt-1">Record received inventory from a purchase order</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Purchase Order <span className="text-red-500">*</span>
          </label>
          <select
            value={purchaseOrderId}
            onChange={(e) => setPurchaseOrderId(e.target.value)}
            className={cn(
              'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
              errors.po ? 'border-red-300' : 'border-gray-200',
            )}
          >
            <option value="">Select an approved purchase order...</option>
            {posData?.data?.map((po) => (
              <option key={po.id} value={po.id}>
                {po.reference} — {po.supplier.name}
              </option>
            ))}
          </select>
          {errors.po && <p className="text-xs text-red-500 mt-1">{errors.po}</p>}
        </div>

        {selectedPO && receiptItems.length > 0 && (
          <>
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
              <strong>PO:</strong> {selectedPO.reference} &bull; <strong>Supplier:</strong> {selectedPO.supplier.name}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-700">Product</th>
                  <th className="text-center py-2 font-medium text-gray-700">Ordered</th>
                  <th className="text-center py-2 font-medium text-gray-700">Prev. Received</th>
                  <th className="text-center py-2 font-medium text-gray-700">Receiving Now</th>
                  <th className="text-right py-2 font-medium text-gray-700">Unit Cost</th>
                </tr>
              </thead>
              <tbody>
                {receiptItems.map((item, i) => {
                  const remaining = item.quantityOrdered - item.quantityPrevReceived;
                  return (
                    <tr key={item.productId} className="border-b border-gray-100">
                      <td className="py-3">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.productSku}</p>
                      </td>
                      <td className="py-3 text-center">{item.quantityOrdered}</td>
                      <td className="py-3 text-center text-gray-500">{item.quantityPrevReceived}</td>
                      <td className="py-3 text-center">
                        <input
                          type="number"
                          value={item.quantityReceived}
                          onChange={(e) =>
                            setReceiptItems((prev) =>
                              prev.map((ri, j) =>
                                j === i ? { ...ri, quantityReceived: e.target.value } : ri,
                              ),
                            )
                          }
                          min="0"
                          max={remaining}
                          className="w-20 px-2 py-1 text-center text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {remaining <= 0 && (
                          <p className="text-xs text-green-600 mt-0.5">Fully received</p>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {Number(item.unitCost).toLocaleString('en-NG', {
                          style: 'currency',
                          currency: 'NGN',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {errors.items && <p className="text-xs text-red-500">{errors.items}</p>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </>
        )}
      </div>

      {errors.submit && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {errors.submit}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (validate()) createMutation.mutate(); }}
          disabled={createMutation.isPending || !purchaseOrderId}
          className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save size={16} />
          {createMutation.isPending ? 'Saving...' : 'Record Receipt'}
        </button>
      </div>
    </div>
  );
}
