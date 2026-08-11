import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WhiteBooksService } from '../gstn/whitebooks.service';
import { buildEwbPayload, EwbInput } from './eway-payload.util';

/**
 * e-Way Bill management. Persists to the EWayBill model. When the WhiteBooks GSP
 * is configured (master-admin GST config) AND the organisation has NIC API
 * credentials (Settings → GST APIs), a real EWB is generated via NIC. Otherwise
 * a local placeholder number is issued so the workflow stays usable end-to-end.
 */
@Injectable()
export class EwayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gsp: WhiteBooksService,
  ) {}

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

  async generate(tenantId: string, billId: string, input: EwbInput, userId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bill = await tx.bill.findUnique({
        where: { id: billId },
        include: { eWayBill: true, party: true, lineItems: true },
      });
      if (!bill) throw new NotFoundException('Bill not found');
      if (bill.eWayBill) throw new BadRequestException('e-Way Bill already generated for this bill');
      const org = await tx.organization.findFirst({ where: { tenantId } });

      let ewbNo: string;
      let validUpto = new Date();
      let source = 'PLACEHOLDER';

      if (org && (await this.gsp.isConfigured(org))) {
        // Real NIC generation via WhiteBooks GSP.
        const payload = buildEwbPayload(bill as any, org, bill.party ?? {}, input);
        const res = await this.gsp.generateEwayBill(org, payload);
        ewbNo = res.ewbNo;
        validUpto = new Date(res.validUpto);
        source = 'NIC';
      } else {
        // Local placeholder 12-digit number (real generation needs GSP config).
        ewbNo = String(Math.floor(Date.now() / 1000)).slice(-9).padStart(12, '3');
        validUpto.setDate(validUpto.getDate() + 1);
      }

      const ewb = await tx.eWayBill.create({
        data: {
          tenantId, billId, ewbNo, ewbDate: new Date(), validUpto,
          vehicleNo: input.vehicleNo, transporterId: input.transporterId, status: 'ACTIVE',
        },
      });
      await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'EWayBill', entityId: ewb.id, after: { ewbNo, billId, source } });
      return { ...ewb, source };
    });
  }
}
