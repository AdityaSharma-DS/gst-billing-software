import { PrintSettings, RegularSettings, ThermalSettings, TEXT_PX } from './printSettings';

export interface InvCompany {
  name: string; address?: string; email?: string; phone?: string; gstin?: string; stateCode?: string; state?: string;
  logoUrl?: string; bankName?: string; bankAccountNumber?: string; bankIfsc?: string; upiId?: string;
}
export interface InvItem { name: string; hsn?: string; qty: number; unit?: string; price: number; discountPct?: number; gstPct: number; }
export interface InvData {
  title: string; number: string; date: string; dueDate?: string; placeOfSupply?: string;
  billTo: { name: string; gstin?: string; state?: string; address?: string; phone?: string };
  items: InvItem[];
  received?: number; description?: string;
}

const rupee = (n: number, grouping = true, decimals = true) => {
  const v = decimals ? n.toFixed(2) : String(Math.round(n));
  if (!grouping) return '₹' + v;
  const [i, d] = v.split('.');
  const last3 = i.slice(-3), rest = i.slice(0, -3);
  const grouped = (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
  return '₹' + grouped + (d ? '.' + d : '');
};
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n: number): string { return n < 20 ? ONES[n] : (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')); }
function three(n: number): string { const h = Math.floor(n / 100); return (h ? ONES[h] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : ''); }
export function amountInWords(amount: number, system: 'indian' | 'international' = 'indian'): string {
  const rs = Math.floor(amount); const paise = Math.round((amount - rs) * 100);
  let words = '';
  if (rs === 0) words = 'Zero';
  else if (system === 'indian') {
    const crore = Math.floor(rs / 10000000), lakh = Math.floor((rs % 10000000) / 100000), thou = Math.floor((rs % 100000) / 1000), rest = rs % 1000;
    words = [crore && two(crore) + ' Crore', lakh && two(lakh) + ' Lakh', thou && two(thou) + ' Thousand', rest && three(rest)].filter(Boolean).join(' ');
  } else {
    const mil = Math.floor(rs / 1000000), thou = Math.floor((rs % 1000000) / 1000), rest = rs % 1000;
    words = [mil && three(mil) + ' Million', thou && three(thou) + ' Thousand', rest && three(rest)].filter(Boolean).join(' ');
  }
  return `${words} Rupees${paise ? ' and ' + two(paise) + ' Paisa' : ''} only`;
}

function computeItems(items: InvItem[], interState: boolean) {
  return items.map((it) => {
    const gross = it.qty * it.price;
    const disc = gross * (it.discountPct ?? 0) / 100;
    const taxable = gross - disc;
    const tax = taxable * it.gstPct / 100;
    return { ...it, gross, disc, taxable, tax, cgst: interState ? 0 : tax / 2, sgst: interState ? 0 : tax / 2, igst: interState ? tax : 0, amount: taxable + tax };
  });
}

/** Build a full standalone HTML document for the invoice, themed by settings. */
export function renderInvoiceHtml(company: InvCompany, inv: InvData, ps: PrintSettings, mode: 'regular' | 'thermal'): string {
  return mode === 'thermal' ? thermal(company, inv, ps.thermal) : regular(company, inv, ps.regular);
}

function regular(co: InvCompany, inv: InvData, s: RegularSettings): string {
  const accent = s.colorHex;
  const money = (n: number) => rupee(n, s.totals.grouping, s.totals.decimals);
  const interState = !!(company_state(co) && inv.billTo.state && company_state(co) !== state2(inv.billTo.state));
  const rows = computeItems(inv.items, interState);
  const cols = s.itemTable.columns;
  const sub = rows.reduce((a, r) => a + r.taxable, 0);
  const taxTotal = rows.reduce((a, r) => a + r.tax, 0);
  const grand = sub + taxTotal;
  const received = s.totals.received ? (inv.received ?? 0) : 0;
  const youSaved = rows.reduce((a, r) => a + r.disc, 0);
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);

  const th = (label: string, extra = '') => `<th style="${extra}">${label}</th>`;
  const headCells = [
    cols.sno && th('#'), cols.item && th('Item name', 'text-align:left'), cols.hsn && th('HSN/SAC'),
    cols.qty && th('Qty', 'text-align:right'), cols.unit && th('Unit'), cols.price && th('Price/Unit', 'text-align:right'),
    cols.discount && th('Discount', 'text-align:right'), cols.gst && th('GST', 'text-align:right'), cols.amount && th('Amount', 'text-align:right'),
  ].filter(Boolean).join('');
  const bodyRows = rows.map((r, i) => [
    cols.sno && `<td>${i + 1}</td>`,
    cols.item && `<td style="text-align:left"><b>${esc(r.name)}</b></td>`,
    cols.hsn && `<td>${esc(r.hsn ?? '')}</td>`,
    cols.qty && `<td style="text-align:right">${r.qty}</td>`,
    cols.unit && `<td>${esc(r.unit ?? '-')}</td>`,
    cols.price && `<td style="text-align:right">${money(r.price)}</td>`,
    cols.discount && `<td style="text-align:right">${money(r.disc)} <span class="mut">(${r.discountPct ?? 0}%)</span></td>`,
    cols.gst && `<td style="text-align:right">${money(r.tax)} <span class="mut">(${r.gstPct}%)</span></td>`,
    cols.amount && `<td style="text-align:right"><b>${money(r.amount)}</b></td>`,
  ].filter(Boolean).join('')).join('');
  const minRows = Math.max(0, (s.itemTable.minRows || 0) - rows.length);
  const filler = Array.from({ length: minRows }).map(() => `<tr class="filler">${Array.from({ length: headCells.match(/<th/g)?.length ?? 1 }).map(() => '<td>&nbsp;</td>').join('')}</tr>`).join('');
  const colspanLeft = [cols.sno, cols.item, cols.hsn].filter(Boolean).length || 1;

  // HSN-wise tax summary
  const hsnMap = new Map<string, any>();
  for (const r of rows) { const k = r.hsn || 'NA'; const e = hsnMap.get(k) ?? { hsn: k, taxable: 0, rate: r.gstPct, cgst: 0, sgst: 0, igst: 0, tax: 0 }; e.taxable += r.taxable; e.cgst += r.cgst; e.sgst += r.sgst; e.igst += r.igst; e.tax += r.tax; hsnMap.set(k, e); }
  const taxRows = [...hsnMap.values()];
  const taxSummary = s.totals.taxDetails ? `
    <div class="tax-sum">
      <div class="sec-h">Tax Summary</div>
      <table class="mini"><thead><tr><th>HSN/SAC</th><th>Taxable</th>${interState ? '<th>IGST %</th><th>IGST</th>' : '<th>CGST</th><th>SGST</th>'}<th>Total Tax</th></tr></thead><tbody>
      ${taxRows.map((t) => `<tr><td>${esc(t.hsn)}</td><td class="r">${money(t.taxable)}</td>${interState ? `<td class="r">${t.rate}%</td><td class="r">${money(t.igst)}</td>` : `<td class="r">${money(t.cgst)}</td><td class="r">${money(t.sgst)}</td>`}<td class="r">${money(t.tax)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="r">${money(sub)}</td>${interState ? `<td></td><td class="r">${money(taxTotal)}</td>` : `<td class="r">${money(taxTotal / 2)}</td><td class="r">${money(taxTotal / 2)}</td>`}<td class="r">${money(taxTotal)}</td></tr>
      </tbody></table>
    </div>` : '';

  const totalsBlock = `
    <table class="totals">
      <tr><td>Sub Total</td><td class="r">${money(sub)}</td></tr>
      <tr class="grand"><td>Total</td><td class="r">${money(grand)}</td></tr>
      ${s.totals.received ? `<tr><td>Received</td><td class="r">${money(received)}</td></tr>` : ''}
      ${s.totals.balance ? `<tr><td>Balance</td><td class="r">${money(Math.max(0, grand - received))}</td></tr>` : ''}
      ${s.totals.youSaved ? `<tr><td>You Saved</td><td class="r">${money(youSaved)}</td></tr>` : ''}
    </table>
    <div class="words"><b>Invoice Amount in Words:</b><br>${amountInWords(grand, s.totals.amountWords)}</div>`;

  const logo = s.header.logo && co.logoUrl ? `<img class="logo" src="${esc(co.logoUrl)}" alt="logo">` : '';
  const compBlock = `
    ${logo}
    <div class="co">
      ${s.header.companyName ? `<div class="co-name" style="font-size:${TEXT_PX[s.companyNameSize]}px">${esc(co.name)}</div>` : ''}
      ${s.header.address && co.address ? `<div class="co-line">${esc(co.address)}</div>` : ''}
      <div class="co-line">${[s.header.phone && co.phone && 'Phone: ' + esc(co.phone), s.header.email && co.email && 'Email: ' + esc(co.email)].filter(Boolean).join('  ')}</div>
      ${s.header.gstin && co.gstin ? `<div class="co-line">GSTIN: <b>${esc(co.gstin)}</b>${co.state ? '  State: ' + esc(co.state) : ''}</div>` : ''}
    </div>`;

  const metaBlock = `
    <div class="box billto">
      <div class="sec-h">Bill To</div>
      <div><b>${esc(inv.billTo.name)}</b></div>
      ${inv.billTo.address ? `<div class="mut">${esc(inv.billTo.address)}</div>` : ''}
      ${inv.billTo.gstin ? `<div>GSTIN: <b>${esc(inv.billTo.gstin)}</b></div>` : ''}
      ${inv.billTo.state ? `<div class="mut">State: ${esc(inv.billTo.state)}</div>` : ''}
    </div>
    <div class="box meta">
      <div class="sec-h">Invoice Details</div>
      <div>Invoice No.: <b>${esc(inv.number)}</b></div>
      <div>Date: <b>${esc(inv.date)}</b></div>
      ${inv.dueDate ? `<div>Due Date: <b>${esc(inv.dueDate)}</b></div>` : ''}
      ${inv.placeOfSupply ? `<div>Place of Supply: <b>${esc(inv.placeOfSupply)}</b></div>` : ''}
    </div>`;

  // Theme header variants
  const banded = ['double-divine', 'gst1', 'french-elite'].includes(s.themeId);
  const header = s.themeId === 'french-elite'
    ? `<div class="title-banner">${esc(inv.title)}</div><div class="head plain">${compBlock}</div>`
    : banded
      ? `<div class="head band">${compBlock}<div class="band-title">${esc(inv.title)}</div></div>`
      : `<div class="title">${esc(inv.title)}</div><div class="head boxed">${compBlock}</div>`;

  const footer = `
    <div class="foot">
      ${s.footer.bankDetails && (co.bankName || co.upiId) ? `<div class="bank"><div class="sec-h">Bank Details</div>${co.bankName ? `<div>Bank: ${esc(co.bankName)}</div>` : ''}${co.bankAccountNumber ? `<div>A/C: ${esc(co.bankAccountNumber)}</div>` : ''}${co.bankIfsc ? `<div>IFSC: ${esc(co.bankIfsc)}</div>` : ''}${co.upiId ? `<div>UPI: ${esc(co.upiId)}</div>` : ''}</div>` : '<div></div>'}
      ${s.footer.signature ? `<div class="sign"><div>For <b>${esc(co.name)}</b></div><div class="sign-space"></div><div>${esc(s.footer.signatureLabel)}</div></div>` : '<div></div>'}
    </div>
    ${s.footer.description && inv.description ? `<div class="desc"><b>Description:</b> ${esc(inv.description)}</div>` : ''}
    ${s.footer.terms ? `<div class="terms"><b>Terms &amp; Conditions:</b> ${esc(s.footer.termsText)}</div>` : ''}
    ${s.footer.receivedBy || s.footer.deliveredBy ? `<div class="rd">${s.footer.receivedBy ? '<div>Received by: ____________</div>' : ''}${s.footer.deliveredBy ? '<div>Delivered by: ____________</div>' : ''}</div>` : ''}`;

  const base = TEXT_PX[s.invoiceTextSize];
  const css = `
    *{box-sizing:border-box} body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;font-size:${base}px}
    .page{padding:${16 + (s.extraTopSpace * 6)}px 22px 22px;max-width:800px;margin:0 auto}
    .mut{color:#777;font-size:0.85em}.r{text-align:right}
    .title{text-align:center;font-weight:700;font-size:1.5em;margin-bottom:10px;color:${accent}}
    .title-banner{background:${accent};color:#fff;text-align:center;font-weight:700;font-size:1.5em;padding:12px;letter-spacing:1px;margin-bottom:12px;border-radius:4px}
    .head{display:flex;gap:14px;align-items:flex-start;margin-bottom:12px}
    .head.boxed{border:1px solid #d9d5cc;border-left:4px solid ${accent};padding:12px;border-radius:4px}
    .head.band{background:${accent};color:#fff;padding:14px;border-radius:4px;justify-content:space-between}
    .head.band .co-line,.head.band .mut{color:#f0eefb}
    .band-title{font-size:1.4em;font-weight:700;align-self:center}
    .logo{width:64px;height:64px;object-fit:contain;border-radius:4px;background:#fff}
    .co-name{font-weight:700;line-height:1.1}.co-line{font-size:0.9em;margin-top:2px}
    .grid2{display:flex;gap:0;margin-bottom:12px}.grid2 .box{flex:1}
    .box{border:1px solid #d9d5cc;padding:10px}.box+.box{border-left:0}
    .sec-h{font-weight:700;font-size:0.85em;text-transform:uppercase;letter-spacing:.03em;color:${accent};margin-bottom:5px}
    table.items{width:100%;border-collapse:collapse;margin-top:4px}
    table.items th{background:${accent};color:#fff;font-size:0.82em;padding:7px 6px;text-align:center;font-weight:600}
    table.items td{border:1px solid #e4e0d7;padding:6px;text-align:center;font-size:0.9em;vertical-align:top}
    table.items tr.filler td{height:16px}
    table.items tfoot td{border-top:2px solid ${accent};font-weight:700;background:#faf8f3}
    .below{display:flex;gap:14px;margin-top:12px;align-items:flex-start}
    .tax-sum{flex:1.3}.totals-wrap{flex:1}
    table.mini{width:100%;border-collapse:collapse;font-size:0.82em}table.mini th,table.mini td{border:1px solid #e4e0d7;padding:4px 6px}table.mini th{background:#f4f1ea}table.mini tr.tot td{font-weight:700;background:#faf8f3}
    table.totals{width:100%;border-collapse:collapse;font-size:0.92em}table.totals td{padding:5px 8px;border-bottom:1px solid #eee}table.totals tr.grand td{font-weight:700;font-size:1.1em;color:${accent};border-bottom:2px solid ${accent}}
    .words{margin-top:8px;font-size:0.85em}
    .foot{display:flex;gap:14px;margin-top:16px}.bank{flex:1;font-size:0.85em}.sign{flex:1;text-align:right;font-size:0.9em}
    .sign-space{height:44px}.desc,.terms{margin-top:8px;font-size:0.85em;color:#444}.rd{display:flex;justify-content:space-between;margin-top:16px;font-size:0.85em;color:#555}`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="page">
    ${header}
    <div class="grid2">${metaBlock}</div>
    <div class="item-table-wrap"><table class="items"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}${filler}</tbody>
      <tfoot><tr><td colspan="${colspanLeft}">Total</td>${cols.qty ? `<td class="r">${s.totals.totalQty ? totalQty : ''}</td>` : ''}${cols.unit ? '<td></td>' : ''}${cols.price ? '<td></td>' : ''}${cols.discount ? `<td class="r">${money(youSaved)}</td>` : ''}${cols.gst ? `<td class="r">${money(taxTotal)}</td>` : ''}${cols.amount ? `<td class="r">${money(grand)}</td>` : ''}</tr></tfoot>
    </table></div>
    <div class="below"><div class="tax-sum">${taxSummary}</div><div class="totals-wrap">${totalsBlock}</div></div>
    ${footer}
  </div></body></html>`;
}

function thermal(co: InvCompany, inv: InvData, s: ThermalSettings): string {
  const money = (n: number) => rupee(n, false, true);
  const interState = !!(company_state(co) && inv.billTo.state && company_state(co) !== state2(inv.billTo.state));
  const rows = computeItems(inv.items, interState);
  const sub = rows.reduce((a, r) => a + r.taxable, 0);
  const taxTotal = rows.reduce((a, r) => a + r.tax, 0);
  const grand = sub + taxTotal;
  const widthMm = s.pageWidth;
  const dash = '<div class="dash"></div>';
  const items = rows.map((r) => `<div class="ln"><span>${esc(r.name)}</span></div><div class="ln sub"><span>${r.qty} x ${money(r.price)}</span><span>${money(r.amount)}</span></div>`).join('');
  const css = `*{box-sizing:border-box}body{margin:0;background:#eee}
    .rcpt{width:${widthMm}mm;max-width:100%;margin:0 auto;background:#fff;padding:8px 6px;font-family:'Courier New',monospace;font-size:${widthMm <= 58 ? 10 : 11}px;color:#000;${s.bold ? 'font-weight:700;' : ''}}
    .c{text-align:center}.ln{display:flex;justify-content:space-between;gap:6px}.ln.sub{color:#333;font-size:0.9em}
    .dash{border-top:1px dashed #000;margin:5px 0}.big{font-size:1.3em;font-weight:700}.r{text-align:right}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="rcpt">
    ${s.header.companyName ? `<div class="c big">${esc(co.name)}</div>` : ''}
    ${s.header.address && co.address ? `<div class="c">${esc(co.address)}</div>` : ''}
    ${s.header.phone && co.phone ? `<div class="c">Ph: ${esc(co.phone)}</div>` : ''}
    ${s.header.gstin && co.gstin ? `<div class="c">GSTIN: ${esc(co.gstin)}</div>` : ''}
    ${dash}
    <div class="ln"><span>${esc(inv.title)}</span><span>${esc(inv.number)}</span></div>
    <div class="ln"><span>${esc(inv.date)}</span></div>
    <div>To: ${esc(inv.billTo.name)}</div>
    ${dash}${items}${dash}
    <div class="ln"><span>Sub Total</span><span>${money(sub)}</span></div>
    ${s.totals.taxDetails ? `<div class="ln"><span>Tax</span><span>${money(taxTotal)}</span></div>` : ''}
    <div class="ln big"><span>TOTAL</span><span>${money(grand)}</span></div>
    ${s.totals.received && inv.received != null ? `<div class="ln"><span>Received</span><span>${money(inv.received)}</span></div><div class="ln"><span>Balance</span><span>${money(Math.max(0, grand - inv.received))}</span></div>` : ''}
    ${s.totals.amountWords ? `<div style="font-size:0.9em;margin-top:4px">${amountInWords(grand, s.totals.amountWords)}</div>` : ''}
    ${dash}
    ${s.footer.terms ? `<div class="c">${esc(s.footer.termsText)}</div>` : ''}
    ${Array.from({ length: s.extraLines }).map(() => '<br>').join('')}
  </div></body></html>`;
}

const state2 = (s?: string) => (s ? s.trim().slice(0, 2) : '');
const company_state = (co: InvCompany) => co.stateCode || (co.gstin ? co.gstin.slice(0, 2) : '');
