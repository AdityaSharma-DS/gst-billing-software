# DONICY — Project State (living handoff doc)

> **Update cadence:** refresh this file when context nears ~90% or at least weekly, and after any major change. It is committed to git so it is never lost. Persistent memory also lives in the Claude memory store (`D:\ClaudeCode\.claude\projects\E--gst\memory\`), auto-loaded each session.
>
> _Last updated: 2026-09-19._

## What DONICY is
Multi-tenant **GST Billing & Compliance SaaS for India**, built for sale. Monorepo `E:\gst` → GitHub `AdityaSharma-DS/gst-billing-software` (`main`).
- `apps/backend` — NestJS 10 + Prisma 5 + PostgreSQL
- `apps/web` — React 18 + Vite + TanStack Query + react-router v6
- `apps/landing` — static marketing site · `apps/mobile` — skeleton

## Architecture keystones
- **Multi-tenancy:** PostgreSQL Row-Level Security. Two DB connections — `gst_app` (NOBYPASSRLS, `APP_DATABASE_URL`) for tenant queries; privileged `admin` (`DATABASE_URL`) exempt via **`gst_bypass` role membership** (no superuser needed → works on Neon). `PrismaService.withTenant()` sets `app.current_tenant`; refuses to boot in prod without `APP_DATABASE_URL`.
- **Secrets at rest:** AES-256-GCM (`ENCRYPTION_KEY`) — GSP passwords, WhiteBooks client secrets, SMTP/Twilio secrets. Format `enc:v1:…`, masked in the UI.
- **Security:** boot-time env validation, no JWT dev-secret fallback, Helmet, CORS allowlist, rate limiting (10/min on auth), append-only audit log.

## Deployment
- **Vercel** (serverless `api/index.ts`) + **Neon Postgres** (`neon-byzantine-yacht`, pooled). Live: `https://gst-billing-software-backend.vercel.app`.
- **Required env (prod won't boot without):** `DATABASE_URL`, `APP_DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`.
- ⚠️ **Live API is DOWN until `ENCRYPTION_KEY` is set on Vercel** (`d1f15547be30a0151f951d6e75acee1520931f6f62b1c77addc7dd9726a79d8a`), then redeploy.
- Optional: `CORS_ORIGINS`, `BLOB_READ_WRITE_TOKEN` (durable PDFs/logos, else `/tmp` is ephemeral), SMTP/WhatsApp via master panel.
- Custom domain `app.donicy.in` NOT attached.

## Local dev
```bash
# backend (port 4100), against local Postgres gst_billing (roles postgres / gst_app)
cd apps/backend && PORT=4100 node -r ts-node/register/transpile-only -r tsconfig-paths/register src/main.ts
# web (port 5200, proxy to 4100)
cd apps/web && VITE_PORT=5200 VITE_API_TARGET=http://localhost:4100 npx vite
```
- Local master admin: `master@donicy.in` / `master123`.
- Test tenant: **SRI TEJA TECHNOLOGIES** (GSTIN 36AFBFS4176D1Z1), login `sharma.aditya816@gmail.com` / `Welcome@2026`.

## GST / WhiteBooks integration
- GSP = **WhiteBooks** (developer.whitebooks.in). Contact: Susritha, +91 90321 11388.
- **Per-product Client ID/Secret** (GST `GSTS/GSTP`, e-Invoice `EINS/EINP`, e-Way Bill `EWBS/EWBP`). Base URL by env: sandbox `apisandbox.whitebooks.in`, prod `api.whitebooks.in`. Configured in master panel → GST API Config (built). Per-taxpayer NIC creds per-org.
- ⚠️ **NIC needs a whitelisted static IP** — Vercel serverless egress is dynamic → prod GSP calls fail from Vercel. Needs a fixed-IP proxy (Hostinger VPS).
- Research pack: `E:\gst\Gst apis research\WhatsApp Chat with +91 90321 11388\` (API Flow PDFs, Postman collections, sandbox creds, prep tools). Sandbox OTP 575757; e-Invoice prod is subscription-locked.

## Done this session (highlights)
Merge + deploy; RLS/security hardening; master-panel Integrations (SMTP/WhatsApp); durable object storage (Blob/S3); per-product GSP config; GSTIN validation + auto-fill (clients + vendors); compliance phantom-overdue fix; HSN/SAC search (bundled catalog); password reset; show/hide password; UI/UX quick-win batch; full functional test with a real bill (₹12,980 IGST — all correct).

## Pending (priority order)
1. **Real GSTN filing** (SAVE→SUBMIT→FILE + EVC/DSC) — the SOW headline; today `markFiled` fakes the ARN.
2. **Static-IP host** for GSP calls (blocks all live NIC calls on Vercel).
3. **e-Invoice IRN** end-to-end (unreachable) + signed-QR-in-PDF + DSC.
4. **GSTR-2B auto-fetch**, **GSTR-2/5/6/7/8**, **FastGST** (or govt master-codes) for full HSN/rates.
5. **Payment gateway** (Razorpay) for self-serve billing.
6. Custom domain; Sentry/monitoring; CI + tests.

## Conventions
- **No Claude attribution in commits** (standing instruction). Conventional-commit messages.
- Verify features (typecheck + local API/UI test) before committing; push each logical change.
