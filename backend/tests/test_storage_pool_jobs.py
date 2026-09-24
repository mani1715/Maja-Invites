"""
Self-test for the Phase-6 background jobs (hourly / daily / weekly).

    cd backend && python -m tests.test_storage_pool_jobs

No network, no Postgres — FakeDB + MemProvider harness. Covers:

  HOURLY
   1. healthy account -> last_health_ok_at, failures reset, health log row.
   2. degraded account that recovers -> restored to active.
   3. unhealthy account -> failures accumulate, degraded at 3; a degraded
      CURRENT drive hands the pointer over.
   4. "full" drive back under the soft cap -> rejoins rotation.
  DAILY
   5. stale pending upload log -> failed.
   6. orphan_check with the file present on the drive -> ADOPTED (row +
      rollups + log completed).
   7. orphan_check with the file gone -> failed.
   8. committed_bytes reconciled to storage_files truth.
   9. daily snapshot written (idempotent per date).
  10. housekeeping prunes old health-log rows.
  WEEKLY
  11. forecast from growing snapshots -> growth rate + days_to_full + alert.
  12. scheduler: _due() honors persisted state (no double-runs).
  LEADER LOCK
  13. _job_loop skips the whole iteration body (no job runs, no _due state
      written) when it does not win the leader lock; runs everything once
      when it does -- guards the multi-worker _due() race (docs sec 30/31).
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from datetime import datetime, timedelta, timezone

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()

from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

import storage
from storage.base import HealthSnapshot, ProviderUnavailable
from tests.test_storage_orchestrator import FakeDB, MemProvider, TestOrchestrator
import cache_backend
import storage_pool_hooks as hooks
import storage_pool_jobs as jobs


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _iso(dt):
    return dt.isoformat()


class JobsMemProvider(MemProvider):
    """MemProvider + controllable health and get_file-404 behavior."""
    def __init__(self):
        super().__init__()
        self.unhealthy_accounts = set()
        self.missing_file_ids = set()

    async def health(self, account):
        if account.get("id") in self.unhealthy_accounts:
            return HealthSnapshot(ok=False, checked_at=_iso(datetime.now(timezone.utc)),
                                  detail="probe failed")
        return HealthSnapshot(ok=True, checked_at=_iso(datetime.now(timezone.utc)),
                              detail="pool@gmail.com", latency_ms=42)

    async def get_file(self, account, ref, expiry_s=3600):
        if ref.provider_ref.get("file_id") in self.missing_file_ids:
            raise ProviderUnavailable("404: not found")
        return await super().get_file(account, ref, expiry_s)


async def _run():
    db = FakeDB()
    prov = JobsMemProvider()
    storage.get_provider = lambda kind: prov  # type: ignore[attr-defined]
    orch = TestOrchestrator(db, prov)
    hooks._orchestrators[id(db)] = orch      # jobs share the hooks orchestrator

    a1 = await orch.add_account(label="d1", capacity_bytes=1000,
                                credentials={"refresh_token": "r1"})
    a2 = await orch.add_account(label="d2", capacity_bytes=1000,
                                credentials={"refresh_token": "r2"})

    print("HOURLY")
    s = await jobs.run_hourly(db)
    _check(s["checked"] == 2 and s["healthy"] == 2, "both accounts probed healthy")
    acc1 = await db.storage_accounts.find_one({"id": a1["id"]})
    _check(acc1.get("last_health_ok_at"), "last_health_ok_at persisted")
    _check(len(db._cols["storage_health_log"].docs) == 2, "health log rows written")

    # 2. degraded recovers
    await db.storage_accounts.update_one({"id": a2["id"]},
                                         {"$set": {"status": "degraded"}})
    s = await jobs.run_hourly(db)
    acc2 = await db.storage_accounts.find_one({"id": a2["id"]})
    _check(acc2["status"] == "active" and s["restored"] >= 1,
           "degraded account restored on recovery")

    # 3. unhealthy CURRENT degrades after 3 failures and hands the pointer over
    prov.unhealthy_accounts.add(a1["id"])
    for _ in range(3):
        await jobs.run_hourly(db)
    acc1 = await db.storage_accounts.find_one({"id": a1["id"]})
    acc2 = await db.storage_accounts.find_one({"id": a2["id"]})
    _check(acc1["status"] == "degraded" and acc1["consecutive_failures"] >= 3,
           "3 failed probes -> degraded")
    _check(acc2["slot"] == "current", "pointer moved off the degraded CURRENT drive")
    prov.unhealthy_accounts.clear()

    # 4. full drive back under the soft cap rejoins
    await db.storage_accounts.update_one(
        {"id": a1["id"]}, {"$set": {"status": "full", "committed_bytes": 100}})
    s = await jobs.run_hourly(db)
    acc1 = await db.storage_accounts.find_one({"id": a1["id"]})
    _check(acc1["status"] == "active", "'full' drive under soft cap -> active again")

    print("DAILY")
    now = datetime.now(timezone.utc)
    # 5. stale pending log
    await db.upload_logs.insert_one({
        "id": "ulog_stale", "status": "pending",
        "started_at": _iso(now - timedelta(hours=10))})
    # 6. adoptable orphan — put a real file on the mem provider
    real = await prov.upload({}, __import__("storage").FolderRef(ref={"folder_id": "gf_x"}),
                             "orphan.jpg", b"ORPHAN", "image/jpeg")
    await db.upload_logs.insert_one({
        "id": "ulog_orphan", "status": "orphan_check",
        "photographer_id": "ph1", "event_id": "ev1", "area": "qr_photos",
        "drive_account_id": a2["id"], "provider_ref": real.provider_ref,
        "size_bytes": 6, "checksum_sha256": "abc",
        "started_at": _iso(now - timedelta(hours=1))})
    # 7. lost orphan
    await db.upload_logs.insert_one({
        "id": "ulog_lost", "status": "orphan_check",
        "photographer_id": "ph1", "area": "portfolio",
        "drive_account_id": a2["id"],
        "provider_ref": {"file_id": "gone123", "folder_id": "gf_x"},
        "size_bytes": 3, "started_at": _iso(now - timedelta(hours=1))})
    prov.missing_file_ids.add("gone123")
    # 8. drift a counter away from files-truth
    await db.storage_accounts.update_one(
        {"id": a1["id"]}, {"$set": {"committed_bytes": 999}})

    s = await jobs.run_daily(db)
    _check(s["stale_failed"] == 1, "stale pending log -> failed")
    _check(s["orphans_adopted"] == 1, "orphan with file present -> adopted")
    adopted = await db.storage_files.find_one({"adopted": True})
    _check(adopted and adopted["photographer_id"] == "ph1"
           and adopted["provider_ref"] == real.provider_ref,
           "adopted row rebuilt from the write-ahead log")
    ps = await db.photographer_storage.find_one({"photographer_id": "ph1"})
    _check(ps and ps["total_bytes"] >= 6, "adoption applied rollups")
    _check(s["orphans_lost"] == 1, "orphan with file gone -> failed")
    acc1 = await db.storage_accounts.find_one({"id": a1["id"]})
    _check(acc1["committed_bytes"] == 0 and s["counters_reconciled"] >= 1,
           "committed_bytes reconciled to storage_files truth")
    snap = await db.storage_usage_analytics.find_one({"type": "daily"})
    _check(snap and snap["date"] == now.date().isoformat()
           and len(snap["accounts"]) == 2, "daily snapshot written")
    await jobs.run_daily(db)
    snaps = [d for d in db._cols["storage_usage_analytics"].docs
             if d.get("type") == "daily"]
    _check(len(snaps) == 1, "snapshot is idempotent per date")

    # 10. housekeeping prunes old health logs
    await db.storage_health_log.insert_one({
        "id": "hl_old", "account_id": a1["id"], "ok": True,
        "checked_at": _iso(now - timedelta(days=45))})
    before = len(db._cols["storage_health_log"].docs)
    await jobs.run_daily(db)
    after = len(db._cols["storage_health_log"].docs)
    _check(after < before and not any(
        d["id"] == "hl_old" for d in db._cols["storage_health_log"].docs),
        "45-day-old health log pruned")

    print("WEEKLY")
    # synthesize a growing week of snapshots: +10 GB/day, 120 GB capacity
    db._cols["storage_usage_analytics"].docs = []
    GB = 1024 ** 3
    for i in range(8):
        d = (now - timedelta(days=7 - i)).date().isoformat()
        await db.storage_usage_analytics.insert_one({
            "id": f"snap_{i}", "type": "daily", "date": d,
            "total_bytes": (10 + 10 * i) * GB, "capacity_bytes": 120 * GB})
    report = await jobs.run_weekly(db)
    _check(report["samples"] == 8, "forecast uses the snapshot window")
    _check(abs(report["growth_bytes_per_day"] - 10 * GB) < GB // 100,
           "growth rate ~10 GB/day detected")
    _check(report["days_to_full"] is not None and 3 <= report["days_to_full"] <= 5,
           f"days_to_full ≈ 4 (got {report['days_to_full']})")
    _check("alert" in report, "under-60-day exhaustion raises the alert")

    print("ALERTS")
    alerts = [a for a in db._cols.get("storage_alerts",
                                      type("x", (), {"docs": []})).docs]
    _check(any(a["kind"] == "account_degraded" for a in alerts),
           "degrading a drive raised an admin alert")
    _check(any(a["kind"] == "capacity_forecast" for a in alerts),
           "capacity forecast raised an admin alert")
    kinds = [a for a in alerts if a["kind"] == "account_degraded"]
    _check(len(kinds) == 1, "alerts are deduped while unacknowledged")

    print("RETRY QUEUE")
    import tempfile, os as _os
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    tmp.write(b"RETRYME"); tmp.close()
    await db.upload_logs.insert_one({
        "id": "ulog_retry_ok", "status": "deferred",
        "photographer_id": "ph1", "area": "portfolio",
        "filename": "r.jpg", "size_bytes": 7, "content_type": "image/jpeg",
        "source_ref": {"kind": "disk", "path": tmp.name},
        "retry_count": 0, "started_at": _iso(now)})
    await db.upload_logs.insert_one({
        "id": "ulog_retry_gone", "status": "failed",
        "photographer_id": "ph1", "area": "portfolio",
        "filename": "gone.jpg", "size_bytes": 3, "content_type": "image/jpeg",
        "source_ref": {"kind": "disk", "path": tmp.name + ".nope"},
        "retry_count": 0, "started_at": _iso(now)})
    res = await jobs.run_retries(db)
    _check(res["succeeded"] == 1, "deferred mirror re-uploaded from its source")
    ok_log = await db.upload_logs.find_one({"id": "ulog_retry_ok"})
    _check(ok_log["status"] == "completed" and ok_log.get("retried"),
           "retried log marked completed")
    refile = await db.storage_files.find_one({"id": ok_log["file_id"]})
    _check(refile and refile["size_bytes"] == 7, "retried file row written")
    gone_log = await db.upload_logs.find_one({"id": "ulog_retry_gone"})
    _check(gone_log["status"] == "unrecoverable" and res["gave_up"] == 1,
           "missing source -> unrecoverable (no infinite retries)")
    _os.unlink(tmp.name)

    print("SCHEDULER")
    ran1 = await jobs._due(db, "hourly", timedelta(hours=1))
    ran2 = await jobs._due(db, "hourly", timedelta(hours=1))
    _check(ran1 is True and ran2 is False,
           "_due runs once per interval (state persisted)")

    print("LEADER LOCK")
    # _job_loop's hardcoded 120s boot delay + 300s re-check sleep are patched
    # to instant (but real) event-loop yields so a couple of test-real
    # milliseconds cover many loop iterations. run_hourly/daily/weekly/
    # disk_sweep are swapped for call-counters so this only exercises the
    # loop's leader-lock gating, not the job bodies (already covered above).
    _real_sleep = asyncio.sleep
    orig_lock = cache_backend.acquire_lock
    orig_hourly, orig_daily, orig_weekly, orig_sweep = (
        jobs.run_hourly, jobs.run_daily, jobs.run_weekly, jobs.run_disk_sweep)

    async def _fast_sleep(_seconds):
        await _real_sleep(0)

    async def _run_one_pass(loop_db):
        task = asyncio.create_task(jobs._job_loop(loop_db))
        await _real_sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    try:
        jobs.asyncio.sleep = _fast_sleep
        lock_db = FakeDB()
        calls = {"hourly": 0, "daily": 0, "weekly": 0, "sweep": 0}

        async def _fake_hourly(_db):
            calls["hourly"] += 1
            return {}

        async def _fake_daily(_db):
            calls["daily"] += 1
            return {}

        async def _fake_weekly(_db):
            calls["weekly"] += 1
            return {}

        async def _fake_sweep(_db, limit=200):
            calls["sweep"] += 1
            return {}

        jobs.run_hourly = _fake_hourly
        jobs.run_daily = _fake_daily
        jobs.run_weekly = _fake_weekly
        jobs.run_disk_sweep = _fake_sweep

        # lock denied -> the whole iteration body (job bodies AND _due) skips
        seen_keys = []

        async def _deny_lock(key, ttl_seconds):
            seen_keys.append((key, ttl_seconds))
            return False

        cache_backend.acquire_lock = _deny_lock
        await _run_one_pass(lock_db)
        _check(seen_keys and seen_keys[0][0] == "storage_pool_jobs_leader",
               "leader lock checked under key 'storage_pool_jobs_leader'")
        _check(seen_keys[0][1] < 300,
               "lock TTL kept under the loop's re-check sleep interval")
        _check(sum(calls.values()) == 0,
               "lock not acquired -> no job body ran this iteration")
        due_state = await lock_db.app_settings.find_one({"key": jobs.STATE_KEY})
        _check(due_state is None,
               "lock not acquired -> _due() never touched, no state written")

        # lock granted -> behavior unchanged, every due cadence runs once
        async def _grant_lock(key, ttl_seconds):
            return True

        cache_backend.acquire_lock = _grant_lock
        await _run_one_pass(lock_db)
        _check(calls == {"hourly": 1, "daily": 1, "weekly": 1, "sweep": 1},
               f"lock acquired -> every due cadence ran exactly once (got {calls})")
    finally:
        jobs.asyncio.sleep = _real_sleep
        cache_backend.acquire_lock = orig_lock
        jobs.run_hourly, jobs.run_daily, jobs.run_weekly, jobs.run_disk_sweep = (
            orig_hourly, orig_daily, orig_weekly, orig_sweep)

    print("\nALL STORAGE POOL JOB CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(_run())
