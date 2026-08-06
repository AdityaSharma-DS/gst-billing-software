import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GstService } from '../gst/gst.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../products/products.service';
import { CreateBillDto } from './dto/create-bill.dto';

export interface BillFilters {
  direction?: 'INCOMING' | 'OUTGOING';
  status?: string;
  search?: string;   // matches bill number or party name
  partyId?: string;
  from?: string;     // ISO date
  to?: string;
}

// Allowed forward/backward transitions for the bill lifecycle.
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['VERIFIED', 'DRAFT', 'CANCELLED'],
  VERIFIED: ['FINALIZED', 'APPROVED', 'CANCELLED'],
  FINALIZED: [],           // terminal
  CANCELLED: [],           // terminal
};

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gst: GstService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
  ) {}

  async list(tenantId: string, f: BillFilters = {}) {
    const bills = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findMany({
        where: {
          direction: f.direction,
          status: f.status as any,
          partyId: f.partyId,
          billDate: f.from || f.to ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined } : undefined,
          ...(f.search
            ? { OR: [{ billNumber: { contains: f.search, mode: 'insensitive' } }, { party: { name: { contains: f.search, mode: 'insensitive' } } }] }
            : {}),
        },
        orderBy: { billDate: 'desc' },
        include: { party: true, payments: true },
      }),
    );
    // Surface paid/outstanding computed from the payments ledger.
    return bills.map((b) => {
      const paid = b.payments.reduce((s, p) => s + Number(p.amount), 0);
      const { payments, ...rest } = b as any;
      return { ...rest, paid, outstanding: Math.max(0, Number(b.grandTotal) - paid) };
    });
  }

  async get(tenantId: string, id: string) {
    const bill = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findUnique({ where: { id }, include: { lineItems: true, party: true } }),
    );
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  async create(tenantId: string, dto: CreateBillDto, userId?: string) {
    const totals = await this.computeTotals(tenantId, dto);
    const billNumber = await this.nextBillNumber(tenantId, dto.direction, dto.documentType);

    const bill = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.create({
        data: {
          tenantId,
          billNumber,
          direction: dto.direction,
          documentType: (dto.documentType ?? 'INVOICE') as any,
          invoiceType: dto.invoiceType ?? 'TAX',
          billDate: new Date(dto.billDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          terms: dto.terms,
          vendorInvoiceNo: dto.vendorInvoiceNo,
          paymentStatus: dto.paymentStatus ?? 'UNPAID',
          paymentMode: dto.paymentMode,
          partyId: dto.partyId,
          placeOfSupply: dto.placeOfSupply,
          reverseCharge: dto.reverseCharge ?? false,
          discountTotal: totals.discountTotal,
          otherCharges: dto.otherCharges ?? 0,
          subTotal: totals.subTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          igstTotal: totals.igstTotal,
          cessTotal: totals.cessTotal,
          roundOff: totals.roundOff,
          grandTotal: totals.grandTotal,
          language: dto.language ?? 'en',
          notes: dto.notes,
          createdById: userId,
          lineItems: { create: totals.lineItems },
        },
        include: { lineItems: true, party: true },
      }),
    );

    await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'Bill', entityId: bill.id, after: { billNumber, grandTotal: totals.grandTotal } });
    await this.products.learnFromLineItems(tenantId, totals.lineItems);
    return bill;
  }

  async update(tenantId: string, id: string, dto: CreateBillDto, userId?: string) {
    const existing = await this.get(tenantId, id);
    if (['FINALIZED', 'CANCELLED'].includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a ${existing.status.toLowerCase()} bill`);
    }
    const totals = await this.computeTotals(tenantId, dto);

    const bill = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.update({
        where: { id },
        data: {
          direction: dto.direction,
          documentType: (dto.documentType ?? existing.documentType) as any,
          invoiceType: dto.invoiceType ?? existing.invoiceType,
          billDate: new Date(dto.billDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : existing.dueDate,
          terms: dto.terms ?? existing.terms,
          vendorInvoiceNo: dto.vendorInvoiceNo ?? existing.vendorInvoiceNo,
          paymentStatus: dto.paymentStatus ?? existing.paymentStatus,
          paymentMode: dto.paymentMode ?? existing.paymentMode,
          partyId: dto.partyId,
          placeOfSupply: dto.placeOfSupply,
          reverseCharge: dto.reverseCharge ?? false,
          discountTotal: totals.discountTotal,
          otherCharges: dto.otherCharges ?? 0,
          subTotal: totals.subTotal,
          cgstTotal: totals.cgstTotal,
          sgstTotal: totals.sgstTotal,
          igstTotal: totals.igstTotal,
          cessTotal: totals.cessTotal,
          roundOff: totals.roundOff,
          grandTotal: totals.grandTotal,
          language: dto.language ?? existing.language,
          notes: dto.notes,
          lineItems: { deleteMany: {}, create: totals.lineItems },
        },
        include: { lineItems: true, party: true },
      }),
    );

    await this.audit.record({ tenantId, userId, action: 'EDIT', entity: 'Bill', entityId: id, before: { grandTotal: existing.grandTotal }, after: { grandTotal: totals.grandTotal } });
    await this.products.learnFromLineItems(tenantId, totals.lineItems);
    return bill;
  }

  async setStatus(tenantId: string, id: string, status: string, userId?: string) {
    const bill = await this.get(tenantId, id);
    const allowed = TRANSITIONS[bill.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move bill from ${bill.status} to ${status}`);
    }
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.update({ where: { id }, data: { status: status as any } }),
    );
    await this.audit.record({ tenantId, userId, action: 'APPROVE', entity: 'Bill', entityId: id, before: { status: bill.status }, after: { status } });
    return updated;
  }

  async remove(tenantId: string, id: string, userId?: string) {
    const bill = await this.get(tenantId, id);
    if (bill.status === 'FINALIZED') throw new BadRequestException('Cannot delete a finalized bill');
    await this.prisma.withTenant(tenantId, (tx) => tx.bill.delete({ where: { id } }));
    await this.audit.record({ tenantId, userId, action: 'DELETE', entity: 'Bill', entityId: id, before: { billNumber: bill.billNumber } });
    return { deleted: true, id };
  }

  /** Shared totals computation (line items + bill-level discount + other charges + round-off). */
  private async computeTotals(tenantId: string, dto: CreateBillDto) {
    const org = await this.prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
    const intraState = this.gst.isIntraState(org?.stateCode ?? undefined, dto.placeOfSupply);

    let subTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, cessTotal = 0, lineDiscounts = 0;
    const lineItems = dto.lineItems.map((li) => {
      const gross = li.rate * li.quantity;
      const discount = li.discount ?? 0;
      const taxableValue = Math.max(0, gross - discount);
      const tax = this.gst.computeLineTax({ taxableValue, gstRate: li.gstRate, cessRate: li.cessRate }, intraState);
      subTotal += taxableValue; lineDiscounts += discount;
      cgstTotal += tax.cgst; sgstTotal += tax.sgst; igstTotal += tax.igst; cessTotal += tax.cess;
      return {
        tenantId, description: li.description, hsnSacCode: li.hsnSacCode,
        quantity: li.quantity, unit: li.unit, rate: li.rate, discount,
        taxableValue, gstRate: li.gstRate, cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst, cess: tax.cess,
        lineTotal: tax.total,
      };
    });

    const billDiscount = dto.billDiscount ?? 0;
    const otherCharges = dto.otherCharges ?? 0;
    const round = (n: number) => Math.round(n * 100) / 100;
    const rawTotal = subTotal + cgstTotal + sgstTotal + igstTotal + cessTotal - billDiscount + otherCharges;
    const grandTotal = Math.round(rawTotal);       // round to nearest rupee
    const roundOff = round(grandTotal - rawTotal);

    return {
      lineItems,
      discountTotal: round(lineDiscounts + billDiscount),
      subTotal: round(subTotal), cgstTotal: round(cgstTotal), sgstTotal: round(sgstTotal),
      igstTotal: round(igstTotal), cessTotal: round(cessTotal), roundOff, grandTotal,
    };
  }

  /** Per-tenant sequential numbering. Prefix by document type; format INV-00001 / CRN- / DCH- / PUR-. */
  private async nextBillNumber(tenantId: string, direction: string, documentType?: string): Promise<string> {
    const count = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.count({ where: { direction: direction as any } }),
    );
    const prefix =
      documentType === 'CREDIT_NOTE' ? 'CRN' :
      documentType === 'DELIVERY_CHALLAN' ? 'DCH' :
      direction === 'OUTGOING' ? 'INV' : 'PUR';
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }
}
