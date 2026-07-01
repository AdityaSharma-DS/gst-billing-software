import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, type?: 'VENDOR' | 'CUSTOMER') {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const parties = await tx.party.findMany({ where: type ? { type } : {}, orderBy: { name: 'asc' } });
      // Attach billing totals per party (outgoing for customers, incoming for vendors).
      return Promise.all(
        parties.map(async (p) => {
          const bills = await tx.bill.findMany({ where: { partyId: p.id } });
          const total = bills.reduce((s, b) => s + Number(b.grandTotal), 0);
          const paid = bills
            .filter((b) => b.status === 'FINALIZED')
            .reduce((s, b) => s + Number(b.grandTotal), 0);
          return { ...p, total, paid, outstanding: total - paid };
        }),
      );
    });
  }

  create(tenantId: string, data: any) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.party.create({ data: { ...data, tenantId } }),
    );
  }

  /** GSTIN format check (15 chars: 2 state + 10 PAN + entity + Z + checksum). */
  static isValidGstinFormat(gstin: string): boolean {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
  }
}
