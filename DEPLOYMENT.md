# Deploying DONICY to a domain

This puts three things online:

| Piece | What it is | Goes live at |
|---|---|---|
| **Marketing site** | `apps/landing` (static HTML) | `donicy.in` |
| **App (SPA)** | `apps/web` built to static files | `app.donicy.in` |
| **API** | `apps/backend` (NestJS) + PostgreSQL | `app.donicy.in/api` (same origin as the SPA) |

The web app calls the API at a **relative `/api`**, so the SPA and API share the
`app.donicy.in` origin — no CORS setup, no build-time API URL needed. Caddy does the
path routing and gives you HTTPS automatically.

> You need to own the domain and a server/host. Buying the domain and creating the
> hosting accounts is yours to do; everything below is the exact set of steps and the
> config files (in `deploy/`) to run.

---

## Before you start — one edit

Point the marketing-site call-to-action buttons at your live signup URL:

- **`apps/landing/index.html`** → find `var SIGNUP_URL=` (near the bottom `<script>`) and
  set it to e.g. `https://app.donicy.in/login`. That updates every "Start for free" /
  "Book a demo" button in one place. Rebuild is not needed (static file).

---

## Option A — Single VPS (recommended to start)

One small Linux server (e.g. Hetzner CX22, DigitalOcean, AWS Lightsail) running
PostgreSQL + the API + Caddy. Comfortable to ~hundreds of tenants.

### 1. Server prep
```bash
sudo apt update && sudo apt install -y postgresql caddy git curl
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo useradd -r -m -d /var/www/donicy donicy
sudo mkdir -p /var/www/donicy/{api,web,landing}
```

### 2. Database (PostgreSQL, two roles — RLS-enforced isolation)
Tenant isolation is enforced by PostgreSQL Row-Level Security, so the app must **not**
run tenant queries as a superuser (that bypasses RLS). It uses two connections:
`gst_app` (NOBYPASSRLS) for all tenant data, and a privileged role (`gst_admin`, with
BYPASSRLS) for migrations and auth/operator lookups.
```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE gst_billing;
-- runtime tenant role: RLS applies
CREATE ROLE gst_app   LOGIN PASSWORD 'STRONG_APP_PASSWORD'   NOSUPERUSER NOBYPASSRLS;
-- privileged role for migrations + auth/operator (bypasses RLS)
CREATE ROLE gst_admin LOGIN PASSWORD 'STRONG_ADMIN_PASSWORD' NOSUPERUSER BYPASSRLS;
GRANT ALL ON DATABASE gst_billing TO gst_admin;
GRANT USAGE ON SCHEMA public TO gst_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gst_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gst_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gst_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gst_app;
REVOKE UPDATE, DELETE ON audit_logs FROM gst_app;   -- keep the audit log append-only
SQL
```
Run migrations and the RLS SQL (step 4) as `gst_admin`/superuser; the app then serves
tenant traffic as `gst_app` via `APP_DATABASE_URL`.

### 3. Build & ship the code
On your machine (or in CI), from the repo root:
```bash
npm ci
npm --workspace apps/web run build        # → apps/web/dist
npm --workspace apps/backend run build     # → apps/backend/dist
```
Copy the artifacts to the server:
```bash
rsync -a apps/web/dist/            donicy@SERVER:/var/www/donicy/web/
rsync -a apps/landing/            donicy@SERVER:/var/www/donicy/landing/
rsync -a apps/backend/dist/       donicy@SERVER:/var/www/donicy/api/dist/
rsync -a apps/backend/prisma/     donicy@SERVER:/var/www/donicy/api/prisma/
rsync -a apps/backend/package*.json donicy@SERVER:/var/www/donicy/api/
```

### 4. Configure & migrate the API (on the server)
```bash
cd /var/www/donicy/api
cp /path/to/deploy/.env.production.example .env      # then edit: DATABASE_URL, JWT_SECRET, APP_PUBLIC_URL, GSP_*
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy                            # apply all migrations
npx prisma db execute --file prisma/rls/policies.sql # apply Row-Level Security (idempotent)
node dist/prisma/seed.js  # OPTIONAL: seed plans/master-admin on a fresh DB (see note)
```
> **Seed note:** the repo's seed is written for local demo data. For production, seed
> only the master-admin and plans (skip demo tenants/invoices), or create them via the
> master-admin panel. Change the seeded master-admin password immediately.

### 5. Run the API as a service
```bash
sudo cp deploy/donicy-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now donicy-api
journalctl -u donicy-api -f     # verify "Nest application successfully started"
```

### 6. DNS + HTTPS (Caddy)
Point these DNS **A records** at the server's public IP:
```
donicy.in        A   <server-ip>
www.donicy.in    A   <server-ip>
app.donicy.in    A   <server-ip>
```
Then:
```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile        # edit domains + email first
sudo systemctl restart caddy
```
Caddy will obtain Let's Encrypt certificates within a minute. Visit
`https://donicy.in` and `https://app.donicy.in`.

---

## Option B — Managed PaaS (no server to run)

- **Marketing site** → deploy `apps/landing` as a static site on **Netlify/Vercel/Cloudflare Pages** (drag-and-drop or connect the repo; publish directory `apps/landing`).
- **App (SPA)** → static site from `apps/web` (build command `npm --workspace apps/web run build`, publish `apps/web/dist`). Add a rewrite so unknown paths serve `index.html`, and proxy `/api/*` + `/uploads/*` to the API origin (Netlify `_redirects` / Vercel `rewrites`).
- **API** → **Render / Railway / Fly.io** web service (build `npm --workspace apps/backend run build`, start `node apps/backend/dist/main.js`, health path `/api`). Run `prisma migrate deploy` + the RLS SQL as a release/pre-deploy step.
- **PostgreSQL** → the platform's managed Postgres (Render/Railway/Neon/Supabase). Use a non-superuser role; RLS still applies.

Set the SPA's API base to the API origin (either same-origin via the proxy above, or set the app to call `https://api.donicy.in`).

---

## Post-deploy checklist
- [ ] `SIGNUP_URL` in the landing page points at the live app.
- [ ] Master-admin password changed; demo data not present in production.
- [ ] `JWT_SECRET` is a fresh long random value; `.env` is not in git.
- [ ] HTTPS works on all three hostnames; HTTP redirects to HTTPS (Caddy default).
- [ ] `prisma migrate deploy` + `policies.sql` ran; RLS verified (a tenant can't see another's rows).
- [ ] GSP set to **production** creds and this server's IP whitelisted with WhiteBooks; test e-Way Bill / IRN once.
- [ ] Backups: automated `pg_dump` (or managed-DB backups) scheduled.
- [ ] Replace placeholder testimonials/stats on the marketing site.

## Updating later
Re-run the build (step 3), rsync `web/dist`, `landing`, `api/dist`, then
`npx prisma migrate deploy` (if schema changed) and `sudo systemctl restart donicy-api`.
Static sites need no restart. Consider wiring these steps into GitHub Actions for CI/CD.
