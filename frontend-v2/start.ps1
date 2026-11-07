# =============================================================================
# MAJA Invites Frontend Launcher
# =============================================================================
$ErrorActionPreference = "Continue"
$frontendDir = $PSScriptRoot
Set-Location $frontendDir

Write-Host "Starting MAJA frontend Vite server on http://localhost:8127..." -ForegroundColor Cyan
node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 8127 --strictPort
