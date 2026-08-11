import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { isValidGstin } from './gstin.util';

type ReturnType = 'GSTR1' | 'GSTR2B' | 'GSTR3B' | 'GSTR4' | 'GSTR5' | 'GSTR6' | 'GSTR7' | 'GSTR8' | 'GSTR9';

const n2 = (n: number) => Math.round(n * 100) / 100;
// GSTN "fp" (filing period) is MMYYYY; our UI period is "MM-YYYY".
const toFp = (period: string) => period.replace('-', '');
const monthRange = (period: string) => {
  const [mm, yyyy] = period.split('-').map(Number);
  return { from: new Date(yyyy, mm - 1, 1), to: new Date(yyyy, mm, 1) };
};

/**
 * GSTN-style return generation. Produces section-wise JSON that mirrors the
 * official GSTR-1 / GSTR-3B structure (see Api-docs/), validates key fields,
 * archives each generated JSON (versioned) and tracks filing status.
 * Live filing via the GSTN API is wired separately (needs client credentials).
 */
@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.gstReturn.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  async generate(tenantId: string, returnType: ReturnType, period: string) {
    const org = await this.prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
    const gstin = org?.gstin ?? null;
    const { payload, errors, summary } = await this.buildPayload(tenantId, returnType, period, gstin);

    // Version = previous count + 1 for this return+period.
    const prev = await this.prisma.withTenant(tenantId, (tx) =>
      tx.gstReturn.count({ where: { returnType: returnType as any, period } }),
    );
    const version = prev + 1;

    // Archive the JSON per-tenant (returns/GSTR1/06-2026/v1.json).
    const { url } = await this.storage.put(
      tenantId, `returns/${returnType}/${period}`, `v${version}.json`,
      Buffer.from(JSON.stringify(payload, null, 2)), 'application/json',
    );

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.gstReturn.create({
        data: {
          tenantId, returnType: returnType as any, period, version,
          status: errors.length ? 'ERROR' : 'GENERATED',
          jsonUrl: url,
          summary: { ...summary, sections: sectionCounts(payload) } as any,
          validationErrors: errors.length ? (errors as any) : undefined,
        },
      }),
    );
  }

  async json(tenantId: string, id: string) {
    const ret = await this.prisma.withTenant(tenantId, (tx) => tx.gstReturn.findUnique({ where: { id } }));
    if (!ret) throw new NotFoundException('Return not found');
    const buf = this.storage.readByUrl(ret.jsonUrl);
    if (!buf) throw new NotFoundException('Generated JSON not found — regenerate the return');
    return { filename: `${ret.returnType}_${ret.period}_v${ret.version}.json`, json: buf.toString('utf-8') };
  }

  async markFiled(tenantId: string, id: string, arn?: string) {
    const ret = await this.prisma.withTenant(tenantId, (tx) => tx.gstReturn.findUnique({ where: { id } }));
    if (!ret) throw new NotFoundException('Return not found');
    if (ret.status === 'ERROR') throw new BadRequestException('Fix validation errors before filing');
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.gstReturn.update({ where: { id }, data: { status: 'FILED', filedAt: new Date(), arn: arn || `ARN${toFp(ret.period)}${String(Date.now()).slice(-8)}` } }),
    );
  }

  // ── builders ──

  private async buildPayload(tenantId: string, returnType: ReturnType, period: string, gstin: string | null) {
    if (returnType === 'GSTR1') return this.buildGstr1(tenantId, period, gstin);
    if (returnType === 'GSTR3B') return this.buildGstr3b(tenantId, period, gstin);
    if (returnType === 'GSTR4') return this.buildGstr4(tenantId, period, gstin);
    if (returnType === 'GSTR9') return this.buildGstr9(tenantId, period, gstin);
    return { payload: { gstin, fp: toFp(period), note: `${returnType} generation is not implemented yet` }, errors: [] as any[], summary: {} };
  }

  /**
   * GSTR-4 — annual/quarterly return for Composition dealers. Composition tax is
   * a flat % of turnover (1% traders/mfrs, 5% restaurants, 6% services) — not
   * collected from customers. `period` here is a quarter "Qn-YYYY".
   */
  private async buildGstr4(tenantId: string, period: string, gstin: string | null) {
    const { from, to } = quarterRange(period);
    const compositionRate = 0.01; // 1% default (traders/manufacturers); configurable per business
    const agg = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.aggregate({ where: { direction: 'OUTGOING', billDate: { gte: from, lt: to }, status: { not: 'CANCELLED' } }, _sum: { subTotal: true, grandTotal: true }, _count: true }),
    );
    const turnover = Number(agg._sum.subTotal ?? 0);
    const taxPayable = n2(turnover * compositionRate);
    const payload = {
      gstin, fp: toFp2(period),
      txos: { turnover: n2(turnover), rt: compositionRate * 100, tax: taxPayable },
      // Inward supplies attracting reverse charge would go in table 4B (not tracked yet).
      summary: { invoices: agg._count },
    };
    const errors = gstin ? [] : [{ message: 'Organization GSTIN not set' }];
    return { payload, errors, summary: { quarter: period, turnover: n2(turnover), rate: compositionRate * 100, taxPayable, invoices: agg._count } };
  }

  /**
   * GSTR-9 — annual return. Consolidates the full financial year's outward
   * supplies (Pt II), ITC availed on inward supplies (Pt III) and the resulting
   * annual tax liability (Pt IV). `period` is the FY string, e.g. "2026-27".
   */
  private async buildGstr9(tenantId: string, period: string, gstin: string | null) {
    const { from, to } = fyRange(period);
    const bills = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findMany({
        where: { billDate: { gte: from, lt: to }, status: { not: 'CANCELLED' } },
        include: { party: true },
      }),
    );

    // Pt II — outward supplies on which tax is payable (split B2B / B2C).
    const out = { b2bTxval: 0, b2cTxval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
    // Pt III — ITC availed on inward supplies (blocked ITC excluded, Sec 17(5)).
    const itc = { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0, blocked: 0 };
    let outCount = 0, inCount = 0;

    for (const b of bills) {
      if (b.direction === 'OUTGOING') {
        if (!['FINALIZED', 'VERIFIED', 'APPROVED'].includes(b.status)) continue;
        const tx = Number(b.subTotal);
        if (b.party?.gstin) out.b2bTxval += tx; else out.b2cTxval += tx;
        out.iamt += Number(b.igstTotal); out.camt += Number(b.cgstTotal); out.samt += Number(b.sgstTotal); out.csamt += Number(b.cessTotal);
        outCount++;
      } else {
        const tax = Number(b.igstTotal) + Number(b.cgstTotal) + Number(b.sgstTotal) + Number(b.cessTotal);
        if ((b as any).itcBlocked) { itc.blocked += tax; }
        else {
          itc.txval += Number(b.subTotal);
          itc.iamt += Number(b.igstTotal); itc.camt += Number(b.cgstTotal); itc.samt += Number(b.sgstTotal); itc.csamt += Number(b.cessTotal);
        }
        inCount++;
      }
    }

    const outTax = out.iamt + out.camt + out.samt + out.csamt;
    const itcTotal = itc.iamt + itc.camt + itc.samt + itc.csamt;
    const net = {
      iamt: n2(out.iamt - itc.iamt), camt: n2(out.camt - itc.camt),
      samt: n2(out.samt - itc.samt), csamt: n2(out.csamt - itc.csamt),
    };

    const payload = {
      gstin, fy: period,
      // Pt II Table 4 — outward supplies on which tax is payable
      pt2_outward: {
        b2b: { txval: n2(out.b2bTxval) },
        b2c: { txval: n2(out.b2cTxval) },
        tax: { iamt: n2(out.iamt), camt: n2(out.camt), samt: n2(out.samt), csamt: n2(out.csamt) },
        total_taxable: n2(out.b2bTxval + out.b2cTxval),
      },
      // Pt III Table 6 — ITC availed
      pt3_itc: { txval: n2(itc.txval), iamt: n2(itc.iamt), camt: n2(itc.camt), samt: n2(itc.samt), csamt: n2(itc.csamt) },
      // Pt IV — tax payable (net of ITC)
      pt4_tax_payable: net,
    };

    const errors: { message: string }[] = [];
    if (!gstin) errors.push({ message: 'Your organization GSTIN is not set (Settings → Company Details)' });

    return {
      payload, errors,
      summary: {
        fy: period,
        outwardTaxable: n2(out.b2bTxval + out.b2cTxval), outwardTax: n2(outTax),
        b2bTaxable: n2(out.b2bTxval), b2cTaxable: n2(out.b2cTxval),
        itcEligible: n2(itcTotal), itcBlocked: n2(itc.blocked),
        netPayable: n2(outTax - itcTotal),
        outwardInvoices: outCount, inwardBills: inCount,
      },
    };
  }

  /** GSTR-1 — outward supplies grouped into B2B / B2CL / B2CS / CDNR / HSN / DOCS. */
  private async buildGstr1(tenantId: string, period: string, gstin: string | null) {
    const { from, to } = monthRange(period);
    const orgStateCode = gstin ? gstin.slice(0, 2) : undefined;
    const bills = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findMany({
        where: { direction: 'OUTGOING', status: { in: ['FINALIZED', 'VERIFIED', 'APPROVED'] }, billDate: { gte: from, lt: to } },
        include: { lineItems: true, party: true },
        orderBy: { billDate: 'asc' },
      }),
    );

    const errors: { invoice?: string; message: string }[] = [];
    const b2bMap = new Map<string, any>();
    const b2cl: any[] = [];
    const b2csMap = new Map<string, any>();
    const cdnrMap = new Map<string, any>();
    const hsnMap = new Map<string, any>();
    let invCount = 0, cnCount = 0;

    for (const b of bills) {
      const pos = (b.placeOfSupply ?? orgStateCode ?? '').padStart(2, '0');
      const val = Number(b.grandTotal);
      const isCredit = b.documentType === 'CREDIT_NOTE';
      const items = b.lineItems.map((li) => ({
        rt: Number(li.gstRate),
        txval: Number(li.taxableValue),
        iamt: Number(li.igst), camt: Number(li.cgst), samt: Number(li.sgst), csamt: Number(li.cess),
      }));
      // HSN accumulation
      for (const li of b.lineItems) {
        const hsn = li.hsnSacCode || 'NA';
        const h = hsnMap.get(hsn) ?? { hsn_sc: hsn, uqc: (li.unit || 'NA').toUpperCase().slice(0, 3), qty: 0, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
        h.qty += Number(li.quantity); h.txval += Number(li.taxableValue);
        h.iamt += Number(li.igst); h.camt += Number(li.cgst); h.samt += Number(li.sgst); h.csamt += Number(li.cess);
        hsnMap.set(hsn, h);
        if (!li.hsnSacCode) errors.push({ invoice: b.billNumber, message: 'Line item missing HSN/SAC code' });
      }

      const inv = {
        inum: b.billNumber, idt: fmtDate(b.billDate), val: n2(val), pos, rchrg: b.reverseCharge ? 'Y' : 'N',
        inv_typ: 'R', itms: items.map((it, i) => ({ num: i + 1, itm_det: { rt: it.rt, txval: n2(it.txval), iamt: n2(it.iamt), camt: n2(it.camt), samt: n2(it.samt), csamt: n2(it.csamt) } })),
      };

      if (b.party?.gstin) {
        // B2B / CDNR (registered counterparty)
        if (!isValidGstin(b.party.gstin)) errors.push({ invoice: b.billNumber, message: `Counterparty GSTIN "${b.party.gstin}" fails checksum` });
        if (isCredit) {
          const e = cdnrMap.get(b.party.gstin) ?? { ctin: b.party.gstin, nt: [] };
          e.nt.push({ ntty: 'C', nt_num: b.billNumber, nt_dt: fmtDate(b.billDate), val: n2(val), pos, itms: inv.itms });
          cdnrMap.set(b.party.gstin, e); cnCount++;
        } else {
          const e = b2bMap.get(b.party.gstin) ?? { ctin: b.party.gstin, inv: [] };
          e.inv.push(inv); b2bMap.set(b.party.gstin, e); invCount++;
        }
      } else {
        // Unregistered: B2CL (inter-state > 2.5L) else B2CS summary
        const interState = orgStateCode && pos && pos !== orgStateCode;
        if (interState && val > 250000) {
          b2cl.push({ pos, inv: [{ inum: b.billNumber, idt: fmtDate(b.billDate), val: n2(val), itms: inv.itms }] });
          invCount++;
        } else {
          for (const it of items) {
            const key = `${pos}-${it.rt}-${interState ? 'INTER' : 'INTRA'}`;
            const s = b2csMap.get(key) ?? { sply_ty: interState ? 'INTER' : 'INTRA', pos, typ: 'OE', rt: it.rt, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
            s.txval += it.txval; s.iamt += it.iamt; s.camt += it.camt; s.samt += it.samt; s.csamt += it.csamt;
            b2csMap.set(key, s);
          }
          invCount++;
        }
      }
    }

    const round = (o: any) => { for (const k of ['txval', 'iamt', 'camt', 'samt', 'csamt', 'qty']) if (k in o) o[k] = n2(o[k]); return o; };

    const payload = {
      gstin, fp: toFp(period), gt: 0, cur_gt: 0,
      b2b: [...b2bMap.values()],
      b2cl,
      b2cs: [...b2csMap.values()].map(round),
      cdnr: [...cdnrMap.values()],
      hsn: { data: [...hsnMap.values()].map((h, i) => ({ num: i + 1, ...round(h) })) },
      doc_issue: { doc_det: [{ doc_num: 1, docs: [{ num: 1, from: bills[0]?.billNumber ?? '-', to: bills[bills.length - 1]?.billNumber ?? '-', totnum: bills.length, cancel: 0, net_issue: bills.length }] }] },
    };

    const totals = [...bills].reduce((acc, b) => {
      acc.taxable += Number(b.subTotal);
      acc.igst += Number(b.igstTotal); acc.cgst += Number(b.cgstTotal); acc.sgst += Number(b.sgstTotal); acc.cess += Number(b.cessTotal);
      acc.invoiceValue += Number(b.grandTotal);
      return acc;
    }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0 });

    if (!gstin) errors.push({ message: 'Your organization GSTIN is not set (Settings → GST & Tax)' });

    return { payload, errors, summary: { ...roundObj(totals), invoices: invCount, creditNotes: cnCount, bills: bills.length } };
  }

  /** GSTR-3B — consolidated liability from outward supplies + ITC from purchases. */
  private async buildGstr3b(tenantId: string, period: string, gstin: string | null) {
    const { from, to } = monthRange(period);
    const [out, inc] = await this.prisma.withTenant(tenantId, async (tx) => Promise.all([
      tx.bill.aggregate({ where: { direction: 'OUTGOING', billDate: { gte: from, lt: to }, status: { not: 'CANCELLED' } }, _sum: { subTotal: true, igstTotal: true, cgstTotal: true, sgstTotal: true, cessTotal: true } }),
      tx.bill.aggregate({ where: { direction: 'INCOMING', billDate: { gte: from, lt: to }, status: { not: 'CANCELLED' } }, _sum: { igstTotal: true, cgstTotal: true, sgstTotal: true, cessTotal: true } }),
    ]));
    const s = (v: any) => Number(v ?? 0);
    const outward = { txval: s(out._sum.subTotal), iamt: s(out._sum.igstTotal), camt: s(out._sum.cgstTotal), samt: s(out._sum.sgstTotal), csamt: s(out._sum.cessTotal) };
    const itc = { iamt: s(inc._sum.igstTotal), camt: s(inc._sum.cgstTotal), samt: s(inc._sum.sgstTotal), csamt: s(inc._sum.cessTotal) };
    const net = { iamt: n2(outward.iamt - itc.iamt), camt: n2(outward.camt - itc.camt), samt: n2(outward.samt - itc.samt), csamt: n2(outward.csamt - itc.csamt) };

    const payload = {
      gstin, ret_period: toFp(period),
      sup_details: { osup_det: { txval: n2(outward.txval), iamt: n2(outward.iamt), camt: n2(outward.camt), samt: n2(outward.samt), csamt: n2(outward.csamt) } },
      itc_elg: { itc_avl: [{ ty: 'OTH', iamt: n2(itc.iamt), camt: n2(itc.camt), samt: n2(itc.samt), csamt: n2(itc.csamt) }] },
      tx_pmt: { net_liability: net },
    };
    const errors = gstin ? [] : [{ message: 'Organization GSTIN not set' }];
    return { payload, errors, summary: { outward: roundObj(outward), itc: roundObj(itc), netPayable: net } };
  }

  /**
   * GSTR-2B reconciliation — matches an uploaded GSTR-2B (downloaded from the
   * GSTN portal) against the tenant's purchase records for the period. Auto-fetch
   * of 2B via the GSP is credential-gated; this manual path needs no credentials.
   * Match key: supplier GSTIN + supplier invoice number.
   */
  async reconcile2b(tenantId: string, period: string, twoB: any) {
    const { from, to } = monthRange(period);
    const bills = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findMany({
        where: { direction: 'INCOMING', billDate: { gte: from, lt: to }, status: { not: 'CANCELLED' } },
        include: { party: true },
      }),
    );
    const norm = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const billTax = (b: any) => Number(b.igstTotal) + Number(b.cgstTotal) + Number(b.sgstTotal) + Number(b.cessTotal);
    const booksMap = new Map<string, any>();
    for (const b of bills) booksMap.set(`${norm(b.party?.gstin)}|${norm(b.vendorInvoiceNo)}`, b);

    const twoBInvs = parse2bB2b(twoB);
    const matched: any[] = [], mismatch: any[] = [], onlyIn2b: any[] = [];
    const matchedKeys = new Set<string>();

    for (const inv of twoBInvs) {
      const key = `${norm(inv.ctin)}|${norm(inv.inum)}`;
      const bill = booksMap.get(key);
      if (bill) {
        matchedKeys.add(key);
        const bTax = billTax(bill);
        const row = { ctin: inv.ctin, inum: inv.inum, twoBVal: n2(inv.val), twoBTax: n2(inv.tax), bookNo: bill.billNumber, bookVal: Number(bill.grandTotal), bookTax: n2(bTax), taxDiff: n2(bTax - inv.tax) };
        (Math.abs(bTax - inv.tax) > 1 ? mismatch : matched).push(row);
      } else {
        onlyIn2b.push({ ctin: inv.ctin, inum: inv.inum, twoBVal: n2(inv.val), twoBTax: n2(inv.tax) });
      }
    }
    const onlyInBooks = bills
      .filter((b) => !matchedKeys.has(`${norm(b.party?.gstin)}|${norm(b.vendorInvoiceNo)}`))
      .map((b) => ({ vendor: b.party?.name ?? '—', gstin: b.party?.gstin ?? null, bookNo: b.billNumber, bookVal: Number(b.grandTotal), bookTax: n2(billTax(b)) }));

    const itc2b = n2(twoBInvs.reduce((s, i) => s + i.tax, 0));
    const itcBooks = n2(bills.reduce((s, b) => s + billTax(b), 0));
    const itcMatched = n2(matched.reduce((s, r) => s + r.twoBTax, 0));

    return {
      period,
      summary: {
        total2b: twoBInvs.length, totalBooks: bills.length,
        matched: matched.length, mismatch: mismatch.length, onlyIn2b: onlyIn2b.length, onlyInBooks: onlyInBooks.length,
        itc2b, itcBooks, itcMatched, itcAtRisk: n2(itcBooks - itcMatched),
      },
      matched, mismatch, onlyIn2b, onlyInBooks,
    };
  }

  /** Filing status + due dates + late-fee estimate for the compliance dashboard. */
  async compliance(tenantId: string) {
    const returns = await this.prisma.withTenant(tenantId, (tx) => tx.gstReturn.findMany());
    const filed = new Map(returns.filter((r) => r.status === 'FILED').map((r) => [`${r.returnType}-${r.period}`, r]));

    const now = new Date();
    const rows: any[] = [];
    // Last 3 months for GSTR-1 (due 11th) and GSTR-3B (due 20th).
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
      const period = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      for (const [type, dueDay] of [['GSTR1', 11], ['GSTR3B', 20]] as const) {
        const due = new Date(d.getFullYear(), d.getMonth() + 1, dueDay);
        const isFiled = filed.has(`${type}-${period}`);
        const overdueDays = !isFiled && now > due ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0;
        // Late fee ₹50/day (₹25 CGST + ₹25 SGST), capped ₹5,000 per Act (illustrative).
        const lateFee = Math.min(overdueDays * 50, 5000);
        rows.push({ returnType: type, period, dueDate: due, status: isFiled ? 'FILED' : now > due ? 'OVERDUE' : 'PENDING', overdueDays, lateFee, arn: filed.get(`${type}-${period}`)?.arn ?? null });
      }
    }
    rows.sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
    return rows;
  }
}

