import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { ReportDataset, ReportRow } from './report-data.service';

// ── CSV ───────────────────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: ReportRow[]): string {
  const lines: string[] = [headers.map(escapeCsv).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  }
  return lines.join('\r\n');
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

async function toXlsx(dataset: ReportDataset): Promise<Buffer> {
  // Dynamic import — exceljs has no CJS-breaking side effects
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KNEF Business OS';
  workbook.created = dataset.generatedAt;

  const sheet = workbook.addWorksheet(dataset.title.slice(0, 31));

  // Header row — bold
  sheet.addRow(dataset.headers).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9EAF7' },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  // Data rows with appropriate cell types
  for (const row of dataset.rows) {
    const values = dataset.headers.map((h) => {
      const v = row[h];
      if (v instanceof Date) return v;
      const num = typeof v === 'string' ? parseFloat(v) : v;
      return typeof num === 'number' && !isNaN(num) ? num : (v ?? '');
    });
    sheet.addRow(values);
  }

  // Auto-width columns (cap at 50)
  sheet.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 50);
  });

  return workbook.xlsx.writeBuffer().then((ab) => Buffer.from(ab));
}

// ── PDF ───────────────────────────────────────────────────────────────────────

async function toPdf(dataset: ReportDataset): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 36, size: 'A4' });

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 72; // margins on both sides

    // ── Title ─────────────────────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold').text(dataset.title, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(
      `Generated: ${dataset.generatedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      { align: 'center' },
    );
    doc.moveDown(0.8);

    if (dataset.rows.length === 0) {
      doc.text('No data for this report period.', { align: 'center' });
      doc.end();
      return;
    }

    // ── Column layout ─────────────────────────────────────────────────────
    const cols = dataset.headers.length;
    const colWidth = Math.floor(pageWidth / cols);
    const rowHeight = 16;
    const headerBg = '#D9EAF7';
    const altBg = '#F5F5F5';

    function drawRow(
      y: number,
      values: string[],
      bold: boolean,
      bg: string | null,
    ): void {
      if (bg) {
        doc.rect(36, y, pageWidth, rowHeight).fill(bg).fillColor('black');
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      values.forEach((val, i) => {
        doc.text(
          val.length > 30 ? `${val.slice(0, 28)}…` : val,
          36 + i * colWidth,
          y + 3,
          { width: colWidth - 4, lineBreak: false },
        );
      });
    }

    let y = doc.y;

    // Header
    drawRow(y, dataset.headers, true, headerBg);
    y += rowHeight;

    // Data rows — paginate automatically
    dataset.rows.forEach((row, idx) => {
      if (y + rowHeight > doc.page.height - 50) {
        doc.addPage();
        y = 36;
        drawRow(y, dataset.headers, true, headerBg);
        y += rowHeight;
      }
      const values = dataset.headers.map((h) => String(row[h] ?? ''));
      drawRow(y, values, false, idx % 2 === 1 ? altBg : null);
      y += rowHeight;
    });

    doc.end();
  });
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ReportExportersService {
  private readonly logger = new Logger(ReportExportersService.name);

  async export(
    dataset: ReportDataset,
    format: 'csv' | 'xlsx' | 'pdf',
    outputDir: string,
    organizationId: string,
  ): Promise<{ filePath: string; sizeBytes: number }> {
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const safeName = dataset.title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const dir = path.join(outputDir, 'reports', organizationId);
    fs.mkdirSync(dir, { recursive: true });

    let buffer: Buffer;
    let ext: string;

    if (format === 'csv') {
      buffer = Buffer.from(toCsv(dataset.headers, dataset.rows), 'utf8');
      ext = 'csv';
    } else if (format === 'xlsx') {
      buffer = await toXlsx(dataset);
      ext = 'xlsx';
    } else {
      buffer = await toPdf(dataset);
      ext = 'pdf';
    }

    const filename = `${safeName}_${ts}.${ext}`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    const sizeBytes = fs.statSync(filePath).size;
    this.logger.log(`Report exported: ${filePath} (${sizeBytes} bytes)`);

    return { filePath, sizeBytes };
  }
}
