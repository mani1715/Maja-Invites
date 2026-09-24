# =============================================================================
# MAJA Invites (M0001) - one-command local launcher.
#   1. Postgres (portable data in .localpg\data)            :5433
#   2. Backend  (FastAPI / uvicorn, backend\server.py)      :8001
#   3. Frontend (frontend-v2, Vite dev server w/ API proxy) :8127
#
#   In a terminal:  .\run.ps1     Stop:  .\stop.ps1
# ASCII-only on purpose (Windows PowerShell 5.1 safe).
#
# NOTES
# - Ports deliberately avoid 5432/8000/3100 (used by sibling projects
#   wedding-36 and M08 - documented port-clash trap).
# - Postgres BINARIES are auto-discovered: any local PostgreSQL install
#   (17/16/18...) or the old wedding-36 portable checkout. The DATA directory
#   always lives here in .localpg\data and is created by initdb on first run,
#   so this works on a fresh machine with nothing but PostgreSQL installed.
#   You do NOT need the password of any pre-existing cluster - this is a
#   separate cluster of our own on :5433.
# - Backend venv: python -m venv .venv ; .venv\Scripts\pip install -r backend\requirements.txt
#   Requires Python 3.11+ (backend\Dockerfile and CI both use 3.11; on 3.10
#   pip cannot resolve numpy==2.4.6, which needs >=3.11).
# - Frontend deps: cd frontend-v2 ; yarn install
# - backend\.env must exist with SUPABASE_DB_URL + JWT_SECRET_KEY or the
#   backend refuses to boot. Copy backend\.env.example and fill those two.
# =============================================================================
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
Set-Location $root

# Prefer a real PostgreSQL install; fall back to the legacy sibling checkout.
# First hit wins, so newest-first is deliberate.
$pgBin = $null
$pgCandidates = @()
foreach ($v in 18, 17, 16) { $pgCandidates += "C:\Program Files\PostgreSQL\$v\bin" }
$pgCandidates += "C:\Users\yemin\Desktop\My Projects\M04(Mani)\wedding-36\.localpg\pgsql\bin"
foreach ($c in $pgCandidates) {
    if (Test-Path (Join-Path $c "pg_ctl.exe")) { $pgBin = $c; break }
}

$pgData = Join-Path $root ".localpg\data"
$pgLog  = Join-Path $root ".localpg\pg.log"
$venvPy = Join-Path $root ".venv\Scripts\python.exe"
$vite   = Join-Path $root "frontend-v2\node_modules\vite\bin\vite.js"

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function PortUp($port) {
    try { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
    catch { return $false }
}

if (-not $pgBin)                          { Fail "No PostgreSQL install found. Install PostgreSQL 16+ (see NOTES in this file)." }
if (-not (Test-Path $venvPy))             { Fail "Backend venv missing. Run: python -m venv .venv ; .venv\Scripts\pip install -r backend\requirements.txt" }
if (-not (Test-Path $vite))               { Fail "Frontend deps missing. Run: cd frontend-v2 ; yarn install" }
if (-not (Test-Path "$root\backend\.env")) { Fail "backend\.env missing. Copy backend\.env.example and set SUPABASE_DB_URL + JWT_SECRET_KEY." }

Write-Host "[1/3] Postgres :5434..." -ForegroundColor Cyan
if (PortUp 5434) {
    # Something holds 5434. If it is not OUR cluster (no local data dir) then
    # it is another install - commonly a PostgreSQL Windows service - and the
    # backend would try to authenticate against a database we did not create
    # and do not have the password for. Say so instead of failing later with a
    # confusing auth error.
    if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) {
        Fail ("Port 5434 is in use but $pgData has no cluster - something else " +
              "owns that port (check: Get-Service postgresql*). Stop it, or " +
              "point backend\.env SUPABASE_DB_URL at whichever database you " +
              "actually want and start the backend yourself.")
    }
    Write-Host "      already running" -ForegroundColor DarkGray
} else {
    # First run on this machine: build our own cluster. initdb creates it from
    # scratch under a password we choose, so no pre-existing cluster's
    # credentials are needed (and we never touch one).
    if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) {
        Write-Host "      no cluster yet - running initdb (one time)" -ForegroundColor DarkGray
        New-Item -ItemType Directory -Force (Split-Path $pgData) | Out-Null
        $pwFile = Join-Path $env:TEMP "maja_pg_pw.txt"
        Set-Content -Path $pwFile -Value "postgres" -Encoding ascii -NoNewline
        # -A trust, NOT scram: this cluster listens on localhost only, holds
        # nothing but throwaway dev data, and trust keeps the connection string
        # in backend\.env password-free. Never use trust on a shared box.
        & "$pgBin\initdb.exe" -D $pgData -U postgres --pwfile="$pwFile" -E UTF8 -A trust --locale=C | Out-Null
        Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path (Join-Path $pgData "PG_VERSION"))) { Fail "initdb failed - could not create cluster at $pgData." }
        $freshCluster = $true
    }
    $stalePid = Join-Path $pgData "postmaster.pid"
    if (Test-Path $stalePid) { Remove-Item $stalePid -Force -ErrorAction SilentlyContinue }
    # Do NOT redirect pg_ctl output (detached postgres inherits the handle and
    # the call blocks forever) - -l already routes server output to the log.
    & "$pgBin\pg_ctl.exe" -D $pgData -l $pgLog -o "-p 5434" start
    $up = $false
    foreach ($i in 1..10) { Start-Sleep -Seconds 1; if (PortUp 5434) { $up = $true; break } }
    if (-not $up) { Fail "Postgres failed to start (see $pgLog)." }
    # The `maja` database is what SUPABASE_DB_URL points at; initdb only makes
    # `postgres`. Harmless to re-run - "already exists" is ignored.
    if ($freshCluster) {
        & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -p 5434 -w -q -c "CREATE DATABASE maja;" 2>&1 | Out-Null
        Write-Host "      created database 'maja'" -ForegroundColor DarkGray
    }
    Write-Host "      started" -ForegroundColor Green
}

