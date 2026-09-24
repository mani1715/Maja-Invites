"""
Self-test for the StorageOrchestrator pipeline (no cloud, no Postgres).

    cd backend && python -m tests.test_storage_orchestrator

Uses an in-memory Mongo-ish FakeDB + an in-memory provider, with the atomic
reservation overridden by a lock-guarded in-memory equivalent that mirrors the
raw-SQL semantics (the SQL itself is exercised by tests/test_storage_race.py
against a live Postgres).

Covers:
  1. Pool bootstrap: first account becomes CURRENT; later ones standby.
  2. Charter folder hierarchy provisioned once, by ID, and cached
     (provider.create_folder call count stays flat on repeat uploads).
  3. Upload pipeline: write-ahead log -> completed; metadata row; rollups.
  4. Duplicate detection by sha256 (case 6).
  5. 80% soft limit: reservation refuses; pointer switches to next drive; the
     upload transparently lands on drive 2; existing files stay on drive 1.
  6. ProviderQuotaExceeded mid-upload -> drive marked full, failover (case 1).
  7. ProviderUnavailable -> release + degrade after threshold, failover (case 3).
  8. Pool exhaustion -> upload_logs row 'failed' with the real error.
  9. delete_file: provider delete + rollup decrement + committed release.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from typing import Any, Dict, List, Optional

# fake aws_service before any storage import (keeps boto3 out)
from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()


# --------------------------------------------------------------------------- #
# In-memory Mongo-ish DB (equality filters only — all the orchestrator uses)
# --------------------------------------------------------------------------- #
class _Cursor:
    def __init__(self, docs: List[Dict]):
        self._docs = docs

    def sort(self, key, direction=1):
        self._docs = sorted(self._docs, key=lambda d: (d.get(key) is None, d.get(key)),
                            reverse=(direction == -1))
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    # pg_adapter (and motor) both expose to_list; without it a caller that
    # wraps its read in try/except silently falls back to its defaults and the
    # test passes while never touching the fake DB at all.
    async def to_list(self, length=None):
        docs = [dict(d) for d in self._docs]
        return docs if length is None else docs[:length]

    def __aiter__(self):
        self._it = iter([dict(d) for d in self._docs])
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class _UpdateResult:
    """The subset of a Mongo/pg_adapter UpdateResult that callers actually read."""
    def __init__(self, matched=0, modified=0, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id


class _Collection:
    def __init__(self):
        self.docs: List[Dict] = []

    @staticmethod
    def _match(doc, flt):
        # Operators the real pg_adapter supports. Anything NOT handled here used
        # to be silently ignored, which quietly turns a filtered query into
        # "match everything" and lets a suite pass while testing nothing — the
        # same trap as the missing `to_list` on the cursor. Unknown operators now
        # raise instead of lying.
        _CMP = {"$lt": lambda a, b: a is not None and a < b,
                "$lte": lambda a, b: a is not None and a <= b,
                "$gt": lambda a, b: a is not None and a > b,
                "$gte": lambda a, b: a is not None and a >= b,
                "$ne": lambda a, b: a != b,
                "$in": lambda a, b: a in (b or []),
                "$nin": lambda a, b: a not in (b or []),
                "$eq": lambda a, b: a == b}
        for k, v in (flt or {}).items():
            if k == "$or":
                if not any(_Collection._match(doc, c) for c in (v or [])):
                    return False
                continue
            if k == "$and":
                if not all(_Collection._match(doc, c) for c in (v or [])):
                    return False
                continue
            if isinstance(v, dict) and any(op.startswith("$") for op in v):
                dv = doc.get(k)
                for op, val in v.items():
                    if op == "$exists":
                        if bool(val) != (k in doc):
                            return False
                    elif op in _CMP:
                        if not _CMP[op](dv, val):
                            return False
                    else:
                        raise NotImplementedError(
                            f"FakeDB._match: operator {op} is not implemented — "
                            "add it rather than letting the filter pass everything")
            elif doc.get(k) != v:
                return False
        return True

    async def count_documents(self, flt=None):
        """Mirrors pg_adapter.Collection.count_documents. Its absence is why a
        count-based code path could not be tested at all."""
        return sum(1 for d in self.docs if self._match(d, flt))

    async def find_one(self, flt=None, *a, **k):
        for d in self.docs:
            if self._match(d, flt):
                return dict(d)
        return None

    def find(self, flt=None, *a, **k):
        return _Cursor([d for d in self.docs if self._match(d, flt)])

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def insert_many(self, docs):
        # pg_adapter.insert_many parity — studio_storage's seeder uses it.
        for d in docs:
            self.docs.append(dict(d))

    async def update_one(self, flt, update, upsert=False):
        # Mirror pg_adapter/motor: return a result carrying matched/modified counts.
        # Returning None let a caller that checks `res.matched_count == 0` (e.g. the
        # wishes approve/reject 404 guard) blow up in tests while working in prod.
        for d in self.docs:
            if self._match(d, flt):
                self._apply(d, update)
                return _UpdateResult(matched=1, modified=1)
        if upsert:
            nd = {k: v for k, v in (flt or {}).items()}
            self._apply(nd, update, is_insert=True)
            self.docs.append(nd)
            return _UpdateResult(matched=0, modified=0, upserted_id=nd.get("id"))
        return _UpdateResult(matched=0, modified=0)

    async def update_many(self, flt, update):
        # Mirror pg_adapter/motor: apply to EVERY matching doc.
        n = 0
        for d in self.docs:
            if self._match(d, flt):
                self._apply(d, update)
                n += 1
        return _UpdateResult(matched=n, modified=n)

    async def find_one_and_update(self, flt, update, **kwargs):
        # Mirror pg_adapter: atomic claim, returns the AFTER-image (or None
        # when the filter matched nothing — how CAS losers detect they lost).
        for d in self.docs:
            if self._match(d, flt):
                self._apply(d, update)
                return dict(d)
        return None

    async def delete_one(self, flt):
        for i, d in enumerate(self.docs):
            if self._match(d, flt):
                del self.docs[i]
                return

    async def delete_many(self, flt):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._match(d, flt)]
        # Mirror pg_adapter: return a result carrying deleted_count (callers such
        # as _daily_trash_purge log res.deleted_count).
        return _UpdateResult(matched=before - len(self.docs), modified=before - len(self.docs))

    @staticmethod
    def _apply(doc, update, is_insert=False):
        for k, v in update.get("$set", {}).items():
            doc[k] = v
        for k, v in update.get("$inc", {}).items():
            doc[k] = doc.get(k, 0) + v
        if is_insert:
            for k, v in update.get("$setOnInsert", {}).items():
                doc.setdefault(k, v)


class FakeDB:
    def __init__(self):
        self._cols: Dict[str, _Collection] = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._cols.setdefault(name, _Collection())

    async def ensure_table(self, name):
        self._cols.setdefault(name, _Collection())


# --------------------------------------------------------------------------- #
# In-memory provider + test orchestrator (in-memory atomic reservation)
# --------------------------------------------------------------------------- #
from storage.base import (StorageProvider, ProviderObject, FolderRef, FileHandle,
                          FileList, QuotaSnapshot, HealthSnapshot,
                          ProviderQuotaExceeded, ProviderUnavailable)
from storage.orchestrator import StorageOrchestrator


class MemProvider(StorageProvider):
    kind = "gdrive"

    def __init__(self):
        self.folders: Dict[str, str] = {}     # folder_id -> name
        self.files: Dict[str, bytes] = {}     # file_id -> data
        self.create_folder_calls = 0
        self.fail_quota_on_account: Optional[str] = None
        self.fail_unavailable_on_account: Optional[str] = None
        self._n = 0

    def _nid(self, p):
        self._n += 1
        return f"{p}{self._n:04d}"

    async def create_folder(self, account, name, parent=None):
        self.create_folder_calls += 1
        fid = self._nid("gf_")
        self.folders[fid] = name
        return FolderRef(ref={"folder_id": fid})

    async def upload(self, account, folder, filename, data, content_type, meta=None):
        if self.fail_quota_on_account is not None \
                and account.get("id") == self.fail_quota_on_account:
            raise ProviderQuotaExceeded("drive says: storage quota exceeded")
        if self.fail_unavailable_on_account is not None \
                and account.get("id") == self.fail_unavailable_on_account:
            raise ProviderUnavailable("drive says: 503")
        fid = self._nid("gd_")
        self.files[fid] = data
        return ProviderObject(
            provider_ref={"file_id": fid, "folder_id": folder.ref["folder_id"]},
            size_bytes=len(data), content_type=content_type)

    async def get_file(self, account, ref, expiry_s=3600):
        return FileHandle(url=f"drive://{ref.provider_ref['file_id']}")

    async def download(self, account, ref):
        fid = ref.provider_ref.get("file_id")
        if fid not in self.files:
            from storage.base import ProviderUnavailable
            raise ProviderUnavailable("404: not found")
        return self.files[fid]

    async def delete(self, account, ref):
        self.files.pop(ref.provider_ref.get("file_id"), None)

    async def list_files(self, account, folder, page_token=None):
        return FileList(files=[])

    async def quota(self, account):
        return QuotaSnapshot(0, 0, "now")

    async def health(self, account):
        return HealthSnapshot(ok=True, checked_at="now")


class TestOrchestrator(StorageOrchestrator):
    """Overrides ONLY the raw-SQL reservation with a lock-guarded in-memory
    equivalent that mirrors the SQL semantics exactly."""

    def __init__(self, db, provider):
        super().__init__(db, provider_factory=lambda kind: provider)
        self._lock = asyncio.Lock()

    async def _reserve(self, account_id, size):
        async with self._lock:
            acc = await self.db.storage_accounts.find_one({"id": account_id})
            if not acc:
                return False
            committed = int(acc.get("committed_bytes") or 0)
            cap = int(acc.get("capacity_bytes") or 0)
            soft = int(acc.get("soft_limit_pct") or 80)
            if committed + size > cap * soft // 100:
                return False
            await self.db.storage_accounts.update_one(
                {"id": account_id}, {"$inc": {"committed_bytes": size}})
            return True

    async def _release(self, account_id, size):
        async with self._lock:
            acc = await self.db.storage_accounts.find_one({"id": account_id})
            if not acc:
                return
            new = max(0, int(acc.get("committed_bytes") or 0) - size)
            await self.db.storage_accounts.update_one(
                {"id": account_id}, {"$set": {"committed_bytes": new}})


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _run():
    db = FakeDB()
    prov = MemProvider()
    orch = TestOrchestrator(db, prov)

    print("1. pool bootstrap")
    a1 = await orch.add_account(label="drive-01", capacity_bytes=1000,
                                credentials={"refresh_token": "r1"})
    a2 = await orch.add_account(label="drive-02", capacity_bytes=1000,
                                credentials={"refresh_token": "r2"})
    a3 = await orch.add_account(label="drive-03", capacity_bytes=1000,
                                credentials={"refresh_token": "r3"})
    _check(a1["slot"] == "current" and a2["slot"] == "standby",
           "first account becomes CURRENT, later ones standby")
    stored = await db.storage_accounts.find_one({"id": a1["id"]})
    _check("refresh_token" not in str(stored.get("credentials_enc", "")),
           "credentials stored encrypted, never plaintext")

    print("2. folder hierarchy (charter structure, cached by ID)")
    f1 = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One",
        area="qr_photos", event_id="ev1", event_name="Anita & Rahul",
        filename="photo_0001.jpg", data=b"AAA", content_type="image/jpeg")
    created_after_first = prov.create_folder_calls
    # Photographers + root + Events + Portfolio + Cloud_Storage + Community
    # + Media + event + QR + Selfies = 10
    _check(created_after_first == 10,
           f"first upload provisions the full tree once ({created_after_first} folders)")
    areas = {}
    async for d in db.storage_folders.find({}):
        areas[d["area"]] = d
    for area in ("photographers_root", "root", "events", "event",
                 "qr_photos", "selfies", "portfolio", "cloud_storage",
                 "community", "media"):
        _check(area in areas, f"folder registry has '{area}' with provider id "
                              f"{areas.get(area, {}).get('provider_ref')}")
    f2 = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One",
        area="qr_photos", event_id="ev1",
        filename="photo_0002.jpg", data=b"BBB", content_type="image/jpeg")
    _check(prov.create_folder_calls == created_after_first,
           "second upload creates ZERO folders (registry cache hit)")

    print("3. pipeline bookkeeping")
    _check(f1["upload_status"] == "stored" and f1["drive_account_id"] == a1["id"],
           "file row stored on drive-01")
    log = await db.upload_logs.find_one({"file_id": f1["id"]})
    _check(log and log["status"] == "completed", "write-ahead log -> completed")
    ps = await db.photographer_storage.find_one({"photographer_id": "ph1"})
    _check(ps["total_bytes"] == 6 and ps["file_count"] == 2
           and ps["qr_photos_bytes"] == 6, "photographer rollup correct")
    es = await db.event_storage.find_one({"event_id": "ev1"})
    _check(es["total_bytes"] == 6 and es["file_count"] == 2, "event rollup correct")

    print("4. duplicate detection (sha256)")
    d = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One",
        area="qr_photos", event_id="ev1",
        filename="photo_0001_copy.jpg", data=b"AAA", content_type="image/jpeg")
    _check(d.get("duplicate") is True and d["id"] == f1["id"],
           "same bytes short-circuit to the existing row")

    print("5. 80% soft limit -> automatic drive switch")
    # drive-01 capacity 1000, soft cap 800, committed 6 → a 795-byte file fits
    big1 = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One",
        area="cloud_storage", filename="a.zip", data=b"z" * 794,
        content_type="application/zip")
    _check(big1["drive_account_id"] == a1["id"], "fits under 80% -> stays on drive-01")
    big2 = await orch.upload_file(
        photographer_id="ph1", photographer_name="Studio One",
        area="cloud_storage", filename="b.zip", data=b"y" * 500,
        content_type="application/zip")
    _check(big2["drive_account_id"] == a2["id"],
           "over 80% -> switched, upload landed on drive-02")
    acc1 = await db.storage_accounts.find_one({"id": a1["id"]})
    acc2 = await db.storage_accounts.find_one({"id": a2["id"]})
    _check(acc1["status"] == "full" and acc1["slot"] == "standby"
           and acc2["slot"] == "current", "pointer moved; drive-01 marked full")
    still = await db.storage_files.find_one({"id": big1["id"]})
    _check(still["drive_account_id"] == a1["id"],
           "existing files REMAIN on the old drive (charter rule 3)")

    print("6. provider quota error mid-upload -> failover (case 1)")
    prov.fail_quota_on_account = a2["id"]
    acc2_before = await db.storage_accounts.find_one({"id": a2["id"]})
    f3 = await orch.upload_file(
        photographer_id="ph2", photographer_name="Studio Two",
        area="portfolio", filename="p.jpg", data=b"P" * 10,
        content_type="image/jpeg")
    _check(f3["drive_account_id"] == a3["id"],
           "quota error on drive-02 -> landed on drive-03")
    acc2 = await db.storage_accounts.find_one({"id": a2["id"]})
    _check(acc2["status"] == "full", "drive-02 marked full")
    _check(int(acc2.get("committed_bytes") or 0)
           == int(acc2_before.get("committed_bytes") or 0),
           "failed reservation fully released on drive-02 (committed unchanged)")
    prov.fail_quota_on_account = None

    print("7. provider unavailable -> degrade + failover (case 3)")
    prov.fail_unavailable_on_account = a3["id"]
    acc3_before = await db.storage_accounts.find_one({"id": a3["id"]})
    # every attempt hits a3 (the only active drive) until retries are exhausted
    try:
        await orch.upload_file(
            photographer_id="ph2", photographer_name="Studio Two",
            area="portfolio", filename="q.jpg", data=b"Q" * 10,
            content_type="image/jpeg")
    except Exception:
        pass  # expected: pool has no healthy drive left
    acc3 = await db.storage_accounts.find_one({"id": a3["id"]})
    _check(acc3["consecutive_failures"] >= 3, "failures counted on drive-03")
    _check(acc3["status"] == "degraded",
           "drive-03 degraded after the failure threshold")
    _check(int(acc3.get("committed_bytes") or 0)
           == int(acc3_before.get("committed_bytes") or 0),
           "every failed attempt released its reservation (committed unchanged)")
    prov.fail_unavailable_on_account = None

    print("8. pool exhaustion -> honest failure recorded")
    # disable everything
    for a in (a1, a2, a3):
        await db.storage_accounts.update_one(
            {"id": a["id"]}, {"$set": {"status": "disabled", "slot": "standby"}})
    failed = False
    try:
        await orch.upload_file(
            photographer_id="ph3", photographer_name="Studio Three",
            area="portfolio", filename="x.jpg", data=b"X",
            content_type="image/jpeg")
    except Exception as e:
        failed = "No eligible storage account" in str(e)
    _check(failed, "upload fails loudly when the pool is empty")
    flog = None
    async for l in db.upload_logs.find({"status": "failed"}):
        flog = l
    _check(flog is not None and flog["error"], "failed upload_logs row with error")

    print("9. delete_file")
    await db.storage_accounts.update_one({"id": a1["id"]},
                                         {"$set": {"status": "active"}})
    before = await db.storage_accounts.find_one({"id": a1["id"]})
    await orch.delete_file(f1["id"])
    gone = await db.storage_files.find_one({"id": f1["id"]})
    _check(gone is None, "file row removed")
    # ph1 owned 4 files (2 qr + 2 cloud_storage) -> 3 after deleting f1 (3 qr bytes)
    ps = await db.photographer_storage.find_one({"photographer_id": "ph1"})
    _check(ps["file_count"] == 3 and ps["qr_photos_bytes"] == 3,
           "rollups decremented")
    after = await db.storage_accounts.find_one({"id": a1["id"]})
    _check(int(after["committed_bytes"]) == int(before["committed_bytes"]) - 3,
           "committed bytes released back to the drive")

    print("\nALL ORCHESTRATOR CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(_run())
