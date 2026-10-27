import { NextRequest, NextResponse } from 'next/server';
import { spawnSync } from 'child_process';

interface PrintLabelItem {
  orgName: string;
  productName: string;
  variantName: string | null;
  variantOptions: Record<string, string> | null;
  sku: string;
  barcodeValue: string;
  barcodeType: 'CODE128' | 'EAN13';
  sellingPrice: string;
  currency: string;
  qty: number;
}

const PRINTER = process.env.LABEL_PRINTER_NAME ?? 'XP-365B';

function formatPriceAscii(price: unknown, currency: unknown): string {
  const num = Number(price);
  if (!price && price !== 0) return '';
  if (isNaN(num)) return String(price);
  const cur = String(currency || 'NGN');
  const sym = cur === 'NGN' ? 'N' : cur === 'USD' ? '$' : cur === 'GBP' ? 'L' : cur === 'EUR' ? 'E' : `${cur} `;
  return `${sym}${num.toLocaleString('en', { maximumFractionDigits: 0 })}`;
}

function buildVariantSpec(item: PrintLabelItem): string | null {
  if (!item.variantName) return null;
  if (item.variantOptions && Object.keys(item.variantOptions).length > 0) {
    return Object.values(item.variantOptions).join(' / ');
  }
  return item.variantName;
}

function escTspl(str: string): string {
  return str
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '~' : str;
}

function buildTspl2(items: PrintLabelItem[]): string {
  // 203 DPI, 60×30 mm = 480×240 dots. Left pad=16, right edge=464.
  const lines: string[] = [
    'SIZE 60 mm,30 mm',
    'GAP 3 mm,0 mm',
    'DIRECTION 0',
    'REFERENCE 0,0',
  ];

  for (const item of items) {
    const price = formatPriceAscii(item.sellingPrice, item.currency);
    const spec = buildVariantSpec(item);

    // Font "1" = 8×12 dots per char — right-align SKU
    const skuStr = trunc(item.sku, 20);
    const skuX = Math.max(200, 464 - skuStr.length * 8);
    const orgStr = trunc(item.orgName.toUpperCase(), 24);

    lines.push('CLS');

    // Row 1 (y=8):  org left, SKU right — font "1"
    lines.push(`TEXT 16,8,"1",0,1,1,"${escTspl(orgStr)}"`);
    lines.push(`TEXT ${skuX},8,"1",0,1,1,"${escTspl(skuStr)}"`);

    // Row 2 (y=24): product name — font "2" = 12×20 dots, ~37 chars
    lines.push(`TEXT 16,24,"2",0,1,1,"${escTspl(trunc(item.productName, 37))}"`);

    // Row 3 (y=48): price — font "4" = 24×32 dots
    if (price) {
      lines.push(`TEXT 16,48,"4",0,1,1,"${escTspl(price)}"`);
    }

    // Row 4 (y=84, optional): variant spec — font "1"
    let barcodeY = 84;
    if (spec) {
      lines.push(`TEXT 16,84,"1",0,1,1,"${escTspl(trunc(spec, 48))}"`);
      barcodeY = 100;
    }

    // Barcode (height=55 dots + readable text)
    const bcType = item.barcodeType === 'EAN13' ? 'EAN13' : '128';
    lines.push(`BARCODE 16,${barcodeY},"${bcType}",55,1,0,2,2,"${escTspl(item.barcodeValue)}"`);

    lines.push(`PRINT ${item.qty},1`);
    lines.push('');
  }

  return lines.join('\r\n');
}

export async function POST(req: NextRequest) {
  let items: PrintLabelItem[];
  try {
    const body = await req.json();
    items = body.labels;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No labels provided' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const tspl = buildTspl2(items);

  const result = spawnSync('lpr', ['-P', PRINTER, '-o', 'raw'], {
    input: tspl,
    timeout: 15_000,
    encoding: 'utf-8',
  });

  if (result.status !== 0 || result.error) {
    const msg = result.stderr || result.error?.message || 'Print failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const totalLabels = items.reduce((s, l) => s + l.qty, 0);
  return NextResponse.json({ ok: true, printed: totalLabels });
}
