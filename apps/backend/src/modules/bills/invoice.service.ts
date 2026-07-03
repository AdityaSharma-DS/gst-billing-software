import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const F = {
  regular: join(FONT_DIR, 'NotoSans-Regular.ttf'),
  bold: join(FONT_DIR, 'NotoSans-Bold.ttf'),
  deva: join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
};

type Lang = 'en' | 'hi';
const L: Record<Lang, Record<string, string>> = {
  en: {
    invoice: 'TAX INVOICE', creditNote: 'CREDIT NOTE', challan: 'DELIVERY CHALLAN',
    billTo: 'Bill To', gstin: 'GSTIN', date: 'Date', number: 'No.',
    item: 'Item', hsn: 'HSN/SAC', qty: 'Qty', rate: 'Rate', tax: 'Tax', amount: 'Amount',
    subtotal: 'Sub Total', discount: 'Discount', cgst: 'CGST', sgst: 'SGST', igst: 'IGST',
    other: 'Other Charges', roundoff: 'Round Off', total: 'Grand Total', placeOfSupply: 'Place of Supply',
  },
  hi: {
    invoice: 'कर बीजक', creditNote: 'क्रेडिट नोट', challan: 'डिलीवरी चालान',
    billTo: 'बिल प्राप्तकर्ता', gstin: 'जीएसटीआईएन', date: 'दिनांक', number: 'संख्या',
    item: 'वस्तु', hsn: 'एचएसएन', qty: 'मात्रा', rate: 'दर', tax: 'कर', amount: 'राशि',
    subtotal: 'उप योग', discount: 'छूट', cgst: 'सीजीएसटी', sgst: 'एसजीएसटी', igst: 'आईजीएसटी',
    other: 'अन्य शुल्क', roundoff: 'राउंड ऑफ', total: 'कुल योग', placeOfSupply: 'आपूर्ति स्थान',
  },
};

