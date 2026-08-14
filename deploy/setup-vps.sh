#!/usr/bin/env bash
# ── DONICY — one-shot VPS deploy (Ubuntu 22.04/24.04, e.g. Hostinger KVM) ──────
# Run as root, from the repo root, AFTER you've cloned the repo onto the VPS.
#
#   sudo DOMAIN=app.yourdomain.com EMAIL=you@yourdomain.com bash deploy/setup-vps.sh
#
# Optional:  SEED=1  also seeds the master-admin panel + plans + a demo tenant.
# It installs Node 20, PostgreSQL, Caddy; creates the two DB roles (gst_app +
# gst_admin); builds the app; runs migrations + RLS; starts the API under systemd;
# and serves the SPA over HTTPS at your subdomain via Caddy (auto Let's Encrypt).
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN=app.yourdomain.com}"
EMAIL="${EMAIL:?Set EMAIL=you@yourdomain.com (for Let's Encrypt)}"
SEED="${SEED:-0}"
REPO_DIR="$(pwd)"
[ -f "$REPO_DIR/apps/backend/package.json" ] || { echo "Run this from the repo root."; exit 1; }

echo "▸ 1/8 Installing packages (Node 20, PostgreSQL, Caddy, git)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git openssl postgresql debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
systemctl enable --now postgresql

echo "▸ 2/8 Ensuring some swap (protects the build on small VPS plans)…"
if [ ! -e /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 2500 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "▸ 3/8 Creating database + roles…"
APP_PW="$(openssl rand -hex 16)"; ADMIN_PW="$(openssl rand -hex 16)"; JWT="$(openssl rand -hex 48)"
pg(){ sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc "$1"; }
pgd(){ sudo -u postgres psql -d gst_billing -v ON_ERROR_STOP=1 -c "$1"; }
pg "SELECT 1 FROM pg_database WHERE datname='gst_billing'" | grep -q 1 || pg "CREATE DATABASE gst_billing"
if pg "SELECT 1 FROM pg_roles WHERE rolname='gst_app'" | grep -q 1; then pg "ALTER ROLE gst_app PASSWORD '${APP_PW}'"; else pg "CREATE ROLE gst_app LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS"; fi
if pg "SELECT 1 FROM pg_roles WHERE rolname='gst_admin'" | grep -q 1; then pg "ALTER ROLE gst_admin PASSWORD '${ADMIN_PW}'"; else pg "CREATE ROLE gst_admin LOGIN PASSWORD '${ADMIN_PW}' NOSUPERUSER BYPASSRLS"; fi
pg "GRANT ALL ON DATABASE gst_billing TO gst_admin"
pgd "GRANT USAGE ON SCHEMA public TO gst_app"
pgd "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO gst_app"
pgd "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO gst_app"
pgd "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO gst_app"
pgd "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO gst_app"

echo "▸ 4/8 Writing apps/backend/.env…"
cat > "$REPO_DIR/apps/backend/.env" <<ENV
NODE_ENV=production
PORT=4000
API_PREFIX=api
APP_DATABASE_URL=postgresql://gst_app:${APP_PW}@localhost:5432/gst_billing?schema=public
DATABASE_URL=postgresql://gst_admin:${ADMIN_PW}@localhost:5432/gst_billing?schema=public
JWT_SECRET=${JWT}
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
APP_PUBLIC_URL=https://${DOMAIN}
ENV

echo "▸ 5/8 Installing deps + building (this can take a few minutes)…"
npm ci
npm --workspace apps/web run build
npm --workspace apps/backend run build

echo "▸ 6/8 Migrating database + applying Row-Level Security…"
( cd "$REPO_DIR/apps/backend" && npx prisma generate && npx prisma migrate deploy && npx prisma db execute --file prisma/rls/policies.sql )
if [ "$SEED" = "1" ]; then
  echo "   seeding master-admin + plans + demo tenant…"
  ( cd "$REPO_DIR/apps/backend" && npx ts-node prisma/seed.ts ) || echo "   (seed skipped/failed — you can still register live)"
fi

echo "▸ 7/8 Running the API under systemd…"
cat > /etc/systemd/system/donicy-api.service <<UNIT
[Unit]
Description=DONICY GST Billing API
After=network.target postgresql.service
Wants=postgresql.service
[Service]
Type=simple
WorkingDirectory=${REPO_DIR}/apps/backend
EnvironmentFile=${REPO_DIR}/apps/backend/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now donicy-api

echo "▸ 8/8 Configuring Caddy for https://${DOMAIN}…"
cat > /etc/caddy/Caddyfile <<CADDY
{
	email ${EMAIL}
}
${DOMAIN} {
	encode gzip
	handle /api/* { reverse_proxy 127.0.0.1:4000 }
	handle /uploads/* { reverse_proxy 127.0.0.1:4000 }
	handle {
		root * ${REPO_DIR}/apps/web/dist
		try_files {path} /index.html
		file_server
	}
}
CADDY
systemctl restart caddy

echo
echo "✅ Live at:  https://${DOMAIN}"
echo "   • Open it and click 'Create account' to onboard your first business."
[ "$SEED" = "1" ] && echo "   • Master admin: https://${DOMAIN}/admin/login  (master@donicy.in / master123 — CHANGE THIS)"
echo "   • API logs:   journalctl -u donicy-api -f"
echo "   • DB roles:   gst_app pw=${APP_PW}  |  gst_admin pw=${ADMIN_PW}  (saved in apps/backend/.env)"
echo "   • To update later: git pull && npm ci && npm --workspace apps/web run build && npm --workspace apps/backend run build && (cd apps/backend && npx prisma migrate deploy) && systemctl restart donicy-api"
