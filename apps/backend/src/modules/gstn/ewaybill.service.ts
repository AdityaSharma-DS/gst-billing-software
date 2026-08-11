import { Injectable } from '@nestjs/common';
import { WhiteBooksService, GspCredentials } from './whitebooks.service';

type OrgCreds = { gstin?: string | null; gspUsername?: string | null; gspPassword?: string | null };

/**
 * e-Way Bill integration — thin wrapper over the WhiteBooks GSP client.
 * See Api-docs/e-WayBill API Flow.pdf and the OpenAPI collection.
 */
@Injectable()
export class EWayBillService {
  constructor(private readonly gsp: WhiteBooksService) {}

  isConfigured(org: OrgCreds) {
    return this.gsp.isConfigured(org);
  }

  generate(org: OrgCreds, ewbPayload: Record<string, unknown>) {
    return this.gsp.generateEwayBill(org, ewbPayload);
  }

  getGstinDetails(org: OrgCreds, lookupGstin: string) {
    return this.gsp.getGstinDetails(org, lookupGstin);
  }
}

export type { GspCredentials };
