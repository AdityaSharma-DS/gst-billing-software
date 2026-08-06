import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateAndLogin(tenantSlug: string, email: string, password: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug }, include: { subscription: true } });
    if (!tenant) throw new UnauthorizedException('Invalid tenant');

    // License enforcement (managed from the master admin panel).
    if (tenant.status === 'SUSPENDED') throw new UnauthorizedException('This account is suspended. Please contact support.');
    if (tenant.status === 'CLOSED') throw new UnauthorizedException('This account is closed.');
    if (tenant.subscription?.currentPeriodEnd && tenant.subscription.currentPeriodEnd < new Date() && tenant.subscription.status !== 'TRIALING') {
      throw new UnauthorizedException('Your subscription has expired. Please renew your license.');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
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
