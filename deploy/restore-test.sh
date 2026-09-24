#!/usr/bin/env bash
#
# deploy/restore-test.sh — prove the latest backup.sh output actually restores
# (recon-security-gaps.md carry-forward checklist item 22: "one tested restore
# before launch"; a backup you have never restored is not a backup).
#
# Downloads the newest *.dump.gz.enc from S3 (or accepts a local path),
# decrypts it, restores it into a DISPOSABLE scratch Postgres container (never
# the live `postgres` service), runs 3 sanity SELECTs, then tears the scratch
# container down. Never touches production data.
#
# Required env: BACKUP_PASSPHRASE   (same passphrase backup.sh used)
# Optional env: BACKUP_DIR (default /var/backups/maja)
#               BACKUP_S3_BUCKET (default s3://maja-backups/pg)
#
# Usage:
#   ./restore-test.sh                          # pulls latest from S3
#   ./restore-test.sh /var/backups/maja/x.dump.gz.enc   # tests a specific file
#
# Run this quarterly (or after any backup.sh change) — cron alongside backup.sh
# is overkill for a destructive-container test; a calendar reminder is enough:
#   # crontab: first Sunday of the quarter, 04:00 IST (22:30 UTC prev day)
#   30 22 1-7 1,4,7,10 * [ "$(date +\%u)" = 7 ] && cd /opt/maja/deploy && BACKUP_PASSPHRASE="$(cat /root/.maja-backup-passphrase)" ./restore-test.sh >> /var/log/maja-restore-test.log 2>&1
#
set -euo pipefail

cd "$(cd "$(dirname "$0")" && pwd)"

: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/maja}"
S3_BUCKET="${BACKUP_S3_BUCKET:-s3://maja-backups/pg}"
SCRATCH="maja-restore-test-$$"

SRC="${1:-}"
if [ -z "$SRC" ]; then
  echo "[restore-test] no file given — pulling latest from ${S3_BUCKET}"
  LATEST_KEY="$(aws s3 ls "${S3_BUCKET%/}/" | sort | tail -1 | awk '{print $4}')"
  [ -n "$LATEST_KEY" ] || { echo "[restore-test] FAILED — bucket empty or unreachable" >&2; exit 1; }
  mkdir -p "$BACKUP_DIR"
  SRC="$BACKUP_DIR/$LATEST_KEY"
  aws s3 cp "${S3_BUCKET%/}/${LATEST_KEY}" "$SRC"
fi
[ -f "$SRC" ] || { echo "[restore-test] FAILED — $SRC not found" >&2; exit 1; }
echo "[restore-test] using $SRC"

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[restore-test] decrypting…"
openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$SRC" | gunzip > "$TMP/restore.dump"

echo "[restore-test] starting disposable scratch postgres ($SCRATCH)…"
docker run -d --name "$SCRATCH" \
  -e POSTGRES_USER=maja -e POSTGRES_PASSWORD=scratch-only -e POSTGRES_DB=maja \
  postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$SCRATCH" pg_isready -U maja -d maja >/dev/null 2>&1 && break
  sleep 1
done

echo "[restore-test] restoring…"
docker cp "$TMP/restore.dump" "$SCRATCH:/tmp/restore.dump"
docker exec "$SCRATCH" pg_restore -U maja -d maja --no-owner --no-privileges /tmp/restore.dump

echo "[restore-test] sanity checks:"
FAILED=0
# invitation_orders isn't declared in schema.sql (pg_adapter auto-creates it
# on first write, per pg_adapter.py:168) but IS the real per-purchase table
# (backend/store_features.py, fulfillment_service.py). `orders` is a distinct
# table (checkout/payment attempts, schema.sql:311) — checking it instead
# would silently skip verifying the actual invitation-purchase data restored.
for T in profiles admins invitation_orders; do
  N="$(docker exec "$SCRATCH" psql -U maja -d maja -tAc "SELECT count(*) FROM $T;" 2>/dev/null || echo "TABLE_MISSING")"
  echo "  $T: $N"
  case "$N" in
    ''|*[!0-9]*) echo "[restore-test] FAILED — table $T did not restore cleanly" >&2; FAILED=1 ;;
  esac
done

if [ "$FAILED" -ne 0 ]; then
  echo "[restore-test] FAILED — see above"
  exit 1
fi

echo "[restore-test] PASSED — backup is restorable. Scratch container will be removed."
