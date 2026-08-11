import { Injectable } from '@nestjs/common';
import { WhiteBooksService } from './whitebooks.service';

type OrgCreds = { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null };

/**
 * e-Invoice (IRN) integration — thin wrapper over the WhiteBooks GSP client.
 * Flow (Api-docs/e-Invoice API Flow.pdf): auth -> generate IRN -> (optional)
 * generate e-Way Bill by IRN. WhiteBooks abstracts the NIC AES/RSA encryption.
 */
@Injectable()
export class EInvoiceService {
  constructor(private readonly gsp: WhiteBooksService) {}

  isConfigured(org: OrgCreds) {
    return this.gsp.isConfigured(org);
  }

  generateIrn(org: OrgCreds, invoicePayload: Record<string, unknown>) {
    return this.gsp.generateIrn(org, invoicePayload);
  }
}
