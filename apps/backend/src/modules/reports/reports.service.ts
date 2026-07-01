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

  async receivables(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bills = await tx.bill.findMany({
        where: { direction: 'OUTGOING' },
        include: { party: true },
        orderBy: { billDate: 'desc' },
      });
      // Without a payments ledger yet, treat FILED/FINALIZED as paid for the demo.
      return bills.map((b) => {
        const amount = Number(b.grandTotal);
        const paid = b.status === 'FINALIZED' ? amount : 0;
        return {
          date: b.billDate, invoice: b.billNumber, client: b.party?.name ?? '—',
          amount, paid, outstanding: amount - paid,
        };
      });
    });
  }
}
