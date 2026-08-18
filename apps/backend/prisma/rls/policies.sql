-- ────────────────────────────────────────────────────────────────────────────
-- Row-Level Security (RLS) for tenant isolation.
-- Run AFTER `prisma migrate` has created the tables:
--     npm run prisma:rls
--
-- Strategy: every tenant-scoped table is filtered by a session variable
-- `app.current_tenant`, which PrismaService.withTenant() sets per request via:
--     SET LOCAL app.current_tenant = '<tenant-uuid>';
--
-- The application connects as a NON-superuser role (DATABASE_APP_ROLE) so that
-- RLS is actually enforced (superusers and BYPASSRLS roles bypass it).
--
-- NOTE: Prisma maps `String` ids to SQL `text`, so the comparison is text = text.
-- This script is idempotent — safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

-- Helper: current tenant from session GUC (returns text to match "tenantId").
-- DROP first because CREATE OR REPLACE cannot change a function's return type.
DROP FUNCTION IF EXISTS app_current_tenant() CASCADE;
CREATE FUNCTION app_current_tenant() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '');
$$ LANGUAGE sql STABLE;

-- ── RLS-exempt connection via role MEMBERSHIP (not the BYPASSRLS attribute) ──
-- The auth/admin connection must read across tenants (email-only login resolves
-- the tenant from a globally-unique email; signup checks global uniqueness).
-- On a superuser DB that role would have BYPASSRLS, but managed serverless
-- Postgres (Neon, Vercel Postgres, Supabase pooled) gives no superuser. Instead
-- we exempt any member of the `gst_bypass` group role: it is DB-enforced (a role
-- can't add itself to a group without admin rights, so the least-privilege
-- runtime role `gst_app` can never escalate) and needs no superuser.
--
-- policies.sql is executed by db:deploy over the privileged DATABASE_URL
-- connection, so CURRENT_USER here is the admin/migration role — we make exactly
-- that role a bypass member. The runtime role (APP_DATABASE_URL → gst_app) is a
-- different user and never gains membership, so RLS stays enforced for it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gst_bypass') THEN
    CREATE ROLE gst_bypass NOLOGIN;
  END IF;
  EXECUTE format('GRANT gst_bypass TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  -- Never fail the deploy on grant quirks; log and continue (on a superuser DB
  -- the admin role bypasses RLS anyway).
  RAISE NOTICE 'gst_bypass setup skipped: %', SQLERRM;
END $$;

-- True when the current connection's role is exempt from tenant filtering.
-- Null-safe: if the gst_bypass role does not exist (e.g. it could not be created
-- on a locked-down provider), this returns false rather than raising — so RLS
-- stays enforced and queries don't error. Referencing the role by OID via the
-- pg_roles subquery avoids pg_has_role() throwing on an unknown role name.
DROP FUNCTION IF EXISTS app_rls_bypass() CASCADE;
CREATE FUNCTION app_rls_bypass() RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT pg_has_role(current_user, oid, 'MEMBER') FROM pg_roles WHERE rolname = 'gst_bypass'),
    false);
$$ LANGUAGE sql STABLE;

-- Apply RLS to every tenant-scoped table.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'organizations',
    'users',
    'parties',
    'bills',
    'bill_line_items',
    'invoices',
    'gst_returns',
    'irns',
    'eway_bills',
    'payments',
    'products',
    'expenses',
    'recurring_profiles',
    'bill_payments',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I;', t);

    -- SELECT/UPDATE/DELETE limited to the current tenant — unless the
    -- connection is an RLS-exempt bypass member (auth/admin/operator).
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_select ON %I
        USING ("tenantId" = app_current_tenant() OR app_rls_bypass());
    $f$, t);

    -- INSERT must target the current tenant (bypass members may write any).
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_insert ON %I
        FOR INSERT WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
    $f$, t);
  END LOOP;
END $$;

-- audit_logs is append-only: block UPDATE and DELETE entirely.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
CREATE OR REPLACE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- NOTE: create the application role (least privilege) once per database:
--   CREATE ROLE gst_app LOGIN PASSWORD 'change_me' NOSUPERUSER NOBYPASSRLS;
--   GRANT USAGE ON SCHEMA public TO gst_app;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gst_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gst_app;
