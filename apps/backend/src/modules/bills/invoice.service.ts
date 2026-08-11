import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { StorageService } from '../../common/storage/storage.service';
import { archiveFolder } from './archive.util';

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const F = {
  regular: join(FONT_DIR, 'NotoSans-Regular.ttf'),
  bold: join(FONT_DIR, 'NotoSans-Bold.ttf'),
  deva: join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
};

const DEFAULT_TERMS =
  'Goods/services once sold will not be taken back or exchanged.\n' +
  'Payment is due within the agreed credit period; delayed payments may attract interest.\n' +
  'All disputes are subject to the jurisdiction of the seller’s registered location.\n' +
  'This is a computer-generated invoice.';

const BORDER = '#D0D5DD';
const LABEL = '#667085';
const TEXT = '#101828';
const ACCENT = '#F68820';
const SOFT = '#FBDDC0';

// Indian-system amount in words.
function inWords(value: number): string {
  let num = Math.round(value);
  if (num === 0) return 'ZERO';
  const a = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const b = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  const two = (n: number) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n: number) => (n >= 100 ? a[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' : '') : '') + two(n % 100);
  let res = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) res += three(crore) + ' CRORE ';
  if (lakh) res += two(lakh) + ' LAKH ';
  if (thousand) res += two(thousand) + ' THOUSAND ';
  if (num) res += three(num);
  return res.trim();
}

@Injectable()
export class InvoiceService {
  constructor(private readonly storage: StorageService) {}

  /** Persist a copy at invoices/<CompanyShort>/<FY>/<Month>/<dd-mm-yyyy>/<billNumber>.pdf and record it on the bill's Invoice row. */
  async archive(tenantId: string, bill: any, org: any, pdf: Buffer): Promise<{ key: string; url: string }> {
    const folder = archiveFolder(org, new Date(bill.billDate));
    return this.storage.put(tenantId, `invoices/${folder}`, `${bill.billNumber}.pdf`, pdf, 'application/pdf');
  }

