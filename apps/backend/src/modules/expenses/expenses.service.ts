import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface ExpenseInput {
  date?: string;
  category?: string;
  description: string;
  amount: number;
  gstAmount?: number;
  businessName?: string;
  businessGstin?: string;
  invoiceBillNo?: string;
  paymentMode?: string;
  note?: string;
  status?: string;
}

const EDITABLE = ['date', 'category', 'description', 'amount', 'gstAmount', 'businessName', 'businessGstin', 'invoiceBillNo', 'paymentMode', 'note', 'status'] as const;

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(tenantId: string, opts?: { category?: string; q?: string; fy?: string }) {
    return this.prisma.withTenant(tenantId, (tx) => {
      const where: any = {};
      if (opts?.category) where.category = opts.category;
      if (opts?.q) where.OR = [
        { description: { contains: opts.q, mode: 'insensitive' } },
        { businessName: { contains: opts.q, mode: 'insensitive' } },
        { invoiceBillNo: { contains: opts.q, mode: 'insensitive' } },
      ];
      if (opts?.fy) {
        const y = Number(String(opts.fy).slice(0, 4));
        if (y) { where.date = { gte: new Date(y, 3, 1), lt: new Date(y + 1, 3, 1) }; }
      }
      return tx.expense.findMany({ where, orderBy: { date: 'desc' } });
    });
  }

  async summary(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [all, month, unpaid, cats] = await Promise.all([
        tx.expense.aggregate({ _sum: { amount: true, gstAmount: true }, _count: true }),
        tx.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: monthStart } } }),
        tx.expense.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'UNPAID' } }),
        tx.expense.findMany({ distinct: ['category'], select: { category: true } }),
      ]);
      return {
        total: Number(all._sum.amount ?? 0), totalGst: Number(all._sum.gstAmount ?? 0), count: all._count,
        thisMonth: Number(month._sum.amount ?? 0),
        unpaid: Number(unpaid._sum.amount ?? 0), unpaidCount: unpaid._count,
        categories: cats.map((c) => c.category).filter(Boolean) as string[],
      };
    });
  }

  async create(tenantId: string, dto: ExpenseInput, userId?: string) {
    if (!dto.description?.trim()) throw new BadRequestException('Description is required');
    const exp = await this.prisma.withTenant(tenantId, (tx) =>
      tx.expense.create({
        data: {
          tenantId,
          date: dto.date ? new Date(dto.date) : new Date(),
          category: dto.category || null,
          description: dto.description.trim(),
          amount: dto.amount ?? 0,
          gstAmount: dto.gstAmount ?? 0,
          businessName: dto.businessName || null,
          businessGstin: dto.businessGstin || null,
          invoiceBillNo: dto.invoiceBillNo || null,
          paymentMode: dto.paymentMode || null,
          note: dto.note || null,
          status: dto.status === 'PAID' ? 'PAID' : 'UNPAID',
        },
      }),
    );
    await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'Expense', entityId: exp.id, after: { amount: Number(exp.amount), description: exp.description } });
    return exp;
  }

  async update(tenantId: string, id: string, dto: Partial<ExpenseInput>, userId?: string) {
    const existing = await this.prisma.withTenant(tenantId, (tx) => tx.expense.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Expense not found');
    const patch: Record<string, any> = {};
    for (const k of EDITABLE) if ((dto as any)[k] !== undefined) patch[k] = (dto as any)[k];
    if (patch.date) patch.date = new Date(patch.date);
    const exp = await this.prisma.withTenant(tenantId, (tx) => tx.expense.update({ where: { id }, data: patch }));
    await this.audit.record({ tenantId, userId, action: 'EDIT', entity: 'Expense', entityId: id, before: { amount: Number(existing.amount) }, after: patch });
    return exp;
  }

  async remove(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.withTenant(tenantId, (tx) => tx.expense.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Expense not found');
    await this.prisma.withTenant(tenantId, (tx) => tx.expense.delete({ where: { id } }));
    await this.audit.record({ tenantId, userId, action: 'DELETE', entity: 'Expense', entityId: id, before: { amount: Number(existing.amount), description: existing.description } });
    return { deleted: true };
  }

  async exportCsv(tenantId: string, userId?: string) {
    const rows = await this.list(tenantId);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Date', 'Category', 'Description', 'Business', 'GSTIN', 'Invoice No', 'Amount', 'GST', 'Payment Mode', 'Status'];
    const lines = rows.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.category, r.description, r.businessName, r.businessGstin, r.invoiceBillNo, Number(r.amount), Number(r.gstAmount), r.paymentMode, r.status].map(esc).join(','));
    await this.audit.record({ tenantId, userId, action: 'EXPORT', entity: 'Expense', after: { rows: rows.length } });
    return [header.join(','), ...lines].join('\r\n');
  }
}
