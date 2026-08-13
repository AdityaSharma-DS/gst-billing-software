import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReturnsService } from '../returns/returns.service';

type Severity = 'high' | 'medium' | 'info';
export interface NotificationItem {
  id: string;
  type: 'gst' | 'invoice' | 'recurring';
  severity: Severity;
  title: string;
  detail: string;
  amount?: number;
  date: string;      // ISO — the due/target date
  group: 'Today' | 'This Week' | 'Earlier';
}

const DAY = 86_400_000;
const inr = (n: number) => '₹' + Number(n ?? 0).toLocaleString('en-IN');

/**
 * Derives an actionable notification feed from live data — GST return due dates,
 * overdue receivables and recurring invoices due soon. No separate store: read
 * state is tracked per-browser on the client.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly returns: ReturnsService) {}

  async list(tenantId: string): Promise<{ items: NotificationItem[]; count: number }> {
    const now = new Date();
    const items: NotificationItem[] = [];

    // 1) GST returns — overdue or due within 10 days (from the compliance tracker).
    const compliance = await this.returns.compliance(tenantId).catch(() => [] as any[]);
    for (const r of compliance) {
      const due = new Date(r.dueDate);
      const daysToDue = Math.ceil((due.getTime() - now.getTime()) / DAY);
      if (r.status === 'OVERDUE') {
        items.push({
          id: `gst:${r.returnType}:${r.period}`, type: 'gst', severity: 'high',
          title: `${r.returnType} ${r.period} overdue`,
          detail: `${r.overdueDays}d overdue${r.lateFee ? ` · late fee ~${inr(r.lateFee)}` : ''}`,
          date: due.toISOString(), group: bucket(due, now),
        });
      } else if (r.status === 'PENDING' && daysToDue <= 10) {
        items.push({
          id: `gst:${r.returnType}:${r.period}`, type: 'gst', severity: 'medium',
          title: `${r.returnType} ${r.period} due soon`,
          detail: `Due ${due.toLocaleDateString('en-IN')} (${daysToDue}d)`,
          date: due.toISOString(), group: bucket(due, now),
        });
      }
    }

    await this.prisma.withTenant(tenantId, async (tx) => {
      // 2) Overdue receivables — outward bills past due and not fully paid.
      const overdue = await tx.bill.findMany({
        where: { direction: 'OUTGOING', status: { not: 'CANCELLED' }, dueDate: { lt: now }, paymentStatus: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        include: { party: true }, orderBy: { dueDate: 'asc' }, take: 30,
      });
      for (const b of overdue) {
        const due = b.dueDate ?? b.billDate;
        items.push({
          id: `inv:${b.id}`, type: 'invoice', severity: 'high',
          title: `${b.billNumber} overdue`,
          detail: `${b.party?.name ?? 'Customer'} · ${inr(Number(b.grandTotal))}`,
          amount: Number(b.grandTotal), date: new Date(due).toISOString(), group: bucket(new Date(due), now),
        });
      }

      // 3) Recurring invoices due within 5 days.
      const recurring = await tx.recurringProfile.findMany({
        where: { active: true, nextRunDate: { lte: new Date(now.getTime() + 5 * DAY) } },
        include: { party: true }, orderBy: { nextRunDate: 'asc' }, take: 30,
      });
      for (const r of recurring) {
        const run = new Date(r.nextRunDate);
        const overdueRun = run < now;
        items.push({
          id: `rec:${r.id}`, type: 'recurring', severity: overdueRun ? 'medium' : 'info',
          title: overdueRun ? 'Recurring invoice due' : 'Recurring invoice upcoming',
          detail: `${r.party?.name ?? 'Client'} · ${r.frequency[0] + r.frequency.slice(1).toLowerCase()} · ${run.toLocaleDateString('en-IN')}`,
          date: run.toISOString(), group: bucket(run, now),
        });
      }
    });

    // Most urgent first: high → medium → info, then soonest date.
    const rank: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
    items.sort((a, b) => rank[a.severity] - rank[b.severity] || +new Date(a.date) - +new Date(b.date));
    return { items, count: items.length };
  }
}

function bucket(date: Date, now: Date): NotificationItem['group'] {
  const diff = Math.abs(Math.floor((now.getTime() - date.getTime()) / DAY));
  return diff === 0 ? 'Today' : diff <= 7 ? 'This Week' : 'Earlier';
}
