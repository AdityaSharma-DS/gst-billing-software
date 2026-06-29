# GST Billing Software

Multi-tenant GST Billing & Compliance SaaS — billing, GST engine, GSTR returns, e-Invoicing/IRN, e-Way Bill, vendor/customer management, subscription/payments, plus a React Native mobile app.

See [spec.md](spec.md) for the full specification (derived from the signed agreement + Annexure A SOW).

## Monorepo layout

```
gst/
├─ apps/
│  ├─ backend/   NestJS + Prisma + PostgreSQL (RLS multi-tenancy)
│  ├─ web/       React + Vite + TypeScript
│  └─ mobile/    React Native (Expo)
├─ packages/
│  └─ shared/    Shared TypeScript types
├─ spec.md       Project specification
└─ Api-docs/     GST / e-Invoice / e-Way Bill API references
```

## Stack (recommended defaults)

| Layer | Choice |
|-------|--------|
| Backend | NestJS (Node 20+), TypeScript |
| ORM / DB | Prisma + PostgreSQL with Row-Level Security |
| Cache/Queue | Redis (planned) |
| Storage | S3 (per-tenant buckets) |
| Web | React 18 + Vite |
| Mobile | React Native + Expo |
| Auth | JWT (role: Admin / Accountant / Viewer) |

> Confirm/lock these at **Milestone 1** (see spec §14 Open Items): payment gateway, cloud provider, FastGST + DSC providers.

## Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis (optional for now)

### 1. Install
```bash
npm install                       # installs all workspaces
cd apps/mobile && npm install     # mobile is outside the workspace set
```

### 2. Configure env
```bash
cp .env.example .env              # fill DATABASE_URL, JWT_SECRET, API creds
cp .env apps/backend/.env         # backend reads its own .env
```

### 3. Database

Local PostgreSQL 17 is already set up on this machine (service `postgresql-x64-17`,
superuser `postgres` / password `postgres`, database `gst_billing`, app role `gst_app`).
`apps/backend/.env` points `DATABASE_URL` at it. To reproduce on another machine:

```sql
-- as superuser:
CREATE DATABASE gst_billing;
CREATE ROLE gst_app LOGIN PASSWORD 'gst_app_pw' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO gst_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gst_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gst_app;
```

Then apply the schema (run from `apps/backend`, or via the root scripts):

```bash
npm run prisma:generate
npm run prisma:migrate            # creates all tables (migration 20260629..._init)
npm --workspace apps/backend run prisma:rls    # applies RLS policies (psql; needs psql on PATH)
npm --workspace apps/backend run seed          # demo tenant: admin@demo.test / admin123
```

> **psql on PATH (Windows):** add `C:\Program Files\PostgreSQL\17\bin` to PATH, or run
> the `prisma/rls/policies.sql` file directly with the full psql path.
>
> **RLS note:** migrations/seed run as the `postgres` superuser (needs DDL rights),
> which *bypasses* RLS. To actually enforce tenant isolation at runtime, point the
> running app at the `gst_app` role — switch `DATABASE_URL` to the value of
> `APP_DATABASE_URL` in `.env` before `npm run dev:backend`.

### 4. Run
```bash
npm run dev:backend               # http://localhost:4000/api
npm run dev:web                   # http://localhost:5173
cd apps/mobile && npm start       # Expo
```

## Multi-tenancy & RLS

Every tenant-scoped table carries `tenantId` and is protected by PostgreSQL RLS.
The backend sets `app.current_tenant` per request via `PrismaService.withTenant(tenantId, …)`,
and the app connects as a non-superuser role so RLS is enforced. See
`apps/backend/prisma/migrations/0001_init_rls/migration.sql`.

## Status

This is a **scaffold / skeleton** aligned to the spec phases. Implemented as runnable
skeletons: auth (JWT + roles), tenant onboarding, bill CRUD with GST calculation,
GSTR-1 draft generation, GSTN/e-Invoice/e-Way Bill client stubs, audit trail (append-only).
Government API calls, returns JSON per GSTN schema, payments, and mobile offline-sync
are stubbed with `TODO`s marking the integration points.
