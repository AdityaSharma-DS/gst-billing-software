import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Two connections, so tenant isolation does not depend on trusting the app code:
 *  - the default client connects as the least-privilege `gst_app` role
 *    (NOBYPASSRLS), so every tenant-scoped query is filtered by PostgreSQL
 *    Row-Level Security. `withTenant` sets `app.current_tenant` for the txn.
 *  - `admin` connects as the privileged role (BYPASSRLS) and is used ONLY for
 *    cross-tenant operator work and for auth lookups that happen before a tenant
 *    context exists (login/registration). Never expose it to tenant requests.
 *
 * APP_DATABASE_URL → gst_app (runtime). DATABASE_URL → superuser (migrations,
 * admin client). If APP_DATABASE_URL is unset we fall back to DATABASE_URL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly admin: PrismaClient;

  constructor() {
    super({ datasources: { db: { url: process.env.APP_DATABASE_URL || process.env.DATABASE_URL } } });
    this.admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  }

  async onModuleInit() {
    await this.$connect();
    await this.admin.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.admin.$disconnect();
  }

  /**
   * Run a callback with the tenant RLS context set for the connection.
   * Uses a transaction so the SET LOCAL is scoped to these queries.
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