function fmtDate(d: Date) { const dt = new Date(d); return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`; }
// Quarter period "Q2-2026" → date range. Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar (Indian FY).
function quarterRange(period: string) {
  const m = /Q([1-4])-(\d{4})/.exec(period);
  if (!m) { const now = new Date(); return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) }; }
  const q = Number(m[1]); const y = Number(m[2]);
  const startMonth = [3, 6, 9, 0][q - 1];          // Apr, Jul, Oct, Jan (0-indexed)
  const startYear = q === 4 ? y + 1 : y;           // Q4 spills into the next calendar year
  return { from: new Date(startYear, startMonth, 1), to: new Date(startYear, startMonth + 3, 1) };
}
const toFp2 = (period: string) => period.replace('-', '');
// Financial-year range for GSTR-9. "2026-27" → 1 Apr 2026 … 1 Apr 2027 (exclusive).
function fyRange(period: string) {
  const m = /(\d{4})/.exec(period);
  const y = m ? Number(m[1]) : new Date().getFullYear();
  return { from: new Date(y, 3, 1), to: new Date(y + 1, 3, 1) };
}
function roundObj(o: any) { const r: any = {}; for (const k in o) r[k] = n2(o[k]); return r; }
/** Extract B2B invoices from a GSTN GSTR-2B JSON (defensive across wrappers). */
function parse2bB2b(twoB: any): { ctin: string; inum: string; val: number; tax: number }[] {
  const root = twoB?.data?.docdata ?? twoB?.docdata ?? twoB?.data ?? twoB ?? {};
  const b2b = root.b2b ?? twoB?.b2b ?? [];
  const out: { ctin: string; inum: string; val: number; tax: number }[] = [];
  for (const sup of b2b) {
    const ctin = sup.ctin ?? sup.gstin;
    for (const inv of (sup.inv ?? [])) {
      const tax = (inv.itms ?? []).reduce((s: number, it: any) => {
        const d = it.itm_det ?? it;
        return s + Number(d.iamt || 0) + Number(d.camt || 0) + Number(d.samt || 0) + Number(d.cesamt || d.csamt || 0);
      }, 0);
      out.push({ ctin, inum: inv.inum, val: Number(inv.val || 0), tax });
    }
  }
  return out;
}
function sectionCounts(p: any) {
  return { b2b: p.b2b?.length ?? 0, b2cl: p.b2cl?.length ?? 0, b2cs: p.b2cs?.length ?? 0, cdnr: p.cdnr?.length ?? 0, hsn: p.hsn?.data?.length ?? 0 };
}
