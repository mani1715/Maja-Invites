#!/usr/bin/env bash
#
# restore_db.sh — restore a MAJA Postgres backup (SECURITY_AUDIT.md §14).
#
# A backup you have never restored is not a backup — run this against a SCRATCH
# database quarterly to prove your DR actually works.
#
# Usage:
#   ops/restore_db.sh /var/backups/maja/maja-20260804-023000.sql.gz.enc
#   ops/restore_db.sh s3://my-bucket/backups/maja-20260804-023000.sql.gz.enc
#   ops/restore_db.sh /var/backups/maja/maja-20260804-023000.sql.gz   # legacy plaintext
#
# A file ending .enc is decrypted first (openssl AES-256-CBC/pbkdf2, matching
# backup_db.sh — requires BACKUP_PASSPHRASE). Anything else is treated as a
# plain gzip, for backward compatibility with dumps made before backup_db.sh
# started encrypting.
#
# Target DB comes from RESTORE_DATABASE_URL (preferred) or the PG* env vars.
# It will REFUSE to run without an explicit target, and asks for confirmation
# because a restore OVERWRITES the target database.
#
set -euo pipefail

SRC="${1:-}"
[ -n "$SRC" ] || { echo "usage: $0 <backup.sql.gz[.enc] | s3://.../backup.sql.gz[.enc]>" >&2; exit 2; }

TARGET="${RESTORE_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$TARGET" ] && [ -z "${PGDATABASE:-}" ]; then
  echo "Refusing to run: set RESTORE_DATABASE_URL (a SCRATCH db, not prod) or PG* env vars." >&2
  exit 2
fi

echo "!! This will RESTORE INTO: ${TARGET:-$PGDATABASE}"
echo "!! Existing objects in that database may be overwritten."
read -r -p "Type 'RESTORE' to proceed: " CONFIRM
[ "$CONFIRM" = "RESTORE" ] || { echo "aborted."; exit 1; }

ENCRYPTED=0
case "$SRC" in
  *.enc) ENCRYPTED=1 ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
LOCAL="$SRC"
if [ "${SRC#s3://}" != "$SRC" ]; then
  LOCAL="$TMP/$(basename "$SRC")"
  echo "[restore] downloading $SRC"
  aws s3 cp "$SRC" "$LOCAL"
fi

GUNZIP_SRC="$LOCAL"
if [ "$ENCRYPTED" -eq 1 ]; then
  : "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE to decrypt this backup}"
  echo "[restore] decrypting $LOCAL"
  GUNZIP_SRC="$TMP/decrypted.sql.gz"
  openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$LOCAL" -out "$GUNZIP_SRC"
fi

echo "[restore] applying $GUNZIP_SRC"
if [ -n "$TARGET" ]; then
  gunzip -c "$GUNZIP_SRC" | psql "$TARGET"
else
  gunzip -c "$GUNZIP_SRC" | psql
fi

echo "[restore] done — verify row counts on key tables (profiles, admins, users, subscriptions)."
