import { Injectable } from '@nestjs/common';

@Injectable()
export class PdfService {
  /**
   * Generate a simple invoice PDF using HTML template.
   * Uses puppeteer if available; otherwise returns an HTML buffer as fallback.
   * Install puppeteer: pnpm add puppeteer -F @knef/api
   */
  async generateInvoicePdf(invoice: Record<string, unknown>): Promise<Buffer> {
    const html = this.buildInvoiceHtml(invoice);

    try {
      // Dynamic require so the app doesn't crash if puppeteer isn't installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const puppeteer = require('puppeteer') as { launch: (opts: Record<string, unknown>) => Promise<{ newPage: () => Promise<{ setContent: (h: string, o: Record<string, unknown>) => Promise<void>; pdf: (o: Record<string, unknown>) => Promise<Uint8Array> }>; close: () => Promise<void> }> };
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
      // Fallback: return HTML as buffer (client can render it)
      return Buffer.from(html, 'utf-8');
    }
  }

  private buildInvoiceHtml(invoice: Record<string, unknown>): string {
    const customer = (invoice['customer'] as Record<string, string> | null) ?? null;
    const items = (invoice['items'] as Array<Record<string, unknown>>) ?? [];
    const payments = (invoice['payments'] as Array<Record<string, unknown>>) ?? [];

    const formatMoney = (value: unknown): string => {
      const num = parseFloat(String(value ?? '0'));
      return num.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
    };

    const itemRows = items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${String(item['description'] ?? item['productId'] ?? 'Item')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${String(item['quantity'] ?? 1)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatMoney(item['unitPrice'])}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${formatMoney(item['totalPrice'])}</td>
        </tr>
      `,
      )
      .join('');

    const paymentRows = payments
      .map(
        (p) => `
        <tr>
          <td style="padding:4px 8px;">${String(p['method'] ?? '')}</td>
          <td style="padding:4px 8px;">${new Date(String(p['createdAt'] ?? '')).toLocaleDateString()}</td>
          <td style="padding:4px 8px;text-align:right;">${formatMoney(p['amount'])}</td>
        </tr>
      `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .logo { font-size: 24px; font-weight: 900; color: #f59e0b; letter-spacing: -1px; }
    .logo span { color: #1e293b; }
    .invoice-title { font-size: 28px; font-weight: 700; color: #1e40af; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-paid { background: #dcfce7; color: #16a34a; }
    .badge-unpaid { background: #fef2f2; color: #dc2626; }
    .badge-partial { background: #fefce8; color: #ca8a04; }
    table { width: 100%; border-collapse: collapse; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .summary-box { background: #f8fafc; border-radius: 8px; padding: 16px; }
    .total-row { font-size: 15px; font-weight: 700; }
    tfoot td { padding: 10px 12px; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
    .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">KNEF<span> Gadgets</span></div>
      <div style="color:#64748b;font-size:12px;margin-top:4px;">Business OS</div>
    </div>
    <div style="text-align:right;">
      <div class="invoice-title">INVOICE</div>
      <div style="font-size:18px;font-weight:600;color:#475569;margin-top:4px;">${String(invoice['reference'] ?? '')}</div>
      <div style="margin-top:8px;">
        <span class="badge badge-${String(invoice['status'] ?? 'unpaid').toLowerCase()}">${String(invoice['status'] ?? '')}</span>
      </div>
    </div>
  </div>

  <div class="info-grid">
    <div>
      <p class="section-title">Bill To</p>
      ${
        customer
          ? `<p style="font-weight:600;">${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}</p>
             <p style="color:#64748b;">${customer['phone'] ?? ''}</p>
             <p style="color:#64748b;">${customer['email'] ?? ''}</p>`
          : '<p style="color:#94a3b8;">Walk-in customer</p>'
      }
    </div>
    <div style="text-align:right;">
      <p class="section-title">Invoice Details</p>
      <p><strong>Date:</strong> ${new Date(String(invoice['issuedAt'] ?? invoice['createdAt'] ?? '')).toLocaleDateString('en-NG')}</p>
      ${invoice['dueDate'] ? `<p><strong>Due:</strong> ${new Date(String(invoice['dueDate'])).toLocaleDateString('en-NG')}</p>` : ''}
      <p><strong>Currency:</strong> ${String(invoice['currency'] ?? 'NGN')}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;">Description</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;color:#64748b;">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;">Unit Price</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;padding-right:16px;color:#64748b;">Subtotal</td>
        <td style="text-align:right;">${formatMoney(invoice['subtotal'])}</td>
      </tr>
      ${parseFloat(String(invoice['discountAmount'] ?? '0')) > 0 ? `
      <tr>
        <td colspan="3" style="text-align:right;padding-right:16px;color:#64748b;">Discount</td>
        <td style="text-align:right;color:#dc2626;">-${formatMoney(invoice['discountAmount'])}</td>
      </tr>` : ''}
      ${parseFloat(String(invoice['taxAmount'] ?? '0')) > 0 ? `
      <tr>
        <td colspan="3" style="text-align:right;padding-right:16px;color:#64748b;">Tax</td>
        <td style="text-align:right;">${formatMoney(invoice['taxAmount'])}</td>
      </tr>` : ''}
      <tr class="total-row" style="border-top:2px solid #1e40af;">
        <td colspan="3" style="text-align:right;padding-right:16px;">Total</td>
        <td style="text-align:right;color:#1e40af;">${formatMoney(invoice['totalAmount'])}</td>
      </tr>
      <tr>
        <td colspan="3" style="text-align:right;padding-right:16px;color:#64748b;">Amount Paid</td>
        <td style="text-align:right;color:#16a34a;">${formatMoney(invoice['paidAmount'])}</td>
      </tr>
      <tr style="font-weight:600;">
        <td colspan="3" style="text-align:right;padding-right:16px;">Balance Due</td>
        <td style="text-align:right;color:${parseFloat(String(invoice['totalAmount'] ?? '0')) - parseFloat(String(invoice['paidAmount'] ?? '0')) <= 0 ? '#16a34a' : '#dc2626'};">
          ${formatMoney(parseFloat(String(invoice['totalAmount'] ?? '0')) - parseFloat(String(invoice['paidAmount'] ?? '0')))}
        </td>
      </tr>
    </tfoot>
  </table>

  ${payments.length > 0 ? `
  <hr class="divider" />
  <p class="section-title">Payment History</p>
  <table>
    <tbody>${paymentRows}</tbody>
  </table>` : ''}

  ${invoice['notes'] ? `
  <hr class="divider" />
  <p class="section-title">Notes</p>
  <p style="color:#64748b;">${String(invoice['notes'])}</p>` : ''}

  ${invoice['terms'] ? `
  <hr class="divider" />
  <p class="section-title">Terms & Conditions</p>
  <p style="color:#64748b;">${String(invoice['terms'])}</p>` : ''}

  <div class="footer">
    <p>Thank you for your business! | KNEF Gadgets Business OS</p>
  </div>
</body>
</html>`;
  }
}
