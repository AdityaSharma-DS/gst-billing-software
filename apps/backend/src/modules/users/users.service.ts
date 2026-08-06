import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER'] as const;
type Role = (typeof ROLES)[number];

const publicUser = (u: any) => ({
  id: u.id, email: u.email, fullName: u.fullName, role: u.role,
  isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string) {
    const users = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({ orderBy: { createdAt: 'asc' } }),
    );
    return users.map(publicUser);
  }

  async create(tenantId: string, input: { email: string; fullName: string; password: string; role: Role }, actorId?: string) {
    if (!input.email?.trim() || !input.fullName?.trim()) throw new BadRequestException('Name and email are required');
    if (!input.password || input.password.length < 6) throw new BadRequestException('Password must be at least 6 characters');
    if (!ROLES.includes(input.role)) throw new BadRequestException('Invalid role');

    const existing = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findUnique({ where: { tenantId_email: { tenantId, email: input.email.trim().toLowerCase() } } }),
    );
    if (existing) throw new BadRequestException('A user with this email already exists');

    const user = await this.prisma.withTenant(tenantId, async (tx) =>
      tx.user.create({
        data: {
          tenantId,
          email: input.email.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          passwordHash: await bcrypt.hash(input.password, 10),
          role: input.role,
        },
      }),
    );
    await this.audit.record({ tenantId, userId: actorId, action: 'CREATE', entity: 'User', entityId: user.id, after: { email: user.email, role: user.role } });
    return publicUser(user);
  }

  async update(tenantId: string, id: string, input: { fullName?: string; role?: Role; isActive?: boolean; password?: string }, actorId?: string) {
    const user = await this.prisma.withTenant(tenantId, (tx) => tx.user.findUnique({ where: { id } }));
    if (!user) throw new NotFoundException('User not found');

    // Guard: never demote/deactivate the last active admin.
    const losingAdmin = user.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || input.isActive === false);
    if (losingAdmin) {
      const admins = await this.prisma.withTenant(tenantId, (tx) =>
        tx.user.count({ where: { role: 'ADMIN', isActive: true } }),
      );
      if (admins <= 1) throw new BadRequestException('Cannot demote or deactivate the last active admin');
    }
    if (input.role && !ROLES.includes(input.role)) throw new BadRequestException('Invalid role');
    if (input.password && input.password.length < 6) throw new BadRequestException('Password must be at least 6 characters');

    const updated = await this.prisma.withTenant(tenantId, async (tx) =>
      tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName ?? undefined,
          role: input.role ?? undefined,
          isActive: input.isActive ?? undefined,
          passwordHash: input.password ? await bcrypt.hash(input.password, 10) : undefined,
        },
      }),
    );
    await this.audit.record({ tenantId, userId: actorId, action: 'EDIT', entity: 'User', entityId: id, before: { role: user.role, isActive: user.isActive }, after: { role: updated.role, isActive: updated.isActive } });
    return publicUser(updated);
  }
}
