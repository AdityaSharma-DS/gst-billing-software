import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WhiteBooksService } from '../gstn/whitebooks.service';
import { buildEInvoicePayload } from './einvoice-payload.util';

const FILABLE = ['FINALIZED', 'VERIFIED', 'APPROVED'];

/**
 * e-Invoice (IRN) management. Persists to the Irn model. When the WhiteBooks GSP
 * is configured (master-admin GST config) AND the organisation has NIC API
 * credentials (Settings → GST APIs), a real IRN + signed QR is generated via
 * NIC. Otherwise a local placeholder IRN is issued so the workflow stays usable.
 * e-Invoice applies to B2B sales invoices (the customer must have a GSTIN).
 */
@Injectable()
export class IrnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gsp: WhiteBooksService,
  ) {}

  /** Outgoing bills with their IRN status. */
  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bills = await tx.bill.findMany({
        where: { direction: 'OUTGOING', status: { not: 'CANCELLED' } },
        orderBy: { billDate: 'desc' },
        include: { party: true, irn: true },
      });
      return bills.map((b) => ({
        id: b.id, billNumber: b.billNumber, billDate: b.billDate,
        party: b.party?.name ?? '—', gstin: b.party?.gstin ?? null,
        grandTotal: Number(b.grandTotal), status: b.status,
        // e-Invoice applies to B2B (registered customer) and a finalized invoice.
        eligible: !!b.party?.gstin && FILABLE.includes(b.status),
        irn: b.irn?.irn ?? null, ackNo: b.irn?.ackNo ?? null, ackDate: b.irn?.ackDate ?? null,
        irnStatus: b.irn?.status ?? null, hasQr: !!b.irn?.signedQrCode,
      }));
    });
  }

  async generate(tenantId: string, billId: string, userId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const bill = await tx.bill.findUnique({
        where: { id: billId },
        include: { irn: true, party: true, lineItems: true, invoice: true },
      });
      if (!bill) throw new NotFoundException('Invoice not found');
      if (bill.direction !== 'OUTGOING') throw new BadRequestException('e-Invoice applies to sales invoices only.');
      if (bill.irn) throw new BadRequestException('An IRN has already been generated for this invoice.');
      if (!bill.party?.gstin) throw new BadRequestException('e-Invoice (IRN) applies to B2B invoices — the customer must have a GSTIN.');
      if (!FILABLE.includes(bill.status)) throw new BadRequestException('Finalize the invoice before generating its IRN.');
      const org = await tx.organization.findFirst({ where: { tenantId } });

      let irnVal: string, ackNo: string | undefined, ackDate = new Date();
      let signedInvoice: string | undefined, signedQrCode: string | undefined, source = 'PLACEHOLDER';

      if (org && (await this.gsp.isConfigured(org))) {
        // Real NIC generation via WhiteBooks GSP.
        const payload = buildEInvoicePayload(bill as any, org, bill.party);
        const res = await this.gsp.generateIrn(org, payload);
        irnVal = res.irn; ackNo = res.ackNo; signedInvoice = res.signedInvoice; signedQrCode = res.signedQr;
        const ackDt = res.raw?.AckDt ?? res.raw?.ackDt;
        if (ackDt) { const d = new Date(String(ackDt).replace(' ', 'T')); if (!isNaN(d.getTime())) ackDate = d; }
        source = 'NIC';
      } else {
        // Local placeholder IRN (64-hex) — real generation needs GSP config.
        irnVal = createHash('sha256').update(`${tenantId}|${bill.billNumber}|${new Date(bill.billDate).toISOString()}`).digest('hex');
        ackNo = String(Date.now()).slice(-12);
      }

      const irn = await tx.irn.create({
        data: { tenantId, billId, irn: irnVal, ackNo, ackDate, signedInvoice, signedQrCode, status: 'ACTIVE' },
      });
      // Surface the signed QR on the invoice so the PDF can render it.
      if (signedQrCode && bill.invoice) {
        await tx.invoice.update({ where: { id: bill.invoice.id }, data: { qrPayload: signedQrCode } });
      }
      await this.audit.record({ tenantId, userId, action: 'CREATE', entity: 'Irn', entityId: irn.id, after: { irn: irnVal, billId, source } });
      return { ...irn, source };
    });
  }
}
