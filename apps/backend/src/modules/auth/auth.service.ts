import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

interface RegisterInput {
  businessName: string; fullName: string; email: string; password: string;
  gstin?: string; stateCode?: string; phone?: string;
}

/** Current Indian financial year, e.g. "2026-27" (starts in April). */
function currentFinancialYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shop';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Self-serve signup: creates a tenant + organization + admin user + 14-day trial. */
  async register(dto: RegisterInput) {
    const email = dto.email.trim().toLowerCase();
    if (!dto.businessName?.trim()) throw new ConflictException('Business name is required');
    if ((dto.password ?? '').length < 6) throw new ConflictException('Password must be at least 6 characters');

    const existing = await this.prisma.admin.user.findFirst({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists — please sign in.');

    // Unique tenant slug from the business name.
    const base = slugify(dto.businessName);
    let slug = base;
    for (let i = 2; await this.prisma.admin.tenant.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

    const tenant = await this.prisma.admin.tenant.create({ data: { name: dto.businessName.trim(), slug, status: 'ACTIVE' } });
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const shortCode = (dto.businessName.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()) || 'INV';

    const user = await this.prisma.withTenant(tenant.id, async (tx) => {
      await tx.organization.create({
        data: {
          tenantId: tenant.id, legalName: dto.businessName.trim(), tradeName: dto.businessName.trim(),
          gstin: dto.gstin?.trim() || null, stateCode: dto.stateCode || null,
          taxRegime: dto.gstin?.trim() ? 'REGULAR' : 'UNREGISTERED',
          financialYear: currentFinancialYear(), invoiceShortCode: shortCode,
          email, phone: dto.phone?.trim() || null,
        },
      });
      return tx.user.create({
        data: { tenantId: tenant.id, email, passwordHash, fullName: dto.fullName?.trim() || email, role: 'ADMIN', isActive: true },
      });
    });

    // Optional 14-day trial on the cheapest active plan (if any are configured).
    const plan = await this.prisma.admin.plan.findFirst({ where: { isActive: true }, orderBy: { priceInr: 'asc' } });
    if (plan) {
      const end = new Date(); end.setDate(end.getDate() + 14);
      await this.prisma.admin.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'TRIALING', currentPeriodStart: new Date(), currentPeriodEnd: end },
      });
    }

    const payload = { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, tenantId: user.tenantId },
      tenantSlug: slug,
    };
  }

  async validateAndLogin(tenantSlug: string | undefined, email: string, password: string) {
    email = email.trim().toLowerCase();
    let tenant;
    if (tenantSlug?.trim()) {
      tenant = await this.prisma.admin.tenant.findUnique({ where: { slug: tenantSlug.trim() }, include: { subscription: true } });
    } else {
      // Email-only login: resolve the tenant from the (globally unique) email.
      const matches = await this.prisma.admin.user.findMany({ where: { email }, take: 2 });
      if (matches.length === 0) throw new UnauthorizedException('Invalid credentials');
      if (matches.length > 1) throw new UnauthorizedException('This email is used by more than one organization — include your organization name.');
      tenant = await this.prisma.admin.tenant.findUnique({ where: { id: matches[0].tenantId }, include: { subscription: true } });
    }
    if (!tenant) throw new UnauthorizedException('Invalid tenant');

    // License enforcement (managed from the master admin panel).
    if (tenant.status === 'SUSPENDED') throw new UnauthorizedException('This account is suspended. Please contact support.');
    if (tenant.status === 'CLOSED') throw new UnauthorizedException('This account is closed.');
    if (tenant.subscription?.currentPeriodEnd && tenant.subscription.currentPeriodEnd < new Date() && tenant.subscription.status !== 'TRIALING') {
      throw new UnauthorizedException('Your subscription has expired. Please renew your license.');
    }

    const user = await this.prisma.admin.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.admin.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, tenantId: user.tenantId },
    };
  }

  static hashPassword(plain: string) {
    return bcrypt.hash(plain, 10);
  }
}
