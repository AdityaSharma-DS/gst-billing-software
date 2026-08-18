# Deploying DONICY to Vercel

The repo is configured for a **single Vercel project** that serves the React app
and runs the NestJS API as a serverless function (`api/index.ts`). The root
[`vercel.json`](vercel.json) wires it together; `npm run vercel-build` generates
the Prisma client, applies migrations **and RLS policies**, then builds both apps.

> **Read this whole file before your first deploy.** One env var
> (`APP_DATABASE_URL`) is the difference between proper tenant isolation and a
> cross-tenant data leak. The app now **refuses to boot in production without
> it** (see `PrismaService.assertTenantIsolation`), so a missing value fails the
> deploy loudly instead of leaking silently.

---

## 1. Provision Postgres + create the runtime role

Use any managed Postgres — **Neon, Vercel Postgres, Supabase, Railway, RDS**.
**No superuser is required.** Tenant isolation uses two *connections*:

| Connection         | Env var            | Role                     | Used for                              |
|--------------------|--------------------|--------------------------|---------------------------------------|
| privileged / owner | `DATABASE_URL`     | your DB's default owner  | migrations + auth/operator (RLS-exempt) |
| runtime            | `APP_DATABASE_URL` | `gst_app` (you create)   | every tenant request (RLS-enforced)   |

The owner is made **RLS-exempt automatically** by `db:deploy` — it adds the
owner to a `gst_bypass` group role and the policies exempt that group. This
replaces the older `BYPASSRLS` requirement, so it works on providers that give
no superuser (Neon, Vercel Postgres). You only need to create the least-
privilege runtime role.

After the **first deploy** has created the tables (migrations run as the owner),
connect **as the owner** (Neon/Vercel Postgres/Supabase all have an SQL console)
and run once:

```sql
-- Least-privilege runtime role. It is NOT a gst_bypass member, so RLS is
-- enforced for every query it makes.
CREATE ROLE gst_app WITH LOGIN PASSWORD 'CHANGE_ME_STRONG' NOSUPERUSER NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO gst_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gst_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gst_app;

-- Apply to tables created by future migrations too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gst_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gst_app;
```

> The `gst_app` connection string is the same host/database as `DATABASE_URL` —
> only the **user/password** differ. Append `?sslmode=require` if your provider
> needs it (most managed ones do). Keep `?schema=public` if your `DATABASE_URL`
> has it.
>
> **Why isolation holds:** the RLS policies allow a row only when
> `"tenantId" = app.current_tenant` **or** the connection is a `gst_bypass`
> member. `gst_app` is never a member (it can't add itself — no role-admin
> rights), so it sees only the tenant set by `withTenant()`, and nothing at all
> when no tenant is set. Verified: a `gst_app` connection with no tenant context
> returns **0** rows.

---

## 2. Import the repo into Vercel

1. Vercel dashboard → **Add New… → Project** → import
   `AdityaSharma-DS/gst-billing-software`.
2. **Root Directory:** leave as the repo root (`.`). The root `vercel.json`
   drives the build — do **not** set it to `apps/web`.
3. Framework preset: **Other** (the `buildCommand`/`outputDirectory` in
   `vercel.json` take over).
4. Don't deploy yet — set env vars first (next step).

---

## 3. Environment variables (Project → Settings → Environment Variables)

Set these for **Production** (and Preview if you use it):

| Variable            | Value                                                        | Notes |
|---------------------|-------------------------------------------------------------|-------|
| `DATABASE_URL`      | owner/superuser connection string                           | migrations + admin client |
| `APP_DATABASE_URL`  | `gst_app` connection string (same DB, `NOBYPASSRLS` role)   | **required** — runtime tenant queries |
| `JWT_SECRET`        | long random string                                          | signs auth tokens |
| `NODE_ENV`          | `production`                                                 | Vercel usually sets this; set explicitly to be safe |
| `API_PREFIX`        | `api` (optional; default is `api`)                          | must stay `api` to match `vercel.json` rewrites |

Optional (WhiteBooks GSP e-invoice / e-way bill — can be left blank and
configured later in the master admin panel): `WHITEBOOKS_*` are stored in the DB
via the platform settings, not env, so nothing extra is required here.

> Both DB URLs point at the **same database** — they differ only in the **role**
> (and therefore the privilege). `sslmode=require` is usually needed for managed
> Postgres; append it to both URLs if your provider requires it.

---

## 4. Deploy

Click **Deploy** (or push to `main` if the repo is already connected — every
push to `main` triggers a production build).

`vercel-build` will, in order:
1. `prisma generate` (with the `rhel-openssl-3.0.x` engine target for Vercel)
2. `prisma migrate deploy` — apply all migrations
3. `prisma db execute prisma/rls/policies.sql` — (re)apply RLS policies
4. build the NestJS backend → `apps/backend/dist`
5. build the React app → `apps/web/dist`

If `APP_DATABASE_URL` is missing, the function throws on first boot with the
`FATAL: APP_DATABASE_URL is not set…` message — that's the guard working.

---

## 5. Verify tenant isolation after deploy

1. Register two businesses (`/register`) with different emails.
2. Add a client under each.
3. Confirm each login sees **only its own** client. If a new tenant sees another
   tenant's data, `APP_DATABASE_URL` is wrong (pointing at a BYPASSRLS role) —
   fix the role/URL and redeploy.

---

## Known limitation: file storage is ephemeral on serverless

`StorageService` writes to `/tmp` on Vercel (`storage.service.ts`). On-demand
invoice PDF generation works, but **archived PDFs and uploaded logos do not
persist** across function invocations. For durable records, move storage to
object storage (Vercel Blob or S3) and update `StorageService`. Until then,
treat PDFs as generate-on-download, not as a stored archive.

If you need durable storage and a persistent connection today, a persistent host
(Railway/VPS — see `DEPLOYMENT.md`) fits the two-role + local-disk model without
this caveat.
