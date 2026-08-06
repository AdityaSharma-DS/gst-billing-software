import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async profitAndLoss(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const out = await tx.bill.aggregate({
        where: { direction: 'OUTGOING' },
        _sum: { subTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true, grandTotal: true },
      });
      const inc = await tx.bill.aggregate({
        where: { direction: 'INCOMING' },
        _sum: { subTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true, grandTotal: true },
      });
      const n = (v: unknown) => Number(v ?? 0);
      const totalRevenue = n(out._sum.grandTotal);
      const gstCollected = n(out._sum.cgstTotal) + n(out._sum.sgstTotal) + n(out._sum.igstTotal);
      const totalExpenses = n(inc._sum.grandTotal);
      const itc = n(inc._sum.cgstTotal) + n(inc._sum.sgstTotal) + n(inc._sum.igstTotal);
      const netRevenue = totalRevenue - gstCollected;
      const netExpenses = totalExpenses - itc;
      return {
        totalRevenue, gstCollected, netRevenue,
        totalExpenses, itc, netExpenses,
        netProfit: netRevenue - netExpenses,
        gstPayable: gstCollected - itc,
      };
    });
  }

  /** Daily / weekly / monthly bill summary (count + taxable + tax + total) per bucket. */
  async summary(tenantId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bills = await tx.bill.findMany({ orderBy: { billDate: 'asc' } });
      const key = (d: Date) => {
        const dt = new Date(d);
        if (period === 'daily') return dt.toISOString().slice(0, 10);
        if (period === 'monthly') return dt.toISOString().slice(0, 7);
        // weekly: ISO year-week
        const onejan = new Date(dt.getFullYear(), 0, 1);
        const week = Math.ceil((((dt.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
        return `${dt.getFullYear()}-W${String(week).padStart(2, '0')}`;
      };
      const buckets: Record<string, { period: string; count: number; taxable: number; tax: number; total: number }> = {};
      for (const b of bills) {
        const k = key(b.billDate);
        const row = (buckets[k] ??= { period: k, count: 0, taxable: 0, tax: 0, total: 0 });
        row.count++;
        row.taxable += Number(b.subTotal);
        row.tax += Number(b.cgstTotal) + Number(b.sgstTotal) + Number(b.igstTotal) + Number(b.cessTotal);
        row.total += Number(b.grandTotal);
      }
      return Object.values(buckets);
    });
  }

  /** Vendor-wise or customer-wise bill summary. */
  async byParty(tenantId: string, type: 'VENDOR' | 'CUSTOMER') {
    const direction = type === 'CUSTOMER' ? 'OUTGOING' : 'INCOMING';
    return this.prisma.withTenant(tenantId, async (tx) => {
      const parties = await tx.party.findMany({ where: { type } });
      return Promise.all(parties.map(async (p) => {
        const agg = await tx.bill.aggregate({
          where: { partyId: p.id, direction },
          _sum: { subTotal: true, grandTotal: true }, _count: true,
        });
        return {
          party: p.name, gstin: p.gstin,
          bills: agg._count,
          taxable: Number(agg._sum.subTotal ?? 0),
          total: Number(agg._sum.grandTotal ?? 0),
        };
      }));
    });
  }

  /** Total CGST / SGST / IGST / CESS across outward and inward supplies. */
  async taxSummary(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const forDir = async (direction: 'OUTGOING' | 'INCOMING') => {
        const a = await tx.bill.aggregate({ where: { direction }, _sum: { cgstTotal: true, sgstTotal: true, igstTotal: true, cessTotal: true } });
        const n = (v: unknown) => Number(v ?? 0);
        return { cgst: n(a._sum.cgstTotal), sgst: n(a._sum.sgstTotal), igst: n(a._sum.igstTotal), cess: n(a._sum.cessTotal) };
      };
      const output = await forDir('OUTGOING');
      const input = await forDir('INCOMING');
      return {
        output, input,
        net: {
          cgst: output.cgst - input.cgst, sgst: output.sgst - input.sgst,
          igst: output.igst - input.igst, cess: output.cess - input.cess,
        },
      };
    });
  }

  async receivables(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bills = await tx.bill.findMany({
        where: { direction: 'OUTGOING', status: { not: 'CANCELLED' } },
        include: { party: true, payments: true },
        orderBy: { billDate: 'desc' },
      });
      // Paid = actual recorded payments (payments ledger).
      return bills.map((b) => {
        const amount = Number(b.grandTotal);
        const paid = b.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          date: b.billDate, invoice: b.billNumber, client: b.party?.name ?? '—',
          amount, paid, outstanding: Math.max(0, amount - paid),
        };
      });
    });
  }
}