  async render(bill: any, org: any): Promise<Buffer> {
    const hasFonts = existsSync(F.regular);
    const lang = bill.language === 'hi' ? 'hi' : 'en';

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

    if (hasFonts) {
      doc.registerFont('body', F.regular);
      doc.registerFont('bold', F.bold);
      if (existsSync(F.deva)) doc.registerFont('deva', F.deva);
    }
    const body = hasFonts ? 'body' : 'Helvetica';
    const bold = hasFonts ? 'bold' : 'Helvetica-Bold';
    const content = lang === 'hi' && hasFonts && existsSync(F.deva) ? 'deva' : body;
    const money = (n: any) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const L = 40, R = 555; // content bounds
    const box = (x: number, y: number, w: number, h: number) => doc.lineWidth(0.7).rect(x, y, w, h).stroke(BORDER);
    const vline = (x: number, y1: number, y2: number) => doc.lineWidth(0.7).moveTo(x, y1).lineTo(x, y2).stroke(BORDER);
    const hline = (x1: number, x2: number, y: number) => doc.lineWidth(0.7).moveTo(x1, y).lineTo(x2, y).stroke(BORDER);
    const lbl = (t: string, x: number, y: number, w?: number) => doc.font(body).fontSize(7.5).fillColor(LABEL).text(t, x, y, { width: w, lineBreak: false });
    const val = (t: string, x: number, y: number, w?: number, align: any = 'left') => doc.font(bold).fontSize(8.5).fillColor(TEXT).text(t ?? '', x, y, { width: w, align, lineBreak: !w ? false : true });

    // Composition & unregistered sellers cannot issue a Tax Invoice — always Bill of Supply.
    const regime = org?.taxRegime ?? 'REGULAR';
    const nonGst = regime !== 'REGULAR';
    const title = bill.documentType === 'CREDIT_NOTE' ? 'CREDIT NOTE'
      : bill.documentType === 'DELIVERY_CHALLAN' ? 'DELIVERY CHALLAN'
      : bill.invoiceType === 'PROFORMA' ? 'PROFORMA INVOICE'
      : (nonGst || bill.invoiceType === 'BILL_OF_SUPPLY') ? 'BILL OF SUPPLY'
      : 'TAX INVOICE';
    const noLabel = bill.invoiceType === 'PROFORMA' ? 'Proforma Invoice No' : 'Invoice No';

    // ── Section 1: header ──
    let y = 40; const h1 = 46;
    box(L, y, R - L, h1);
    doc.font(bold).fontSize(12).fillColor(TEXT).text(title, L + 8, y + 15, { lineBreak: false });
    vline(255, y, y + h1); vline(355, y, y + h1); vline(455, y, y + h1);
    lbl(noLabel, 262, y + 8); val(bill.billNumber, 262, y + 22);
    lbl('Invoice Date', 362, y + 8); val(new Date(bill.billDate).toLocaleDateString('en-GB').replace(/\//g, '-'), 362, y + 22);
    lbl('Due Date', 462, y + 8); val(bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('en-GB').replace(/\//g, '-') : '-', 462, y + 22);

    // ── Section 2: seller (left) + Bill To (right) ──
    y += h1; const h2 = 116;
    box(L, y, R - L, h2); vline(300, y, y + h2);
    // seller — company branding: logo if uploaded, else the trade name
    const logoBuf = this.storage.readByUrl(org?.logoUrl);
    if (logoBuf) {
      try { doc.image(logoBuf, L + 8, y + 8, { fit: [110, 26] }); } catch { /* ignore bad image */ }
    } else {
      doc.font(bold).fontSize(12).fillColor(ACCENT).text(org?.tradeName || 'DONICY', L + 8, y + 8, { lineBreak: false });
    }
    doc.font(bold).fontSize(8.5).fillColor(TEXT).text(org?.legalName ?? '', L + 8, y + 36, { width: 250 });
    const sellerAddr = [org?.addressLine1, org?.city, org?.state, org?.pincode].filter(Boolean).join(', ');
    doc.font(body).fontSize(7.5).fillColor(LABEL).text(sellerAddr, L + 8, y + 50, { width: 250 });
    lbl('GSTIN', L + 8, y + 66); val(org?.gstin ?? '-', L + 8, y + 76, 88);
    lbl('Ph No', 138, y + 66); val(org?.phone ?? '-', 138, y + 76, 60);
    lbl('Mail ID', 205, y + 66); val(org?.email ?? '-', 205, y + 76, 92);
    // bill to
    lbl('Bill To', 308, y + 8);
    doc.font(bold).fontSize(10).fillColor(TEXT).text(bill.party?.name ?? '-', 308, y + 20, { width: 240 });
    const buyerAddr = [bill.party?.billingAddress?.address, bill.party?.billingAddress?.city, bill.party?.billingAddress?.state, bill.party?.billingAddress?.pincode].filter(Boolean).join(', ');
    doc.font(body).fontSize(7.5).fillColor(LABEL).text(buyerAddr || '-', 308, y + 36, { width: 240 });
    lbl('GSTIN', 308, y + 62); val(bill.party?.gstin ?? '-', 308, y + 72);
    lbl('PAN', 440, y + 62); val(bill.party?.pan ?? (bill.party?.gstin ? String(bill.party.gstin).slice(2, 12) : '-'), 440, y + 72);
    lbl('Place of Supply', 308, y + 90); val(bill.placeOfSupply ?? '-', 308, y + 100);
    lbl('State Code', 440, y + 90); val(bill.placeOfSupply ?? '-', 440, y + 100);

    // ── Section 3: PAN / CIN / MSME ──
    y += h2; const h3 = 40;
    box(L, y, R - L, h3);
    lbl('PAN', L + 8, y + 6); val(org?.pan ?? '-', L + 8, y + 16);
    lbl('CIN No', 200, y + 6); val(org?.cin ?? '-', 200, y + 16, 150);
    lbl('MSME Number', 380, y + 6); val(org?.msme ?? '-', 380, y + 16, 160);

    // ── Section 4: items table ──
    y += h3;
    const cols = { idx: L + 4, desc: 60, hsn: 202, uqc: 246, qty: 280, rate: 312, tax: 372, gst: 436, amt: 502 };
    const seps = [L, 56, 198, 242, 276, 308, 368, 432, 498, R];
    const rightEnds = { qty: 305, rate: 365, tax: 429, gst: 495, amt: 552 };
    const anyIgst = (bill.lineItems ?? []).some((l: any) => Number(l.igst) > 0);
    const taxHdr = anyIgst ? 'IGST' : 'CGST+SGST';
    // header
    const tableStartY = y;
    const th = 20;
    doc.rect(L, y, R - L, th).fill(SOFT);
    doc.font(bold).fontSize(8).fillColor(TEXT);
    doc.text('#', cols.idx, y + 6, { lineBreak: false });
    doc.text('Item Description', cols.desc, y + 6, { lineBreak: false });
    doc.text('HSN/SAC', cols.hsn, y + 6, { lineBreak: false });
    doc.text('UQC', cols.uqc, y + 6, { lineBreak: false });
    doc.text('Qty', cols.qty, y + 6, { width: rightEnds.qty - cols.qty, align: 'right' });
    doc.text('Rate', cols.rate, y + 6, { width: rightEnds.rate - cols.rate, align: 'right' });
    doc.text('Taxable', cols.tax, y + 6, { width: rightEnds.tax - cols.tax, align: 'right' });
    doc.text(taxHdr, cols.gst, y + 6, { width: rightEnds.gst - cols.gst, align: 'right' });
    doc.text('Amount', cols.amt, y + 6, { width: rightEnds.amt - cols.amt, align: 'right' });
    y += th;

    let rowFont = content;
    for (const [i, li] of (bill.lineItems ?? []).entries()) {
      const taxAmt = Number(li.cgst) + Number(li.sgst) + Number(li.igst) + Number(li.cess);
      const descH = doc.font(rowFont).fontSize(8).heightOfString(li.description || '-', { width: cols.hsn - cols.desc - 6 });
      const rh = Math.max(22, descH + 10);
      doc.font(rowFont).fontSize(8).fillColor(TEXT);
      doc.text(String(i + 1), cols.idx, y + 5, { lineBreak: false });
      doc.text(li.description || '-', cols.desc, y + 5, { width: cols.hsn - cols.desc - 6 });
      doc.font(body);
      doc.text(li.hsnSacCode ?? '-', cols.hsn, y + 5, { lineBreak: false });
      doc.text(li.unit ?? 'NA', cols.uqc, y + 5, { lineBreak: false });
      doc.text(String(Number(li.quantity)), cols.qty, y + 5, { width: rightEnds.qty - cols.qty, align: 'right' });
      doc.text(money(li.rate), cols.rate, y + 5, { width: rightEnds.rate - cols.rate, align: 'right' });
      doc.text(money(li.taxableValue), cols.tax, y + 5, { width: rightEnds.tax - cols.tax, align: 'right' });
      // tax cell: amount on top, rate note beneath
      doc.text(money(taxAmt), cols.gst, y + 3, { width: rightEnds.gst - cols.gst, align: 'right' });
      doc.font(body).fontSize(6.5).fillColor(LABEL).text(`@(${Number(li.gstRate)}%)`, cols.gst, y + 12, { width: rightEnds.gst - cols.gst, align: 'right' });
      doc.font(body).fontSize(8).fillColor(TEXT).text(money(li.lineTotal), cols.amt, y + 5, { width: rightEnds.amt - cols.amt, align: 'right' });
      hline(L, R, y + rh);
      y += rh;
      if (y > 700) { doc.addPage(); y = 60; }
    }
    // subtotal row (tax + amount)
    const totalTax = Number(bill.cgstTotal) + Number(bill.sgstTotal) + Number(bill.igstTotal) + Number(bill.cessTotal);
    doc.font(bold).fontSize(8.5).fillColor(TEXT);
    doc.text(money(totalTax), cols.gst, y + 4, { width: rightEnds.gst - cols.gst, align: 'right' });
    doc.text(money(bill.grandTotal), cols.amt, y + 4, { width: rightEnds.amt - cols.amt, align: 'right' });
    y += 20;
    const tableEndY = y;
    hline(L, R, tableEndY);
    // vertical column separators spanning the items block
    seps.forEach((x) => vline(x, tableStartY, tableEndY));

    // ── Taxable Amount / Total Tax bands ──
    const band = (label: string, value: string) => {
      box(L, y, R - L, 20);
      doc.font(bold).fontSize(9).fillColor(TEXT).text(label, L, y + 6, { width: rightEnds.gst - L, align: 'center' });
      doc.text(value, cols.amt, y + 6, { width: rightEnds.amt - cols.amt, align: 'right' });
      y += 20;
    };
    band('Taxable Amount', money(bill.subTotal));
    band('Total Tax', money(totalTax));

    // ── Amount in words + Total Invoice Value ──
    const h6 = 40; box(L, y, R - L, h6); vline(370, y, y + h6);
    lbl('Invoice Amount In Words', L + 8, y + 6);
    doc.font(body).fontSize(8).fillColor(TEXT).text(`*** ${inWords(Number(bill.grandTotal))} RUPEES ONLY`, L + 8, y + 18, { width: 320 });
    // Payment status stamp
    const ps = String(bill.paymentStatus ?? 'UNPAID');
    const stamp = ps === 'PAID' ? { t: 'PAID', bg: '#E1F5EE', fg: '#0F6E56' }
      : ps === 'PARTIAL' ? { t: 'PART-PAID', bg: '#FAEEDA', fg: '#854F0B' }
      : { t: 'UNPAID', bg: '#FCEBEB', fg: '#A32D2D' };
    doc.roundedRect(L + 8, y + 22, 74, 14, 3).fill(stamp.bg);
    doc.font(bold).fontSize(8).fillColor(stamp.fg).text(stamp.t, L + 8, y + 25, { width: 74, align: 'center' });
    doc.rect(370, y, R - 370, h6).fill(SOFT);
    doc.font(bold).fontSize(9).fillColor(TEXT).text('Total Invoice Value', 378, y + 8, { lineBreak: false });
    doc.font(bold).fontSize(12).fillColor(TEXT).text(money(bill.grandTotal), 378, y + 22, { lineBreak: false });
    y += h6;

    // ── Bank details + UPI QR ──
    const h7 = 96; box(L, y, R - L, h7);
    lbl('Pay Using UPI', L + 8, y + 8);
    try {
      const upi = org?.upiId
        ? `upi://pay?pa=${org.upiId}&pn=${encodeURIComponent(org?.tradeName || 'DONICY')}&am=${Number(bill.grandTotal)}&cu=INR`
        : JSON.stringify({ inv: bill.billNumber, total: Number(bill.grandTotal) });
      const qr = await QRCode.toBuffer(upi, { margin: 1, width: 130 });
      doc.image(qr, L + 8, y + 22, { width: 66 });
    } catch { /* ignore */ }
    lbl('Bank Details', 180, y + 8);
    const bankRows: [string, string][] = [
      ['Account Name', org?.bankAccountName ?? '-'], ['Bank Name', org?.bankName ?? '-'],
      ['Account Number', org?.bankAccountNumber ?? '-'], ['Branch Name', org?.bankBranch ?? '-'], ['IFSC Code', org?.bankIfsc ?? '-'],
    ];
    let by = y + 24;
    for (const [k, v] of bankRows) {
      doc.font(body).fontSize(8).fillColor(LABEL).text(k, 180, by, { lineBreak: false });
      doc.font(bold).fontSize(8).fillColor(TEXT).text(v, 290, by, { lineBreak: false });
      by += 13;
    }
    y += h7;

    // ── Terms & Conditions + signature ──
    const termsText = (bill.terms && String(bill.terms).trim()) || org?.defaultTerms || DEFAULT_TERMS;
    const h8 = 90; box(L, y, R - L, h8); vline(380, y, y + h8);
    doc.font(bold).fontSize(9).fillColor(TEXT).text('Terms & Conditions', L + 8, y + 8, { lineBreak: false });
    doc.font(content).fontSize(7.5).fillColor(LABEL);
    let ty = y + 22;
    for (const line of String(termsText).split('\n').filter(Boolean)) {
      doc.text('• ' + line.trim(), L + 8, ty, { width: 350 });
      ty = doc.y + 2;
    }
    // Mandatory GST declaration for non-regular sellers.
    if (nonGst) {
      const decl = regime === 'COMPOSITION'
        ? 'Composition taxable person — not eligible to collect tax on supplies.'
        : 'Supplier not registered under GST. Tax is not applicable on this bill.';
      doc.font(content).fontSize(7).fillColor('#993C1D').text(decl, L + 8, y + h8 - 16, { width: 360 });
    }
    doc.font(body).fontSize(8).fillColor(LABEL).text('Authorised Signature', 388, y + h8 - 34, { width: R - 388 - 8, align: 'right' });
    doc.font(bold).fontSize(8.5).fillColor(TEXT).text(org?.legalName ?? 'DONICY', 388, y + h8 - 22, { width: R - 388 - 8, align: 'right' });

    doc.end();
    return done;
  }
}
