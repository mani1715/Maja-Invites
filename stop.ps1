# Stop the MAJA Invites local stack started by run.ps1 (ASCII, PS 5.1 safe).
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

$pidFile = Join-Path $root ".run_pids.txt"
if (Test-Path $pidFile) {
    foreach ($p in Get-Content $pidFile) {
        try { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue } catch {}
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host "Closed launcher windows." -ForegroundColor Green
}

$pgBin  = "C:\Users\yemin\Desktop\My Projects\M04(Mani)\wedding-36\.localpg\pgsql\bin"
$pgData = Join-Path $root ".localpg\data"
if (Test-Path "$pgBin\pg_ctl.exe") {
    & "$pgBin\pg_ctl.exe" -D $pgData stop -m fast
    Write-Host "Postgres stopped." -ForegroundColor Green
}
