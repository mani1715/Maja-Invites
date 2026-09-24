"""
storage.orchestrator — account selection, folders, quotas, reliability.
=======================================================================

The single entry point business logic uses. Providers (Drive/S3/R2) are
interchangeable behind it (charter §MIGRATION READINESS).

Responsibilities
----------------
* **Account pool** (`db.storage_accounts`): one CURRENT drive receives uploads;
  atomic capacity reservation; switch to the next drive at the soft limit (80%);
  failover on quota/availability errors; new accounts join the pool live.
* **Folder registry** (`db.storage_folders`): the charter hierarchy
  (Photographers/<Name>/{Events/<Event>/{QR_Photos,Selfies}, Portfolio,
  Cloud_Storage}) provisioned once per (photographer|event) × account and
  cached BY ID — the upload hot path does zero provider folder lookups and
  never addresses folders by name.
* **Upload pipeline** (`db.storage_files` + `db.upload_logs`): sha256 dedup →
  write-ahead log → reserve → provider.upload (resumable/chunked inside) →
  metadata + rollups → log complete. A DB failure after the provider write
  leaves an `orphan_check` log row for the daily reconciler (failure case 5).
* **Rollups** (`db.photographer_storage`, `db.event_storage`): `$inc`-maintained
  so the dashboard never scans millions of `storage_files` rows.

Concurrency note (verified against pg_adapter): the generic
`find_one_and_update` puts filter guards in an inner subquery which Postgres
does NOT re-check after a lock wait — so the capacity reservation uses one raw
conditional UPDATE with the guard in the OUTER where (`_reserve`). Tests
override `_reserve/_release` with in-memory equivalents; the SQL itself is
exercised by `tests/test_storage_race.py` against a live Postgres.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .base import (
    FolderRef,
    ProviderObject,
    ProviderQuotaExceeded,
    ProviderUnavailable,
    StorageError,
)
from .crypto import decrypt_credentials, encrypt_credentials

logger = logging.getLogger("storage.orchestrator")

# Folder areas and their tree relationships (charter §PHOTOGRAPHER/EVENT STRUCTURE)
TOP_FOLDER = "Photographers"
# `community` and `media` were added when Drive became the PRIMARY store rather
# than a mirror. Before that, pixora_service passed area="community" into a
# resolver that only knew four areas, so it raised "Unknown upload area" — and
# because mirroring is fire-and-forget inside `try/except: pass`, every single
# community post and reel failed to reach the pool in silence. `media` covers
# the studio-level odds and ends that write straight to /app/uploads (dashboard
# images, videos, music, voice messages) and previously had no hook at all.
UPLOAD_AREAS = ("qr_photos", "selfies", "portfolio", "cloud_storage",
                "community", "media")
# Photographer-level areas: no event_id, one folder per studio per drive.
_STUDIO_AREAS = ("portfolio", "cloud_storage", "community", "media")
# Event-level areas: live under Events/<Event>/, event_id required.
_EVENT_AREAS = ("qr_photos", "selfies")
_AREA_NAMES = {
    "events": "Events",
    "portfolio": "Portfolio",
    "cloud_storage": "Cloud_Storage",
    "qr_photos": "QR_Photos",
    "selfies": "Selfies",
    "community": "Community",
    "media": "Media",
}

COLLECTIONS = (
    "storage_accounts", "storage_folders", "storage_files", "upload_logs",
    "photographer_storage", "event_storage", "storage_usage_analytics",
    "storage_event_deletions",
)

_DEGRADE_AFTER_FAILURES = 3      # consecutive failures before status=degraded
_MAX_ACCOUNT_ATTEMPTS = 3        # distinct drives tried per upload
SOFT_DELETE_RETENTION_DAYS = 5   # deleted event storage is recoverable for 5 days

# Owner decision 2026-08-06: S3+CloudFront is primary, Drive retired. Callers
# that don't pass an explicit kind get this; explicit kind= args still win.
DEFAULT_PROVIDER = os.environ.get("STORAGE_DEFAULT_PROVIDER", "s3")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _file_type(content_type: str, filename: str) -> str:
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("video/"):
        return "video"
    if "zip" in ct or (filename or "").lower().endswith(".zip"):
        return "zip"
    return "other"


class StorageOrchestrator:
    def __init__(self, db, provider_factory=None):
        self.db = db
        if provider_factory is None:
            from . import get_provider as provider_factory  # lazy: avoid cycle
        self._provider_factory = provider_factory
        self._ready = False
        # Serializes folder CREATION only (cache hits skip it) — prevents two
        # concurrent first-uploads from double-creating a Drive folder.
        self._provision_lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # setup
    # ------------------------------------------------------------------ #
    async def ensure_ready(self) -> None:
        if self._ready:
            return
        ensure = getattr(self.db, "ensure_table", None)
        if ensure:
            for name in COLLECTIONS:
                await ensure(name)
        self._ready = True

    def _provider(self, account: Dict[str, Any]):
        return self._provider_factory(account.get("kind") or "gdrive")

    @staticmethod
    def _with_credentials(account: Dict[str, Any]) -> Dict[str, Any]:
        """Return a copy with credentials decrypted for provider calls.
        The encrypted blob never leaves this module in plaintext form."""
        acc = dict(account)
        enc = acc.pop("credentials_enc", None)
        if enc:
            acc["credentials"] = decrypt_credentials(enc)
        return acc

    # ------------------------------------------------------------------ #
    # account pool
    # ------------------------------------------------------------------ #
    async def add_account(
        self,
        *,
        kind: str = "gdrive",  # explicit admin action — callers pass kind; legacy default kept for the pool tests' contract
        label: str,
        capacity_bytes: int,
        credential_mode: str = "oauth",
        credentials: Optional[Dict[str, Any]] = None,
        soft_limit_pct: int = 95,   # 15 TB drives: 80 stranded ~3 TB each; 95 is safe
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Register a new pooled drive. Joins the pool live — the selection
        loop sees it on the next upload (charter: add accounts, no downtime)."""
        await self.ensure_ready()
        existing = await self._all_accounts()
        order = 1 + max((int(a.get("pool_order") or 0) for a in existing), default=0)
        doc: Dict[str, Any] = {
            "id": f"acc_{uuid.uuid4().hex[:10]}",
            "kind": kind,
            "label": label,
            "status": "active",                # active|degraded|disabled|full
            "slot": "standby",                 # current|standby (string, queryable)
            "credential_mode": credential_mode,
            "capacity_bytes": int(capacity_bytes),
            "committed_bytes": 0,
            "soft_limit_pct": int(soft_limit_pct),
            "pool_order": order,
            "consecutive_failures": 0,
            "last_health_ok_at": None,
            "last_quota_sync_at": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        if extra:
            doc.update(extra)
        if credentials:
            doc["credentials_enc"] = encrypt_credentials(credentials)
        # First eligible account of its kind becomes current automatically.
        has_current = any(
            a.get("slot") == "current" and a.get("kind") == kind for a in existing
        )
        if not has_current:
            doc["slot"] = "current"
        await self.db.storage_accounts.insert_one(doc)
        return doc

    async def _all_accounts(self) -> List[Dict[str, Any]]:
        cur = self.db.storage_accounts.find({})
        docs = [d async for d in cur]
        for d in docs:
            d.pop("_id", None)
        return docs

    async def current_account(self, kind: str = DEFAULT_PROVIDER) -> Optional[Dict[str, Any]]:
        """The single drive receiving uploads (charter rule: one active drive).
        Self-heals: if no current account exists (fresh pool, or the current
        one was disabled), promotes the lowest-pool_order active account.
        No-arg callers get DEFAULT_PROVIDER (s3 post-cutover); when that pool
        is empty — a pre-cutover deployment holding only legacy gdrive
        accounts — fall back to the gdrive pool so provisioning/mirroring
        never silently dies. Explicit kind= callers get exact semantics."""
        await self.ensure_ready()
        doc = await self.db.storage_accounts.find_one({"slot": "current", "kind": kind})
        if doc and doc.get("status") == "active":
            doc.pop("_id", None)
            return doc
        result = await self._promote_next(prev_id=(doc or {}).get("id"),
                                          prev_status=(doc or {}).get("status") or "disabled",
                                          kind=kind)
        if result is None and kind == DEFAULT_PROVIDER and kind != "gdrive":
            return await self.current_account("gdrive")
        return result

    async def _promote_next(
        self, prev_id: Optional[str], prev_status: str, kind: str = "gdrive",
    ) -> Optional[Dict[str, Any]]:
        """Move the CURRENT pointer to the next active account by pool_order.
        Existing files stay where they are (charter rule 3). Idempotent under
        races: two concurrent switches settle on the same next account."""
        if prev_id:
            await self.db.storage_accounts.update_one(
                {"id": prev_id},
                {"$set": {"slot": "standby", "status": prev_status,
                          "updated_at": _now()}},
            )
        candidates = [
            a for a in await self._all_accounts()
            if a.get("kind") == kind and a.get("status") == "active"
            and a.get("id") != prev_id
        ]
        candidates.sort(key=lambda a: int(a.get("pool_order") or 0))
        if not candidates:
            logger.error("storage-pool: NO eligible %s account left (prev=%s)", kind, prev_id)
            return None
        nxt = candidates[0]
        await self.db.storage_accounts.update_one(
            {"id": nxt["id"]}, {"$set": {"slot": "current", "updated_at": _now()}},
        )
        nxt["slot"] = "current"
        logger.warning("storage-pool: switched current %s drive %s -> %s (%s)",
                       kind, prev_id, nxt["id"], prev_status)
        return nxt

    async def _bump_failure(self, account: Dict[str, Any]) -> None:
        """Failure case 3: consecutive failures degrade the account so
        selection skips it; the health loop restores it on recovery."""
        fails = int(account.get("consecutive_failures") or 0) + 1
        update: Dict[str, Any] = {"consecutive_failures": fails, "updated_at": _now()}
        status = account.get("status") or "active"
        if fails >= _DEGRADE_AFTER_FAILURES:
            status = "degraded"
        await self.db.storage_accounts.update_one(
            {"id": account["id"]},
            {"$set": {**update, "status": status}},
        )
        if status == "degraded" and account.get("slot") == "current":
            await self._promote_next(account["id"], "degraded", account.get("kind") or "gdrive")

    # ------------------------------------------------------------------ #
    # atomic capacity reservation (raw SQL — see module docstring)
    # ------------------------------------------------------------------ #
    async def _reserve(self, account_id: str, size: int) -> bool:
        """Atomically add `size` to committed_bytes IF it stays under the soft
        limit. Guard in the OUTER where → re-checked under the row lock →
        two concurrent uploads can never both cross 80%."""
        pool = getattr(self.db, "pool", None)
        if pool is None:
            raise StorageError("Database pool unavailable for atomic reservation")
        sql = """
            UPDATE storage_accounts
               SET data = jsonb_set(data, '{committed_bytes}',
                        to_jsonb((COALESCE((data->>'committed_bytes')::bigint, 0) + $2)::bigint)),
                   updated_at = now()
             WHERE id = $1
               AND COALESCE((data->>'committed_bytes')::bigint, 0) + $2
                   <= ((data->>'capacity_bytes')::bigint
                       * COALESCE((data->>'soft_limit_pct')::bigint, 95)) / 100
             RETURNING (data->>'committed_bytes')::bigint AS committed
        """
        async with pool.acquire() as conn:
            row = await conn.fetchrow(sql, account_id, int(size))
        return row is not None

    async def _release(self, account_id: str, size: int) -> None:
        """Give reserved bytes back after a failed/aborted upload (floor 0)."""
        pool = getattr(self.db, "pool", None)
        if pool is None:
            raise StorageError("Database pool unavailable for atomic release")
        sql = """
            UPDATE storage_accounts
               SET data = jsonb_set(data, '{committed_bytes}',
                        to_jsonb(GREATEST(COALESCE((data->>'committed_bytes')::bigint, 0) - $2, 0)::bigint)),
                   updated_at = now()
             WHERE id = $1
        """
        async with pool.acquire() as conn:
            await conn.execute(sql, account_id, int(size))

    # ------------------------------------------------------------------ #
    # folder registry (IDs cached — zero name lookups on the upload path)
    # ------------------------------------------------------------------ #
    async def _get_or_create_folder(
        self,
        account: Dict[str, Any],
        *,
        area: str,
        display_name: str,
        photographer_id: Optional[str],
        event_id: Optional[str],
        parent_doc: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        flt = {
            "area": area,
            "drive_account_id": account["id"],
            "photographer_id": photographer_id,
            "event_id": event_id,
        }
        doc = await self.db.storage_folders.find_one(flt)
        if doc:
            doc.pop("_id", None)
            return doc
        async with self._provision_lock:
            # re-check under the lock — a concurrent creator may have won
            doc = await self.db.storage_folders.find_one(flt)
            if doc:
                doc.pop("_id", None)
                return doc
            provider = self._provider(account)
            parent_ref = FolderRef(ref=parent_doc["provider_ref"]) if parent_doc else None
            created = await provider.create_folder(
                self._with_credentials(account), display_name, parent_ref,
            )
            doc = {
                "id": f"fold_{uuid.uuid4().hex[:12]}",
                **flt,
                "provider_ref": created.to_dict(),
                "parent_folder_id": (parent_doc or {}).get("id"),
                "display_name": display_name,   # cosmetic ONLY — never used to address
                "created_at": _now(),
            }
            await self.db.storage_folders.insert_one(doc)
            return doc

    @staticmethod
    def _disambiguate(name: str, entity_id: str) -> str:
        """Folder display names are cosmetic (never identifiers), but Drive's
        find-or-create matches by name under a parent — two photographers both
        named 'Studio One' (or two 'Anita-Rahul' events) would otherwise MERGE
        into one provider folder. A short id suffix keeps every tree distinct."""
        suffix = (entity_id or "")[:8]
        return f"{name} [{suffix}]" if suffix else name

    async def ensure_photographer_tree(
        self, account: Dict[str, Any], photographer_id: str, display_name: str,
    ) -> Dict[str, Dict[str, Any]]:
        """Photographers/<Name>/{Events,Portfolio,Cloud_Storage,Community,Media}
        on `account`. Idempotent; called at registration and lazily on first
        upload to a new drive (per-drive-lazy tree — design §3). Studios
        provisioned before Community/Media existed pick them up on the next
        upload, because _get_or_create_folder is find-or-create per area."""
        top = await self._get_or_create_folder(
            account, area="photographers_root", display_name=TOP_FOLDER,
            photographer_id=None, event_id=None, parent_doc=None)
        root = await self._get_or_create_folder(
            account, area="root",
            display_name=self._disambiguate(display_name or photographer_id,
                                            photographer_id),
            photographer_id=photographer_id, event_id=None, parent_doc=top)
        out = {"root": root}
        for area in ("events",) + _STUDIO_AREAS:
            out[area] = await self._get_or_create_folder(
                account, area=area, display_name=_AREA_NAMES[area],
                photographer_id=photographer_id, event_id=None, parent_doc=root)
        return out

    async def ensure_event_tree(
        self,
        account: Dict[str, Any],
        photographer_id: str,
        photographer_name: str,
        event_id: str,
        event_name: str,
    ) -> Dict[str, Dict[str, Any]]:
        """Events/<EventName>/{QR_Photos,Selfies} on `account`. Idempotent."""
        tree = await self.ensure_photographer_tree(account, photographer_id, photographer_name)
        event = await self._get_or_create_folder(
            account, area="event",
            display_name=self._disambiguate(event_name or event_id, event_id),
            photographer_id=photographer_id, event_id=event_id,
            parent_doc=tree["events"])
        out = {"event": event}
        for area in ("qr_photos", "selfies"):
            out[area] = await self._get_or_create_folder(
                account, area=area, display_name=_AREA_NAMES[area],
                photographer_id=photographer_id, event_id=event_id,
                parent_doc=event)
        return out

    async def _upload_folder(
        self,
        account: Dict[str, Any],
        *,
        area: str,
        photographer_id: str,
        photographer_name: str,
        event_id: Optional[str],
        event_name: Optional[str],
    ) -> Dict[str, Any]:
        """Resolve the destination folder doc for an upload — cached path is a
        single DB read; the create path runs only the first time a
        photographer/event lands on this drive."""
        if area in _EVENT_AREAS:
            if not event_id:
                raise StorageError(f"area '{area}' requires an event_id")
            cached = await self.db.storage_folders.find_one({
                "area": area, "drive_account_id": account["id"],
                "photographer_id": photographer_id, "event_id": event_id,
            })
            if cached:
                cached.pop("_id", None)
                return cached
            tree = await self.ensure_event_tree(
                account, photographer_id, photographer_name, event_id,
                event_name or event_id)
            return tree[area]
        if area in _STUDIO_AREAS:
            cached = await self.db.storage_folders.find_one({
                "area": area, "drive_account_id": account["id"],
                "photographer_id": photographer_id, "event_id": None,
            })
            if cached:
                cached.pop("_id", None)
                return cached
            tree = await self.ensure_photographer_tree(
                account, photographer_id, photographer_name)
            return tree[area]
        raise StorageError(f"Unknown upload area: {area!r} (expected one of {UPLOAD_AREAS})")

    # ------------------------------------------------------------------ #
    # upload pipeline (design §5)
    # ------------------------------------------------------------------ #
    async def upload_file(
        self,
        *,
        photographer_id: str,
        photographer_name: str,
        area: str,
        filename: str,
        data: bytes,
        content_type: str,
        event_id: Optional[str] = None,
        event_name: Optional[str] = None,
        kind: str = "gdrive",  # legacy default; production mirror (storage_pool_hooks) passes the current account's kind explicitly
        source_ref: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        await self.ensure_ready()
        if not data:
            raise StorageError("upload_file: empty payload")
        size = len(data)
        checksum = hashlib.sha256(data).hexdigest()

        # 1. duplicate short-circuit (failure case 6)
        dup = await self.db.storage_files.find_one({
            "photographer_id": photographer_id, "area": area,
            "event_id": event_id, "checksum_sha256": checksum,
        })
        if dup:
            dup.pop("_id", None)
            dup["duplicate"] = True
            return dup

        # 2. write-AHEAD log: the DB knows before the provider does (case 5)
        log_id = f"ulog_{uuid.uuid4().hex[:12]}"
        await self.db.upload_logs.insert_one({
            "id": log_id, "status": "pending",
            "photographer_id": photographer_id, "event_id": event_id,
            "area": area, "filename": filename, "size_bytes": size,
            "checksum_sha256": checksum, "attempts": 0,
            "drive_account_id": None, "error": None,
            "started_at": _now(), "finished_at": None,
        })

        attempts = 0
        last_error: Optional[str] = None
        while attempts < _MAX_ACCOUNT_ATTEMPTS:
            attempts += 1
            account = await self.current_account(kind)
            if account is None:
                last_error = "No eligible storage account in the pool"
                break

            # 3. atomic reservation; at soft cap → switch drive (cases 1 & rule 2)
            if not await self._reserve(account["id"], size):
                await self._promote_next(account["id"], "full", kind)
                continue

            await self.db.upload_logs.update_one(
                {"id": log_id},
                {"$set": {"status": "uploading", "drive_account_id": account["id"],
                          "attempts": attempts}},
            )
            try:
                # 4. cached folder ref — zero provider lookups on the hot path
                folder = await self._upload_folder(
                    account, area=area, photographer_id=photographer_id,
                    photographer_name=photographer_name,
                    event_id=event_id, event_name=event_name)
                provider = self._provider(account)
                obj: ProviderObject = await provider.upload(
                    self._with_credentials(account),
                    FolderRef(ref=folder["provider_ref"]),
                    filename, data, content_type,
                    meta={"photographer_id": photographer_id,
                          "event_id": event_id, "checksum_sha256": checksum},
                )
            except ProviderQuotaExceeded as e:
                await self._release(account["id"], size)
                await self._promote_next(account["id"], "full", kind)
                last_error = str(e)
                continue
            except ProviderUnavailable as e:
                await self._release(account["id"], size)
                await self._bump_failure(account)
                last_error = str(e)
                continue
            except StorageError as e:
                await self._release(account["id"], size)
                last_error = str(e)
                break

            # success → clear failure streak
            await self.db.storage_accounts.update_one(
                {"id": account["id"]},
                {"$set": {"consecutive_failures": 0, "updated_at": _now()}},
            )

            # 6. metadata + rollups. If THIS fails, the provider file exists but
            # the DB row doesn't → mark the log for the daily reconciler.
            file_doc = {
                "id": f"file_{uuid.uuid4().hex[:14]}",
                "photographer_id": photographer_id,
                "event_id": event_id,
                "area": area,
                "drive_account_id": account["id"],
                "folder_id": folder["id"],
                "provider_ref": obj.provider_ref,
                "filename": filename,
                "size_bytes": size,
                "content_type": content_type or "application/octet-stream",
                "file_type": _file_type(content_type, filename),
                "checksum_sha256": checksum,
                "upload_status": "stored",
                # flat correlation key back to the ORIGINAL source (disk path or
                # S3 key) so a later source-file delete can find + purge this
                # mirror exactly (mirror_delete). None when mirrored without a
                # source (e.g. reconciler adoption).
                "source_path": (source_ref or {}).get("path")
                or (source_ref or {}).get("key"),
                "uploaded_at": _now(),
            }
            try:
                await self.db.storage_files.insert_one(file_doc)
                await self._apply_rollups(photographer_id, event_id, area, size, +1)
            except Exception as e:
                await self.db.upload_logs.update_one(
                    {"id": log_id},
                    {"$set": {"status": "orphan_check", "error": str(e),
                              "provider_ref": obj.provider_ref,
                              "finished_at": _now()}},
                )
                raise StorageError(
                    f"Upload stored on drive but metadata write failed "
                    f"(will be reconciled): {e}") from e

            await self.db.upload_logs.update_one(
                {"id": log_id},
                {"$set": {"status": "completed", "file_id": file_doc["id"],
                          "finished_at": _now()}},
            )
            return file_doc

        # exhausted the pool
        await self.db.upload_logs.update_one(
            {"id": log_id},
            {"$set": {"status": "failed", "error": last_error, "finished_at": _now()}},
        )
        raise StorageError(f"Upload failed after {attempts} account attempt(s): {last_error}")

    async def _apply_rollups(
        self, photographer_id: str, event_id: Optional[str], area: str,
        size: int, count_delta: int,
    ) -> None:
        signed = size if count_delta > 0 else -size
        await self.db.photographer_storage.update_one(
            {"photographer_id": photographer_id},
            {"$inc": {"total_bytes": signed, "file_count": count_delta,
                      f"{area}_bytes": signed},
             "$set": {"updated_at": _now()},
             "$setOnInsert": {"id": f"ps_{uuid.uuid4().hex[:10]}",
                              "created_at": _now()}},
            upsert=True,
        )
        if event_id:
            await self.db.event_storage.update_one(
                {"event_id": event_id},
                {"$inc": {"total_bytes": signed, "file_count": count_delta,
                          f"{area}_bytes": signed},
                 "$set": {"photographer_id": photographer_id, "updated_at": _now()},
                 "$setOnInsert": {"id": f"es_{uuid.uuid4().hex[:10]}",
                                  "created_at": _now()}},
                upsert=True,
            )

    # ------------------------------------------------------------------ #
    # retrieval / deletion (minimal by charter)
    # ------------------------------------------------------------------ #
    async def _file_and_account(self, file_id: str):
        f = await self.db.storage_files.find_one({"id": file_id})
        if not f:
            raise StorageError(f"File not found: {file_id}")
        f.pop("_id", None)
        acc_id = f.get("drive_account_id")
        if not acc_id:
            # storage_upload.commit rows (direct browser->S3 presign/POST) never
            # go through the pooled-account path, so there is no account row to
            # find — that used to KeyError here. They ARE S3-resident, so hand
            # back a bare S3 account: S3Provider needs no credentials/bucket
            # override to sign a URL for provider_ref.key.
            pref = f.get("provider_ref") or {}
            if not pref.get("key") and f.get("source_path"):
                pref = {"key": f["source_path"]}
                f["provider_ref"] = pref
            return f, {"kind": "s3"}
        acc = await self.db.storage_accounts.find_one({"id": acc_id})
        if not acc:
            raise StorageError(f"Storage account missing for file {file_id}")
        acc.pop("_id", None)
        return f, acc

    async def download_file(self, file_id: str) -> bytes:
        """Raw bytes for a stored file, straight from its provider.

        The serving path (`storage_serve.py`) uses this rather than
        `get_download_url`, because a Drive `webContentLink` only resolves for
        a principal that can read the file — handing one to a guest's browser
        would mean publishing every wedding photo. Fetching here keeps the
        files private and keeps the public URL shape unchanged.
        """
        f, acc = await self._file_and_account(file_id)
        provider = self._provider(acc)
        return await provider.download(
            self._with_credentials(acc),
            ProviderObject(provider_ref=f["provider_ref"],
                           size_bytes=f.get("size_bytes", 0),
                           content_type=f.get("content_type", "")),
        )

    async def get_download_url(self, file_id: str, expiry_s: int = 3600) -> str:
        f, acc = await self._file_and_account(file_id)
        provider = self._provider(acc)
        handle = await provider.get_file(
            self._with_credentials(acc),
            ProviderObject(provider_ref=f["provider_ref"],
                           size_bytes=f.get("size_bytes", 0),
                           content_type=f.get("content_type", "")),
            expiry_s=expiry_s,
        )
        return handle.url

    async def delete_file(self, file_id: str) -> None:
        f, acc = await self._file_and_account(file_id)
        provider = self._provider(acc)
        await provider.delete(
            self._with_credentials(acc),
            ProviderObject(provider_ref=f["provider_ref"]),
        )
        await self.db.storage_files.delete_one({"id": file_id})
        await self._apply_rollups(f["photographer_id"], f.get("event_id"),
                                  f.get("area") or "cloud_storage",
                                  int(f.get("size_bytes") or 0), -1)
        # give the bytes back to the drive's committed counter (S3-resident
        # commit rows have no drive_account_id — _release(None, ...) is a
        # harmless no-op, nothing in storage_accounts matches)
        await self._release(f.get("drive_account_id"), int(f.get("size_bytes") or 0))

    async def delete_mirror(
        self,
        photographer_id: str,
        *,
        source_path: Optional[str] = None,
        filename: Optional[str] = None,
        area: Optional[str] = None,
        event_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Delete the pooled mirror(s) of a source file that was just deleted by
        the app, releasing bytes + fixing rollups (via delete_file). Correlates
        EXACTLY on (photographer_id, source_path) — the disk path / S3 key the
        mirror was stored under — falling back to (photographer_id, area,
        filename) when no source_path is available.

        Idempotent by construction: if the mirror is already gone (or never
        existed / the pool is disabled at the call site) it matches nothing and
        is a no-op. A provider failure leaves the row for the daily reconciler
        rather than dropping the metadata."""
        await self.ensure_ready()
        result = {"deleted": 0, "failed": 0, "bytes_released": 0, "matched": 0}
        if not photographer_id:
            return result
        flt: Dict[str, Any] = {"photographer_id": photographer_id}
        if source_path:
            flt["source_path"] = source_path
        elif filename:
            flt["filename"] = filename
            if area:
                flt["area"] = area
        else:
            return result      # nothing to correlate on — refuse a blind match
        matches: List[Dict[str, Any]] = []
        async for f in self.db.storage_files.find(flt):
            f.pop("_id", None)
            if event_id and f.get("event_id") != event_id:
                continue
            matches.append(f)
        result["matched"] = len(matches)
        for f in matches:
            sz = int(f.get("size_bytes") or 0)
            try:
                await self.delete_file(f["id"])
                result["deleted"] += 1
                result["bytes_released"] += sz
            except Exception as e:
                result["failed"] += 1
                logger.warning("delete_mirror: file %s failed (kept for reconcile): %s",
                               f.get("id"), e)
        return result

    async def list_files(
        self,
        *,
        photographer_id: Optional[str] = None,
        event_id: Optional[str] = None,
        area: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """DB-backed listing (indexed) — provider list_files is reserved for
        reconciliation, per the performance requirements."""
        flt: Dict[str, Any] = {}
        if photographer_id:
            flt["photographer_id"] = photographer_id
        if event_id:
            flt["event_id"] = event_id
        if area:
            flt["area"] = area
        cur = self.db.storage_files.find(flt).sort("uploaded_at", -1) \
            .skip(max(0, offset)).limit(min(max(1, limit), 500))
        out = []
        async for d in cur:
            d.pop("_id", None)
            out.append(d)
        return out

    # ------------------------------------------------------------------ #
    # 5-day event soft-delete (recycle → purge + byte release)
    # ------------------------------------------------------------------ #
    @staticmethod
    def _parse_iso(s):
        try:
            dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    @classmethod
    def _purge_after(cls, deleted_at):
        from datetime import timedelta
        dt = cls._parse_iso(deleted_at)
        return (dt + timedelta(days=SOFT_DELETE_RETENTION_DAYS)).isoformat() if dt else None

    async def soft_delete_event(self, event_id, photographer_id=None):
        """Mark an event's pooled storage for deletion. Recoverable for
        SOFT_DELETE_RETENTION_DAYS; the daily job purges it afterwards.
        Idempotent — a second delete returns the existing recycle row."""
        await self.ensure_ready()
        if not event_id:
            return None
        existing = await self.db.storage_event_deletions.find_one(
            {"event_id": event_id, "status": "recycle"})
        if existing:
            existing.pop("_id", None)
            return existing
        if not photographer_id:
            es = await self.db.event_storage.find_one({"event_id": event_id})
            photographer_id = (es or {}).get("photographer_id")
        doc = {
            "id": f"del_{uuid.uuid4().hex[:12]}",
            "event_id": event_id,
            "photographer_id": photographer_id,
            "status": "recycle",              # recycle | purged
            "deleted_at": _now(),
            "purge_attempts": 0,
            "last_error": None,
        }
        await self.db.storage_event_deletions.insert_one(doc)
        return doc

    async def restore_event(self, event_id):
        """Cancel a pending deletion (admin restore during the recycle window)."""
        await self.ensure_ready()
        rows = []
        async for d in self.db.storage_event_deletions.find(
                {"event_id": event_id, "status": "recycle"}):
            d.pop("_id", None)
            rows.append(d)
        for d in rows:
            await self.db.storage_event_deletions.delete_one({"id": d["id"]})
        return len(rows)

    async def list_deleted_events(self):
        """Recycle-bin listing with a purge-after timestamp for the dashboard."""
        await self.ensure_ready()
        out = []
        async for d in self.db.storage_event_deletions.find({"status": "recycle"}):
            d.pop("_id", None)
            d["retention_days"] = SOFT_DELETE_RETENTION_DAYS
            d["purge_after"] = self._purge_after(d.get("deleted_at"))
            out.append(d)
        return out

    async def _delete_event_folders(self, event_id):
        """Delete the event's QR_Photos, Selfies and Event folders from every
        drive they live on (children before parent). Best-effort + idempotent."""
        deleted = failed = 0
        rows = []
        async for fdoc in self.db.storage_folders.find({"event_id": event_id}):
            fdoc.pop("_id", None)
            rows.append(fdoc)
        order = {"qr_photos": 0, "selfies": 0, "event": 1}   # children first
        rows.sort(key=lambda r: order.get(r.get("area"), 2))
        for fdoc in rows:
            acc = await self.db.storage_accounts.find_one(
                {"id": fdoc.get("drive_account_id")})
            try:
                if acc:
                    acc.pop("_id", None)
                    await self._provider(acc).delete(
                        self._with_credentials(acc),
                        ProviderObject(provider_ref=fdoc["provider_ref"]))
                await self.db.storage_folders.delete_one({"id": fdoc["id"]})
                deleted += 1
            except Exception as e:
                failed += 1
                logger.warning("soft-delete: folder %s delete failed: %s", fdoc.get("id"), e)
        return deleted, failed

    async def purge_event_storage(self, event_id):
        """Permanently delete an event's pooled files + folders and RELEASE the
        committed bytes (delete_file handles provider delete + rollup + release).
        Resumable/best-effort: returns counts + `complete` so the caller keeps the
        recycle row for retry if anything failed."""
        await self.ensure_ready()
        files_deleted = files_failed = bytes_released = 0
        while True:
            batch = await self.list_files(event_id=event_id, limit=200)
            if not batch:
                break
            progressed = False
            for f in batch:
                try:
                    sz = int(f.get("size_bytes") or 0)
                    await self.delete_file(f["id"])
                    files_deleted += 1
                    bytes_released += sz
                    progressed = True
                except Exception as e:
                    files_failed += 1
                    logger.warning("soft-delete: file %s purge failed: %s", f.get("id"), e)
            if not progressed:
                break     # only undeletable files remain → avoid an infinite loop
        folders_deleted, folders_failed = await self._delete_event_folders(event_id)
        complete = files_failed == 0 and folders_failed == 0
        if complete:
            await self.db.event_storage.delete_many({"event_id": event_id})
        return {"complete": complete, "files_deleted": files_deleted,
                "files_failed": files_failed, "bytes_released": bytes_released,
                "folders_deleted": folders_deleted, "folders_failed": folders_failed}

    async def purge_expired_deleted_events(self, retention_days=SOFT_DELETE_RETENTION_DAYS):
        """Daily job: purge events whose recycle window has elapsed. On partial
        failure the recycle row is kept (attempt counter + error) for the next run."""
        await self.ensure_ready()
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
        summary = {"events_purged": 0, "events_failed": 0,
                   "files_deleted": 0, "bytes_released": 0}
        rows = []
        async for d in self.db.storage_event_deletions.find({"status": "recycle"}):
            d.pop("_id", None)
            rows.append(d)
        for d in rows:
            if (d.get("deleted_at") or "") >= cutoff:
                continue      # still inside the recycle window
            try:
                res = await self.purge_event_storage(d["event_id"])
            except Exception as e:
                res = {"complete": False}
                logger.error("soft-delete: purge_event_storage(%s) crashed: %s",
                             d.get("event_id"), e)
            summary["files_deleted"] += res.get("files_deleted", 0)
            summary["bytes_released"] += res.get("bytes_released", 0)
            if res.get("complete"):
                await self.db.storage_event_deletions.update_one(
                    {"id": d["id"]}, {"$set": {"status": "purged", "purged_at": _now()}})
                summary["events_purged"] += 1
            else:
                await self.db.storage_event_deletions.update_one(
                    {"id": d["id"]},
                    {"$set": {"last_error": "purge incomplete — will retry",
                              "last_attempt_at": _now()},
                     "$inc": {"purge_attempts": 1}})
                summary["events_failed"] += 1
        return summary
