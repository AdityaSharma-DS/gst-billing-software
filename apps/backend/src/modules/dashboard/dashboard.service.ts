import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [customers, orders, outgoing, incoming, recent] = await Promise.all([
        tx.party.count({ where: { type: 'CUSTOMER' } }),
        tx.bill.count(),
        tx.bill.aggregate({ where: { direction: 'OUTGOING' }, _sum: { grandTotal: true } }),
        tx.bill.aggregate({ where: { direction: 'INCOMING' }, _sum: { grandTotal: true } }),
        tx.bill.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { party: true },
        }),
      ]);
      const revenue = Number(outgoing._sum.grandTotal ?? 0);
      const expenses = Number(incoming._sum.grandTotal ?? 0);
      return {
        customers,
        orders,
        revenue,
        netProfit: revenue - expenses,
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
