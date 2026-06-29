import { Injectable } from '@nestjs/common';
import { GstnAuthService } from './gstn-auth.service';

/**
 * e-Invoice (IRN) integration — follows Api-docs/e-Invoice API Flow.pdf:
 *   auth -> get GSTIN details -> generate IRN -> get IRN details (handle duplicate
 *   IRN / missing QR within 3 days) -> generate e-Way Bill by IRN.
 */
@Injectable()
export class EInvoiceService {
  constructor(private readonly auth: GstnAuthService) {}

  async generateIrn(gstin: string, invoicePayload: unknown): Promise<{ irn: string; signedQr: string }> {
    await this.auth.getToken(gstin);
    // TODO: POST `${EINVOICE_BASE_URL}/eicore/v1.03/Invoice` with the IRP-spec payload.
    return { irn: 'PLACEHOLDER_IRN', signedQr: 'PLACEHOLDER_QR' };
  }

  async getIrnDetails(gstin: string, irn: string) {
    await this.auth.getToken(gstin);
    // TODO: GET `${EINVOICE_BASE_URL}/eicore/v1.03/Invoice/irn/{irn}`
    return { irn, status: 'ACTIVE' };
  }
}
