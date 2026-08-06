import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * e-Way Bill management. Persists to the EWayBill model. When NIC/GSTN sandbox
 * credentials are configured (via the master admin GST config) this should call
 * the NIC API (see GstnModule.EWayBillService); until then it issues a local
 * placeholder EWB number so the workflow is usable end-to-end.
 */
@Injectable()
export class EwayService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Outgoing bills with their e-Way Bill status. */
  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bills = await tx.bill.findMany({
        where: { direction: 'OUTGOING', status: { not: 'CANCELLED' } },
        orderBy: { billDate: 'desc' },
        include: { party: true, eWayBill: true },
      });
      return bills.map((b) => ({
        id: b.id, billNumber: b.billNumber, billDate: b.billDate,
        party: b.party?.name ?? '—', placeOfSupply: b.placeOfSupply,
        grandTotal: Number(b.grandTotal),
        // e-Way Bill required for consignments over ₹50,000.
        required: Number(b.grandTotal) >= 50000,
        ewbNo: b.eWayBill?.ewbNo ?? null,
        ewbStatus: b.eWayBill?.status ?? null,
        validUpto: b.eWayBill?.validUpto ?? null,
        vehicleNo: b.eWayBill?.vehicleNo ?? null,
      }));
    });
  }

  async generate(tenantId: string, billId: string, input: { vehicleNo?: string; transporterId?: string }, userId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bill = await tx.bill.findUnique({ where: { id: billId }, include: { eWayBill: true } });
      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.eWayBill) throw new BadRequestException('e-Way Bill already generated for this bill');

      // Placeholder 12-digit EWB number (real NIC generation is wired via GstnModule).
      const ewbNo = String(Math.floor(Date.now() / 1000)).slice(-9).padStart(12, '3');
      const validUpto = new Date(); validUpto.setDate(validUpto.getDate() + 1);

      const ewb = await tx.eWayBill.create({
        data: { tenantId, billId, ewbNo, ewbDate: new Date(), validUpto, vehicleNo: input.vehicleNo, transporterId: input.transporterId, status: 'ACTIVE' },
      });
      await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'EWayBill', entityId: ewb.id, after: { ewbNo, billId } });
      return ewb;
    });
  }
}
