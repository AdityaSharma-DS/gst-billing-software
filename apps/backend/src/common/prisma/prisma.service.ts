import { BadRequestException, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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
 * APP_DATABASE_URL → gst_app (runtime). DATABASE_URL → privileged (migrations,
 * admin client). In development APP_DATABASE_URL may be omitted and we fall back
 * to DATABASE_URL for convenience — but in production that fallback would run
 * tenant queries as the privileged role and silently BYPASS RLS, leaking data
 * across tenants. So we refuse to boot in production without APP_DATABASE_URL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly admin: PrismaClient;
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly log = new Logger('PrismaService');

  constructor() {
    PrismaService.assertTenantIsolation();
    super({ datasources: { db: { url: process.env.APP_DATABASE_URL || process.env.DATABASE_URL } } });
    this.admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  }

  /**
   * Fail fast rather than silently disable multi-tenant isolation. In any
   * production-like environment the runtime connection MUST use a distinct,
   * NOBYPASSRLS role (APP_DATABASE_URL) — otherwise RLS is bypassed and tenants
   * can read each other's data.
   */
  private static assertTenantIsolation() {
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    if (isProd && !process.env.APP_DATABASE_URL) {
      throw new Error(
        'FATAL: APP_DATABASE_URL is not set in a production environment. The app ' +
          'would connect as the privileged DATABASE_URL role and BYPASS Row-Level ' +
          'Security, exposing every tenant to every other tenant. Set APP_DATABASE_URL ' +
          'to a NOBYPASSRLS role (see VERCEL_DEPLOY.md → "two-role database").',
      );
    }
    if (!process.env.APP_DATABASE_URL) {
      PrismaService.log.warn(
        'APP_DATABASE_URL not set — using DATABASE_URL for runtime queries. RLS is ' +
          'only enforced when the runtime role is NOBYPASSRLS. Acceptable for local dev only.',
      );
    }
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
    
    // Defence in depth: this comes from a verified JWT claim, but it is
    // interpolated into a session setting, so validate the shape before it
    // ever reaches SQL. This previously used $executeRawUnsafe (injectable).
    if (!PrismaService.UUID_RE.test(tenantId)) {
      throw new BadRequestException('Invalid tenant context');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}
