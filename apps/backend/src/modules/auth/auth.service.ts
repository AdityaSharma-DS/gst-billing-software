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
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new UnauthorizedException('Invalid tenant');

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