Write-Host "[2/3] Backend (uvicorn :8001)..." -ForegroundColor Cyan
$pids = @()
if (PortUp 8001) {
    Write-Host "      already running" -ForegroundColor DarkGray
} else {
    # SUPABASE_DB_URL is deliberately NOT set here. python-dotenv does not
    # override variables that already exist in the environment, so setting it
    # would silently beat backend\.env and point the app at a database the
    # user did not choose. backend\.env is the single source of truth; the
    # matching value for this cluster is:
    #   SUPABASE_DB_URL=postgresql://postgres@127.0.0.1:5433/maja
    $beCmd = "Set-Location '$root\backend'; " +
             "`$env:PYTHONIOENCODING='utf-8'; " +
             "`$env:ENVIRONMENT='development'; " +
             "`$env:CORS_ORIGINS='http://localhost:8127,http://localhost:3100'; " +
             "`$env:SEED_TEST_ACCOUNTS='0'; " +
             "if (-not `$env:JWT_SECRET_KEY) { `$env:JWT_SECRET_KEY='dev_local_only_change_me_0123456789abcdef' }; " +
             "& '$venvPy' -m uvicorn server:app --host 127.0.0.1 --port 8001"
    $be = Start-Process powershell -ArgumentList "-NoExit","-Command",$beCmd -PassThru
    $pids += $be.Id
    Write-Host "      launching (pid $($be.Id))" -ForegroundColor Green
}

Write-Host "[3/3] Frontend (vite :8127, proxies /api -> :8001)..." -ForegroundColor Cyan
if (PortUp 8127) {
    Write-Host "      already running" -ForegroundColor DarkGray
} else {
    $feCmd = "Set-Location '$root\frontend-v2'; " +
             "node node_modules\vite\bin\vite.js --port 8127 --strictPort"
    $fe = Start-Process powershell -ArgumentList "-NoExit","-Command",$feCmd -PassThru
    $pids += $fe.Id
    Write-Host "      launching (pid $($fe.Id))" -ForegroundColor Green
}

$pidFile = Join-Path $root ".run_pids.txt"
if ($pids.Count -gt 0) { Set-Content -Path $pidFile -Value $pids -Encoding ascii }

Write-Host ""
Write-Host "MAJA Invites is starting." -ForegroundColor Cyan
Write-Host "  Website  : http://localhost:8127" -ForegroundColor Yellow
Write-Host "  API      : http://localhost:8001/api/health" -ForegroundColor Yellow
Write-Host "Stop everything with: .\stop.ps1" -ForegroundColor Yellow

$portUp = $false
foreach ($i in 1..30) { if (PortUp 8127) { $portUp = $true; break }; Start-Sleep -Seconds 2 }
if ($portUp) { Start-Process "http://localhost:8127" }
