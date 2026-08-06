import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Record a (possibly partial) payment against a bill and recompute its payment status. */
  async record(tenantId: string, billId: string, input: { amount: number; mode?: string; reference?: string; chequeNo?: string; bankDetails?: string; date?: string; notes?: string }, userId?: string) {
    if (!input.amount || input.amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.prisma.withTenant(tenantId, async (tx) => {
      const bill = await tx.bill.findUnique({ where: { id: billId }, include: { payments: true } });
      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.status === 'CANCELLED') throw new BadRequestException('Cannot record payment on a cancelled bill');

      const alreadyPaid = bill.payments.reduce((s, p) => s + Number(p.amount), 0);
      const outstanding = Number(bill.grandTotal) - alreadyPaid;
      if (input.amount > outstanding + 0.01) {
        throw new BadRequestException(`Amount exceeds outstanding (₹${outstanding.toFixed(2)})`);
      }

      const payment = await tx.billPayment.create({
        data: {
          tenantId, billId,
          amount: input.amount,
          mode: input.mode,
          reference: input.reference,
          chequeNo: input.chequeNo,
          bankDetails: input.bankDetails,
          notes: input.notes,
          date: input.date ? new Date(input.date) : new Date(),
        },
      });

      const paidNow = alreadyPaid + input.amount;
      const paymentStatus = paidNow >= Number(bill.grandTotal) - 0.01 ? 'PAID' : 'PARTIAL';
      await tx.bill.update({ where: { id: billId }, data: { paymentStatus } });

      await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'BillPayment', entityId: payment.id, after: { billId, amount: input.amount, mode: input.mode } });
      return { ...payment, paymentStatus, outstanding: Number(bill.grandTotal) - paidNow };
    });
  }

  listForBill(tenantId: string, billId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.billPayment.findMany({ where: { billId }, orderBy: { date: 'desc' } }),
    );
  }

  /** All payment receipts for the tenant (Receipts screen). */
  listAll(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const payments = await tx.billPayment.findMany({
        orderBy: { date: 'desc' },
        include: { bill: { include: { party: true } } },
      });
      return payments.map((p) => ({
        id: p.id,
        date: p.date,
        client: p.bill.party?.name ?? '—',
        invoice: p.bill.billNumber,
        mode: p.mode ?? '—',
        reference: p.reference,
        amount: Number(p.amount),
      }));
    });
  }
}
