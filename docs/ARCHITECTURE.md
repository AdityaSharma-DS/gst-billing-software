# Architecture

This document describes how the DONICY GST Billing platform is structured: the
request lifecycle, multi-tenancy model, GST calculation engine, and data model.

## High-level

```
   Web (React/Vite)                Mobile (React Native)
          │  /api (proxy)                 │  /api
          └───────────────┬──────────────┘
                          ▼
                 ┌───────────────────┐        ┌───────────────────────┐
                 │  NestJS API       │───────▶│  GSTN / NIC APIs       │
                 │  (JWT + RLS ctx)  │        │  e-Invoice (IRP),      │
                 └─────────┬─────────┘        │  e-Way Bill, GSTR file │
                           │                  └───────────────────────┘
        ┌──────────────────┼───────────────────┐
        ▼                  ▼                   ▼
   Prisma / RLS        FastGST (rates)     S3 (documents, planned)
        │
        ▼
   PostgreSQL  (tenantId + Row-Level Security)
```

## Request lifecycle

1. **Auth** — the client sends `Authorization: Bearer <jwt>`. `JwtStrategy` validates
   it and attaches `{ id, tenantId, role }` to `req.user`.
2. **Tenant context** — `TenantMiddleware` resolves the tenant id (JWT claim / `x-tenant-id`)
   onto `req.tenantId`; the `@CurrentTenant()` decorator injects it into controllers.
3. **Authorization** — `JwtAuthGuard` protects data routes; `RolesGuard` + `@Roles()`
   restrict writes to Admin/Accountant.
4. **Data access** — services call `PrismaService.withTenant(tenantId, tx => …)`, which
   opens a transaction and runs `SET LOCAL app.current_tenant = '<id>'` so Postgres RLS
   filters every query to that tenant.

## Multi-tenancy (Row-Level Security)

- Every tenant-scoped table has a `tenantId` column.
- `apps/backend/prisma/rls/policies.sql` enables `ROW LEVEL SECURITY` + `FORCE ROW LEVEL
  SECURITY` on those tables and adds two policies each:
  - `tenant_isolation_select` — `USING ("tenantId" = app_current_tenant())`
  - `tenant_isolation_insert` — `WITH CHECK ("tenantId" = app_current_tenant())`
- `app_current_tenant()` reads the `app.current_tenant` session GUC (returns `text` to
  match Prisma's `String`→`text` mapping).
- **Enforcement requires a non-superuser role.** Superusers bypass RLS. Run the app with
  `APP_DATABASE_URL` (the `gst_app` role, `NOSUPERUSER NOBYPASSRLS`). Migrations/seed use
  the superuser because they need DDL rights.
- `audit_logs` is additionally **append-only**: `UPDATE`/`DELETE` are revoked and blocked
  by rules.

## GST calculation engine

`apps/backend/src/modules/gst/gst.service.ts` (unit-tested in `gst.service.spec.ts`):

- **Intra-state** (supplier state == place of supply) → split GST into **CGST + SGST**
  (rate / 2 each; rounding remainder absorbed into SGST).
- **Inter-state** → full **IGST**.
- Per-line rounding to 2 decimals; CESS supported; bill totals aggregated in
  `BillsService.create`.

Example: ₹10,000 @ 18% intra-state → CGST ₹900 + SGST ₹900; inter-state → IGST ₹1,800.

## Data model (Prisma)

18 models in `apps/backend/prisma/schema.prisma`. Core groups:

- **Tenancy/Identity:** `Tenant`, `Organization`, `User` (roles)
- **Master data:** `Party` (vendor/customer)
- **Billing:** `Bill`, `BillLineItem`, `Invoice`
- **Tax & returns:** `TaxRate`, `GstReturn`
- **e-Invoicing:** `Irn`, `EWayBill`
- **Billing/SaaS:** `Plan`, `Subscription`, `Payment`
- **Compliance:** `AuditLog` (append-only)

Money uses `Decimal(14,2)`; ids are UUID strings; enums model bill status
(`DRAFT → APPROVED → VERIFIED → FINALIZED → CANCELLED`) and return types (GSTR1..9).

## Backend modules

| Module | Responsibility |
|--------|----------------|
| `auth` | Login, JWT strategy, password hashing |
| `tenants` | Onboarding (tenant + admin + organization) |
| `bills` | Bill/invoice CRUD, invokes the GST engine |
| `gst` | Tax computation |
| `returns` | GSTR generation + JSON (per GSTN schema — WIP) |
| `vendors` | Party master + per-client totals |
| `gstn` | NIC/GSTN auth, e-Invoice (IRN), e-Way Bill clients |
| `dashboard` | Aggregated KPIs + recent orders |
| `reports` | Profit & Loss, receivables |
| `subscriptions` | Plans/subscriptions (WIP) |
| `audit` | Append-only audit trail |

## Frontend

- **React + Vite + TypeScript**, TanStack Query for server state.
- `src/lib/api.ts` — axios instance; attaches JWT + `x-tenant-id`; 401 → logout.
- `src/styles/tokens.css` — design tokens extracted from the DONICY design (Inter,
  accent `#F68820`, GST bill-status colors).
- Route guard `RequireAuth` gates the app shell; `Layout` provides sidebar + topbar.

## Known gaps / next

- Switch runtime to `gst_app` and add a cross-tenant isolation test.
- Implement GSTN-schema JSON + real filing; wire e-Invoice/e-Way Bill sandbox.
- Payments (Razorpay/PayU/Stripe) + webhooks.
- Mobile offline sync + barcode.
