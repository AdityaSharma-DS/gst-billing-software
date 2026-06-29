import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GstService } from '../gst/gst.service';
import { CreateBillDto } from './dto/create-bill.dto';

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gst: GstService,
  ) {}

  async list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findMany({ orderBy: { billDate: 'desc' }, include: { party: true } }),
    );
  }

  async get(tenantId: string, id: string) {
    const bill = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findUnique({ where: { id }, include: { lineItems: true, party: true } }),
    );
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  async create(tenantId: string, dto: CreateBillDto, userId?: string) {
    // Resolve supplier state for intra/inter-state determination.
    const org = await this.prisma.withTenant(tenantId, (tx) =>
      tx.organization.findFirst(),
    );
    const intraState = this.gst.isIntraState(org?.stateCode ?? undefined, dto.placeOfSupply);

    let subTotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, cessTotal = 0;

    const lineItems = dto.lineItems.map((li) => {
      const taxableValue = li.rate * li.quantity - (li.discount ?? 0);
      const tax = this.gst.computeLineTax(
        { taxableValue, gstRate: li.gstRate, cessRate: li.cessRate },
        intraState,
      );
      subTotal += taxableValue;
      cgstTotal += tax.cgst;
      sgstTotal += tax.sgst;
      igstTotal += tax.igst;
      cessTotal += tax.cess;
      return {
        tenantId,
        description: li.description,
        hsnSacCode: li.hsnSacCode,
        quantity: li.quantity,
        unit: li.unit,
        rate: li.rate,
        discount: li.discount ?? 0,
        taxableValue,
        gstRate: li.gstRate,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        cess: tax.cess,
        lineTotal: tax.total,
      };
    });

    const grandTotal = subTotal + cgstTotal + sgstTotal + igstTotal + cessTotal;
    const billNumber = await this.nextBillNumber(tenantId, dto.direction);

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.create({
        data: {
          tenantId,
          billNumber,
          direction: dto.direction,
          billDate: new Date(dto.billDate),
          partyId: dto.partyId,
          placeOfSupply: dto.placeOfSupply,
          reverseCharge: dto.reverseCharge ?? false,
          subTotal,
          cgstTotal,
          sgstTotal,
          igstTotal,
          cessTotal,
          grandTotal,
          notes: dto.notes,
          createdById: userId,
          lineItems: { create: lineItems },
        },
        include: { lineItems: true },
      }),
    );
  }

  /** Simple per-tenant sequential bill numbering. Format is configurable per org in Phase 2. */
  private async nextBillNumber(tenantId: string, direction: string): Promise<string> {
    const count = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.count({ where: { direction: direction as any } }),
    );
    const prefix = direction === 'OUTGOING' ? 'INV' : 'PUR';
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }
}
