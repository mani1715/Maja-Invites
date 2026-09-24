"""Ingest every existing media file into the Google Drive pool.

WHY THIS EXISTS SEPARATELY FROM storage/migrate.py
--------------------------------------------------
`storage.migrate` moves files BETWEEN pool accounts (Drive -> S3/R2 later). It
scans `storage_files`, so it can only move things already in the pool. Every
file written before the cutover has no row at all, so nothing in the existing
tooling can see it. This walks the SOURCES instead — the uploads directory and
the S3 bucket — and pushes each file through the orchestrator so it gets a
folder, a row, and a `source_path` the serving layer can resolve.

It is also the permanent safety net. Six endpoints call `mirror_upload`
inline, but roughly nine others just write to /app/uploads and always did.
Rather than hand-wire each one (and miss the tenth someone adds next month),
run this on a schedule: anything under uploads/ without a `storage_files` row
gets ingested. Hooks make a file appear in Drive in seconds; this makes sure it
appears at all. The two are complementary, not alternatives.

ATTRIBUTION
-----------
The pool's tree is Photographers/<Studio>/..., so every file needs an owner:

    portfolio/<studio_id>/…          -> that studio, area=portfolio
    community/<studio_id>/…          -> that studio, area=community
    weddings/<profile_id>/…          -> the profile's admin, area=qr_photos
                                        (event_id=profile_id, so it lands in
                                        Events/<Event>/QR_Photos)
    photos/admin-<uuid>-<slot>-…     -> <uuid>, area=media
    anything else                    -> the platform bucket, area=media

Unattributable files go to a real, clearly-named "MAJA Platform" studio folder
rather than being skipped. Skipping would leave them as the one thing still
pinned to the VM disk, which defeats the purpose of the cutover.

SAFETY
------
* **Dry-run by default.** `--execute` is required to write anything.
* **Idempotent + resumable.** The scan filter is "no storage_files row for
  this source_path", so a crash, a re-run, or a cron overlap just continues.
* **Never deletes.** Purging the local/S3 originals is a separate, deliberate
  step (see `--verify` first, then storage/migrate.py's purge semantics or the
  runbook in MULTI_DRIVE_STORAGE_DESIGN.md).
* Honours the `storage_pool_enabled` flag unless `--force` is given, so it
  cannot start filling Drive before the owner has switched the pool on.

USAGE (on the server, from ~/wedding-36/microservices)
------------------------------------------------------
    DC="docker compose -f docker-compose.yml -f docker-compose.deploy.yml"
    $DC run --rm core python scripts/backfill_media.py --dry-run
    $DC run --rm core python scripts/backfill_media.py --execute
    $DC run --rm core python scripts/backfill_media.py --execute --include-s3
    $DC run --rm core python scripts/backfill_media.py --verify
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pg_adapter import Database  # noqa: E402

UPLOADS_ROOT = Path(os.environ.get("UPLOADS_ROOT", "/app/uploads"))

# Files the pool must never adopt.
SKIP_DIRS = {".mediacache", ".cache", "__pycache__", ".git"}
SKIP_SUFFIXES = (".part", ".tmp", ".DS_Store")

PLATFORM_ID = "platform"
PLATFORM_NAME = "MAJA Platform"

# uploads/photos/admin-<uuid>-<slot>-<ts>-<rand>.webp
_ADMIN_IN_NAME = re.compile(
    r"^admin-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-",
    re.I,
)

_CTYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav",
    ".ogg": "audio/ogg", ".zip": "application/zip", ".pdf": "application/pdf",
}


def _norm(p) -> str:
    return str(p).replace("\\", "/")


def _ctype(name: str) -> str:
    return _CTYPES.get(os.path.splitext(name)[1].lower(),
                       "application/octet-stream")


def _skip(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if path.name.startswith("."):
        return True
    return path.name.endswith(SKIP_SUFFIXES)


async def _classify(db, rel: Path) -> Tuple[str, str, Optional[str], Optional[str]]:
    """rel (relative to uploads root) -> (photographer_id, area, event_id, name)."""
    parts = rel.parts
    head = parts[0] if parts else ""

    if head == "portfolio" and len(parts) >= 3:
        return parts[1], "portfolio", None, None
    if head == "community" and len(parts) >= 3:
        return parts[1], "community", None, None

    if head == "weddings" and len(parts) >= 2:
        profile_id = parts[1]
        try:
            prof = await db.profiles.find_one({"id": profile_id},
                                              {"_id": 0, "admin_id": 1,
                                               "couple_name": 1, "slug": 1})
        except Exception:
            prof = None
        admin_id = (prof or {}).get("admin_id")
        if admin_id:
            label = (prof or {}).get("couple_name") or (prof or {}).get("slug") \
                or profile_id
            # event_id set -> lands under Events/<Event>/QR_Photos, which is
            # where guest + gallery photos for a wedding actually belong.
            return admin_id, "qr_photos", profile_id, label
        return PLATFORM_ID, "media", None, None

    if head == "photos":
        m = _ADMIN_IN_NAME.match(rel.name)
        if m:
            return m.group(1), "media", None, None

    return PLATFORM_ID, "media", None, None


async def _already(db, source_path: str) -> bool:
    try:
        return bool(await db.storage_files.find_one({"source_path": source_path}))
    except Exception:
        return False


async def _ingest(orch, db, *, data: bytes, filename: str, source_ref: Dict[str, Any],
                  photographer_id: str, area: str, event_id: Optional[str],
                  event_name: Optional[str]) -> None:
    name = None
    if photographer_id == PLATFORM_ID:
        name = PLATFORM_NAME
    else:
        try:
            a = await db.admins.find_one({"id": photographer_id},
                                         {"_id": 0, "studio_name": 1, "name": 1,
                                          "username": 1})
            name = (a or {}).get("studio_name") or (a or {}).get("name") \
                or (a or {}).get("username")
        except Exception:
            name = None
    await orch.upload_file(
        photographer_id=photographer_id,
        photographer_name=name or photographer_id,
        area=area,
        filename=filename,
        data=data,
        content_type=_ctype(filename),
        event_id=event_id,
        event_name=event_name,
        source_ref=source_ref,
    )


async def backfill_disk(db, orch, *, execute: bool, limit: int) -> Dict[str, int]:
    stats = {"seen": 0, "skipped": 0, "already": 0, "ingested": 0, "failed": 0}
    if not UPLOADS_ROOT.is_dir():
        print(f"[warn] {UPLOADS_ROOT} does not exist — nothing on disk to backfill.")
        return stats

    for path in sorted(UPLOADS_ROOT.rglob("*")):
        if stats["ingested"] >= limit:
            print(f"[stop] hit --limit {limit}")
            break
        if not path.is_file() or _skip(path.relative_to(UPLOADS_ROOT)):
            continue
        stats["seen"] += 1
        source_path = _norm(path)
        if await _already(db, source_path):
            stats["already"] += 1
            continue

        rel = path.relative_to(UPLOADS_ROOT)
        ph, area, event_id, event_name = await _classify(db, rel)
        if not execute:
            print(f"  WOULD ingest {rel}  ->  {ph}/{area}"
                  + (f"/event:{event_id}" if event_id else ""))
            stats["ingested"] += 1
            continue
        try:
            data = path.read_bytes()
            await _ingest(orch, db, data=data, filename=path.name,
                          source_ref={"kind": "disk", "path": source_path},
                          photographer_id=ph, area=area,
                          event_id=event_id, event_name=event_name)
            stats["ingested"] += 1
            if stats["ingested"] % 25 == 0:
                print(f"  … {stats['ingested']} ingested")
        except Exception as e:
            stats["failed"] += 1
            print(f"  [fail] {rel}: {e}")
    return stats


async def backfill_s3(db, orch, *, execute: bool, limit: int) -> Dict[str, int]:
    """Studio-storage + wedding-gallery objects live in S3 with the key stored
    as `source_path`, so they resolve through exactly the same lookup."""
    stats = {"seen": 0, "already": 0, "ingested": 0, "failed": 0}
    try:
        from aws_service import s3, bucket
    except Exception as e:
        print(f"[warn] aws_service unavailable ({e}) — skipping S3.")
        return stats
    bkt = bucket()
    if not bkt:
        print("[warn] AWS_S3_BUCKET is not set — skipping S3.")
        return stats

    paginator = s3().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bkt):
        for obj in page.get("Contents") or []:
            if stats["ingested"] >= limit:
                print(f"[stop] hit --limit {limit}")
                return stats
            key = obj["Key"]
            if key.endswith("/"):
                continue
            stats["seen"] += 1
            if await _already(db, key):
                stats["already"] += 1
                continue

            parts = key.split("/")
            if parts[0] == "studio" and len(parts) >= 3:
                ph, area, event_id, event_name = parts[1], "cloud_storage", None, None
            elif parts[0] == "weddings" and len(parts) >= 2:
                prof = await db.profiles.find_one({"id": parts[1]},
                                                  {"_id": 0, "admin_id": 1,
                                                   "couple_name": 1})
                admin_id = (prof or {}).get("admin_id")
                if admin_id:
                    area = "selfies" if "selfies/" in key else "qr_photos"
                    ph, event_id = admin_id, parts[1]
                    event_name = (prof or {}).get("couple_name") or parts[1]
                else:
                    ph, area, event_id, event_name = PLATFORM_ID, "media", None, None
            else:
                ph, area, event_id, event_name = PLATFORM_ID, "media", None, None

            if not execute:
                print(f"  WOULD ingest s3://{bkt}/{key}  ->  {ph}/{area}")
                stats["ingested"] += 1
                continue
            try:
                body = await asyncio.to_thread(
                    lambda: s3().get_object(Bucket=bkt, Key=key)["Body"].read())
                await _ingest(orch, db, data=body, filename=os.path.basename(key),
                              source_ref={"kind": "s3", "key": key},
                              photographer_id=ph, area=area,
                              event_id=event_id, event_name=event_name)
                stats["ingested"] += 1
                if stats["ingested"] % 25 == 0:
                    print(f"  … {stats['ingested']} ingested")
            except Exception as e:
                stats["failed"] += 1
                print(f"  [fail] {key}: {e}")
    return stats


async def verify(db, orch, sample: int) -> int:
    """Re-download a sample from Drive and compare against the stored checksum.
    Run this before deleting a single source file."""
    import hashlib
    checked = bad = 0
    async for f in db.storage_files.find({}):
        if checked >= sample:
            break
        if not f.get("source_path"):
            continue
        checked += 1
        try:
            data = await orch.download_file(f["id"])
            got = hashlib.sha256(data).hexdigest()
            if f.get("checksum_sha256") and got != f["checksum_sha256"]:
                bad += 1
                print(f"  [MISMATCH] {f['id']} {f.get('source_path')}")
        except Exception as e:
            bad += 1
            print(f"  [UNREADABLE] {f['id']}: {e}")
    print(f"\nverified {checked} files, {bad} problem(s).")
    return bad


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--execute", action="store_true",
                    help="actually upload (default is a dry run)")
    ap.add_argument("--include-s3", action="store_true",
                    help="also ingest every object in the S3 bucket")
    ap.add_argument("--limit", type=int, default=10 ** 9)
    ap.add_argument("--verify", type=int, nargs="?", const=50, default=0,
                    metavar="N", help="re-download N files and check checksums")
    ap.add_argument("--force", action="store_true",
                    help="run even when storage_pool_enabled is off")
    args = ap.parse_args()

    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("ERROR: SUPABASE_DB_URL is not set.")
        return 1
    db = await Database.connect(dsn)

    from storage_pool_hooks import pool_enabled
    from storage.orchestrator import StorageOrchestrator
    orch = StorageOrchestrator(db)

    if args.verify:
        rc = 1 if await verify(db, orch, args.verify) else 0
        await db.close()
        return rc

    if not await pool_enabled(db) and not args.force:
        print("storage_pool_enabled is OFF — refusing to run.\n"
              "Turn the pool on first, or pass --force to stage files anyway.")
        await db.close()
        return 2

    accounts = [a async for a in db.storage_accounts.find({})]
    if not accounts:
        print("No storage accounts connected. Connect at least one Drive account\n"
              "from the super-admin storage panel before backfilling.")
        await db.close()
        return 2

    mode = "EXECUTE" if args.execute else "DRY RUN (nothing will be written)"
    print(f"=== backfill to Drive — {mode} ===")
    print(f"uploads root: {UPLOADS_ROOT}")
    print(f"accounts:     {len(accounts)}\n")

    print("-- local disk --")
    d = await backfill_disk(db, orch, execute=args.execute, limit=args.limit)
    print(f"   seen {d['seen']}  already {d['already']}  "
          f"ingested {d['ingested']}  failed {d['failed']}")

    if args.include_s3:
        print("\n-- S3 --")
        s = await backfill_s3(db, orch, execute=args.execute, limit=args.limit)
        print(f"   seen {s['seen']}  already {s['already']}  "
              f"ingested {s['ingested']}  failed {s['failed']}")

    if not args.execute:
        print("\nDry run only. Re-run with --execute to upload.")
    else:
        print("\nDone. Verify before deleting anything:")
        print("  python scripts/backfill_media.py --verify 100")

    await db.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
