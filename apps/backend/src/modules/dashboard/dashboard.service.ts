import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 6); // last 7 days
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const [
        customers, orders, outgoing, incoming,
        billsToday, billsWeek, billsMonth, pendingApprovals, recent, salesBills,
      ] = await Promise.all([
        tx.party.count({ where: { type: 'CUSTOMER' } }),
        tx.bill.count(),
        tx.bill.aggregate({ where: { direction: 'OUTGOING' }, _sum: { grandTotal: true } }),
        tx.bill.aggregate({ where: { direction: 'INCOMING' }, _sum: { grandTotal: true } }),
        tx.bill.count({ where: { billDate: { gte: startOfToday } } }),
        tx.bill.count({ where: { billDate: { gte: startOfWeek } } }),
        tx.bill.count({ where: { billDate: { gte: startOfMonth } } }),
        tx.bill.count({ where: { status: 'DRAFT' } }),
        tx.bill.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { party: true } }),
        tx.bill.findMany({ where: { direction: 'OUTGOING', status: { not: 'CANCELLED' }, billDate: { gte: yearAgo } }, select: { billDate: true, grandTotal: true } }),
      ]);

      // Real last-12-months outward sales, bucketed by month.
      const monthlySales = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        return { month: d.toLocaleString('en-US', { month: 'short' }), key: `${d.getFullYear()}-${d.getMonth()}`, total: 0 };
      });
      const bucket = new Map(monthlySales.map((m, i) => [m.key, i]));
      for (const b of salesBills) {
        const d = new Date(b.billDate);
        const i = bucket.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (i != null) monthlySales[i].total += Number(b.grandTotal);
      }

      const revenue = Number(outgoing._sum.grandTotal ?? 0);
      const expenses = Number(incoming._sum.grandTotal ?? 0);
      return {
        customers,
        orders,
        revenue,
        netProfit: revenue - expenses,
        incomingValue: expenses,
        outgoingValue: revenue,
        billsToday, billsThisWeek: billsWeek, billsThisMonth: billsMonth,
        pendingApprovals,
        monthlySales: monthlySales.map((m) => ({ month: m.month, total: m.total })),
        recentOrders: recent.map((b) => ({
          id: b.id,
          product: b.party?.name ?? b.billNumber,
          category: b.direction === 'OUTGOING' ? 'Sales' : 'Purchase',
          price: Number(b.grandTotal),
          status: b.status,
        })),
      };
    });
  }
}
