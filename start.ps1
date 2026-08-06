# ─────────────────────────────────────────────────────────────
# GST Billing (DONICY) — start the dev environment
#   Usage:  .\start.ps1          start backend + web
#           .\start.ps1 -Setup   run DB migrate + RLS + seed first
# ─────────────────────────────────────────────────────────────
param([switch]$Setup)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Write-Host 'GST Billing — starting dev environment...' -ForegroundColor Cyan

# 1. Ensure PostgreSQL is running
$svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($svc) {
  if ($svc.Status -ne 'Running') { Write-Host "Starting $($svc.Name)..."; Start-Service $svc.Name }
  Write-Host "PostgreSQL: $($svc.Status)" -ForegroundColor Green
} else {
  Write-Warning 'PostgreSQL service not found — make sure your database is running.'
}

# 2. Install dependencies if missing
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host 'Installing dependencies (first run)...' -ForegroundColor Yellow
  npm install
}

# 3. Optional one-time database setup
if ($Setup) {
  Write-Host 'Setting up database (generate + migrate + RLS + seed)...' -ForegroundColor Yellow
  npm run prisma:generate
  npm run prisma:migrate
  npm --workspace apps/backend run prisma:rls
  npm --workspace apps/backend run seed
}

# 4. Launch backend + web, each in its own window
Write-Host 'Launching backend (http://localhost:4000)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; npm run dev:backend"

Write-Host 'Launching web (http://localhost:5173)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; npm run dev:web"

Write-Host ''
Write-Host 'Backend : http://localhost:4000/api' -ForegroundColor Green
Write-Host 'Web app : http://localhost:5173'      -ForegroundColor Green
Write-Host 'Login   : org "demo" / admin@demo.test / admin123' -ForegroundColor Green
Write-Host ''
Write-Host 'Two windows opened. Close them to stop the servers.' -ForegroundColor DarkGray
