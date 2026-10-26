'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Printer, Minus, Plus, AlertCircle, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LabelPrintPreview, printLabels } from './label-print-preview';

interface LabelData {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  variantOptions: Record<string, string> | null;
  sku: string;
  barcodeValue: string;
  barcodeType: 'CODE128' | 'EAN13';
  sellingPrice: string;
  currency: string;
  brandName: string | null;
  orgName: string;
}

interface PrintItem {
  productId: string;
  variantId?: string;
  qty: number;
}

// ── Single-product modal ────────────────────────────────────────────────────

interface SingleLabelModalProps {
  productId: string;
  variantId?: string;
  onClose: () => void;
}

export function PrintSingleLabelModal({ productId, variantId, onClose }: SingleLabelModalProps) {
  const [qty, setQty] = useState(1);
  const [printing, setPrinting] = useState(false);

  const { data, isLoading, error } = useQuery<LabelData>({
    queryKey: ['label-data', productId, variantId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (variantId) params.set('variantId', variantId);
      const res = await api().get(`/products/${productId}/label?${params}`);
      return ((res.data as any)?.data ?? res.data) as LabelData;
    },
  });

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printLabels([{ ...data, qty }], data.orgName);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Print Label</h2>
          <button onClick={onClose} className="p-1.5 rounded text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {isLoading && (
          <div className="animate-pulse h-28 bg-gray-100 rounded-lg" />
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={14} />
            Failed to load label data
          </div>
        )}

        {data && (
          <>
            {/* Preview */}
            <div className="flex justify-center">
              <LabelPrintPreview label={data} width={226} height={113} />
            </div>

            {/* Barcode info */}
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
              <p><span className="font-medium">Barcode:</span> {data.barcodeValue} ({data.barcodeType})</p>
              <p><span className="font-medium">SKU:</span> {data.sku}</p>
              {data.barcodeType === 'EAN13' && (
                <p className="text-blue-600"><Info size={10} className="inline mr-0.5" />EAN-13 GTIN will be printed</p>
              )}
            </div>

            {/* Printer note */}
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex gap-2">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>Set print scale to <strong>100%</strong> (Actual size). Disable headers/footers. Configure paper size to <strong>60 × 30 mm</strong> in your printer settings.</span>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  disabled={qty <= 1}
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={qty}
                  onChange={e => setQty(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-16 text-center text-sm border border-gray-200 rounded-lg py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => setQty(q => Math.min(200, q + 1))}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  disabled={qty >= 200}
                >
                  <Plus size={14} />
                </button>
                <span className="text-sm text-gray-500">labels</span>
              </div>
            </div>

            <button
              onClick={handlePrint}
              disabled={printing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              <Printer size={16} />
              {printing ? 'Opening print dialog…' : `Print ${qty} Label${qty !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Batch modal (multiple products) ────────────────────────────────────────

interface BatchItem {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  qty: number;
}

interface BatchLabelModalProps {
  items: BatchItem[];
  onClose: () => void;
}

export function PrintBatchLabelsModal({ items, onClose }: BatchLabelModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(items.map(item => [`${item.productId}:${item.variantId ?? ''}`, item.qty ?? 1]))
  );
  const [printing, setPrinting] = useState(false);

  const batchMutation = useMutation({
    mutationFn: async () => {
      const batchItems = items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        qty: quantities[`${item.productId}:${item.variantId ?? ''}`] ?? 1,
      }));
      const res = await api().post('/products/labels/batch', { items: batchItems });
      return ((res.data as any)?.data ?? res.data) as Array<LabelData & { qty: number }>;
    },
    onSuccess: async (data) => {
      const orgName = data[0]?.orgName ?? 'KNEF';
      await printLabels(data, orgName);
      setPrinting(false);
    },
    onError: () => setPrinting(false),
  });

  const handlePrint = () => {
    setPrinting(true);
    batchMutation.mutate();
  };

  const totalQty = Object.values(quantities).reduce((s, q) => s + q, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Print Labels</h2>
          <button onClick={onClose} className="p-1.5 rounded text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex gap-2">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>Set print scale to <strong>100%</strong>. Paper size: <strong>60 × 30 mm</strong>. Disable headers/footers.</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.map(item => {
            const key = `${item.productId}:${item.variantId ?? ''}`;
            const qty = quantities[key] ?? 1;
            return (
              <div key={key} className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                  {item.variantName && <p className="text-xs text-gray-500 truncate">{item.variantName}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setQuantities(q => ({ ...q, [key]: Math.max(1, (q[key] ?? 1) - 1) }))}
                    className="p-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    disabled={qty <= 1}
                  >
                    <Minus size={10} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={qty}
                    onChange={e => setQuantities(q => ({ ...q, [key]: Math.min(200, Math.max(1, parseInt(e.target.value) || 1)) }))}
                    className="w-12 text-center text-xs border border-gray-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setQuantities(q => ({ ...q, [key]: Math.min(200, (q[key] ?? 1) + 1) }))}
                    className="p-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    disabled={qty >= 200}
                  >
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {batchMutation.isError && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={14} />
            Failed to load label data. Please try again.
          </div>
        )}

        <button
          onClick={handlePrint}
          disabled={printing || batchMutation.isPending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          <Printer size={16} />
          {printing || batchMutation.isPending ? 'Preparing…' : `Print ${totalQty} Label${totalQty !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
