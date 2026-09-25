import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportTable } from './report-export.util';

/** A report's body (everything except org/period, which the dispatcher adds). */
type ReportBody = Omit<ReportTable, 'org' | 'period'>;

export type ReportStatus = 'ready' | 'soon' | 'in-returns';
export interface ReportMeta {
  id: string;
  name: string;
  group: string;
  status: ReportStatus;
  /** what a 'soon' report is waiting on (shown as a hint) */
  needs?: string;
  /** requires a party to be chosen first */
  param?: 'party';
}

/**
 * The report centre catalogue. Mirrors the Vyapar report set for audit/record.
 * `ready` reports export real data now; `soon` reports are premium add-ons that
 * depend on modules being configured later (stock, accounting ledgers, sale
 * orders, bank accounts); `in-returns` reports are produced on the GST Returns
 * screen (with portal JSON).
 */
export const REPORT_CATALOG: ReportMeta[] = [
  // Transactions
  { id: 'sale-report', name: 'Sale Report', group: 'Transactions', status: 'ready' },
  { id: 'purchase-report', name: 'Purchase Report', group: 'Transactions', status: 'ready' },
  { id: 'day-book', name: 'Day Book', group: 'Transactions', status: 'ready' },
  { id: 'all-transactions', name: 'All Transactions', group: 'Transactions', status: 'ready' },
  { id: 'expense-report', name: 'Expense Report', group: 'Transactions', status: 'ready' },
  { id: 'sale-order-report', name: 'Sale Order Report', group: 'Transactions', status: 'soon', needs: 'Sale orders module' },
  // Profit & accounting
  { id: 'profit-and-loss', name: 'Profit and Loss', group: 'Profit & accounting', status: 'ready' },
  { id: 'bill-wise-profit', name: 'Bill Wise Profit', group: 'Profit & accounting', status: 'soon', needs: 'Item cost / purchase price tracking' },
  { id: 'item-wise-pnl', name: 'Item Wise Profit & Loss', group: 'Profit & accounting', status: 'soon', needs: 'Item cost tracking' },
  { id: 'party-wise-pnl', name: 'Party Wise Profit & Loss', group: 'Profit & accounting', status: 'soon', needs: 'Item cost tracking' },
  { id: 'cash-flow', name: 'Cash Flow', group: 'Profit & accounting', status: 'soon', needs: 'Cash & bank accounts' },
  { id: 'trial-balance', name: 'Trial Balance', group: 'Profit & accounting', status: 'soon', needs: 'Double-entry ledger' },
  { id: 'balance-sheet', name: 'Balance Sheet', group: 'Profit & accounting', status: 'soon', needs: 'Double-entry ledger' },
  // Parties
  { id: 'party-statement', name: 'Party Statement', group: 'Parties', status: 'ready', param: 'party' },
  { id: 'all-parties', name: 'All Parties', group: 'Parties', status: 'ready' },
  // GST
  { id: 'gst-report', name: 'GST Report', group: 'GST', status: 'ready' },
  { id: 'gst-rate-report', name: 'GST Rate Report', group: 'GST', status: 'ready' },
  { id: 'sale-summary-hsn', name: 'Sale Summary by HSN', group: 'GST', status: 'ready' },
  { id: 'gstr-1', name: 'GSTR-1', group: 'GST', status: 'in-returns' },
  { id: 'gstr-2', name: 'GSTR-2', group: 'GST', status: 'soon', needs: 'Inward-supply return' },
  { id: 'gstr-3b', name: 'GSTR-3B', group: 'GST', status: 'in-returns' },
  { id: 'gstr-9', name: 'GSTR-9 (Annual)', group: 'GST', status: 'in-returns' },
  // Inventory
  { id: 'stock-summary', name: 'Stock Summary', group: 'Inventory', status: 'soon', needs: 'Stock/godown tracking' },
  { id: 'stock-transfer', name: 'Stock Transfer Report', group: 'Inventory', status: 'soon', needs: 'Godowns' },
  // Bank
  { id: 'bank-statement', name: 'Bank Statement', group: 'Bank', status: 'soon', needs: 'Bank accounts' },
];

