#!/bin/sh
#
# deploy/backup-cron-entrypoint.sh — entrypoint for the `backup` compose
# service in deploy/docker-compose.yml. Automates the nightly cadence that
# deploy/backup.sh's own header comment otherwise expects a host crontab to
# provide.
#
# Runs INSIDE the compose network, so it talks to the `postgres` service
# directly (PGHOST=postgres) instead of deploy/backup.sh's host-cron
# `docker compose exec` path — no docker socket/CLI needed in this
# container. Same dump -> encrypt -> prune shape as deploy/backup.sh:
#   pg_dump (-Fc) -> gzip -> openssl AES-256-CBC/pbkdf2 (BACKUP_PASSPHRASE)
#   -> write to the mounted backup volume -> prune local copies older than
#   BACKUP_RETENTION_DAYS.
#
# Required env (from deploy/.env via the service's env_file):
#   BACKUP_PASSPHRASE    AES-256 passphrase. Container refuses to start
#                         without it — see deploy/backup.sh's header for why
#                         losing this makes every backup unrecoverable.
#   POSTGRES_PASSWORD    same password the `postgres` service was created with
# Optional:
#   BACKUP_RETENTION_DAYS   local encrypted copies to keep (default: 30)
#   BACKUP_DIR              mount point for the backup volume (default: /backups)
#
# This container has no off-box (S3) upload step — see deploy/backup_media.sh
# for the equivalent for S3 *media*; wiring the `backupdata` volume or this
# script up to an S3 upload is a follow-up if off-box DB backups are needed
# beyond what's already on this VM's disk.
set -eu

log() { echo "[backup-cron] $(date -u +%FT%TZ) $*"; }

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set — refusing to start (set it in deploy/.env)}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set — refusing to start (set it in deploy/.env)}"
export PGPASSWORD="$POSTGRES_PASSWORD"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-maja}"
PGDATABASE="${PGDATABASE:-maja}"
mkdir -p "$BACKUP_DIR"

# postgres:16-alpine ships pg_dump/gzip but not always the openssl CLI —
# install it once if missing rather than assuming.
command -v openssl >/dev/null 2>&1 || apk add --no-cache openssl >/dev/null 2>&1

run_backup() {
  TS="$(date -u +%Y%m%d-%H%M%S)"
  DUMP="$BACKUP_DIR/maja-${TS}.dump"
  ENC="$BACKUP_DIR/${TS}.dump.gz.enc"
  log "starting -> $ENC"

  if ! pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -Fc >"$DUMP"; then
    log "FAILED — pg_dump error"
    rm -f "$DUMP"
    return 1
  fi

  # A truncated/empty dump is worse than none — it looks like a successful
  # backup until the day it's needed.
  SIZE=$(stat -c%s "$DUMP" 2>/dev/null || echo 0)
  if [ "${SIZE:-0}" -lt 1024 ]; then
    log "FAILED — dump is suspiciously small (${SIZE} bytes)"
    rm -f "$DUMP"
    return 1
  fi

  gzip -9 -c "$DUMP" | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$ENC"
  rm -f "$DUMP"
  ENC_SIZE=$(stat -c%s "$ENC" 2>/dev/null || echo 0)
  log "wrote ${ENC_SIZE} encrypted bytes"

  find "$BACKUP_DIR" -name '*.dump.gz.enc' -type f -mtime "+${RETENTION_DAYS}" -delete || true
  log "done"
}

log "backup scheduler started — nightly at 02:00 UTC, retention ${RETENTION_DAYS}d, dir ${BACKUP_DIR}"

# ponytail: minute-window polling instead of computing seconds-until-2am —
# no busybox `date -d` parsing to get subtly wrong across images. Upgrade to
# a proper scheduler if sub-minute precision or multiple daily runs matter.
while true; do
  HOUR="$(date -u +%H)"
  MIN="$(date -u +%M)"
  if [ "$HOUR" = "02" ] && [ "$MIN" = "00" ]; then
    run_backup || log "backup run failed — will retry at tomorrow's window"
    sleep 82800  # 23h — well clear of the 02:00 minute so today can't refire
  fi
  sleep 30
done
