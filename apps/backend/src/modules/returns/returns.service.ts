import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type ReturnType = 'GSTR1' | 'GSTR2B' | 'GSTR3B' | 'GSTR4' | 'GSTR5' | 'GSTR6' | 'GSTR7' | 'GSTR8' | 'GSTR9';

/**
 * Generates GSTN-compliant return JSON, validates against schema, archives,
 * and (Phase 3) files via the GSTN API. Each generator is a stub to be filled
 * per the GSTN spec in Api-docs/.
 */
@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.gstReturn.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  /** Build the section-wise JSON for a given return + period. */
  async generate(tenantId: string, returnType: ReturnType, period: string) {
    const payload = await this.buildPayload(tenantId, returnType, period);
    const errors = this.validateSchema(returnType, payload);

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.gstReturn.create({
        data: {
          tenantId,
          returnType: returnType as any,
          period,
          status: errors.length ? 'ERROR' : 'GENERATED',
          summary: payload as any,
          validationErrors: errors.length ? (errors as any) : undefined,
        },
      }),
    );
  }

  private async buildPayload(tenantId: string, returnType: ReturnType, period: string) {
    switch (returnType) {
      case 'GSTR1':
        return this.buildGstr1(tenantId, period);
      // TODO: GSTR2B (fetch from GSTN), GSTR3B (auto from 1+2B), GSTR4..9
      default:
        return { gstin: null, fp: period, note: `${returnType} generator pending` };
    }
  }

  /** GSTR-1: outward supplies grouped into B2B / B2CL / B2CS / EXP / HSN sections. */
  private async buildGstr1(tenantId: string, period: string) {
    const bills = await this.prisma.withTenant(tenantId, (tx) =>
      tx.bill.findMany({
        where: { direction: 'OUTGOING', status: 'FINALIZED' },
        include: { lineItems: true, party: true },
      }),
    );
    // Placeholder grouping — real mapping must follow GSTN GSTR-1 JSON spec.
    return {
      fp: period,
      b2b: bills.filter((b) => b.party?.gstin),
      b2cs: bills.filter((b) => !b.party?.gstin),
    };
  }

  /** Validate against the GSTN JSON schema. Plug in ajv + the official schema. */
  private validateSchema(_returnType: ReturnType, _payload: unknown): string[] {
    // TODO: load GSTN schema and validate with ajv; return field-level errors.
    return [];
  }
}
