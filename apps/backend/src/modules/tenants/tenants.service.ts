import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Onboard a new tenant + first admin user + organization shell. */
  async onboard(input: {
    tenantName: string;
    slug: string;
    adminEmail: string;
    adminPassword: string;
    adminName: string;
    legalName: string;
    gstin?: string;
    financialYear: string;
  }) {
    const passwordHash = await AuthService.hashPassword(input.adminPassword);
    return this.prisma.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.slug,
        users: {
          create: {
            email: input.adminEmail,
            passwordHash,
            fullName: input.adminName,
            role: 'ADMIN',
          },
        },
        organizations: {
          create: {
            legalName: input.legalName,
            gstin: input.gstin,
            financialYear: input.financialYear,
          },
        },
      },
      include: { organizations: true },
    });
  }
}
