# =============================================================================
# MAJA Invites Backend Launcher
# =============================================================================
$ErrorActionPreference = "Continue"
$backendDir = $PSScriptRoot
$rootDir = Split-Path -Parent $backendDir
Set-Location $backendDir

$env:PYTHONIOENCODING = "utf-8"
$env:ENVIRONMENT = "development"
$env:CORS_ORIGINS = "http://localhost:8127,http://localhost:3100"
$env:SEED_TEST_ACCOUNTS = "0"
if (-not $env:JWT_SECRET_KEY) {
    $env:JWT_SECRET_KEY = "dev_local_only_change_me_0123456789abcdef"
}

$venvPy = Join-Path $rootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    $venvPy = "python"
}

Write-Host "Starting MAJA backend on http://127.0.0.1:8001..." -ForegroundColor Cyan
& $venvPy -X utf8 -m uvicorn server:app --host 127.0.0.1 --port 8001
