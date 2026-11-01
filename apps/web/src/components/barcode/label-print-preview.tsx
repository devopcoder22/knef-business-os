'use client';

import { useEffect, useRef, useState } from 'react';

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

interface LabelPrintPreviewProps {
  label: LabelData;
  width?: number;
  height?: number;
}

function formatPrice(price: unknown, currency: unknown): string {
  const num = Number(price);
  if (!price && price !== 0) return '';
  if (isNaN(num)) return String(price);
  const cur = String(currency || 'NGN');
  try {
    const result = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(num);
    if (result && result.trim()) return result;
    throw new Error('empty');
  } catch {
    const sym = cur === 'NGN' ? '₦' : cur;
    return `${sym}${num.toLocaleString('en', { maximumFractionDigits: 0 })}`;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function buildVariantSpec(label: LabelData): string | null {
  if (label.variantName) {
    const opts = label.variantOptions as Record<string, string> | null;
    if (opts && Object.keys(opts).length > 0) {
      return Object.values(opts).join(' · ');
    }
    return label.variantName;
  }
  return null;
}

export function LabelPrintPreview({ label, width = 226, height = 113 }: LabelPrintPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const spec = buildVariantSpec(label);
  const priceText = formatPrice(label.sellingPrice, label.currency);

  useEffect(() => {
    if (!label.barcodeValue) return;
    const render = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const bwipjs = (await import('bwip-js')) as any; // eslint-disable-line
        const canvas = canvasRef.current;
        if (!canvas) return;
        bwipjs.toCanvas(canvas, {
          bcid: label.barcodeType === 'EAN13' ? 'ean13' : 'code128',
          text: label.barcodeValue,
          scale: 2,
          height: 8,
          includetext: true,
          textxalign: 'center',
          textsize: 7,
        });
        setBarcodeDataUrl(canvas.toDataURL('image/png'));
        setBarcodeError(null);
      } catch (err: any) {
        setBarcodeError(err.message ?? 'Barcode render failed');
      }
    };
    render();
  }, [label.barcodeValue, label.barcodeType]);

  const s = (base: number) => Math.round(base * (width / 226));

  return (
    <div className="inline-block border border-gray-300 rounded overflow-hidden bg-white shadow-sm">
      {/* Hidden canvas for bwip-js rendering */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Preview — 60×30mm proportional */}
      <div style={{ width, height, padding: s(4), fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: s(1) }}>

        {/* Row 1: org name (left) + SKU (right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: s(5), color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', maxWidth: '60%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {label.orgName}
          </span>
          <span style={{ fontSize: s(5), color: '#9ca3af', fontFamily: 'monospace', maxWidth: '40%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: 'right' }}>
            {label.sku}
          </span>
        </div>

        {/* Row 2: product name */}
        <div style={{ fontSize: s(6.5), fontWeight: 600, color: '#111827', lineHeight: 1.2, flexShrink: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {truncate(label.productName, 40)}
        </div>

        {/* Row 3: price — always on its own row */}
        <div style={{ fontSize: s(10), fontWeight: 800, color: '#000000', lineHeight: 1, flexShrink: 0, letterSpacing: '-0.02em' }}>
          {priceText || <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: s(7) }}>No price</span>}
        </div>

        {/* Variant spec (optional) */}
        {spec && (
          <div style={{ fontSize: s(5.5), color: '#6b7280', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {truncate(spec, 36)}
          </div>
        )}

        {/* Barcode */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {barcodeError ? (
            <span style={{ fontSize: s(5), color: '#ef4444' }}>Barcode error: {barcodeError}</span>
          ) : barcodeDataUrl ? (
            <img src={barcodeDataUrl} alt={label.barcodeValue} style={{ maxWidth: '100%', maxHeight: s(32), objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '80%', height: s(18), background: '#e5e7eb', borderRadius: 2 }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Print via TSPL2 API ───────────────────────────────────────────────────

interface PrintableLabelData extends LabelData {
  qty: number;
}

export async function printLabels(labels: PrintableLabelData[], _orgName: string): Promise<void> {
  const res = await fetch('/api/print/label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Print failed (${res.status})`);
  }
}