const n = (v: unknown) => Number(v ?? 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
const billTax = (b: any) => n(b.cgstTotal) + n(b.sgstTotal) + n(b.igstTotal) + n(b.cessTotal);
const paidOf = (b: any) => (b.payments ?? []).reduce((s: number, p: any) => s + n(p.amount), 0);

export interface ReportParams { from: Date; to: Date; partyId?: string }

/** Build a report's tabular data. Throws for non-ready reports. */
export async function buildReport(prisma: PrismaService, tenantId: string, id: string, params: ReportParams): Promise<ReportTable> {
  const meta = REPORT_CATALOG.find((m) => m.id === id);
  if (!meta) throw new BadRequestException('Unknown report');
  if (meta.status === 'in-returns') throw new BadRequestException(`${meta.name} is generated on the GST Returns screen (with portal JSON export).`);
  if (meta.status === 'soon') throw new BadRequestException(`${meta.name} is a premium add-on we're configuring${meta.needs ? ` (needs: ${meta.needs})` : ''} — not available yet.`);

  const { from, to } = params;
  const org = await prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
  const base = {
    org: { name: org?.tradeName ?? org?.legalName ?? 'DONICY', gstin: org?.gstin ?? null },
    period: `${from.toLocaleDateString('en-IN')} to ${to.toLocaleDateString('en-IN')}`,
  };

  switch (id) {
    case 'sale-report': return { ...base, ...(await billReport(prisma, tenantId, 'OUTGOING', from, to, 'Sale Report', 'Invoice No')) };
    case 'purchase-report': return { ...base, ...(await billReport(prisma, tenantId, 'INCOMING', from, to, 'Purchase Report', 'Bill No')) };
    case 'day-book': return { ...base, period: from.toDateString() === to.toDateString() ? from.toLocaleDateString('en-IN') : base.period, ...(await txnRegister(prisma, tenantId, from, to, 'Day Book')) };
    case 'all-transactions': return { ...base, ...(await txnRegister(prisma, tenantId, from, to, 'All Transactions')) };
    case 'expense-report': return { ...base, ...(await expenseReport(prisma, tenantId, from, to)) };
    case 'profit-and-loss': return { ...base, ...(await pnl(prisma, tenantId, from, to)) };
    case 'all-parties': return { ...base, period: 'As on ' + to.toLocaleDateString('en-IN'), ...(await allParties(prisma, tenantId)) };
    case 'party-statement': return { ...base, ...(await partyStatement(prisma, tenantId, from, to, params.partyId)) };
    case 'gst-report': return { ...base, ...(await gstReport(prisma, tenantId, from, to)) };
    case 'gst-rate-report': return { ...base, ...(await gstRateReport(prisma, tenantId, from, to)) };
    case 'sale-summary-hsn': return { ...base, ...(await hsnSummary(prisma, tenantId, from, to)) };
    default: throw new BadRequestException('Report not implemented');
  }
}

async function billReport(prisma: PrismaService, tenantId: string, direction: 'OUTGOING' | 'INCOMING', from: Date, to: Date, title: string, refLabel: string): Promise<ReportBody> {
  const bills = await prisma.withTenant(tenantId, (tx) => tx.bill.findMany({
    where: { direction, billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
    include: { party: true, payments: true }, orderBy: { billDate: 'asc' },
  }));
  const rows = bills.map((b) => {
    const total = n(b.grandTotal), received = paidOf(b);
    return {
      date: b.billDate, ref: b.billNumber, party: b.party?.name ?? '—', gstin: b.party?.gstin ?? '',
      taxable: r2(n(b.subTotal)), gst: r2(billTax(b)), total: r2(total), received: r2(received),
      balance: r2(Math.max(0, total - received)), status: b.paymentStatus,
    };
  });
  const sum = (k: string) => r2(rows.reduce((s, x: any) => s + n(x[k]), 0));
  return {
    title,
    columns: [
      { key: 'date', label: 'Date', type: 'date', width: 1.1 },
      { key: 'ref', label: refLabel, width: 1.1 },
      { key: 'party', label: 'Party', width: 2.2 },
      { key: 'gstin', label: 'GSTIN', width: 1.6 },
      { key: 'taxable', label: 'Taxable', type: 'money', width: 1.3 },
      { key: 'gst', label: 'GST', type: 'money', width: 1.2 },
      { key: 'total', label: 'Total', type: 'money', width: 1.3 },
      { key: 'received', label: direction === 'OUTGOING' ? 'Received' : 'Paid', type: 'money', width: 1.3 },
      { key: 'balance', label: 'Balance', type: 'money', width: 1.2 },
      { key: 'status', label: 'Status', width: 1.1 },
    ],
    rows,
    totals: { taxable: sum('taxable'), gst: sum('gst'), total: sum('total'), received: sum('received'), balance: sum('balance') },
  };
}

async function txnRegister(prisma: PrismaService, tenantId: string, from: Date, to: Date, title: string): Promise<ReportBody> {
  const [bills, expenses] = await prisma.withTenant(tenantId, async (tx) => Promise.all([
    tx.bill.findMany({ where: { billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, include: { party: true }, orderBy: { billDate: 'asc' } }),
    tx.expense.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }).catch(() => []),
  ]));
  const rows: any[] = [];
  for (const b of bills) rows.push({ date: b.billDate, type: b.direction === 'OUTGOING' ? 'Sale' : 'Purchase', ref: b.billNumber, party: b.party?.name ?? '—', amount: r2(n(b.grandTotal)) });
  for (const e of expenses as any[]) rows.push({ date: e.date, type: 'Expense', ref: e.invoiceBillNo ?? '—', party: e.category ?? e.businessName ?? '—', amount: r2(n(e.amount) + n(e.gstAmount)) });
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return {
    title,
    columns: [
      { key: 'date', label: 'Date', type: 'date', width: 1.2 },
      { key: 'type', label: 'Type', width: 1.2 },
      { key: 'ref', label: 'Reference', width: 1.4 },
      { key: 'party', label: 'Party / Details', width: 3 },
      { key: 'amount', label: 'Amount', type: 'money', width: 1.5 },
    ],
    rows,
    totals: { amount: r2(rows.reduce((s, x) => s + n(x.amount), 0)) },
    notes: ['Transaction register — gross amounts by voucher. Cash/credit split appears in Cash Flow (premium).'],
  };
}

async function expenseReport(prisma: PrismaService, tenantId: string, from: Date, to: Date): Promise<ReportBody> {
  const expenses = await prisma.withTenant(tenantId, (tx) => tx.expense.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } })).catch(() => [] as any[]);
  const rows = (expenses as any[]).map((e) => ({ date: e.date, category: e.category ?? '—', description: e.description ?? '', amount: r2(n(e.amount)), gst: r2(n(e.gstAmount)) }));
  return {
    title: 'Expense Report',
    columns: [
      { key: 'date', label: 'Date', type: 'date', width: 1.2 },
      { key: 'category', label: 'Category', width: 1.8 },
      { key: 'description', label: 'Description', width: 3 },
      { key: 'amount', label: 'Amount', type: 'money', width: 1.4 },
      { key: 'gst', label: 'GST', type: 'money', width: 1.2 },
    ],
    rows,
    totals: { amount: r2(rows.reduce((s, x) => s + n(x.amount), 0)), gst: r2(rows.reduce((s, x) => s + n(x.gst), 0)) },
  };
}

