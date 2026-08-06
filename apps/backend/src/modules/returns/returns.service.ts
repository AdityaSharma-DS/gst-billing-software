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
    return { payload: { gstin, fp: toFp(period), note: `${returnType} generation is not implemented yet` }, errors: [] as any[], summary: {} };
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
function roundObj(o: any) { const r: any = {}; for (const k in o) r[k] = n2(o[k]); return r; }
function sectionCounts(p: any) {
  return { b2b: p.b2b?.length ?? 0, b2cl: p.b2cl?.length ?? 0, b2cs: p.b2cs?.length ?? 0, cdnr: p.cdnr?.length ?? 0, hsn: p.hsn?.data?.length ?? 0 };
}
