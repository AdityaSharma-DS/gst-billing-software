import PDFDocument from 'pdfkit';

export type ColType = 'text' | 'num' | 'money' | 'date';
export interface ReportColumn { key: string; label: string; type?: ColType; width?: number }
export interface ReportTable {
  title: string;
  subtitle?: string;
  org?: { name?: string; gstin?: string | null };
  period?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;      // keyed by column key
  notes?: string[];
}

const inr = (n: any) => 'Rs ' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleDateString('en-IN'); };

function fmt(v: any, type?: ColType): string {
  if (v == null || v === '') return type === 'money' || type === 'num' ? '0' : '';
  if (type === 'money') return inr(v);
  if (type === 'num') return Number(v).toLocaleString('en-IN');
  if (type === 'date') return fmtDate(v);
  return String(v);
}

/** CSV (Excel-openable): a header row, the data rows, then a totals row if present. */
export function toCsv(r: ReportTable): string {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const cell = (row: Record<string, any>, c: ReportColumn) => {
    const v = row[c.key];
    if (v == null) return '';
    // Keep numbers raw in CSV so spreadsheets can sum them.
    if (c.type === 'money' || c.type === 'num') return String(Number(v));
    if (c.type === 'date') return fmtDate(v);
    return esc(String(v));
  };
  const lines: string[] = [];
  lines.push(esc(r.title));
  if (r.org?.name) lines.push(esc(`${r.org.name}${r.org.gstin ? ' (' + r.org.gstin + ')' : ''}`));
  if (r.period) lines.push(esc(r.period));
  lines.push('');
  lines.push(r.columns.map((c) => esc(c.label)).join(','));
  for (const row of r.rows) lines.push(r.columns.map((c) => cell(row, c)).join(','));
  if (r.totals) {
    lines.push(r.columns.map((c, i) => (i === 0 ? 'TOTAL' : (r.totals![c.key] != null ? String(Number(r.totals![c.key])) : ''))).join(','));
  }
  return lines.join('\r\n');
}

/** Formatted PDF table (pdfkit). Auto-fits columns, repeats the header per page. */
export function toPdf(r: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const tableW = right - left;

    // Header
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(15).text(r.title, left, doc.y);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#555');
    if (r.org?.name) doc.text(`${r.org.name}${r.org.gstin ? '  |  GSTIN: ' + r.org.gstin : ''}`);
    if (r.period) doc.text(r.period);
    if (r.subtitle) doc.text(r.subtitle);
    doc.moveDown(0.5);

    // Column widths: honour explicit weights, else even split.
    const weights = r.columns.map((c) => c.width ?? 1);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / wsum) * tableW);
    const align = (c: ReportColumn) => (c.type === 'money' || c.type === 'num' ? 'right' : 'left');

    const rowHeight = 16;
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, tableW, rowHeight + 2).fill('#F1EFE8');
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(8);
      let x = left;
      r.columns.forEach((c, i) => {
        doc.text(c.label.toUpperCase(), x + 4, y + 4, { width: widths[i] - 8, align: align(c), ellipsis: true, lineBreak: false });
        x += widths[i];
      });
      doc.y = y + rowHeight + 2;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(8).fillColor('#222');
    const bottom = doc.page.height - doc.page.margins.bottom - rowHeight;

    const drawRow = (cells: string[], bold = false, bg?: string) => {
      if (doc.y > bottom) { doc.addPage(); drawHeader(); doc.font('Helvetica').fontSize(8).fillColor('#222'); }
      const y = doc.y;
      if (bg) doc.rect(left, y, tableW, rowHeight).fill(bg);
      doc.fillColor(bold ? '#111' : '#222').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = left;
      r.columns.forEach((c, i) => {
        doc.text(cells[i] ?? '', x + 4, y + 4, { width: widths[i] - 8, align: align(c), ellipsis: true, lineBreak: false });
        x += widths[i];
      });
      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).strokeColor('#E7E2D8').lineWidth(0.5).stroke();
      doc.y = y + rowHeight;
    };

    for (const row of r.rows) drawRow(r.columns.map((c) => fmt(row[c.key], c.type)));
    if (!r.rows.length) drawRow(r.columns.map((_, i) => (i === 0 ? 'No data for this period.' : '')));
    if (r.totals) drawRow(r.columns.map((c, i) => (i === 0 ? 'TOTAL' : (r.totals![c.key] != null ? fmt(r.totals![c.key], c.type) : ''))), true, '#F6EDD9');

    if (r.notes?.length) {
      doc.moveDown(0.8).font('Helvetica-Oblique').fontSize(7).fillColor('#777');
      for (const n of r.notes) doc.text('• ' + n, { width: tableW });
    }
    doc.moveDown(0.6).font('Helvetica').fontSize(7).fillColor('#999')
      .text(`Generated ${new Date().toLocaleString('en-IN')} · DONICY`, left, undefined, { width: tableW, align: 'right' });

    doc.end();
  });
}
