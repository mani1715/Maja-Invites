#!/usr/bin/env bash
#
# backup_db.sh — nightly Postgres backup for MAJA Invites (SECURITY_AUDIT.md §14).
#
# Creates a compressed pg_dump, AES-256-CBC/pbkdf2-encrypts it (openssl, same
# approach as deploy/backup.sh), keeps a local retention window, and
# (optionally) uploads the encrypted copy off-box to S3 so a lost/stolen disk
# isn't a lost business. Exits non-zero on ANY failure so cron/systemd can alert.
#
# Configure via env (or a sourced env file):
#   DATABASE_URL   postgres://user:pass@host:5432/dbname   (preferred), OR
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
#   BACKUP_PASSPHRASE      AES-256 passphrase — required unless
#                          ALLOW_UNENCRYPTED_BACKUP=1 is explicitly set.
#                          LOSE THIS AND EVERY ENCRYPTED BACKUP IS
#                          UNRECOVERABLE — store it in a password manager or
#                          secret store that survives losing this box, never
#                          only alongside the backups themselves.
#   ALLOW_UNENCRYPTED_BACKUP=1   explicit opt-out — writes a PLAINTEXT
#                          .sql.gz instead of refusing to run. Only for a
#                          disposable/local scratch box, never production.
#   BACKUP_DIR         local dir for dumps        (default: /var/backups/maja)
#   BACKUP_RETENTION_DAYS  local copies to keep   (default: 14)
#   BACKUP_S3_BUCKET   optional s3://bucket/prefix for off-box copies
#
# Cron example (daily 02:30, log to file):
#   30 2 * * *  BACKUP_PASSPHRASE="$(cat /root/.maja-backup-passphrase)" /home/majainvites/wedding-36/ops/backup_db.sh >> /var/log/maja-backup.log 2>&1
#
set -euo pipefail

if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ "${ALLOW_UNENCRYPTED_BACKUP:-0}" != "1" ]; then
  echo "[backup] FAILED — BACKUP_PASSPHRASE is not set. Refusing to write an" >&2
  echo "[backup]   unencrypted dump. Set BACKUP_PASSPHRASE, or explicitly opt" >&2
  echo "[backup]   out with ALLOW_UNENCRYPTED_BACKUP=1 (not for production)." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/maja}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TS="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  OUT="$BACKUP_DIR/maja-${TS}.sql.gz.enc"
else
  echo "[backup] WARNING — ALLOW_UNENCRYPTED_BACKUP=1: writing a PLAINTEXT dump" >&2
  OUT="$BACKUP_DIR/maja-${TS}.sql.gz"
fi

echo "[backup] $(date -u +%FT%TZ) starting → $OUT"

# pg_dump reads DATABASE_URL directly if given; else it uses the PG* env vars.
if [ -n "${DATABASE_URL:-}" ]; then
  DUMP_CMD=(pg_dump --no-owner --no-privileges "$DATABASE_URL")
else
  : "${PGDATABASE:?set DATABASE_URL or PG* env vars}"
  DUMP_CMD=(pg_dump --no-owner --no-privileges)
fi

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  "${DUMP_CMD[@]}" | gzip -9 | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
else
  "${DUMP_CMD[@]}" | gzip -9 > "$OUT"
fi

# Verify the dump is non-trivial (a truncated/empty dump is worse than none).
SIZE=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
if [ "${SIZE:-0}" -lt 1024 ]; then
  echo "[backup] FAILED — dump is suspiciously small (${SIZE} bytes)" >&2
  exit 1
fi
echo "[backup] wrote ${SIZE} bytes"

# Off-box copy (strongly recommended — a backup on the same disk is not a backup).
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  echo "[backup] uploading to ${BACKUP_S3_BUCKET}/"
  # SSE-KMS at rest; adjust --sse aws:kms / --sse-kms-key-id as your bucket requires.
  aws s3 cp "$OUT" "${BACKUP_S3_BUCKET%/}/$(basename "$OUT")" --sse AES256
fi

# Local retention (covers both encrypted and legacy plaintext filenames).
find "$BACKUP_DIR" -name 'maja-*.sql.gz*' -type f -mtime "+${RETENTION_DAYS}" -delete || true

echo "[backup] $(date -u +%FT%TZ) done"
