import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

interface OrgBranding {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  currency: string;
}

@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Private helpers ───────────────────────────────────────────

  private async getOrg(organizationId: string): Promise<OrgBranding> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        name: true, address: true, city: true, state: true,
        country: true, phone: true, email: true, taxId: true,
        logoUrl: true, currency: true,
      },
    });
    return {
      name: org?.name ?? 'Business',
      address: org?.address ?? null,
      city: org?.city ?? null,
      state: org?.state ?? null,
      country: org?.country ?? 'Nigeria',
      phone: org?.phone ?? null,
      email: org?.email ?? null,
      taxId: org?.taxId ?? null,
      logoUrl: org?.logoUrl ?? null,
      currency: org?.currency ?? 'NGN',
    };
  }

  private async getUserName(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return null;
    return `${user.firstName} ${user.lastName}`.trim();
  }

  private esc(val: unknown): string {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private fmt(value: unknown, currency = 'NGN'): string {
    const num = parseFloat(String(value ?? '0'));
    try {
      return num.toLocaleString('en-NG', { style: 'currency', currency });
    } catch {
      return `${currency} ${num.toFixed(2)}`;
    }
  }

  private fmtDate(val: unknown): string {
    const d = val instanceof Date ? val : new Date(String(val ?? ''));
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-NG');
  }

  private logoHtml(org: OrgBranding): string {
    if (org.logoUrl && /^https?:\/\//.test(org.logoUrl)) {
      return `<img src="${this.esc(org.logoUrl)}" alt="${this.esc(org.name)}" style="max-height:48px;max-width:140px;object-fit:contain;" onerror="this.style.display='none'"/>`;
    }
    return '';
  }

  private orgHeaderHtml(org: OrgBranding): string {
    const logo = this.logoHtml(org);
    const addr = [org.address, org.city, org.state, org.country].filter(Boolean).join(', ');
    return `
      <div>
        ${logo}
        <div style="font-size:20px;font-weight:900;color:#1e40af;letter-spacing:-0.5px;">${this.esc(org.name)}</div>
        ${addr ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">${this.esc(addr)}</div>` : ''}
        ${org.phone ? `<div style="color:#64748b;font-size:11px;">${this.esc(org.phone)}</div>` : ''}
        ${org.email ? `<div style="color:#64748b;font-size:11px;">${this.esc(org.email)}</div>` : ''}
        ${org.taxId ? `<div style="color:#64748b;font-size:11px;">Tax ID: ${this.esc(org.taxId)}</div>` : ''}
      </div>`;
  }

  private baseStyles(): string {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 13px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
      .doc-title { font-size: 26px; font-weight: 700; color: #1e40af; }
      .doc-ref { font-size: 16px; font-weight: 600; color: #475569; margin-top: 4px; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; }
      .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 6px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
      tfoot td { padding: 8px 12px; }
      .total-row td { font-size: 14px; font-weight: 700; }
      .divider { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
      .footer { margin-top: 36px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 12px; }
      th { padding: 9px 12px; text-align: left; font-size: 11px; color: #64748b; background: #f1f5f9; }
      td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }`;
  }

  private async renderPdf(html: string): Promise<Buffer> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const puppeteer = require('puppeteer') as {
        launch: (opts: Record<string, unknown>) => Promise<{
          newPage: () => Promise<{
            setContent: (h: string, o: Record<string, unknown>) => Promise<void>;
            pdf: (o: Record<string, unknown>) => Promise<Uint8Array>;
          }>;
          close: () => Promise<void>;
        }>;
      };
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });
      await browser.close();
      return Buffer.from(pdf);
    } catch {
      return Buffer.from(html, 'utf-8');
    }
  }

  // ── Invoice ───────────────────────────────────────────────────

  private buildInvoiceHtml(invoice: Record<string, unknown>, org: OrgBranding): string {
    const customer = (invoice['customer'] as Record<string, string> | null) ?? null;
    const items = (invoice['items'] as Array<Record<string, unknown>>) ?? [];
    const payments = (invoice['payments'] as Array<Record<string, unknown>>) ?? [];
    const cur = org.currency;

    const statusBadgeClass: Record<string, string> = {
      PAID: 'background:#dcfce7;color:#16a34a;',
      UNPAID: 'background:#fef2f2;color:#dc2626;',
      PARTIAL: 'background:#fefce8;color:#ca8a04;',
      OVERDUE: 'background:#fef2f2;color:#dc2626;',
      VOID: 'background:#f1f5f9;color:#94a3b8;',
      CANCELLED: 'background:#f1f5f9;color:#94a3b8;',
    };
    const status = String(invoice['status'] ?? 'UNPAID').toUpperCase();
    const badgeStyle = statusBadgeClass[status] ?? 'background:#f1f5f9;color:#64748b;';

    const itemRows = items.map(item => `
      <tr>
        <td>${this.esc(item['description'] ?? item['productId'] ?? 'Item')}</td>
        <td class="text-center">${this.esc(item['quantity'] ?? 1)}</td>
        <td class="text-right">${this.fmt(item['unitPrice'], cur)}</td>
        ${parseFloat(String(item['discountRate'] ?? '0')) > 0 ? `<td class="text-right">${this.esc(item['discountRate'])}%</td>` : '<td class="text-right">—</td>'}
        ${parseFloat(String(item['taxRate'] ?? '0')) > 0 ? `<td class="text-right">${this.esc(item['taxRate'])}%</td>` : '<td class="text-right">—</td>'}
        <td class="text-right">${this.fmt(item['totalPrice'], cur)}</td>
      </tr>`).join('');

    const paymentRows = payments.map(p => `
      <tr>
        <td>${this.esc(p['method'] ?? '')}</td>
        <td>${this.fmtDate(p['receivedAt'] ?? p['createdAt'])}</td>
        <td class="text-right">${this.fmt(p['amount'], cur)}</td>
        <td>${this.esc(p['reference'] ?? '')}</td>
      </tr>`).join('');

    const total = parseFloat(String(invoice['totalAmount'] ?? '0'));
    const paid = parseFloat(String(invoice['paidAmount'] ?? '0'));
    const balance = total - paid;

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>${this.baseStyles()}</style>
</head><body>
<div class="header">
  ${this.orgHeaderHtml(org)}
  <div style="text-align:right;">
    <div class="doc-title">INVOICE</div>
    <div class="doc-ref">${this.esc(invoice['reference'] ?? '')}</div>
    <div style="margin-top:6px;"><span class="badge" style="${badgeStyle}">${this.esc(status)}</span></div>
  </div>
</div>

<div class="info-grid">
  <div>
    <p class="section-title">Bill To</p>
    ${customer
      ? `<p style="font-weight:600;">${this.esc(customer['firstName'] ?? '')} ${this.esc(customer['lastName'] ?? '')}</p>
         <p style="color:#64748b;">${this.esc(customer['phone'] ?? '')}</p>
         <p style="color:#64748b;">${this.esc(customer['email'] ?? '')}</p>`
      : '<p style="color:#94a3b8;">Walk-in customer</p>'}
  </div>
  <div style="text-align:right;">
    <p class="section-title">Invoice Details</p>
    <p><strong>Date:</strong> ${this.fmtDate(invoice['issuedAt'] ?? invoice['createdAt'])}</p>
    ${invoice['dueDate'] ? `<p><strong>Due:</strong> ${this.fmtDate(invoice['dueDate'])}</p>` : ''}
    ${invoice['order'] ? `<p><strong>Order:</strong> ${this.esc((invoice['order'] as Record<string, unknown>)['reference'] ?? '')}</p>` : ''}
    <p><strong>Currency:</strong> ${this.esc(cur)}</p>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th class="text-center">Qty</th>
      <th class="text-right">Unit Price</th>
      <th class="text-right">Discount</th>
      <th class="text-right">Tax</th>
      <th class="text-right">Total</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    <tr><td colspan="5" class="text-right" style="color:#64748b;">Subtotal</td><td class="text-right">${this.fmt(invoice['subtotal'], cur)}</td></tr>
    ${parseFloat(String(invoice['discountAmount'] ?? '0')) > 0 ? `<tr><td colspan="5" class="text-right" style="color:#64748b;">Discount</td><td class="text-right" style="color:#dc2626;">-${this.fmt(invoice['discountAmount'], cur)}</td></tr>` : ''}
    ${parseFloat(String(invoice['taxAmount'] ?? '0')) > 0 ? `<tr><td colspan="5" class="text-right" style="color:#64748b;">Tax</td><td class="text-right">${this.fmt(invoice['taxAmount'], cur)}</td></tr>` : ''}
    <tr class="total-row" style="border-top:2px solid #1e40af;">
      <td colspan="5" class="text-right">Total</td>
      <td class="text-right" style="color:#1e40af;">${this.fmt(invoice['totalAmount'], cur)}</td>
    </tr>
    <tr><td colspan="5" class="text-right" style="color:#64748b;">Amount Paid</td><td class="text-right" style="color:#16a34a;">${this.fmt(invoice['paidAmount'], cur)}</td></tr>
    <tr style="font-weight:600;"><td colspan="5" class="text-right">Balance Due</td><td class="text-right" style="color:${balance <= 0 ? '#16a34a' : '#dc2626'};">${this.fmt(balance, cur)}</td></tr>
  </tfoot>
</table>

${payments.length > 0 ? `
<hr class="divider"/>
<p class="section-title">Payment History</p>
<table>
  <thead><tr><th>Method</th><th>Date</th><th class="text-right">Amount</th><th>Reference</th></tr></thead>
  <tbody>${paymentRows}</tbody>
</table>` : ''}

${invoice['notes'] ? `<hr class="divider"/><p class="section-title">Notes</p><p style="color:#64748b;">${this.esc(invoice['notes'])}</p>` : ''}
${invoice['terms'] ? `<hr class="divider"/><p class="section-title">Terms &amp; Conditions</p><p style="color:#64748b;">${this.esc(invoice['terms'])}</p>` : ''}

<div class="footer">
  <p>Thank you for your business! | ${this.esc(org.name)}</p>
  ${org.email ? `<p>${this.esc(org.email)}</p>` : ''}
</div>
</body></html>`;
  }

  // ── Purchase Order ────────────────────────────────────────────

  private buildPoHtml(
    po: Record<string, unknown>,
    org: OrgBranding,
    approverName: string | null,
  ): string {
    const supplier = (po['supplier'] as Record<string, unknown>) ?? {};
    const location = (po['location'] as Record<string, unknown>) ?? {};
    const items = (po['items'] as Array<Record<string, unknown>>) ?? [];
    const cur = org.currency;

    const statusColors: Record<string, string> = {
      DRAFT: 'background:#f1f5f9;color:#64748b;',
      SUBMITTED: 'background:#dbeafe;color:#1d4ed8;',
      APPROVED: 'background:#dcfce7;color:#16a34a;',
      PARTIALLY_RECEIVED: 'background:#fefce8;color:#ca8a04;',
      RECEIVED: 'background:#dcfce7;color:#16a34a;',
      CANCELLED: 'background:#fef2f2;color:#dc2626;',
      CLOSED: 'background:#f3f4f6;color:#6b7280;',
    };
    const status = String(po['status'] ?? 'DRAFT').toUpperCase();
    const badgeStyle = statusColors[status] ?? 'background:#f1f5f9;color:#64748b;';

    const itemRows = items.map(item => {
      const prod = (item['product'] as Record<string, unknown>) ?? {};
      return `<tr>
        <td>${this.esc(prod['name'] ?? item['description'] ?? 'Item')}</td>
        <td>${this.esc(prod['sku'] ?? '')}</td>
        <td class="text-center">${this.esc(item['quantity'] ?? 0)}</td>
        <td class="text-center" style="color:#64748b;">${this.esc(item['receivedQty'] ?? 0)}</td>
        <td class="text-right">${this.fmt(item['unitCost'], cur)}</td>
        ${parseFloat(String(item['taxRate'] ?? '0')) > 0 ? `<td class="text-right">${this.esc(item['taxRate'])}%</td>` : '<td class="text-right">—</td>'}
        <td class="text-right">${this.fmt(item['totalCost'], cur)}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>${this.baseStyles()}</style>
</head><body>
<div class="header">
  ${this.orgHeaderHtml(org)}
  <div style="text-align:right;">
    <div class="doc-title">PURCHASE ORDER</div>
    <div class="doc-ref">${this.esc(po['reference'] ?? '')}</div>
    <div style="margin-top:6px;"><span class="badge" style="${badgeStyle}">${this.esc(status)}</span></div>
  </div>
</div>

<div class="info-grid">
  <div>
    <p class="section-title">Supplier</p>
    <p style="font-weight:600;">${this.esc(supplier['name'] ?? '')}</p>
    ${supplier['email'] ? `<p style="color:#64748b;">${this.esc(supplier['email'])}</p>` : ''}
    ${supplier['phone'] ? `<p style="color:#64748b;">${this.esc(supplier['phone'])}</p>` : ''}
    ${supplier['address'] ? `<p style="color:#64748b;">${this.esc(supplier['address'])}</p>` : ''}
  </div>
  <div style="text-align:right;">
    <p class="section-title">Order Details</p>
    <p><strong>Date:</strong> ${this.fmtDate(po['createdAt'])}</p>
    ${po['expectedDate'] ? `<p><strong>Expected:</strong> ${this.fmtDate(po['expectedDate'])}</p>` : ''}
    <p><strong>Deliver To:</strong> ${this.esc(location['name'] ?? '')}</p>
    <p><strong>Currency:</strong> ${this.esc(cur)}</p>
    ${po['approvedAt'] ? `<p><strong>Approved:</strong> ${this.fmtDate(po['approvedAt'])}${approverName ? ` by ${this.esc(approverName)}` : ''}</p>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Product</th>
      <th>SKU</th>
      <th class="text-center">Ordered</th>
      <th class="text-center">Received</th>
      <th class="text-right">Unit Cost</th>
      <th class="text-right">Tax</th>
      <th class="text-right">Total</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    <tr><td colspan="6" class="text-right" style="color:#64748b;">Subtotal</td><td class="text-right">${this.fmt(po['subtotal'], cur)}</td></tr>
    ${parseFloat(String(po['taxAmount'] ?? '0')) > 0 ? `<tr><td colspan="6" class="text-right" style="color:#64748b;">Tax</td><td class="text-right">${this.fmt(po['taxAmount'], cur)}</td></tr>` : ''}
    ${parseFloat(String(po['shippingCost'] ?? '0')) > 0 ? `<tr><td colspan="6" class="text-right" style="color:#64748b;">Shipping</td><td class="text-right">${this.fmt(po['shippingCost'], cur)}</td></tr>` : ''}
    ${parseFloat(String(po['discountAmount'] ?? '0')) > 0 ? `<tr><td colspan="6" class="text-right" style="color:#64748b;">Discount</td><td class="text-right" style="color:#dc2626;">-${this.fmt(po['discountAmount'], cur)}</td></tr>` : ''}
    <tr class="total-row" style="border-top:2px solid #1e40af;">
      <td colspan="6" class="text-right">Total</td>
      <td class="text-right" style="color:#1e40af;">${this.fmt(po['totalAmount'], cur)}</td>
    </tr>
    <tr><td colspan="6" class="text-right" style="color:#64748b;">Amount Paid</td><td class="text-right" style="color:#16a34a;">${this.fmt(po['paidAmount'], cur)}</td></tr>
    <tr style="font-weight:600;"><td colspan="6" class="text-right">Balance Outstanding</td><td class="text-right" style="color:${parseFloat(String(po['totalAmount'] ?? '0')) - parseFloat(String(po['paidAmount'] ?? '0')) <= 0 ? '#16a34a' : '#dc2626'};">${this.fmt(parseFloat(String(po['totalAmount'] ?? '0')) - parseFloat(String(po['paidAmount'] ?? '0')), cur)}</td></tr>
  </tfoot>
</table>

${po['notes'] ? `<hr class="divider"/><p class="section-title">Notes</p><p style="color:#64748b;">${this.esc(po['notes'])}</p>` : ''}
${po['cancelReason'] ? `<hr class="divider"/><p class="section-title">Cancellation Reason</p><p style="color:#dc2626;">${this.esc(po['cancelReason'])}</p>` : ''}

<div class="footer">
  <p>${this.esc(org.name)} | ${org.email ? this.esc(org.email) : ''} | ${org.phone ? this.esc(org.phone) : ''}</p>
</div>
</body></html>`;
  }

  // ── Goods Received Note ───────────────────────────────────────

  private buildGrnHtml(
    grn: Record<string, unknown>,
    org: OrgBranding,
    receivedByName: string | null,
  ): string {
    const po = (grn['purchaseOrder'] as Record<string, unknown>) ?? {};
    const supplier = (po['supplier'] as Record<string, unknown>) ?? {};
    const location = (po['location'] as Record<string, unknown>) ?? {};
    const items = (grn['items'] as Array<Record<string, unknown>>) ?? [];
    const cur = org.currency;

    const itemRows = items.map(item => {
      const ordered = Number(item['quantityOrdered'] ?? 0);
      const received = Number(item['quantityReceived'] ?? 0);
      const discrepancy = received - ordered;
      const discColor = discrepancy < 0 ? 'color:#dc2626;' : discrepancy > 0 ? 'color:#ca8a04;' : 'color:#16a34a;';
      return `<tr>
        <td>${this.esc(item['productId'] ?? '')}</td>
        <td class="text-center">${ordered}</td>
        <td class="text-center">${received}</td>
        <td class="text-center" style="${discColor};font-weight:600;">${discrepancy >= 0 ? '+' : ''}${discrepancy}</td>
        <td class="text-right">${this.fmt(item['unitCost'], cur)}</td>
        ${item['notes'] ? `<td>${this.esc(item['notes'])}</td>` : '<td style="color:#94a3b8;">—</td>'}
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>${this.baseStyles()}</style>
</head><body>
<div class="header">
  ${this.orgHeaderHtml(org)}
  <div style="text-align:right;">
    <div class="doc-title">GOODS RECEIVED NOTE</div>
    <div class="doc-ref">${this.esc(grn['reference'] ?? '')}</div>
    <div style="margin-top:6px;"><span class="badge" style="background:#dcfce7;color:#16a34a;">RECEIVED</span></div>
  </div>
</div>

<div class="info-grid">
  <div>
    <p class="section-title">Supplier</p>
    <p style="font-weight:600;">${this.esc(supplier['name'] ?? '')}</p>
    ${supplier['email'] ? `<p style="color:#64748b;">${this.esc(supplier['email'])}</p>` : ''}
    ${supplier['phone'] ? `<p style="color:#64748b;">${this.esc(supplier['phone'])}</p>` : ''}
  </div>
  <div style="text-align:right;">
    <p class="section-title">Receipt Details</p>
    <p><strong>GRN:</strong> ${this.esc(grn['reference'] ?? '')}</p>
    <p><strong>PO:</strong> ${this.esc(po['reference'] ?? '')}</p>
    <p><strong>Date:</strong> ${this.fmtDate(grn['receivedAt'])}</p>
    <p><strong>Location:</strong> ${this.esc(location['name'] ?? '')}</p>
    ${receivedByName ? `<p><strong>Received By:</strong> ${this.esc(receivedByName)}</p>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Product</th>
      <th class="text-center">Ordered</th>
      <th class="text-center">Received</th>
      <th class="text-center">Discrepancy</th>
      <th class="text-right">Unit Cost</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

${grn['notes'] ? `<hr class="divider"/><p class="section-title">Notes</p><p style="color:#64748b;">${this.esc(grn['notes'])}</p>` : ''}

<div class="footer">
  <p>${this.esc(org.name)} | Goods Received Note | ${this.fmtDate(grn['receivedAt'])}</p>
</div>
</body></html>`;
  }

  // ── Sales Receipt (A4) ────────────────────────────────────────

  private buildReceiptHtml(receipt: Record<string, unknown>, org: OrgBranding): string {
    const customer = (receipt['customer'] as Record<string, string> | null) ?? null;
    const invoice = (receipt['invoice'] as Record<string, unknown> | null) ?? null;
    const items = invoice
      ? ((invoice['items'] as Array<Record<string, unknown>>) ?? [])
      : [];
    const cur = org.currency;

    const itemRows = items.map(item => `
      <tr>
        <td>${this.esc(item['description'] ?? item['productId'] ?? 'Item')}</td>
        <td class="text-center">${this.esc(item['quantity'] ?? 1)}</td>
        <td class="text-right">${this.fmt(item['unitPrice'], cur)}</td>
        <td class="text-right">${this.fmt(item['totalPrice'], cur)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
${this.baseStyles()}
@media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head><body>
<div class="header">
  ${this.orgHeaderHtml(org)}
  <div style="text-align:right;">
    <div class="doc-title">RECEIPT</div>
    <div class="doc-ref">${this.esc(receipt['reference'] ?? '')}</div>
  </div>
</div>

<div class="info-grid">
  <div>
    <p class="section-title">Customer</p>
    ${customer
      ? `<p style="font-weight:600;">${this.esc(customer['firstName'] ?? '')} ${this.esc(customer['lastName'] ?? '')}</p>
         ${customer['phone'] ? `<p style="color:#64748b;">${this.esc(customer['phone'])}</p>` : ''}
         ${customer['email'] ? `<p style="color:#64748b;">${this.esc(customer['email'])}</p>` : ''}`
      : '<p style="color:#94a3b8;">Walk-in customer</p>'}
  </div>
  <div style="text-align:right;">
    <p class="section-title">Payment Details</p>
    <p><strong>Date:</strong> ${this.fmtDate(receipt['issuedAt'])}</p>
    <p><strong>Method:</strong> ${this.esc(receipt['method'] ?? '')}</p>
    ${invoice ? `<p><strong>Invoice:</strong> ${this.esc((invoice as Record<string, unknown>)['reference'] ?? '')}</p>` : ''}
    <p><strong>Currency:</strong> ${this.esc(cur)}</p>
  </div>
</div>

${items.length > 0 ? `
<table>
  <thead>
    <tr>
      <th>Description</th>
      <th class="text-center">Qty</th>
      <th class="text-right">Unit Price</th>
      <th class="text-right">Total</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>
<br/>` : ''}

<div style="background:#f8fafc;border-radius:8px;padding:16px;margin-top:16px;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:16px;font-weight:700;">Amount Received</span>
    <span style="font-size:20px;font-weight:900;color:#1e40af;">${this.fmt(receipt['amount'], cur)}</span>
  </div>
  <div style="margin-top:8px;color:#64748b;font-size:12px;">Payment Method: ${this.esc(receipt['method'] ?? '')}</div>
</div>

${receipt['notes'] ? `<hr class="divider"/><p class="section-title">Notes</p><p style="color:#64748b;">${this.esc(receipt['notes'])}</p>` : ''}

<div class="footer">
  <p>Thank you for your payment! | ${this.esc(org.name)}</p>
  ${org.phone ? `<p>${this.esc(org.phone)}</p>` : ''}
</div>
</body></html>`;
  }

  // ── Thermal Receipt ───────────────────────────────────────────

  private buildThermalHtml(receipt: Record<string, unknown>, org: OrgBranding): string {
    const customer = (receipt['customer'] as Record<string, string> | null) ?? null;
    const invoice = (receipt['invoice'] as Record<string, unknown> | null) ?? null;
    const items = invoice
      ? ((invoice['items'] as Array<Record<string, unknown>>) ?? [])
      : [];
    const cur = org.currency;

    const sep = '--------------------------------';
    const itemLines = items.map(item => {
      const name = String(item['description'] ?? item['productId'] ?? 'Item').slice(0, 20);
      const qty = String(item['quantity'] ?? 1);
      const total = this.fmt(item['totalPrice'], cur);
      const pad = Math.max(0, 32 - name.length - qty.length - total.length - 2);
      return `<div style="display:flex;justify-content:space-between;"><span>${this.esc(name)} ×${qty}</span><span>${this.esc(total)}</span></div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  color: #000;
  width: 302px;
  padding: 8px;
}
.center { text-align: center; }
.sep { border-top: 1px dashed #000; margin: 6px 0; }
.total-line { font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; margin: 8px 0; }
@media print {
  @page { size: 80mm auto; margin: 0; }
  body { width: 80mm; }
}
</style>
</head><body>
<div class="center" style="font-size:15px;font-weight:bold;margin-bottom:4px;">${this.esc(org.name)}</div>
${org.address ? `<div class="center" style="font-size:10px;color:#444;">${this.esc(org.address)}</div>` : ''}
${org.phone ? `<div class="center" style="font-size:10px;">${this.esc(org.phone)}</div>` : ''}
<div class="sep"></div>
<div class="center" style="font-size:13px;font-weight:bold;">RECEIPT</div>
<div class="center" style="font-size:10px;">${this.esc(receipt['reference'] ?? '')}</div>
<div class="center" style="font-size:10px;">${this.fmtDate(receipt['issuedAt'])}</div>
<div class="sep"></div>
${customer ? `<div>${this.esc(customer['firstName'] ?? '')} ${this.esc(customer['lastName'] ?? '')}</div>
${customer['phone'] ? `<div style="font-size:10px;color:#444;">${this.esc(customer['phone'])}</div>` : ''}` : '<div style="color:#666;">Walk-in</div>'}
<div class="sep"></div>
${itemLines}
<div class="sep"></div>
<div class="total-line">
  <span>TOTAL</span>
  <span>${this.esc(this.fmt(receipt['amount'], cur))}</span>
</div>
<div style="display:flex;justify-content:space-between;font-size:11px;">
  <span>Method</span><span>${this.esc(receipt['method'] ?? '')}</span>
</div>
<div class="sep"></div>
<div class="center" style="font-size:10px;margin-top:8px;">Thank you for your business!</div>
<div class="center" style="font-size:10px;">${this.esc(org.name)}</div>
</body></html>`;
  }

  // ── Public API ────────────────────────────────────────────────

  async generateInvoicePdf(invoice: Record<string, unknown>, organizationId?: string): Promise<Buffer> {
    const org = organizationId
      ? await this.getOrg(organizationId)
      : { name: 'Business', address: null, city: null, state: null, country: 'Nigeria', phone: null, email: null, taxId: null, logoUrl: null, currency: 'NGN' };
    const html = this.buildInvoiceHtml(invoice, org);
    return this.renderPdf(html);
  }

  async generatePoPdf(po: Record<string, unknown>, organizationId: string): Promise<Buffer> {
    const [org, approverName] = await Promise.all([
      this.getOrg(organizationId),
      this.getUserName(po['approvedBy'] as string | null),
    ]);
    const html = this.buildPoHtml(po, org, approverName);
    return this.renderPdf(html);
  }

  async generateGrnPdf(grn: Record<string, unknown>, organizationId: string): Promise<Buffer> {
    const [org, receivedByName] = await Promise.all([
      this.getOrg(organizationId),
      this.getUserName(grn['receivedBy'] as string | null),
    ]);
    const html = this.buildGrnHtml(grn, org, receivedByName);
    return this.renderPdf(html);
  }

  async generateReceiptPdf(receipt: Record<string, unknown>, organizationId: string): Promise<Buffer> {
    const org = await this.getOrg(organizationId);
    const html = this.buildReceiptHtml(receipt, org);
    return this.renderPdf(html);
  }

  async generateThermalReceiptHtml(receipt: Record<string, unknown>, organizationId: string): Promise<string> {
    const org = await this.getOrg(organizationId);
    return this.buildThermalHtml(receipt, org);
  }
}
