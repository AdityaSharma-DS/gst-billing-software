@echo off
REM GST Billing (DONICY) — double-click to start backend + web.
REM Pass "setup" the first time to migrate + seed the database:  start.bat setup
if /I "%1"=="setup" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Setup
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
)
