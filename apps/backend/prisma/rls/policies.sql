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

    -- SELECT/UPDATE/DELETE limited to the current tenant.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_select ON %I
        USING ("tenantId" = app_current_tenant());
    $f$, t);

    -- INSERT must target the current tenant.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_insert ON %I
        FOR INSERT WITH CHECK ("tenantId" = app_current_tenant());
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