async function pnl(prisma: PrismaService, tenantId: string, from: Date, to: Date): Promise<ReportBody> {
  const [out, inc, exp] = await prisma.withTenant(tenantId, async (tx) => Promise.all([
    tx.bill.aggregate({ where: { direction: 'OUTGOING', billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, _sum: { subTotal: true } }),
    tx.bill.aggregate({ where: { direction: 'INCOMING', billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, _sum: { subTotal: true } }),
    tx.expense.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } } as any)),
  ]));
  const sales = r2(n(out._sum.subTotal));
  const purchases = r2(n(inc._sum.subTotal));
  const expenses = r2(n(exp._sum.amount));
  const gross = r2(sales - purchases);
  const net = r2(gross - expenses);
  const rows = [
    { particulars: 'Sales (taxable value)', amount: sales },
    { particulars: 'Less: Purchases (taxable value)', amount: -purchases },
    { particulars: 'Gross Profit', amount: gross },
    { particulars: 'Less: Expenses', amount: -expenses },
    { particulars: 'Net Profit', amount: net },
  ];
  return {
    title: 'Profit and Loss',
    subtitle: 'Trading view (values exclude GST)',
    columns: [{ key: 'particulars', label: 'Particulars', width: 4 }, { key: 'amount', label: 'Amount', type: 'money', width: 1.5 }],
    rows,
    notes: ['Cost of goods is approximated by purchases in the period. Item-level margins need cost tracking (premium).'],
  };
}

