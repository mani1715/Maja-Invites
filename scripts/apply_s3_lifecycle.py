#!/usr/bin/env python3
"""Apply baseline S3 hardening + lifecycle rules to the four canonical media buckets.

MAJA Invites media lives in four private, per-purpose S3 buckets (region
us-east-2 in production). Bucket names resolve exactly like
`backend/aws_service.py`'s `bucket_for_category()` — canonical name first,
then the deprecated `S3_BUCKET_<CAT>` alias, then `AWS_S3_BUCKET` — see
`backend/media_storage.py` for the key/limit contract these buckets serve,
and `docs/MEDIA_STORAGE.md` for the full architecture:

    AWS_S3_PORTFOLIO_BUCKET   / S3_BUCKET_PORTFOLIO    (category: portfolio)
    AWS_S3_EVENT_BUCKET       / S3_BUCKET_EVENT        (category: event)
    AWS_S3_INVITATIONS_BUCKET / S3_BUCKET_INVITATIONS  (category: invitation)
    AWS_S3_FACE_BUCKET        / S3_BUCKET_FACE         (category: face — never
                                                          falls back to AWS_S3_BUCKET)
    AWS_S3_BUCKET             (fallback for portfolio/event/invitation only)

Bucket CREATION is done externally (Terraform/console — see
docs/MEDIA_STORAGE.md's ops runbook). This script hardens buckets that
already exist and can also push CORS. Per configured bucket, the default
(hardening) mode:

  1. Verifies/sets S3 Block Public Access to all four blocks ON. Never
     loosens an existing config — only tightens toward all-blocked.
  2. Verifies/sets default server-side encryption to SSE-S3 (AES256), UNLESS
     the bucket already has SSE-KMS configured — that is reported, never
     downgraded.
  3. Merges an AbortIncompleteMultipartUpload (2 days, all objects) rule —
     and, on the face bucket only, an Expiration (2 days) rule scoped to the
     `event/` prefix, belt-and-braces behind the app's own 24h selfie
     sweep — into whatever lifecycle rules already exist on the bucket.
     Existing rules are left untouched; only the `maja-*` rule IDs this
     script owns are replaced on each run.

`--cors` mode instead applies `deploy/s3-cors.json` verbatim to each bucket
via `put_bucket_cors` (previously docs-only / hand-run via the console).

DRY RUN BY DEFAULT — prints what it would do and touches nothing, in both
modes. Pass --apply to actually call the AWS APIs. Safe to re-run: every
step recomputes desired state from what is live and only writes what
differs.

    python scripts/apply_s3_lifecycle.py                       # dry run harden, all buckets
    python scripts/apply_s3_lifecycle.py --apply                # apply harden, all buckets
    python scripts/apply_s3_lifecycle.py --apply --bucket maja-face-private-2026
    python scripts/apply_s3_lifecycle.py --cors                 # dry run CORS, all buckets
    python scripts/apply_s3_lifecycle.py --cors --apply         # apply CORS, all buckets

Credentials/region resolve the same way as `backend/aws_service.py`:
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION (default ap-south-1).
Loads `backend/.env` automatically if python-dotenv is installed (optional —
real environment variables work fine without it; no new dependency beyond
boto3, which is already a backend requirement).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:  # optional convenience; script works fine from real env vars without it
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
except ImportError:
    pass

import boto3
from botocore.exceptions import BotoCoreError, ClientError

# category -> (canonical env var, deprecated alias), same set/order as
# backend/aws_service.py's BUCKET_ENV.
BUCKET_ENV = {
    "portfolio": ("AWS_S3_PORTFOLIO_BUCKET", "S3_BUCKET_PORTFOLIO"),
    "event": ("AWS_S3_EVENT_BUCKET", "S3_BUCKET_EVENT"),
    "invitation": ("AWS_S3_INVITATIONS_BUCKET", "S3_BUCKET_INVITATIONS"),
    "face": ("AWS_S3_FACE_BUCKET", "S3_BUCKET_FACE"),
}

# Rule IDs this script owns. Anything else already on a bucket is left alone
# on every re-apply — namespaced so a human-authored rule never collides.
ABORT_MPU_RULE_ID = "maja-abort-mpu"
FACE_EXPIRY_RULE_ID = "maja-face-selfie-expiry"

CORS_CONFIG_PATH = Path(__file__).resolve().parent.parent / "deploy" / "s3-cors.json"


def resolve_buckets() -> "dict[str, str]":
    """category -> bucket name, empty/unset env vars skipped.

    Mirrors `backend.aws_service.bucket_for_category()`: canonical name ->
    deprecated `S3_BUCKET_<CAT>` alias -> `AWS_S3_BUCKET` (legacy
    single-bucket deploy) — except face, which never falls back to the
    shared bucket (biometric selfies must never silently land there).
    """
    legacy_shared = os.environ.get("AWS_S3_BUCKET", "").strip()
    out: "dict[str, str]" = {}
    for category, (canonical, legacy) in BUCKET_ENV.items():
        name = os.environ.get(canonical, "").strip() or os.environ.get(legacy, "").strip()
        if not name and category != "face":
            name = legacy_shared
        if name:
            out[category] = name
    return out


def load_desired_cors_rules() -> list:
    with open(CORS_CONFIG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)["CORSRules"]


def s3_client():
    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "ap-south-1"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )


def _err_code(e: ClientError) -> str:
    return e.response.get("Error", {}).get("Code", "")


# ---------------------------------------------------------------------------
# Per-check logic. Each reads live state and returns a one-line report,
# writing only when --apply is set and state actually needs to change.
# ---------------------------------------------------------------------------
def check_public_access_block(s3, bucket: str, apply: bool) -> str:
    desired = {"BlockPublicAcls": True, "IgnorePublicAcls": True,
               "BlockPublicPolicy": True, "RestrictPublicBuckets": True}
    try:
        current = s3.get_public_access_block(Bucket=bucket)["PublicAccessBlockConfiguration"]
    except ClientError as e:
        if _err_code(e) != "NoSuchPublicAccessBlockConfiguration":
            raise
        current = {}
    if current == desired:
        return "OK — already all-blocked"
    if not apply:
        return f"WOULD SET all-blocked (currently {current or 'unset'})"
    s3.put_public_access_block(Bucket=bucket, PublicAccessBlockConfiguration=desired)
    return f"SET all-blocked (was {current or 'unset'})"


def check_encryption(s3, bucket: str, apply: bool) -> str:
    try:
        rules = s3.get_bucket_encryption(Bucket=bucket)["ServerSideEncryptionConfiguration"]["Rules"]
        algo = rules[0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"]
    except ClientError as e:
        if _err_code(e) != "ServerSideEncryptionConfigurationNotFoundError":
            raise
        algo = None
    if algo == "aws:kms":
        return "SKIPPED — already SSE-KMS, not downgrading"
    if algo == "AES256":
        return "OK — already SSE-S3 (AES256)"
    if not apply:
        return "WOULD SET default encryption to SSE-S3 (AES256)"
    s3.put_bucket_encryption(
        Bucket=bucket,
        ServerSideEncryptionConfiguration={
            "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
        })
    return "SET default encryption to SSE-S3 (AES256)"


def _managed_lifecycle_rules(category: str) -> list:
    rules = [{
        "ID": ABORT_MPU_RULE_ID,
        "Status": "Enabled",
        "Filter": {"Prefix": ""},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 2},
    }]
    if category == "face":
        rules.append({
            "ID": FACE_EXPIRY_RULE_ID,
            "Status": "Enabled",
            "Filter": {"Prefix": "event/"},
            "Expiration": {"Days": 2},
        })
    return rules


def check_lifecycle(s3, bucket: str, category: str, apply: bool) -> str:
    managed_ids = {ABORT_MPU_RULE_ID, FACE_EXPIRY_RULE_ID}
    try:
        existing = s3.get_bucket_lifecycle_configuration(Bucket=bucket)["Rules"]
    except ClientError as e:
        if _err_code(e) != "NoSuchLifecycleConfiguration":
            raise
        existing = []
    kept = [r for r in existing if r.get("ID") not in managed_ids]
    desired = kept + _managed_lifecycle_rules(category)
    n_managed = len(desired) - len(kept)
    verb = "MERGED" if apply else "WOULD MERGE"
    detail = f"{verb} {n_managed} managed rule(s), kept {len(kept)} existing rule(s)"
    if apply:
        s3.put_bucket_lifecycle_configuration(Bucket=bucket, LifecycleConfiguration={"Rules": desired})
    return detail


def check_cors(s3, bucket: str, desired_rules: list, apply: bool) -> str:
    try:
        current_rules = s3.get_bucket_cors(Bucket=bucket)["CORSRules"]
    except ClientError as e:
        if _err_code(e) != "NoSuchCORSConfiguration":
            raise
        current_rules = []
    if current_rules == desired_rules:
        return "OK — already matches deploy/s3-cors.json"
    verb = "SET" if apply else "WOULD SET"
    detail = (f"{verb} CORS from deploy/s3-cors.json "
              f"(replacing {len(current_rules)} existing rule(s) with {len(desired_rules)})")
    if apply:
        s3.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": desired_rules})
    return detail


def process_bucket(s3, category: str, bucket: str, apply: bool) -> bool:
    """Runs all hardening checks for one bucket; returns True if any check errored."""
    print(f"\n=== {bucket}  (category: {category}) ===")
    had_error = False
    for label, fn in (
        ("PublicAccessBlock", lambda: check_public_access_block(s3, bucket, apply)),
        ("Encryption", lambda: check_encryption(s3, bucket, apply)),
        ("Lifecycle", lambda: check_lifecycle(s3, bucket, category, apply)),
    ):
        try:
            print(f"  [{label}] {fn()}")
        except (ClientError, BotoCoreError) as e:
            had_error = True
            print(f"  [{label}] ERROR: {e}")
    return had_error


def process_bucket_cors(s3, category: str, bucket: str, desired_rules: list, apply: bool) -> bool:
    """Applies deploy/s3-cors.json to one bucket; returns True if it errored."""
    print(f"\n=== {bucket}  (category: {category}) ===")
    try:
        print(f"  [CORS] {check_cors(s3, bucket, desired_rules, apply)}")
        return False
    except (ClientError, BotoCoreError) as e:
        print(f"  [CORS] ERROR: {e}")
        return True


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="Actually call AWS. Default is dry-run (prints only).")
    ap.add_argument("--bucket", default=None,
                    help="Limit to one bucket name (must match a resolved bucket).")
    ap.add_argument("--cors", action="store_true",
                    help="Apply deploy/s3-cors.json instead of the PAB/SSE/lifecycle "
                         "hardening checks. Also dry-run by default; combine with --apply.")
    args = ap.parse_args()

    buckets = resolve_buckets()
    if not buckets:
        print("No S3 buckets configured (AWS_S3_PORTFOLIO_BUCKET/EVENT/INVITATIONS/FACE, "
              "their deprecated S3_BUCKET_* aliases, and AWS_S3_BUCKET are all unset). "
              "Nothing to do.")
        return 0

    targets = list(buckets.items())
    if args.bucket:
        targets = [(c, b) for c, b in targets if b == args.bucket]
        if not targets:
            print(f"--bucket {args.bucket!r} does not match any resolved bucket: "
                  f"{sorted(set(buckets.values()))}")
            return 1

    mode = "APPLY" if args.apply else "DRY RUN (pass --apply to execute)"
    s3 = s3_client()
    any_error = False

    if args.cors:
        print(f"Mode: {mode} CORS ({CORS_CONFIG_PATH})")
        desired_rules = load_desired_cors_rules()
        for category, bucket in targets:
            any_error = process_bucket_cors(s3, category, bucket, desired_rules, args.apply) or any_error
    else:
        print(f"Mode: {mode} hardening (PAB/SSE/lifecycle)")
        for category, bucket in targets:
            any_error = process_bucket(s3, category, bucket, args.apply) or any_error

    print()
    if args.apply and any_error:
        print("DONE with errors — see ERROR lines above.")
        return 1
    print("DONE.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
