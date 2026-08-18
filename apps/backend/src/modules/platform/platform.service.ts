import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';

const GST_CONFIG_KEY = 'gst_api_config';

// Platform queries run without tenant context by design (operator scope).
// Note: if the app is switched to the RLS-enforcing `gst_app` role, the platform
// module needs a connection with BYPASSRLS (or its own role) to see all tenants.
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  // ── Auth ──
  async login(email: string, password: string) {
    const admin = await this.prisma.admin.platformAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.admin.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    return {
      accessToken: await this.jwt.signAsync({ sub: admin.id, email: admin.email, scope: 'platform' }, { expiresIn: '8h' }),
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName },
    };
  }

  // ── Overview ──
  async overview() {
    const [tenants, active, suspended, subs, plans] = await Promise.all([
      this.prisma.admin.tenant.count(),
      this.prisma.admin.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.admin.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.admin.subscription.findMany({ include: { plan: true }, where: { status: { in: ['ACTIVE', 'TRIALING'] } } }),
      this.prisma.admin.plan.count({ where: { isActive: true } }),
    ]);
    // Monthly recurring revenue normalized to months.
    const mrr = subs.reduce((s, x) => {
      const price = Number(x.plan.priceInr);
      return s + (x.plan.interval === 'YEARLY' ? price / 12 : x.plan.interval === 'QUARTERLY' ? price / 3 : price);
    }, 0);
    return { tenants, active, suspended, activeSubscriptions: subs.length, plans, mrr: Math.round(mrr) };
  }

  // ── Tenants / licenses ──
  async tenants() {
    const list = await this.prisma.admin.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        organizations: { take: 1 },
        subscription: { include: { plan: true } },
        _count: { select: { users: true, bills: true } },
      },
    });
    return list.map((t) => ({
      id: t.id, name: t.name, slug: t.slug, status: t.status, createdAt: t.createdAt,
      organization: t.organizations[0]?.legalName ?? null,
      gstin: t.organizations[0]?.gstin ?? null,
      users: t._count.users, bills: t._count.bills,
      plan: t.subscription?.plan?.name ?? null,
      subscriptionStatus: t.subscription?.status ?? null,
      licenseExpiry: t.subscription?.currentPeriodEnd ?? null,
    }));
  }

  async setTenantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED') {
    if (!['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.admin.tenant.update({ where: { id }, data: { status } });
  }

  /** Assign a plan / extend the license. months defaults to the plan interval. */
  async assignSubscription(tenantId: string, planId: string, months?: number) {
    const plan = await this.prisma.admin.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const tenant = await this.prisma.admin.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const span = months ?? (plan.interval === 'YEARLY' ? 12 : plan.interval === 'QUARTERLY' ? 3 : 1);
    // Extend from the current expiry when still in the future; otherwise from now.
    const base = tenant.subscription?.currentPeriodEnd && tenant.subscription.currentPeriodEnd > new Date()
      ? tenant.subscription.currentPeriodEnd : new Date();
    const end = new Date(base); end.setMonth(end.getMonth() + span);

    return this.prisma.admin.subscription.upsert({
      where: { tenantId },
      create: { tenantId, planId, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: end },
      update: { planId, status: 'ACTIVE', currentPeriodEnd: end },
      include: { plan: true },
    });
  }

  // ── Plans ──
  listPlans() {
    return this.prisma.admin.plan.findMany({ orderBy: { priceInr: 'asc' } });
  }

  savePlan(data: { id?: string; name: string; interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; priceInr: number; trialDays?: number; limits?: any; isActive?: boolean }) {
    if (!data.name?.trim()) throw new BadRequestException('Plan name required');
    const payload = {
      name: data.name.trim(), interval: data.interval, priceInr: data.priceInr,
      trialDays: data.trialDays ?? 0, limits: data.limits ?? undefined, isActive: data.isActive ?? true,
    };
    return data.id
      ? this.prisma.admin.plan.update({ where: { id: data.id }, data: payload })
      : this.prisma.admin.plan.create({ data: payload });
  }

  // ── GST API configuration (platform-wide) ──
  async getGstConfig() {
    const row = await this.prisma.admin.platformSetting.findUnique({ where: { key: GST_CONFIG_KEY } });
    const defaults = {
      // WhiteBooks GSP — one Client ID/Secret pair covers e-Invoice, e-Way Bill,
      // GSTR filing, GSTR-2B and Payment APIs.
      provider: 'whitebooks',
      environment: 'sandbox',            // sandbox | production
      baseUrl: 'https://api.whitebooks.in',
      email: '',                         // WhiteBooks account email
      clientId: '',                      // sandbox GSTS... / production GSTP...
      clientSecret: '',
      ipAddress: '',                     // public IP whitelisted with NIC/GSP
      fastGstUrl: '', fastGstApiKey: '',
    };
    // Merge so newly-added keys appear even for configs saved under the old shape.
    return { ...defaults, ...((row?.value as object) ?? {}) };
  }

  /** Never expose the client secret to the browser; report only whether it's set. */
  async getGstConfigMasked() {
    const cfg: any = await this.getGstConfig();
    return { ...cfg, clientSecret: cfg.clientSecret ? '********' : '', clientSecretSet: !!cfg.clientSecret };
  }

  async setGstConfig(value: any) {
    const existing: any = await this.getGstConfig();
    // If the UI sends the masked placeholder, keep the stored secret.
    const merged = { ...existing, ...value };
    if (!value?.clientSecret || value.clientSecret === '********') merged.clientSecret = existing.clientSecret ?? '';
    await this.prisma.admin.platformSetting.upsert({
      where: { key: GST_CONFIG_KEY },
      create: { key: GST_CONFIG_KEY, value: merged },
      update: { value: merged },
    });
    return { saved: true };
  }
}
