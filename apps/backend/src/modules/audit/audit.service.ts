import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Append-only audit trail. UPDATE/DELETE are blocked at the DB level (see RLS migration). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: {
    tenantId: string;
    userId?: string;
    action: 'CREATE' | 'EDIT' | 'APPROVE' | 'DELETE' | 'EXPORT' | 'FILE';
    entity: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string;
    sessionId?: string;
  }) {
    return this.prisma.withTenant(entry.tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          before: entry.before as any,
          after: entry.after as any,
          ipAddress: entry.ipAddress,
          sessionId: entry.sessionId,
        },
      }),
    );
  }

  /** List recent audit entries (newest first), enriched with the acting user. */
  async list(tenantId: string, opts?: { entity?: string; action?: string; limit?: number }) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const logs = await tx.auditLog.findMany({
        where: { entity: opts?.entity || undefined, action: (opts?.action as any) || undefined },
        orderBy: { createdAt: 'desc' },
        take: Math.min(opts?.limit ?? 200, 1000),
      });
      const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean) as string[])];
      const users = userIds.length ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) : [];
      const byId = new Map(users.map((u) => [u.id, u]));
      return logs.map((l) => ({
        id: l.id, action: l.action, entity: l.entity, entityId: l.entityId,
        user: l.userId ? (byId.get(l.userId)?.fullName ?? 'Unknown user') : 'System',
        email: l.userId ? (byId.get(l.userId)?.email ?? null) : null,
        ipAddress: l.ipAddress, sessionId: l.sessionId, createdAt: l.createdAt,
        before: l.before, after: l.after,
      }));
    });
  }

  /** Audit trail as CSV (for compliance export). Records its own EXPORT entry. */
  async exportCsv(tenantId: string, userId?: string) {
    const rows = await this.list(tenantId, { limit: 1000 });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Timestamp', 'User', 'Email', 'Action', 'Entity', 'Entity ID', 'IP Address'];
    const lines = rows.map((r) => [new Date(r.createdAt).toISOString(), r.user, r.email, r.action, r.entity, r.entityId, r.ipAddress].map(esc).join(','));
    await this.record({ tenantId, userId, action: 'EXPORT', entity: 'AuditLog', after: { rows: rows.length } });
    return [header.join(','), ...lines].join('\r\n');
  }
}