async function allParties(prisma: PrismaService, tenantId: string): Promise<ReportBody> {
  const parties = await prisma.withTenant(tenantId, (tx) => tx.party.findMany({ include: { bills: { include: { payments: true } } } }));
  const rows = parties.map((p: any) => {
    const bal = p.bills.reduce((s: number, b: any) => (b.status === 'CANCELLED' ? s : s + (n(b.grandTotal) - paidOf(b))), 0);
    return { party: p.name, type: p.type === 'VENDOR' ? 'Vendor' : 'Customer', gstin: p.gstin ?? '', phone: p.phone ?? '', balance: r2(bal) };
  });
  return {
    title: 'All Parties',
    columns: [
      { key: 'party', label: 'Party', width: 2.4 },
      { key: 'type', label: 'Type', width: 1 },
      { key: 'gstin', label: 'GSTIN', width: 1.8 },
      { key: 'phone', label: 'Phone', width: 1.4 },
      { key: 'balance', label: 'Balance', type: 'money', width: 1.4 },
    ],
    rows,
    totals: { balance: r2(rows.reduce((s, x) => s + n(x.balance), 0)) },
    notes: ['Balance = outstanding (billed minus received/paid). Positive = receivable/payable owed.'],
  };
}

async function partyStatement(prisma: PrismaService, tenantId: string, from: Date, to: Date, partyId?: string): Promise<ReportBody> {
  if (!partyId) throw new BadRequestException('Choose a party for the Party Statement.');
  const party = await prisma.withTenant(tenantId, (tx) => tx.party.findUnique({ where: { id: partyId }, include: { bills: { where: { billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, include: { payments: true }, orderBy: { billDate: 'asc' } } } }));
  if (!party) throw new BadRequestException('Party not found');
  const isCustomer = party.type !== 'VENDOR';
  const events: { date: Date; particulars: string; debit: number; credit: number }[] = [];
  for (const b of (party as any).bills) {
    // Invoice increases what the party owes (debit for a customer).
    events.push({ date: b.billDate, particulars: `${b.direction === 'OUTGOING' ? 'Invoice' : 'Bill'} ${b.billNumber}`, debit: isCustomer ? n(b.grandTotal) : 0, credit: isCustomer ? 0 : n(b.grandTotal) });
    for (const p of b.payments) events.push({ date: p.date ?? b.billDate, particulars: `Payment ${b.billNumber}`, debit: isCustomer ? 0 : n(p.amount), credit: isCustomer ? n(p.amount) : 0 });
  }
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let bal = 0;
  const rows = events.map((e) => { bal += e.debit - e.credit; return { date: e.date, particulars: e.particulars, debit: r2(e.debit), credit: r2(e.credit), balance: r2(bal) }; });
  return {
    title: `Party Statement — ${party.name}`,
    subtitle: `${party.type === 'VENDOR' ? 'Vendor' : 'Customer'}${party.gstin ? '  |  GSTIN: ' + party.gstin : ''}`,
    columns: [
      { key: 'date', label: 'Date', type: 'date', width: 1.2 },
      { key: 'particulars', label: 'Particulars', width: 3 },
      { key: 'debit', label: 'Debit', type: 'money', width: 1.3 },
      { key: 'credit', label: 'Credit', type: 'money', width: 1.3 },
      { key: 'balance', label: 'Balance', type: 'money', width: 1.3 },
    ],
    rows,
    totals: { debit: r2(rows.reduce((s, x) => s + n(x.debit), 0)), credit: r2(rows.reduce((s, x) => s + n(x.credit), 0)) },
  };
}

async function gstReport(prisma: PrismaService, tenantId: string, from: Date, to: Date): Promise<ReportBody> {
  const forDir = async (direction: 'OUTGOING' | 'INCOMING') => prisma.withTenant(tenantId, (tx) => tx.bill.aggregate({ where: { direction, billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, _sum: { cgstTotal: true, sgstTotal: true, igstTotal: true, cessTotal: true } }));
  const o = await forDir('OUTGOING'); const i = await forDir('INCOMING');
  const row = (particulars: string, s: any, sign = 1) => ({ particulars, cgst: r2(sign * n(s.cgstTotal)), sgst: r2(sign * n(s.sgstTotal)), igst: r2(sign * n(s.igstTotal)), cess: r2(sign * n(s.cessTotal)), total: r2(sign * (n(s.cgstTotal) + n(s.sgstTotal) + n(s.igstTotal) + n(s.cessTotal))) });
  const out = row('Output tax (on sales)', o._sum);
  const itc = row('Input tax credit (on purchases)', i._sum);
  const net = { particulars: 'Net GST payable', cgst: r2(out.cgst - itc.cgst), sgst: r2(out.sgst - itc.sgst), igst: r2(out.igst - itc.igst), cess: r2(out.cess - itc.cess), total: r2(out.total - itc.total) };
  return {
    title: 'GST Report',
    columns: [
      { key: 'particulars', label: 'Particulars', width: 2.6 },
      { key: 'cgst', label: 'CGST', type: 'money', width: 1.2 },
      { key: 'sgst', label: 'SGST', type: 'money', width: 1.2 },
      { key: 'igst', label: 'IGST', type: 'money', width: 1.2 },
      { key: 'cess', label: 'Cess', type: 'money', width: 1 },
      { key: 'total', label: 'Total', type: 'money', width: 1.3 },
    ],
    rows: [out, itc, net],
  };
}

async function gstRateReport(prisma: PrismaService, tenantId: string, from: Date, to: Date): Promise<ReportBody> {
  const items = await prisma.withTenant(tenantId, (tx) => tx.billLineItem.findMany({ where: { bill: { direction: 'OUTGOING', billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } } } }));
  const map = new Map<number, any>();
  for (const li of items) {
    const rate = n(li.gstRate);
    const row = map.get(rate) ?? { rate: `${rate}%`, _rate: rate, count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 0 };
    row.count++; row.taxable += n(li.taxableValue); row.cgst += n(li.cgst); row.sgst += n(li.sgst); row.igst += n(li.igst); row.cess += n(li.cess);
    row.tax += n(li.cgst) + n(li.sgst) + n(li.igst) + n(li.cess);
    map.set(rate, row);
  }
  const rows = [...map.values()].sort((a, b) => a._rate - b._rate).map((x) => ({ rate: x.rate, count: x.count, taxable: r2(x.taxable), cgst: r2(x.cgst), sgst: r2(x.sgst), igst: r2(x.igst), cess: r2(x.cess), tax: r2(x.tax) }));
  const sum = (k: string) => r2(rows.reduce((s, x: any) => s + n(x[k]), 0));
  return {
    title: 'GST Rate Report',
    columns: [
      { key: 'rate', label: 'GST Rate', width: 1 },
      { key: 'count', label: 'Items', type: 'num', width: 0.9 },
      { key: 'taxable', label: 'Taxable', type: 'money', width: 1.4 },
      { key: 'cgst', label: 'CGST', type: 'money', width: 1.1 },
      { key: 'sgst', label: 'SGST', type: 'money', width: 1.1 },
      { key: 'igst', label: 'IGST', type: 'money', width: 1.1 },
      { key: 'cess', label: 'Cess', type: 'money', width: 0.9 },
      { key: 'tax', label: 'Total Tax', type: 'money', width: 1.3 },
    ],
    rows,
    totals: { taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), cess: sum('cess'), tax: sum('tax') },
  };
}

