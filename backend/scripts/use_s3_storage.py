"""Make S3 the active storage provider and retire the Google Drive pool.

Owner decision 2026-08-06: S3 + CloudFront is the media store (see
AWS_ARCHITECTURE.md §0.1). Drive could not serve guests without either
publishing every wedding photo or proxying every byte through the app server.

WHAT THIS DOES
--------------
1. Registers an S3 account in the storage pool and makes it CURRENT, so every
   new upload lands in S3.
2. Marks any Google Drive accounts `retired`, so nothing new is written to them
   while existing rows keep resolving (files already on Drive stay readable
   until they are migrated).

WHAT IT DOES NOT DO
-------------------
It never moves or deletes a byte. Migrating the files that already live on
Drive is `storage/migrate.py`, which copies, verifies checksums, and only then
lets you purge:

    python -m storage.migrate --dest-account <s3 account id> --dry-run
    python -m storage.migrate --dest-account <s3 account id> --execute
    python -m storage.migrate --dest-account <s3 account id> --verify

Files still on the VM disk are ingested by `backfill_media.py` (the name is
now historical — it pushes through the orchestrator, so it targets whichever
account is CURRENT, which after this script is S3).

USAGE
-----
    python scripts/use_s3_storage.py --dry-run
    python scripts/use_s3_storage.py --execute
    python scripts/use_s3_storage.py --execute --capacity-tb 50
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pg_adapter import Database  # noqa: E402


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--label", default="s3-primary")
    ap.add_argument("--capacity-tb", type=float, default=50.0,
                    help="Logical cap the orchestrator enforces. S3 has no hard "
                         "quota, so this is a policy guard against runaway spend, "
                         "not a provider limit.")
    ap.add_argument("--keep-drive-active", action="store_true",
                    help="Do not retire Drive accounts (leaves them writable).")
    args = ap.parse_args()

    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("ERROR: SUPABASE_DB_URL is not set.")
        return 1

    try:
        import aws_service
        bucket = aws_service.bucket()
    except Exception as e:
        print(f"ERROR: aws_service unavailable: {e}")
        return 1
    if not bucket:
        print("ERROR: AWS_S3_BUCKET is not set. Configure S3 before switching.")
        return 1

    db = await Database.connect(dsn)
    from storage.orchestrator import StorageOrchestrator
    orch = StorageOrchestrator(db)
    await orch.ensure_ready()

    accounts = [a async for a in db.storage_accounts.find({})]
    drive = [a for a in accounts if (a.get("kind") or "gdrive") == "gdrive"]
    s3s = [a for a in accounts if (a.get("kind") or "") in ("s3", "aws", "r2")]

    print(f"bucket:          {bucket}")
    print(f"drive accounts:  {len(drive)}")
    print(f"s3 accounts:     {len(s3s)}")
    if not args.execute:
        print("\nDRY RUN — would:")
        if not s3s:
            print(f"  + register S3 account '{args.label}' "
                  f"({args.capacity_tb} TB cap) as CURRENT")
        else:
            print(f"  = S3 account already present ({s3s[0]['id']}) — make it CURRENT")
        if drive and not args.keep_drive_active:
            for d in drive:
                print(f"  ~ retire drive account {d['id']} ({d.get('label')})")
        print("\nRe-run with --execute to apply.")
        await db.close()
        return 0

    if s3s:
        acc = s3s[0]
        print(f"[=] reusing S3 account {acc['id']}")
    else:
        acc = await orch.add_account(
            kind="s3",
            label=args.label,
            capacity_bytes=int(args.capacity_tb * 1024 ** 4),
            credential_mode="iam_role",   # instance role; no keys stored
            credentials=None,
            soft_limit_pct=95,
            extra={"bucket": bucket},
        )
        print(f"[+] registered S3 account {acc['id']}")

    await db.storage_accounts.update_one(
        {"id": acc["id"]}, {"$set": {"slot": "current", "status": "active"}})
    print(f"[+] {acc['id']} is now CURRENT — new uploads go to S3")

    if drive and not args.keep_drive_active:
        for d in drive:
            # 'retired' not 'deleted': existing storage_files rows still point
            # at these accounts and must keep resolving until migrated.
            await db.storage_accounts.update_one(
                {"id": d["id"]}, {"$set": {"slot": "retired", "status": "retired"}})
            print(f"[~] retired drive account {d['id']} ({d.get('label')})")

    print("\nDone. Next:")
    print(f"  1. migrate what is still on Drive:")
    print(f"       python -m storage.migrate --dest-account {acc['id']} --dry-run")
    print(f"  2. ingest anything still on local disk:")
    print(f"       python scripts/backfill_media.py --dry-run")
    print(f"  3. verify checksums BEFORE deleting any source.")
    await db.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
