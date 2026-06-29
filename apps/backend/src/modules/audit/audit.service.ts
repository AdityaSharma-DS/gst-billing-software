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
}
