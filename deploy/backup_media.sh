#!/usr/bin/env bash
#
# deploy/backup_media.sh — mirror the four canonical media buckets into
# distinct prefixes of one backup bucket (SECURITY_AUDIT.md §14 /
# recon-security-gaps.md S3 "No DB backups" — this is the media-side
# counterpart; deploy/backup.sh + the `backup` compose service only cover
# Postgres).
#
# ⚠️  WARNING: until this script is actually scheduled somewhere (cron/
#     systemd timer — see below), S3 media (original photos/videos, every
#     wedding gallery) has NO second copy anywhere. A bucket-level mistake,
#     ransomware, or AWS-account compromise is unrecoverable until this runs.
#
# `aws s3 sync` only copies new/changed keys each run — cheap to run nightly.
#
# Required env:
#   MEDIA_BACKUP_BUCKET    the backup bucket to sync into
#   Per source bucket, canonical name or its deprecated alias (same
#   resolution order as backend/aws_service.py, minus the AWS_S3_BUCKET
#   fallback — this script backs up the four buckets, not the legacy one):
#     AWS_S3_PORTFOLIO_BUCKET   / S3_BUCKET_PORTFOLIO
#     AWS_S3_EVENT_BUCKET       / S3_BUCKET_EVENT
#     AWS_S3_INVITATIONS_BUCKET / S3_BUCKET_INVITATIONS
#   A bucket left entirely unset is skipped with a warning, not synced as
#   "s3:///" — see sync_bucket() below.
#   AWS credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION,
#   same as the app's) — the IAM user needs s3:GetObject + s3:ListBucket on
#   each source bucket and s3:PutObject + s3:ListBucket on the destination.
#
# PRIVACY — the face bucket (AWS_S3_FACE_BUCKET) holds temporary biometric
# selfies on a 2-day expiry lifecycle (scripts/apply_s3_lifecycle.py). It is
# NOT backed up by default: mirroring short-lived biometric data into a
# second, longer-retained bucket defeats the whole point of that retention
# policy. Set BACKUP_INCLUDE_FACE=1 to opt in only if you have a specific
# compliance reason to keep a second copy.
#
# Recommended: enable versioning on MEDIA_BACKUP_BUCKET (protects the backup
# copy itself from an accidental delete/overwrite propagating through the
# sync — see docs/DEPLOYMENT.md §5.1 for the `aws s3api put-bucket-versioning`
# command; point it at MEDIA_BACKUP_BUCKET instead of the primary bucket).
#
# STANDARD_IA is the right class for a backup copy — rarely read, only ever
# restored from in a disaster.
#
# Cron (nightly, 02:45 UTC — staggered 45min after the `backup` compose
# service's 02:00 Postgres dump so the two don't compete for bandwidth):
#   45 2 * * *  MEDIA_BACKUP_BUCKET=... AWS_S3_PORTFOLIO_BUCKET=... AWS_S3_EVENT_BUCKET=... AWS_S3_INVITATIONS_BUCKET=... /opt/maja/deploy/backup_media.sh >> /var/log/maja-media-backup.log 2>&1
#
set -euo pipefail

: "${MEDIA_BACKUP_BUCKET:?set MEDIA_BACKUP_BUCKET (the backup bucket to sync into)}"

# sync_bucket LABEL PREFIX BUCKET — skips (with a warning) instead of
# running `aws s3 sync` against an empty bucket name, which would otherwise
# resolve to the malformed "s3:///PREFIX/" and either error confusingly or,
# worse, silently sync nothing while looking like it ran.
sync_bucket() {
  local label="$1" prefix="$2" bucket="$3"
  if [ -z "$bucket" ]; then
    echo "[backup-media] WARNING: no bucket configured for '${label}' — skipping" >&2
    return 0
  fi
  echo "[backup-media] $(date -u +%FT%TZ) syncing s3://${bucket} -> s3://${MEDIA_BACKUP_BUCKET}/${prefix}/"
  aws s3 sync "s3://${bucket}" "s3://${MEDIA_BACKUP_BUCKET}/${prefix}/" --storage-class STANDARD_IA
}

# Canonical name first, deprecated alias second — same order as
# backend/aws_service.py's bucket_for_category(), minus the final
# AWS_S3_BUCKET fallback (this script is about the four-bucket layout).
portfolio_bucket="${AWS_S3_PORTFOLIO_BUCKET:-${S3_BUCKET_PORTFOLIO:-}}"
event_bucket="${AWS_S3_EVENT_BUCKET:-${S3_BUCKET_EVENT:-}}"
invitations_bucket="${AWS_S3_INVITATIONS_BUCKET:-${S3_BUCKET_INVITATIONS:-}}"

sync_bucket portfolio   portfolio   "$portfolio_bucket"
sync_bucket event       event       "$event_bucket"
sync_bucket invitations invitations "$invitations_bucket"

if [ "${BACKUP_INCLUDE_FACE:-0}" = "1" ]; then
  face_bucket="${AWS_S3_FACE_BUCKET:-${S3_BUCKET_FACE:-}}"
  sync_bucket face face "$face_bucket"
else
  echo "[backup-media] face bucket skipped by default (biometric selfies, 2-day expiry — set BACKUP_INCLUDE_FACE=1 to opt in)"
fi

echo "[backup-media] $(date -u +%FT%TZ) done"
