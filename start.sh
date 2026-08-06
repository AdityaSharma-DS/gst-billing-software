#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# GST Billing (DONICY) — start the dev environment (Git Bash / Linux / macOS)
#   Usage:  ./start.sh          start backend + web
#           ./start.sh setup    run DB migrate + RLS + seed first
# ─────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"
echo "GST Billing — starting dev environment..."

# 1. Install deps if missing
[ -d node_modules ] || { echo "Installing dependencies (first run)..."; npm install; }

# 2. Optional one-time DB setup
if [ "$1" = "setup" ]; then
  echo "Setting up database (generate + migrate + RLS + seed)..."
  npm run prisma:generate
  npm run prisma:migrate
  npm --workspace apps/backend run prisma:rls
  npm --workspace apps/backend run seed
fi

# 3. Start backend + web; stop both on Ctrl+C
echo "Launching backend (http://localhost:4000) and web (http://localhost:5173)..."
npm run dev:backend &
BACKEND_PID=$!
npm run dev:web &
WEB_PID=$!

trap "echo; echo 'Stopping...'; kill $BACKEND_PID $WEB_PID 2>/dev/null" INT TERM
echo ""
echo "Backend : http://localhost:4000/api"
echo "Web app : http://localhost:5173"
echo "Login   : org 'demo' / admin@demo.test / admin123"
echo "Press Ctrl+C to stop."
wait
