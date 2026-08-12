import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillsService } from '../bills/bills.service';

interface RItem { description: string; hsnSacCode?: string; quantity: number; rate: number; gstRate: number; }
export interface RecurringInput {
  partyId?: string;
  description?: string;
  invoiceType?: string;
  frequency?: string;
  nextRunDate?: string;
  paymentMode?: string;
  active?: boolean;
  items: RItem[];
}

const n2 = (n: number) => Math.round(n * 100) / 100;
const EDITABLE = ['partyId', 'description', 'invoiceType', 'frequency', 'nextRunDate', 'paymentMode', 'active', 'items'] as const;

function totalsFor(items: RItem[]) {
  let taxable = 0, gst = 0;
  for (const it of items ?? []) {
    const t = Number(it.quantity || 0) * Number(it.rate || 0);
    taxable += t; gst += (t * Number(it.gstRate || 0)) / 100;
  }
  return { taxable: n2(taxable), gst: n2(gst), total: n2(taxable + gst) };
}

/** Advance a date by the recurrence frequency. */
function advance(from: Date, frequency: string): Date {
  const d = new Date(from);
  const step = frequency === 'YEARLY' ? 12 : frequency === 'QUARTERLY' ? 3 : 1;
  d.setMonth(d.getMonth() + step);
  return d;
}

@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bills: BillsService,
  ) {}

  async list(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const rows = await tx.recurringProfile.findMany({ include: { party: true }, orderBy: { nextRunDate: 'asc' } });
      return rows.map((r) => {
        const t = totalsFor(r.items as any);
        return {
          id: r.id, partyId: r.partyId, client: r.party?.name ?? '—', gstin: r.party?.gstin ?? null,
          description: r.description, invoiceType: r.invoiceType, frequency: r.frequency,
          nextRunDate: r.nextRunDate, paymentMode: r.paymentMode, active: r.active, lastRunAt: r.lastRunAt,
          items: r.items, gstRate: (r.items as any)?.[0]?.gstRate ?? 0,
          taxable: t.taxable, gst: t.gst, amount: t.total,
        };
      });
    });
  }

  async create(tenantId: string, dto: RecurringInput, userId?: string) {
    if (!dto.items?.length) throw new BadRequestException('Add at least one line item');
    if (!dto.nextRunDate) throw new BadRequestException('Next due date is required');
    const rec = await this.prisma.withTenant(tenantId, (tx) =>
      tx.recurringProfile.create({
        data: {
          tenantId, partyId: dto.partyId || null, description: dto.description || null,
          invoiceType: dto.invoiceType || 'TAX', frequency: dto.frequency || 'MONTHLY',
          nextRunDate: new Date(dto.nextRunDate!), paymentMode: dto.paymentMode || null,
          active: dto.active ?? true, items: dto.items as any,
        },
      }),
    );
    await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'RecurringProfile', entityId: rec.id });
    return rec;
  }

  async update(tenantId: string, id: string, dto: Partial<RecurringInput>, userId?: string) {
    const existing = await this.prisma.withTenant(tenantId, (tx) => tx.recurringProfile.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Recurring profile not found');
    const patch: Record<string, any> = {};
    for (const k of EDITABLE) if ((dto as any)[k] !== undefined) patch[k] = (dto as any)[k];
    if (patch.nextRunDate) patch.nextRunDate = new Date(patch.nextRunDate);
    const rec = await this.prisma.withTenant(tenantId, (tx) => tx.recurringProfile.update({ where: { id }, data: patch }));
    await this.audit.record({ tenantId, userId, action: 'EDIT', entity: 'RecurringProfile', entityId: id, after: patch });
    return rec;
  }

  async remove(tenantId: string, id: string, userId?: string) {
    const existing = await this.prisma.withTenant(tenantId, (tx) => tx.recurringProfile.findUnique({ where: { id } }));
    if (!existing) throw new NotFoundException('Recurring profile not found');
    await this.prisma.withTenant(tenantId, (tx) => tx.recurringProfile.delete({ where: { id } }));
    await this.audit.record({ tenantId, userId, action: 'DELETE', entity: 'RecurringProfile', entityId: id });
    return { deleted: true };
  }

  /** Generate an invoice from the profile now and roll the next-run date forward. */
  async generateNow(tenantId: string, id: string, userId?: string) {
    const rec = await this.prisma.withTenant(tenantId, (tx) => tx.recurringProfile.findUnique({ where: { id }, include: { party: true } }));
    if (!rec) throw new NotFoundException('Recurring profile not found');
    const items = (rec.items as any as RItem[]) ?? [];
    if (!items.length) throw new BadRequestException('This profile has no line items');

    const org = await this.prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
    const pos = rec.party?.gstin?.slice(0, 2) || org?.stateCode || '27';

    const bill = await this.bills.create(tenantId, {
      direction: 'OUTGOING' as any,
      documentType: 'INVOICE' as any,
      invoiceType: rec.invoiceType,
      billDate: new Date().toISOString(),
      partyId: rec.partyId || undefined,
      placeOfSupply: pos,
      lineItems: items.map((it) => ({
        description: it.description, hsnSacCode: it.hsnSacCode || undefined,
        quantity: it.quantity, rate: it.rate, discount: 0, gstRate: it.gstRate,
      })),
    } as any, userId);

    const nextRunDate = advance(rec.nextRunDate, rec.frequency);
    await this.prisma.withTenant(tenantId, (tx) => tx.recurringProfile.update({ where: { id }, data: { lastRunAt: new Date(), nextRunDate } }));
    await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'RecurringProfile', entityId: id, after: { generatedBill: bill.billNumber, nextRunDate } });
    return { bill, nextRunDate };
  }
}