@Injectable()
export class InvoiceService {
  async render(bill: any, org: any): Promise<Buffer> {
    const lang: Lang = bill.language === 'hi' ? 'hi' : 'en';
    const t = L[lang];
    const hasFonts = existsSync(F.regular);

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

    if (hasFonts) {
      doc.registerFont('body', F.regular);
      doc.registerFont('bold', F.bold);
      if (lang === 'hi' && existsSync(F.deva)) doc.registerFont('deva', F.deva);
    }
    const body = hasFonts ? 'body' : 'Helvetica';
    const bold = hasFonts ? 'bold' : 'Helvetica-Bold';
    const label = lang === 'hi' && hasFonts && existsSync(F.deva) ? 'deva' : body;
    const money = (n: any) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const title = bill.documentType === 'CREDIT_NOTE' ? t.creditNote : bill.documentType === 'DELIVERY_CHALLAN' ? t.challan
      : bill.invoiceType === 'BILL_OF_SUPPLY' ? (lang === 'hi' ? 'आपूर्ति बिल' : 'BILL OF SUPPLY')
      : bill.invoiceType === 'PROFORMA' ? (lang === 'hi' ? 'प्रोफ़ॉर्मा' : 'PROFORMA INVOICE')
      : t.invoice;

    // Header — company (DONICY brand retained)
    doc.font(bold).fontSize(18).fillColor('#F68820').text(org?.tradeName || 'DONICY', 40, 40);
    doc.font(body).fontSize(9).fillColor('#444');
    const addr = [org?.addressLine1, org?.city, org?.state, org?.pincode].filter(Boolean).join(', ');
    if (addr) doc.text(addr, 40, 64);
    if (org?.gstin) doc.text(`${t.gstin}: ${org.gstin}`, 40, 76);

    doc.font(label).fontSize(16).fillColor('#111').text(title, 300, 40, { width: 255, align: 'right' });
    doc.font(body).fontSize(10).fillColor('#111')
      .text(`${t.number}: ${bill.billNumber}`, 300, 66, { width: 255, align: 'right' })
      .text(`${t.date}: ${new Date(bill.billDate).toLocaleDateString('en-IN')}`, 300, 80, { width: 255, align: 'right' });
    if (bill.dueDate) doc.text(`${lang === 'hi' ? 'देय तिथि' : 'Due'}: ${new Date(bill.dueDate).toLocaleDateString('en-IN')}`, 300, 94, { width: 255, align: 'right' });

    doc.moveTo(40, 100).lineTo(555, 100).strokeColor('#E2E2E2').stroke();

    // Bill To
    doc.font(label).fontSize(10).fillColor('#666').text(`${t.billTo}:`, 40, 112);
    doc.font(bold).fontSize(11).fillColor('#111').text(bill.party?.name ?? '-', 40, 126);
    if (bill.party?.gstin) doc.font(body).fontSize(9).fillColor('#444').text(`${t.gstin}: ${bill.party.gstin}`, 40, 142);
    if (bill.placeOfSupply) doc.font(label).fontSize(9).fillColor('#444').text(`${t.placeOfSupply}: ${bill.placeOfSupply}`, 40, 156);

    // Items table
    let y = 184;
    const cols = [40, 250, 300, 340, 400, 470]; // item, hsn, qty, rate, tax, amount
    doc.rect(40, y - 4, 515, 20).fill('#FBDDC0');
    doc.font(label).fontSize(9).fillColor('#111');
    doc.text(t.item, cols[0] + 4, y); doc.text(t.hsn, cols[1], y); doc.text(t.qty, cols[2], y);
    doc.text(t.rate, cols[3], y, { width: 55, align: 'right' });
    doc.text(t.tax, cols[4], y, { width: 60, align: 'right' });
    doc.text(t.amount, cols[5], y, { width: 80, align: 'right' });
    y += 22;

    doc.font(body).fontSize(9).fillColor('#222');
    for (const li of bill.lineItems ?? []) {
      const taxAmt = Number(li.cgst) + Number(li.sgst) + Number(li.igst) + Number(li.cess);
      doc.text(li.description, cols[0] + 4, y, { width: 200 });
      doc.text(li.hsnSacCode ?? '-', cols[1], y);
      doc.text(String(li.quantity), cols[2], y);
      doc.text(money(li.rate), cols[3], y, { width: 55, align: 'right' });
      doc.text(`${li.gstRate}%`, cols[4], y, { width: 60, align: 'right' });
      doc.text(money(li.lineTotal), cols[5], y, { width: 80, align: 'right' });
      y += 18;
      if (y > 720) { doc.addPage(); y = 60; }
    }

    // Totals
    doc.moveTo(320, y + 2).lineTo(555, y + 2).strokeColor('#E2E2E2').stroke();
    y += 10;
    const row = (lbl: string, val: string, strong = false) => {
      doc.font(strong ? bold : label).fontSize(strong ? 11 : 9).fillColor('#111')
        .text(lbl, 320, y, { width: 120, align: 'right' });
      doc.font(strong ? bold : body).text(val, 445, y, { width: 110, align: 'right' });
      y += strong ? 20 : 16;
    };
    row(t.subtotal, money(bill.subTotal));
    if (Number(bill.discountTotal) > 0) row(t.discount, '-' + money(bill.discountTotal));
    if (Number(bill.cgstTotal) > 0) row(t.cgst, money(bill.cgstTotal));
    if (Number(bill.sgstTotal) > 0) row(t.sgst, money(bill.sgstTotal));
    if (Number(bill.igstTotal) > 0) row(t.igst, money(bill.igstTotal));
    if (Number(bill.otherCharges) > 0) row(t.other, money(bill.otherCharges));
    if (Number(bill.roundOff) !== 0) row(t.roundoff, money(bill.roundOff));
    row(t.total, money(bill.grandTotal), true);

    // QR (placeholder for IRN in Phase 4) — encodes invoice summary
    try {
      const payload = JSON.stringify({ inv: bill.billNumber, gstin: org?.gstin ?? null, total: Number(bill.grandTotal), date: bill.billDate });
      const qr = await QRCode.toBuffer(payload, { margin: 1, width: 90 });
      doc.image(qr, 40, y - 70, { width: 80 });
      doc.font(body).fontSize(7).fillColor('#888').text('QR: IRN placeholder (Phase 4)', 40, y + 12);
    } catch { /* ignore QR failures */ }

    // Terms & Conditions
    if (bill.terms) {
      const ty = Math.min(y + 40, 750);
      doc.font(label).fontSize(9).fillColor('#666').text(lang === 'hi' ? 'नियम एवं शर्तें' : 'Terms & Conditions', 40, ty);
      doc.font(body).fontSize(8).fillColor('#444').text(bill.terms, 40, ty + 14, { width: 400 });
    }

    doc.end();
    return done;
  }
}
