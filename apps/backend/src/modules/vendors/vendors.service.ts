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
          const bills = await tx.bill.findMany({ where: { partyId: p.id, status: { not: 'CANCELLED' } }, include: { payments: true } });
          const total = bills.reduce((s, b) => s + Number(b.grandTotal), 0);
          const paid = bills.reduce((s, b) => s + b.payments.reduce((ps, pay) => ps + Number(pay.amount), 0), 0);
          return { ...p, total, paid, outstanding: Math.max(0, total - paid) };
        }),
      );
    });
  }

  create(tenantId: string, data: any) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.party.create({ data: { ...data, tenantId } }),
    );
  }

  update(tenantId: string, id: string, data: any) {
    const { id: _i, tenantId: _t, total, paid, outstanding, ...rest } = data ?? {};
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.party.update({ where: { id }, data: rest }),
    );
  }

  remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.party.delete({ where: { id } }));
  }

  /** GSTIN format check (15 chars: 2 state + 10 PAN + entity + Z + checksum). */
  static isValidGstinFormat(gstin: string): boolean {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
  }
}