async function hsnSummary(prisma: PrismaService, tenantId: string, from: Date, to: Date): Promise<ReportBody> {
  const items = await prisma.withTenant(tenantId, (tx) => tx.billLineItem.findMany({ where: { bill: { direction: 'OUTGOING', billDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } } } }));
  const map = new Map<string, any>();
  for (const li of items) {
    const hsn = li.hsnSacCode || 'NA';
    const row = map.get(hsn) ?? { hsn, uqc: (li.unit || 'NA').toUpperCase().slice(0, 3), qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    row.qty += n(li.quantity); row.taxable += n(li.taxableValue); row.igst += n(li.igst); row.cgst += n(li.cgst); row.sgst += n(li.sgst); row.cess += n(li.cess);
    map.set(hsn, row);
  }
  const rows = [...map.values()].map((x) => ({ hsn: x.hsn, uqc: x.uqc, qty: r2(x.qty), taxable: r2(x.taxable), igst: r2(x.igst), cgst: r2(x.cgst), sgst: r2(x.sgst), cess: r2(x.cess) }));
  const sum = (k: string) => r2(rows.reduce((s, x: any) => s + n(x[k]), 0));
  return {
    title: 'Sale Summary by HSN',
    columns: [
      { key: 'hsn', label: 'HSN/SAC', width: 1.3 },
      { key: 'uqc', label: 'UQC', width: 0.8 },
      { key: 'qty', label: 'Qty', type: 'num', width: 0.9 },
      { key: 'taxable', label: 'Taxable', type: 'money', width: 1.4 },
      { key: 'igst', label: 'IGST', type: 'money', width: 1.1 },
      { key: 'cgst', label: 'CGST', type: 'money', width: 1.1 },
      { key: 'sgst', label: 'SGST', type: 'money', width: 1.1 },
      { key: 'cess', label: 'Cess', type: 'money', width: 0.9 },
    ],
    rows,
    totals: { qty: sum('qty'), taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'), cess: sum('cess') },
  };
}
