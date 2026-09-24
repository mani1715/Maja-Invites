#!/usr/bin/env bash
#
# deploy/backup.sh — nightly encrypted Postgres backup for the deploy/ stack
# (SECURITY_AUDIT.md §14 / recon-security-gaps.md S3 "No DB backups").
#
# pg_dump (custom format, from inside the running `postgres` container) ->
# gzip -> AES-256 encrypt (openssl, passphrase-based) -> upload to S3 ->
# prune local copies older than the retention window. Exits non-zero on ANY
# failure so cron/systemd can alert — a silent backup failure is worse than
# no backup script at all.
#
# Required env:
#   BACKUP_PASSPHRASE   AES-256 passphrase. LOSE THIS AND EVERY BACKUP IS
#                        UNRECOVERABLE — store it in a password manager or
#                        secret store that survives losing this VM, never
#                        only in deploy/.env on the same disk as the backups.
# Optional env:
#   BACKUP_DIR              local scratch dir             (default: /var/backups/maja)
#   BACKUP_RETENTION_DAYS   local encrypted copies to keep (default: 30)
#   BACKUP_S3_BUCKET        s3://bucket/prefix             (default: s3://maja-backups/pg)
#   PG_SERVICE               compose service name           (default: postgres)
#
# Cron (03:30 IST daily = 22:00 UTC), reading the passphrase from a root-only
# file instead of inline so it never shows up in `ps`/crontab -l:
#   0 22 * * *  cd /opt/maja/deploy && BACKUP_PASSPHRASE="$(cat /root/.maja-backup-passphrase)" ./backup.sh >> /var/log/maja-backup.log 2>&1
#
set -euo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE (AES-256 passphrase for the encrypted dump)}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/maja}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://maja-backups/pg}"
PG_SERVICE="${PG_SERVICE:-postgres}"
TS="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

DUMP="$BACKUP_DIR/maja-${TS}.dump"
ENC="$BACKUP_DIR/${TS}.dump.gz.enc"

echo "[backup] $(date -u +%FT%TZ) starting -> $ENC"

# Custom format (-Fc): restorable with pg_restore, supports selective/parallel
# restore. Dump from INSIDE the postgres container via `docker compose exec`
# so no pg_dump binary/version mismatch on the host is ever a variable.
docker compose exec -T "$PG_SERVICE" pg_dump -U maja -d maja -Fc > "$DUMP"

# Verify the dump is non-trivial (a truncated/empty dump is worse than none —
# it looks like a successful backup until the day you need it).
SIZE=$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")
if [ "${SIZE:-0}" -lt 1024 ]; then
  echo "[backup] FAILED — dump is suspiciously small (${SIZE} bytes)" >&2
  rm -f "$DUMP"
  exit 1
fi

gzip -9 -c "$DUMP" | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$ENC"
rm -f "$DUMP"
ENC_SIZE=$(stat -c%s "$ENC" 2>/dev/null || stat -f%z "$ENC")
echo "[backup] wrote ${ENC_SIZE} encrypted bytes"

if [ -n "$S3_BUCKET" ]; then
  echo "[backup] uploading to ${S3_BUCKET}/"
  aws s3 cp "$ENC" "${S3_BUCKET%/}/${TS}.dump.gz.enc" --sse AES256
fi

# Local retention — the off-box S3 copy is the real durability guarantee;
# this just keeps the VM's own disk from filling up.
find "$BACKUP_DIR" -name '*.dump.gz.enc' -type f -mtime "+${RETENTION_DAYS}" -delete || true

echo "[backup] $(date -u +%FT%TZ) done"
