"""
storage.migrate — provider-to-provider migration (V1 charter, Phase 8).
=======================================================================

Moves the archive off the Google Drive pool onto S3 / Cloudflare R2 (or any
future provider) **without touching business logic** — every call site keeps
talking to the orchestrator; only each file row's `drive_account_id` +
`provider_ref` change.

Semantics — COPY, verify, then (separately) purge:
  1. `run()` copies every file that is not yet on the destination account:
     source `download()` → sha256 verified against the stored checksum →
     destination `upload()` → row updated (old ref preserved in
     `previous_ref`). Naturally resumable/idempotent: the scan filter is
     "not on the destination yet", so a crash or re-run just continues.
  2. `verify()` samples migrated rows, re-downloads from the destination and
     compares checksums.
  3. Purging the source copies is a deliberate, separate step
     (`purge_source()`) that only deletes rows that migrated AND pass a
     checksum re-verify — never automatic.

Dry-run by default: `run(dry_run=True)` only reports what WOULD move.

CLI (run on the server, backend venv):
    python -m storage.migrate --dest-account acc_xyz --dry-run
    python -m storage.migrate --dest-account acc_xyz --execute [--limit 500]
    python -m storage.migrate --dest-account acc_xyz --verify
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .base import ProviderObject, FolderRef, StorageError

logger = logging.getLogger("storage.migrate")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StorageMigrator:
    def __init__(self, db, dest_account_id: str, provider_factory=None):
        self.db = db
        self.dest_account_id = dest_account_id
        if provider_factory is None:
            from . import get_provider as provider_factory
        self._provider_factory = provider_factory
        self._accounts: Dict[str, Dict[str, Any]] = {}

    # ------------------------------------------------------------------ #
    async def _account(self, account_id: str) -> Dict[str, Any]:
        if account_id not in self._accounts:
            doc = await self.db.storage_accounts.find_one({"id": account_id})
            if not doc:
                raise StorageError(f"Storage account not found: {account_id}")
            doc.pop("_id", None)
            self._accounts[account_id] = doc
        return self._accounts[account_id]

    def _orch(self):
        from .orchestrator import StorageOrchestrator
        orch = StorageOrchestrator(self.db, provider_factory=self._provider_factory)
        return orch

    @staticmethod
    def _with_credentials(account: Dict[str, Any]) -> Dict[str, Any]:
        from .orchestrator import StorageOrchestrator
        return StorageOrchestrator._with_credentials(account)

    async def _candidates(self, limit: Optional[int]) -> List[Dict[str, Any]]:
        """Every stored file NOT yet on the destination. Re-runs resume free."""
        rows: List[Dict[str, Any]] = []
        async for f in self.db.storage_files.find({"upload_status": "stored"}):
            if f.get("drive_account_id") == self.dest_account_id:
                continue
            f.pop("_id", None)
            rows.append(f)
        rows.sort(key=lambda f: f.get("uploaded_at") or "")
        return rows[:limit] if limit else rows

    # ------------------------------------------------------------------ #
    async def run(self, *, dry_run: bool = True,
                  limit: Optional[int] = None) -> Dict[str, Any]:
        dest = await self._account(self.dest_account_id)
        if dest.get("status") == "disabled":
            raise StorageError("Destination account is disabled")
        dest_provider = self._provider_factory(dest.get("kind") or "s3")
        orch = self._orch()
        await orch.ensure_ready()

        summary: Dict[str, Any] = {"dry_run": dry_run, "scanned": 0, "migrated": 0,
                                   "bytes": 0, "checksum_mismatch": 0, "errors": 0}
        for f in await self._candidates(limit):
            summary["scanned"] += 1
            if dry_run:
                summary["bytes"] += int(f.get("size_bytes") or 0)
                continue
            try:
                src = await self._account(f["drive_account_id"])
                src_provider = self._provider_factory(src.get("kind") or "gdrive")
                data = await src_provider.download(
                    self._with_credentials(src),
                    ProviderObject(provider_ref=f["provider_ref"]))

                # integrity gate — never propagate silent corruption
                digest = hashlib.sha256(data).hexdigest()
                if f.get("checksum_sha256") and digest != f["checksum_sha256"]:
                    summary["checksum_mismatch"] += 1
                    await self.db.storage_files.update_one(
                        {"id": f["id"]},
                        {"$set": {"upload_status": "checksum_mismatch",
                                  "mismatch_at": _now()}})
                    logger.error("migrate: checksum mismatch for %s — skipped", f["id"])
                    continue

                # destination folder via the same registry (per-account tree)
                folder = await orch._upload_folder(
                    dest, area=f.get("area") or "cloud_storage",
                    photographer_id=f["photographer_id"],
                    photographer_name=f["photographer_id"],
                    event_id=f.get("event_id"),
                    event_name=f.get("event_id"))
                obj = await dest_provider.upload(
                    self._with_credentials(dest),
                    FolderRef(ref=folder["provider_ref"]),
                    f.get("filename") or f["id"], data,
                    f.get("content_type") or "application/octet-stream",
                    meta={"photographer_id": f["photographer_id"],
                          "event_id": f.get("event_id"),
                          "checksum_sha256": f.get("checksum_sha256")})

                await self.db.storage_files.update_one(
                    {"id": f["id"]},
                    {"$set": {
                        "drive_account_id": self.dest_account_id,
                        "folder_id": folder["id"],
                        "provider_ref": obj.provider_ref,
                        "previous_ref": f["provider_ref"],
                        "migrated_from": f["drive_account_id"],
                        "migrated_at": _now(),
                    }})
                await self.db.storage_accounts.update_one(
                    {"id": self.dest_account_id},
                    {"$inc": {"committed_bytes": len(data)}})
                summary["migrated"] += 1
                summary["bytes"] += len(data)
            except Exception as e:
                summary["errors"] += 1
                logger.exception("migrate: %s failed: %s", f.get("id"), e)
        return summary

    # ------------------------------------------------------------------ #
    async def verify(self, sample: int = 50) -> Dict[str, Any]:
        """Re-download migrated rows from the destination and compare
        checksums. Run before any purge decision."""
        dest = await self._account(self.dest_account_id)
        dest_provider = self._provider_factory(dest.get("kind") or "s3")
        out = {"checked": 0, "ok": 0, "bad": 0}
        rows: List[Dict[str, Any]] = []
        async for f in self.db.storage_files.find(
                {"drive_account_id": self.dest_account_id}):
            if f.get("migrated_at"):
                f.pop("_id", None)
                rows.append(f)
        rows.sort(key=lambda f: f.get("migrated_at") or "", reverse=True)
        for f in rows[:sample]:
            out["checked"] += 1
            try:
                data = await dest_provider.download(
                    self._with_credentials(dest),
                    ProviderObject(provider_ref=f["provider_ref"]))
                if (not f.get("checksum_sha256")) or \
                        hashlib.sha256(data).hexdigest() == f["checksum_sha256"]:
                    out["ok"] += 1
                else:
                    out["bad"] += 1
                    logger.error("migrate-verify: BAD checksum on dest for %s", f["id"])
            except Exception as e:
                out["bad"] += 1
                logger.error("migrate-verify: %s unreadable on dest: %s", f["id"], e)
        return out

    # ------------------------------------------------------------------ #
    async def purge_source(self, *, confirm: bool = False,
                           limit: Optional[int] = None) -> Dict[str, Any]:
        """Delete SOURCE copies of rows that migrated AND re-verify on the
        destination right before each delete. Never runs without confirm."""
        if not confirm:
            raise StorageError("purge_source requires confirm=True — verify first.")
        dest = await self._account(self.dest_account_id)
        dest_provider = self._provider_factory(dest.get("kind") or "s3")
        out = {"purged": 0, "skipped": 0}
        rows: List[Dict[str, Any]] = []
        async for f in self.db.storage_files.find(
                {"drive_account_id": self.dest_account_id}):
            if f.get("previous_ref") and f.get("migrated_from"):
                f.pop("_id", None)
                rows.append(f)
        for f in (rows[:limit] if limit else rows):
            try:
                data = await dest_provider.download(
                    self._with_credentials(dest),
                    ProviderObject(provider_ref=f["provider_ref"]))
                if f.get("checksum_sha256") and \
                        hashlib.sha256(data).hexdigest() != f["checksum_sha256"]:
                    out["skipped"] += 1
                    continue
                src = await self._account(f["migrated_from"])
                src_provider = self._provider_factory(src.get("kind") or "gdrive")
                await src_provider.delete(
                    self._with_credentials(src),
                    ProviderObject(provider_ref=f["previous_ref"]))
                await self.db.storage_files.update_one(
                    {"id": f["id"]},
                    {"$set": {"source_purged_at": _now()}, "$unset": {"previous_ref": ""}})
                await self.db.storage_accounts.update_one(
                    {"id": f["migrated_from"]},
                    {"$inc": {"committed_bytes": -int(f.get("size_bytes") or 0)}})
                out["purged"] += 1
            except Exception as e:
                out["skipped"] += 1
                logger.warning("migrate-purge: %s skipped: %s", f.get("id"), e)
        return out


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
async def _main() -> int:
    import argparse
    import os
    ap = argparse.ArgumentParser(description="MAJA storage migrator")
    ap.add_argument("--dest-account", required=True)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true", help="actually copy")
    mode.add_argument("--verify", action="store_true", help="verify migrated rows")
    ap.add_argument("--dry-run", action="store_true", help="(default) report only")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    import asyncpg
    from pg_adapter import Database
    dsn = os.environ.get("DATABASE_URL") or os.environ.get(
        "MAJA_PG_DSN", "postgresql://postgres@localhost:5432/maja")
    pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=4)
    db = Database(pool)

    m = StorageMigrator(db, args.dest_account)
    if args.verify:
        print(await m.verify())
    else:
        print(await m.run(dry_run=not args.execute, limit=args.limit))
    return 0


if __name__ == "__main__":
    import asyncio as _a
    raise SystemExit(_a.run(_main()))
