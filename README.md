# DONICY — GST Billing Software

> Multi-tenant **GST Billing & Compliance SaaS** for Indian businesses — billing, a GST tax engine, full GSTR return generation, e-Invoicing (IRN), e-Way Bill, vendor/customer management, subscriptions, and a React Native mobile app.

<p>
  <img alt="stack" src="https://img.shields.io/badge/backend-NestJS-e0234e">
  <img alt="db" src="https://img.shields.io/badge/db-PostgreSQL%20(RLS)-336791">
  <img alt="web" src="https://img.shields.io/badge/web-React%20%2B%20Vite-61dafb">
  <img alt="mobile" src="https://img.shields.io/badge/mobile-React%20Native-000">
  <img alt="license" src="https://img.shields.io/badge/license-Proprietary-red">
</p>

The product brand is **DONICY**. GST filing is designed to be **automated via the GSTN APIs** (no auditor in the loop). This repository is a monorepo containing the backend API, web app, mobile app, and shared types.

📄 Full specification: [`spec.md`](spec.md) · 🎨 Design system: [`design/design-system.md`](design/design-system.md) · 🏛 Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · 🔌 API reference: [`docs/API.md`](docs/API.md)

---

## Table of contents
- [Features](#features)
- [Tech stack](#tech-stack)
- [Monorepo layout](#monorepo-layout)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database & multi-tenancy](#database--multi-tenancy)
- [Running the apps](#running-the-apps)
- [API overview](#api-overview)
- [Project status](#project-status)
- [Security](#security)
- [License](#license)

---

## Features

**Implemented (web + API, wired end-to-end):**
- 🔐 **Auth** — JWT login, roles (Admin / Accountant / Viewer), route guards, 401→login
- 🏠 **Dashboard** — KPI cards, monthly sales chart, target gauge, recent orders (live)
- 👥 **Clients** — list with Total / Paid / Outstanding + add-client modal
- 🧾 **New Invoice** — General Invoice / Credit Note / Delivery Challan, line items, live GST preview, persists to the API
- 📊 **Reports** — Profit & Loss statement + outstanding receivables (computed)
- 🧮 **GST engine** — CGST/SGST (intra-state) vs IGST (inter-state), per-line tax, unit-tested
- 📁 **GST Returns** — GSTR-1 / 3B / Reconciliation / TDS-TCS tabs, B2B/B2CL/B2CS/CDNR, JSON export
- 🏢 **Multi-tenancy** — PostgreSQL Row-Level Security keyed on `tenantId`
- 📜 **Audit trail** — append-only (DB-enforced)

**Scaffolded / stubbed** (integration points marked with `TODO`):
- GSTN / NIC **e-Invoice (IRN)** and **e-Way Bill** clients (token caching for 1h/6h TTL)
- GSTN-schema **return JSON** generation & filing
- **Subscriptions & payments** (Razorpay/PayU/Stripe)
- **Mobile app** (bill entry, offline sync, barcode) — Expo skeleton
- Additional screens: Recurring Clients, Expenses, Purchases, Receipts, Settings

See [Project status](#project-status) for the phase-by-phase breakdown.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Backend | **NestJS** (Node 20+), TypeScript |
| ORM / DB | **Prisma** + **PostgreSQL** with Row-Level Security |
| Web | **React 18** + **Vite** + TypeScript + TanStack Query |
| Mobile | **React Native** (Expo) |
| Auth | JWT (roles: Admin / Accountant / Viewer) |
| Design | DONICY design system — Inter, accent `#F68820` (see `design/`) |
| Cache/Queue | Redis (planned) |
| Storage | S3, per-tenant buckets (planned) |

---

## Monorepo layout

```
gst/
├─ apps/
│  ├─ backend/     NestJS API + Prisma schema + RLS policies
│  │  ├─ prisma/   schema.prisma · migrations/ · rls/policies.sql · seed.ts
│  │  └─ src/
│  │     ├─ common/    prisma, tenancy (RLS middleware), auth guards
│  │     └─ modules/   auth, tenants, bills, gst, returns, vendors,
│  │                   gstn, dashboard, reports, subscriptions, audit
│  ├─ web/         React + Vite SPA (DONICY UI)
│  │  └─ src/      pages/ · components/ · lib/api.ts · styles/tokens.css
│  └─ mobile/      React Native (Expo) skeleton
├─ packages/
│  └─ shared/      Shared TypeScript types
├─ design/         Design system source (HTML) + design-system.md
├─ docs/           ARCHITECTURE.md · API.md
├─ Api-docs/       GST / e-Invoice / e-Way Bill API references
└─ spec.md         Full project specification
```

---

## Quick start

### Prerequisites
- **Node.js 20+**
- **PostgreSQL 15+** (17 recommended)
- `psql` on `PATH` (Windows: add `C:\Program Files\PostgreSQL\17\bin`)

### 1. Install
```bash
npm install                       # installs all workspaces
cd apps/mobile && npm install     # mobile is outside the workspace set
```

### 2. Configure environment
```bash
cp .env.example .env              # fill DATABASE_URL, JWT_SECRET, API creds
cp .env apps/backend/.env         # the backend reads its own .env
```
See [Environment variables](#environment-variables).

### 3. Create the database
```sql
-- as the postgres superuser:
CREATE DATABASE gst_billing;
CREATE ROLE gst_app LOGIN PASSWORD 'gst_app_pw' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO gst_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gst_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gst_app;
```

### 4. Apply schema, RLS, and seed data
```bash
npm run prisma:generate
npm run prisma:migrate                          # creates all tables
npm --workspace apps/backend run prisma:rls     # applies RLS policies (needs psql)
npm --workspace apps/backend run seed           # demo data
```

### 5. Run
```bash
npm run dev:backend     # http://localhost:4000/api
npm run dev:web         # http://localhost:5173
```

**Demo login:** organization `demo` · `admin@demo.test` · `admin123`

---

## Environment variables

Copy `.env.example` → `.env` (and to `apps/backend/.env`). Key entries:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (migrations/seed use the superuser) |
| `APP_DATABASE_URL` | Least-privilege `gst_app` role — use this at runtime to **enforce RLS** |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth token signing |
| `EINVOICE_*`, `EWAYBILL_*`, `GSTN_API_*` | Government API credentials (client-provided) |
| `FASTGST_API_*` | Real-time GST rate lookup |
| `PAYMENT_PROVIDER`, `RAZORPAY_*` | Subscription payments |
| `S3_*`, `REDIS_URL`, `SMTP_*` | Storage, cache, notifications |

> Infrastructure and third-party API costs are the client's responsibility per the development agreement (§10).

---

## Database & multi-tenancy

Every tenant-scoped table carries a `tenantId` and is protected by **PostgreSQL Row-Level Security**. The backend sets `app.current_tenant` per request via `PrismaService.withTenant(tenantId, …)`; when the app connects as the non-superuser `gst_app` role, RLS is enforced automatically.

- Schema: [`apps/backend/prisma/schema.prisma`](apps/backend/prisma/schema.prisma) (18 models)
- RLS policies: [`apps/backend/prisma/rls/policies.sql`](apps/backend/prisma/rls/policies.sql)
- Deep dive: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

> ⚠️ Migrations/seed run as the `postgres` superuser (needs DDL), which **bypasses RLS**. For real tenant isolation at runtime, point the running backend at `APP_DATABASE_URL` (the `gst_app` role).

---

## Running the apps

| App | Command | URL |
|-----|---------|-----|
| Backend API | `npm run dev:backend` | http://localhost:4000/api |
| Web | `npm run dev:web` | http://localhost:5173 |
| Mobile | `cd apps/mobile && npm start` | Expo |

The web dev server proxies `/api` → `:4000` (see `apps/web/vite.config.ts`).

---

## API overview

All data routes require `Authorization: Bearer <jwt>` and are tenant-scoped. Full reference: [`docs/API.md`](docs/API.md).

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/dashboard/summary` | KPIs + recent orders |
| GET/POST | `/api/parties` | Clients/vendors (list incl. totals; create) |
| GET/POST | `/api/bills` | Invoices/bills (list; create with GST calc) |
| GET | `/api/reports/pnl` · `/receivables` | P&L + receivables |
| GET/POST | `/api/returns` · `/returns/generate` | GST returns + JSON generation |
| POST | `/api/tenants/onboard` | Tenant + admin + org onboarding |

---

## Project status

| Phase | Area | Status |
|-------|------|--------|
| 0 | Architecture, DB schema, RLS, CI scaffolding | ✅ |
| 1 | Design system (DONICY) → web tokens/components | ✅ |
| 2 | Auth, Bills + GST engine, Dashboard, Multi-tenancy | ✅ |
| 3 | GSTR returns, JSON export, compliance dashboard | 🟡 partial (GSTR-1 draft + UI) |
| 4 | Mobile app, vendor mgmt, bulk import | 🟡 vendors done; mobile skeleton |
| 5 | e-Invoicing/IRN, e-Way Bill, subscriptions/payments | 🟡 client stubs |
| 6 | Testing, UAT, deployment | ⬜ pending |

---

## Security

- Secrets live in `.env` (gitignored) — never commit real credentials.
- JWT auth + role guards; append-only audit log.
- RLS for tenant isolation (enable via `APP_DATABASE_URL`).
- Encryption in transit & at rest is a delivery requirement (see `spec.md`).

> Note: `Api-docs/Sandbox Credentials.pdf` is tracked for reference — rotate any real credentials and prefer keeping secrets out of git.

---

## License

**Proprietary.** See [`LICENSE`](LICENSE). Ownership transfers to the client per the Software Development Agreement upon full payment; not for redistribution or resale.
