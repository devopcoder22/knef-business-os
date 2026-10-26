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

function formatPrice(price: string, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(price));
  } catch {
    return `${currency} ${Number(price).toLocaleString()}`;
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

  const scaleFactor = width / 226;

  return (
    <div className="inline-block border border-gray-300 rounded overflow-hidden bg-white shadow-sm">
      {/* Hidden canvas for bwip-js rendering */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Preview box — proportional to 60×30mm */}
      <div
        style={{ width, height, padding: Math.round(4 * scaleFactor), fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
      >
        {/* Top row: org name + price */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Math.round(1 * scaleFactor) }}>
          <span style={{ fontSize: Math.round(5.5 * scaleFactor), color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.02em', maxWidth: '55%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {label.orgName}
          </span>
          <span style={{ fontSize: Math.round(7.5 * scaleFactor), fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
            {formatPrice(label.sellingPrice, label.currency)}
          </span>
        </div>

        {/* Product name */}
        <div style={{ fontSize: Math.round(7 * scaleFactor), fontWeight: 600, color: '#111827', lineHeight: 1.2, marginBottom: Math.round(1 * scaleFactor), overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {truncate(label.productName, 40)}
        </div>

        {/* Variant spec */}
        {spec && (
          <div style={{ fontSize: Math.round(6 * scaleFactor), color: '#4b5563', marginBottom: Math.round(1 * scaleFactor), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {truncate(spec, 36)}
          </div>
        )}

        {/* Barcode */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {barcodeError ? (
            <span style={{ fontSize: Math.round(5.5 * scaleFactor), color: '#ef4444' }}>Barcode error: {barcodeError}</span>
          ) : barcodeDataUrl ? (
            <img src={barcodeDataUrl} alt={label.barcodeValue} style={{ maxWidth: '100%', maxHeight: Math.round(36 * scaleFactor), objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '80%', height: Math.round(20 * scaleFactor), background: '#e5e7eb', borderRadius: 2 }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Print document generation ─────────────────────────────────────────────

interface PrintableLabelData extends LabelData {
  qty: number;
}

export async function printLabels(labels: PrintableLabelData[], orgName: string): Promise<void> {
  // Pre-render all barcodes to dataURLs
  const rendered: Array<{ label: PrintableLabelData; dataUrl: string | null }> = [];

  for (const label of labels) {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const bwipjs = (await import('bwip-js')) as any; // eslint-disable-line
      const canvas = document.createElement('canvas');
      bwipjs.toCanvas(canvas, {
        bcid: label.barcodeType === 'EAN13' ? 'ean13' : 'code128',
        text: label.barcodeValue,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
        textsize: 8,
      });
      rendered.push({ label, dataUrl: canvas.toDataURL('image/png') });
    } catch {
      rendered.push({ label, dataUrl: null });
    }
  }

  // Build one HTML block per physical label
  const labelBlocks: string[] = [];
  for (const { label, dataUrl } of rendered) {
    const spec = buildVariantSpec(label);
    const price = formatPrice(label.sellingPrice, label.currency);
    for (let i = 0; i < label.qty; i++) {
      labelBlocks.push(`
        <div class="label">
          <div class="label-top">
            <span class="org">${escHtml(label.orgName)}</span>
            <span class="price">${escHtml(price)}</span>
          </div>
          <div class="product-name">${escHtml(truncate(label.productName, 40))}</div>
          ${spec ? `<div class="spec">${escHtml(truncate(spec, 36))}</div>` : ''}
          <div class="barcode-area">
            ${dataUrl
              ? `<img src="${dataUrl}" alt="${escHtml(label.barcodeValue)}" />`
              : `<span class="barcode-fallback">${escHtml(label.barcodeValue)}</span>`}
          </div>
        </div>
      `);
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Product Labels</title>
  <style>
    /* ── Print settings ── */
    @page {
      size: 60mm 30mm;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 60mm; height: 30mm; background: white; }

    /* Each label fills one page exactly */
    .label {
      width: 60mm;
      height: 30mm;
      padding: 1.5mm 2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      break-after: page;
      font-family: Arial, Helvetica, sans-serif;
      overflow: hidden;
    }
    .label:last-child { page-break-after: avoid; break-after: avoid; }

    .label-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .org {
      font-size: 5pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      max-width: 55%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .price {
      font-size: 7pt;
      font-weight: 700;
      color: #111827;
      white-space: nowrap;
    }
    .product-name {
      font-size: 6.5pt;
      font-weight: 600;
      color: #111827;
      line-height: 1.25;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .spec {
      font-size: 5.5pt;
      color: #4b5563;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .barcode-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
    }
    .barcode-area img {
      max-width: 100%;
      max-height: 10mm;
      object-fit: contain;
    }
    .barcode-fallback {
      font-size: 5pt;
      font-family: monospace;
      color: #374151;
    }

    /* Hide everything on screen except print simulation */
    @media screen {
      body { background: #f3f4f6; padding: 8px; }
      .label { border: 1px solid #d1d5db; margin-bottom: 4px; background: white; }
    }
  </style>
</head>
<body>
  ${labelBlocks.join('\n')}
  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=400,height=300');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print labels.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
