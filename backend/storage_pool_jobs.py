"""
MAJA Invites — Storage Pool background jobs (V1 multi-drive storage, Phase 6).
==============================================================================

One long-running asyncio worker (same pattern as `drive_archive.start_worker`,
no Celery/Redis) driving the charter §HEALTH MONITORING cadence:

HOURLY  (`run_hourly`)
    * per-account health probe → last_health_ok_at / consecutive_failures;
      degraded accounts that recover are restored to active; an account that
      degrades while CURRENT hands the pointer over.
    * quota sync → provider_used_bytes + drift vs our committed counter
      (drift is LOGGED, corrections belong to the daily reconciler).
    * "full" accounts whose committed bytes dropped back under the soft limit
      (deletions) are restored to active.
    * token validation is implicit: the health probe exercises the refresh
      flow, and failures surface as unhealthy.
    * each probe appended to `db.storage_health_log` (pruned after 30 days).

DAILY  (`run_daily`)
    * reconciliation (charter failure case 5):
        - `upload_logs` stuck pending/uploading > 6 h → marked failed.
        - `orphan_check` rows (file reached the drive but the metadata write
          failed) → verified via provider.get_file and ADOPTED into
          `storage_files` + rollups, or marked failed if the file is gone.
        - per-account `committed_bytes` recomputed from `storage_files` truth
          (skipped while uploads are actively in flight).
    * missing-file detection: newest N files per account sample-verified.
    * a daily snapshot written to `storage_usage_analytics` (the dashboard's
      and forecaster's time series).
    * housekeeping: old health-log rows + expired oauth states pruned.

WEEKLY (`run_weekly`)
    * growth report + linear capacity forecast over the daily snapshots →
      `storage_usage_analytics` (type="forecast"); logs a loud warning when
      the pool is projected full within 60 days.

Job state (`app_settings.storage_pool_job_state`) survives restarts, so a
redeploy neither re-runs nor skips a cycle.
"""
from __future__ import annotations

import asyncio
import logging
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import cache_backend

logger = logging.getLogger("storage_pool_jobs")

STATE_KEY = "storage_pool_job_state"
HEALTH_LOG_RETENTION_DAYS = 30
STALE_UPLOAD_HOURS = 6
MISSING_SAMPLE_PER_ACCOUNT = 20
FORECAST_WARN_DAYS = 60

_worker_task: Optional[asyncio.Task] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _orch(db):
    from storage_pool_hooks import _orch as _hooks_orch
    return _hooks_orch(db)      # shared per-db orchestrator cache


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
async def _active_pool(db) -> List[Dict[str, Any]]:
    out = []
    async for a in db.storage_accounts.find({}):
        a.pop("_id", None)
        if a.get("status") != "disabled":
            out.append(a)
    return out


async def _files_truth(db, account_id: str) -> Dict[str, int]:
    """SUM(size_bytes) + COUNT for one account from storage_files — via the
    adapter's SQL-pushed aggregate fast path, with a cursor fallback."""
    try:
        agg = db.storage_files.aggregate([
            {"$match": {"drive_account_id": account_id}},
            {"$group": {"_id": None, "total": {"$sum": "$size_bytes"},
                        "n": {"$sum": 1}}},
        ])
        rows = await agg.to_list(1)
        if rows:
            return {"bytes": int(rows[0].get("total") or 0),
                    "count": int(rows[0].get("n") or 0)}
        return {"bytes": 0, "count": 0}
    except Exception:
        total = n = 0
        async for f in db.storage_files.find({"drive_account_id": account_id}):
            total += int(f.get("size_bytes") or 0)
            n += 1
        return {"bytes": total, "count": n}


async def _uploads_in_flight(db, minutes: int = 30) -> bool:
    cutoff = _iso(_now() - timedelta(minutes=minutes))
    async for l in db.upload_logs.find({"status": "uploading"}):
        if (l.get("started_at") or "") >= cutoff:
            return True
    return False


async def alert(db, kind: str, message: str, *, severity: str = "warning",
                account_id: Optional[str] = None) -> None:
    """Admin alert feed (charter failure case 3: 'alert admin'). Deduped: an
    unacknowledged alert of the same kind+account is refreshed, not repeated."""
    try:
        existing = await db.storage_alerts.find_one(
            {"kind": kind, "account_id": account_id, "acked": False})
        if existing:
            await db.storage_alerts.update_one(
                {"id": existing["id"]},
                {"$set": {"message": message, "severity": severity,
                          "last_seen_at": _iso(_now())},
                 "$inc": {"occurrences": 1}})
            return
        await db.storage_alerts.insert_one({
            "id": f"al_{uuid.uuid4().hex[:12]}",
            "kind": kind, "severity": severity, "message": message,
            "account_id": account_id, "acked": False, "occurrences": 1,
            "created_at": _iso(_now()), "last_seen_at": _iso(_now()),
        })
        logger.warning("storage-alert [%s/%s]: %s", severity, kind, message)
    except Exception as e:
        logger.warning("storage-alert write failed: %s", e)


# --------------------------------------------------------------------------- #
# RETRY QUEUE (charter failure case 7 + deferred/burst mirrors)
# --------------------------------------------------------------------------- #
MAX_RETRIES = 3


async def _load_source(source_ref: Dict[str, Any]) -> Optional[bytes]:
    kind = (source_ref or {}).get("kind")
    if kind == "disk":
        path = source_ref.get("path")
        if not path:
            return None
        from pathlib import Path
        p = Path(path)
        if not p.exists():
            return None
        return await asyncio.to_thread(p.read_bytes)
    if kind == "s3":
        key = source_ref.get("key")
        if not key:
            return None

        def _get() -> bytes:
            import aws_service
            return aws_service.s3().get_object(
                Bucket=aws_service.bucket(), Key=key)["Body"].read()
        return await asyncio.to_thread(_get)
    return None


async def run_disk_sweep(db, limit: int = 200) -> Dict[str, int]:
    """Ingest anything under uploads/ that has no storage_files row yet.

    Six upload endpoints call `mirror_upload` inline; roughly nine others just
    write to /app/uploads and always did. Hand-wiring each one leaves the tenth
    that someone adds next month silently pinned to the VM disk — which is the
    exact failure mode this system exists to remove. So the sweep is the
    backstop: hooks make a file reach S3 in seconds, this makes sure it
    reaches Drive *at all*.

    Delegates to the backfill script so there is one implementation of the
    path->owner attribution rules, not two that drift.
    """
    try:
        sys.path.insert(0, str(Path(__file__).parent / "scripts"))
        from backfill_media import backfill_disk        # type: ignore
    except Exception as e:
        logger.warning("disk sweep unavailable: %s", e)
        return {"seen": 0, "ingested": 0, "failed": 0, "error": 1}
    orch = _orch(db)
    await orch.ensure_ready()
    return await backfill_disk(db, orch, execute=True, limit=limit)


async def run_retries(db, limit: int = 50) -> Dict[str, int]:
    """Re-mirror deferred/failed uploads that carry a source_ref. Cheap in the
    mirror architecture: the source file still exists on disk/S3."""
    orch = _orch(db)
    await orch.ensure_ready()
    summary = {"retried": 0, "succeeded": 0, "gave_up": 0}
    candidates: List[Dict[str, Any]] = []
    for status in ("deferred", "failed"):
        cur = db.upload_logs.find(
            {"status": status, "retry_count": {"$lt": MAX_RETRIES}}
        ).sort("started_at", 1).limit(limit)
        async for l in cur:
            if l.get("source_ref"):
                candidates.append(l)
    candidates.sort(key=lambda l: l.get("started_at") or "")

    for l in candidates[:limit]:
        summary["retried"] += 1
        data = None
        try:
            data = await _load_source(l["source_ref"])
        except Exception as e:
            logger.warning("storage-retry: source read failed for %s: %s", l["id"], e)
        if not data:
            await db.upload_logs.update_one(
                {"id": l["id"]},
                {"$set": {"status": "unrecoverable",
                          "error": "retry: source no longer available",
                          "finished_at": _iso(_now())}})
            summary["gave_up"] += 1
            continue
        try:
            f = await orch.upload_file(
                photographer_id=l.get("photographer_id"),
                photographer_name=l.get("photographer_id"),
                area=l.get("area") or "cloud_storage",
                filename=l.get("filename") or "retry",
                data=data,
                content_type=l.get("content_type") or "application/octet-stream",
                event_id=l.get("event_id"),
                event_name=l.get("event_name"),
                source_ref=l.get("source_ref"),
            )
            await db.upload_logs.update_one(
                {"id": l["id"]},
                {"$set": {"status": "completed", "retried": True,
                          "file_id": f["id"], "finished_at": _iso(_now())}})
            summary["succeeded"] += 1
        except Exception as e:
            retry_count = int(l.get("retry_count") or 0) + 1
            update = {"retry_count": retry_count, "error": f"retry: {e}"}
            if retry_count >= MAX_RETRIES:
                update["status"] = "unrecoverable"
                update["finished_at"] = _iso(_now())
                summary["gave_up"] += 1
                await alert(db, "retry_exhausted",
                            f"Mirror of '{l.get('filename')}' gave up after "
                            f"{retry_count} retries: {e}", severity="error")
            await db.upload_logs.update_one({"id": l["id"]}, {"$set": update})
    return summary


# --------------------------------------------------------------------------- #
# HOURLY
# --------------------------------------------------------------------------- #
async def run_hourly(db) -> Dict[str, Any]:
    orch = _orch(db)
    await orch.ensure_ready()
    summary = {"checked": 0, "healthy": 0, "restored": 0, "degraded": 0}

    for acc in await _active_pool(db):
        summary["checked"] += 1
        provider = orch._provider(acc)
        creds = orch._with_credentials(acc)
        health = await provider.health(creds)

        log_row = {
            "id": f"hl_{uuid.uuid4().hex[:12]}",
            "account_id": acc["id"], "ok": health.ok,
            "detail": (health.detail or "")[:300],
            "latency_ms": health.latency_ms, "checked_at": health.checked_at,
        }
        await db.storage_health_log.insert_one(log_row)

        update: Dict[str, Any] = {"updated_at": _iso(_now())}
        if health.ok:
            summary["healthy"] += 1
            update["last_health_ok_at"] = health.checked_at
            update["consecutive_failures"] = 0
            if acc.get("status") == "degraded":
                update["status"] = "active"
                summary["restored"] += 1
                logger.info("storage-jobs: %s recovered -> active", acc["id"])
            # quota sync + drift
            try:
                q = await provider.quota(creds)
                update["provider_used_bytes"] = q.used_bytes
                update["last_quota_sync_at"] = q.reported_at
                drift = int(acc.get("committed_bytes") or 0) - q.used_bytes
                if abs(drift) > 1024 ** 3:
                    logger.warning("storage-jobs: %s drift %.2f GB "
                                   "(committed=%s provider=%s)", acc["id"],
                                   drift / 1024 ** 3,
                                   acc.get("committed_bytes"), q.used_bytes)
            except Exception as e:
                logger.warning("storage-jobs: quota sync failed for %s: %s",
                               acc["id"], e)
            # a "full" drive whose committed bytes dropped back under the soft
            # cap (deletions) rejoins the rotation
            if acc.get("status") == "full":
                cap = int(acc.get("capacity_bytes") or 0)
                soft = int(acc.get("soft_limit_pct") or 95)
                if int(acc.get("committed_bytes") or 0) < cap * soft // 100:
                    update["status"] = "active"
                    summary["restored"] += 1
                    logger.info("storage-jobs: %s back under soft cap -> active",
                                acc["id"])
        else:
            fails = int(acc.get("consecutive_failures") or 0) + 1
            update["consecutive_failures"] = fails
            if fails >= 3 and acc.get("status") == "active":
                update["status"] = "degraded"
                summary["degraded"] += 1
                logger.warning("storage-jobs: %s degraded after %d failures (%s)",
                               acc["id"], fails, health.detail)
                # charter case 3: revoked/unreachable drive -> ALERT the admin
                await alert(db, "account_degraded",
                            f"Drive '{acc.get('label') or acc['id']}' marked "
                            f"degraded after {fails} failed probes: "
                            f"{(health.detail or '')[:150]}",
                            severity="error", account_id=acc["id"])
        await db.storage_accounts.update_one({"id": acc["id"]}, {"$set": update})
        if update.get("status") == "degraded" and acc.get("slot") == "current":
            await orch._promote_next(acc["id"], "degraded",
                                     acc.get("kind") or "gdrive")

    # Emergency capacity monitoring: alert when the whole pool drops below 10%
    # remaining (charter: alert admin to connect another drive before it's full).
    pool = await _active_pool(db)
    total_cap = sum(int(a.get("capacity_bytes") or 0) for a in pool)
    total_used = sum(int(a.get("committed_bytes") or 0) for a in pool)
    if total_cap:
        remaining_pct = (total_cap - total_used) / total_cap * 100
        summary["remaining_pct"] = round(remaining_pct, 2)
        if remaining_pct < 10:
            free_gb = (total_cap - total_used) // (1024 ** 3)
            cap_gb = total_cap // (1024 ** 3)
            await alert(db, "capacity_emergency",
                        f"Storage pool is at {remaining_pct:.1f}% remaining "
                        f"({free_gb} GB of {cap_gb} GB free) — connect another "
                        "drive now to avoid upload failures.",
                        severity="critical")

    # retry pipeline: re-mirror deferred/failed uploads from their sources
    summary["retries"] = await run_retries(db)
    return summary


# --------------------------------------------------------------------------- #
# DAILY
# --------------------------------------------------------------------------- #
async def run_daily(db) -> Dict[str, Any]:
    from storage.base import ProviderObject
    orch = _orch(db)
    await orch.ensure_ready()
    now = _now()
    summary = {"stale_failed": 0, "orphans_adopted": 0, "orphans_lost": 0,
               "counters_reconciled": 0, "missing": 0}

    # 1. stale pending/uploading logs -> failed
    stale_cutoff = _iso(now - timedelta(hours=STALE_UPLOAD_HOURS))
    for status in ("pending", "uploading"):
        async for l in db.upload_logs.find({"status": status}):
            if (l.get("started_at") or "") < stale_cutoff:
                await db.upload_logs.update_one(
                    {"id": l["id"]},
                    {"$set": {"status": "failed",
                              "error": f"stale: stuck in '{status}' > "
                                       f"{STALE_UPLOAD_HOURS}h (reconciled)",
                              "finished_at": _iso(now)}})
                summary["stale_failed"] += 1

    # 2. orphan adoption — the drive has the file, the DB row was lost
    accounts_by_id = {a["id"]: a async for a in db.storage_accounts.find({})}
    async for l in db.upload_logs.find({"status": "orphan_check"}):
        ref = l.get("provider_ref")
        acc = accounts_by_id.get(l.get("drive_account_id"))
        if not ref or not acc:
            await db.upload_logs.update_one(
                {"id": l["id"]},
                {"$set": {"status": "failed", "error": "orphan: no ref/account",
                          "finished_at": _iso(now)}})
            summary["orphans_lost"] += 1
            continue
        acc.pop("_id", None)
        provider = orch._provider(acc)
        try:
            await provider.get_file(orch._with_credentials(acc),
                                    ProviderObject(provider_ref=ref))
            exists = True
        except Exception:
            exists = False
        if not exists:
            await db.upload_logs.update_one(
                {"id": l["id"]},
                {"$set": {"status": "failed",
                          "error": "orphan: file not found on drive",
                          "finished_at": _iso(now)}})
            summary["orphans_lost"] += 1
            continue
        # adopt: rebuild the metadata row from the write-ahead log
        file_doc = {
            "id": f"file_{uuid.uuid4().hex[:14]}",
            "photographer_id": l.get("photographer_id"),
            "event_id": l.get("event_id"),
            "area": l.get("area") or "cloud_storage",
            "drive_account_id": acc["id"],
            "folder_id": None,
            "provider_ref": ref,
            "filename": l.get("filename") or "recovered",
            "size_bytes": int(l.get("size_bytes") or 0),
            "content_type": "application/octet-stream",
            "file_type": "other",
            "checksum_sha256": l.get("checksum_sha256"),
            "upload_status": "stored",
            "adopted": True,
            "uploaded_at": _iso(now),
        }
        await db.storage_files.insert_one(file_doc)
        await orch._apply_rollups(file_doc["photographer_id"],
                                  file_doc["event_id"], file_doc["area"],
                                  file_doc["size_bytes"], +1)
        await db.upload_logs.update_one(
            {"id": l["id"]},
            {"$set": {"status": "completed", "adopted": True,
                      "file_id": file_doc["id"], "finished_at": _iso(now)}})
        summary["orphans_adopted"] += 1
        logger.info("storage-jobs: adopted orphan %s -> %s", l["id"], file_doc["id"])

    # 3. counter reconcile — storage_files is the truth for committed_bytes.
    #    Skipped while uploads are in flight (their reservations are real).
    if not await _uploads_in_flight(db):
        for acc in await _active_pool(db):
            truth = await _files_truth(db, acc["id"])
            if truth["bytes"] != int(acc.get("committed_bytes") or 0):
                logger.info("storage-jobs: reconcile %s committed %s -> %s",
                            acc["id"], acc.get("committed_bytes"), truth["bytes"])
                await db.storage_accounts.update_one(
                    {"id": acc["id"]},
                    {"$set": {"committed_bytes": truth["bytes"],
                              "file_count": truth["count"],
                              "updated_at": _iso(now)}})
                summary["counters_reconciled"] += 1

    # 4. missing-file sampling (newest N per account)
    for acc in await _active_pool(db):
        provider = orch._provider(acc)
        creds = orch._with_credentials(acc)
        cur = db.storage_files.find({"drive_account_id": acc["id"],
                                     "upload_status": "stored"}) \
            .sort("uploaded_at", -1).limit(MISSING_SAMPLE_PER_ACCOUNT)
        async for f in cur:
            try:
                await provider.get_file(creds,
                                        ProviderObject(provider_ref=f["provider_ref"]))
            except Exception:
                summary["missing"] += 1
                await db.storage_files.update_one(
                    {"id": f["id"]},
                    {"$set": {"upload_status": "missing", "missing_at": _iso(now)}})
                logger.error("storage-jobs: file %s MISSING on %s (%s)",
                             f["id"], acc["id"], f.get("filename"))
    if summary["missing"]:
        await alert(db, "files_missing",
                    f"{summary['missing']} archived file(s) missing on their "
                    "drive — investigate before trusting the archive.",
                    severity="error")

    # 4b. purge soft-deleted events whose 5-day recycle window has elapsed
    #     (permanent file+folder delete + committed-byte release). Runs BEFORE
    #     the snapshot so released bytes are reflected in today's usage.
    try:
        purged = await orch.purge_expired_deleted_events()
        summary["events_purged"] = purged.get("events_purged", 0)
        summary["events_purge_failed"] = purged.get("events_failed", 0)
        summary["purge_bytes_released"] = purged.get("bytes_released", 0)
        if purged.get("events_failed"):
            await alert(db, "event_purge_incomplete",
                        f"{purged['events_failed']} soft-deleted event(s) could not be "
                        "fully purged — will retry next run.", severity="warning")
    except Exception as e:
        logger.warning("storage-jobs: event purge failed: %s", e)

    # 5. daily snapshot (one doc per UTC date — idempotent)
    date = now.date().isoformat()
    accounts = await _active_pool(db)
    total_cap = sum(int(a.get("capacity_bytes") or 0) for a in accounts)
    total_used = sum(int(a.get("committed_bytes") or 0) for a in accounts)
    await db.storage_usage_analytics.update_one(
        {"type": "daily", "date": date},
        {"$set": {
            "type": "daily", "date": date,
            "total_bytes": total_used, "capacity_bytes": total_cap,
            "accounts": [{"id": a["id"], "label": a.get("label"),
                          "status": a.get("status"),
                          "committed_bytes": int(a.get("committed_bytes") or 0),
                          "capacity_bytes": int(a.get("capacity_bytes") or 0)}
                         for a in accounts],
            "updated_at": _iso(now),
        },
         "$setOnInsert": {"id": f"snap_{uuid.uuid4().hex[:10]}"}},
        upsert=True,
    )

    # 6. housekeeping
    prune_before = _iso(now - timedelta(days=HEALTH_LOG_RETENTION_DAYS))
    try:
        await db.storage_health_log.delete_many(
            {"checked_at": {"$lt": prune_before}})
        await db.storage_oauth_states.delete_many(
            {"expires_at": {"$lt": _iso(now)}})
    except Exception as e:
        logger.warning("storage-jobs: housekeeping failed: %s", e)

    # Heartbeat so the System-Health dashboard can show this daily job's last run.
    try:
        from system_health import record_job_run
        await record_job_run(db, "storage_pool_daily", summary)
    except Exception as e:
        logger.warning("storage-jobs: heartbeat failed: %s", e)

    return summary


# --------------------------------------------------------------------------- #
# WEEKLY
# --------------------------------------------------------------------------- #
async def run_weekly(db) -> Dict[str, Any]:
    now = _now()
    snaps: List[Dict[str, Any]] = []
    async for s in db.storage_usage_analytics.find({"type": "daily"}):
        s.pop("_id", None)
        snaps.append(s)
    snaps.sort(key=lambda s: s.get("date") or "")
    window = snaps[-56:]

    report: Dict[str, Any] = {
        "id": f"fc_{uuid.uuid4().hex[:10]}",
        "type": "forecast", "date": now.date().isoformat(),
        "created_at": _iso(now), "samples": len(window),
    }
    if len(window) >= 2:
        first, last = window[0], window[-1]
        days = max(1, (datetime.fromisoformat(last["date"])
                       - datetime.fromisoformat(first["date"])).days)
        growth_per_day = (int(last.get("total_bytes") or 0)
                          - int(first.get("total_bytes") or 0)) / days
        remaining = int(last.get("capacity_bytes") or 0) - int(last.get("total_bytes") or 0)
        days_to_full = (remaining / growth_per_day) if growth_per_day > 0 else None
        report.update({
            "growth_bytes_per_day": int(growth_per_day),
            "total_bytes": int(last.get("total_bytes") or 0),
            "capacity_bytes": int(last.get("capacity_bytes") or 0),
            "remaining_bytes": remaining,
            "days_to_full": round(days_to_full, 1) if days_to_full else None,
        })
        if days_to_full is not None and days_to_full < FORECAST_WARN_DAYS:
            report["alert"] = (f"Pool projected FULL in ~{days_to_full:.0f} days "
                               f"at {growth_per_day / 1024**3:.2f} GB/day — "
                               "connect more accounts.")
            logger.warning("storage-jobs: %s", report["alert"])
            await alert(db, "capacity_forecast", report["alert"], severity="warning")
    else:
        report["note"] = "Not enough daily snapshots yet for a forecast."
    await db.storage_usage_analytics.insert_one(report)
    return report


# --------------------------------------------------------------------------- #
# scheduler
# --------------------------------------------------------------------------- #
async def _due(db, name: str, interval: timedelta) -> bool:
    """Read-then-write on app_settings, not a CAS guard — only safe because
    _job_loop only calls this from inside the acquire_lock-elected leader
    iteration. Do not call this outside that lock."""
    doc = await db.app_settings.find_one({"key": STATE_KEY}) or {}
    last = (doc.get("value") or {}).get(name)
    if last and _iso(_now() - interval) < last:
        return False
    value = dict(doc.get("value") or {})
    value[name] = _iso(_now())
    await db.app_settings.update_one(
        {"key": STATE_KEY},
        {"$set": {"key": STATE_KEY, "value": value, "updated_at": _iso(_now())}},
        upsert=True)
    return True


async def _job_loop(db) -> None:
    await asyncio.sleep(120)        # let the app finish booting
    while True:
        try:
            # This loop runs once per uvicorn worker (4x in prod compose).
            # Only the elected leader runs the body each iteration; the rest
            # just keep sleeping. TTL kept under the re-check sleep below so
            # a dead leader's lock expires before the next iteration instead
            # of stalling the job for good. Mirrors usage_metering's
            # usage_flush_loop / server.py's _expiry_sweep_loop.
            if await cache_backend.acquire_lock("storage_pool_jobs_leader", 290):
                # Runs often on purpose: until it does, a file written by an
                # unhooked endpoint exists ONLY on the VM disk, which is the
                # one state the Drive cutover is meant to eliminate.
                if await _due(db, "disk_sweep", timedelta(minutes=10)):
                    logger.info("storage-jobs disk sweep: %s", await run_disk_sweep(db))
                if await _due(db, "hourly", timedelta(hours=1)):
                    logger.info("storage-jobs hourly: %s", await run_hourly(db))
                if await _due(db, "daily", timedelta(days=1)):
                    logger.info("storage-jobs daily: %s", await run_daily(db))
                if await _due(db, "weekly", timedelta(days=7)):
                    logger.info("storage-jobs weekly: %s", await run_weekly(db))
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.exception("storage-jobs loop error (continuing): %s", e)
        await asyncio.sleep(300)    # re-check due-ness every 5 minutes


def start_jobs(db) -> asyncio.Task:
    """Start the background worker. Call once from server.py startup —
    idempotent, mirrors drive_archive.start_worker."""
    global _worker_task
    if _worker_task and not _worker_task.done():
        return _worker_task
    _worker_task = asyncio.create_task(_job_loop(db), name="storage_pool_jobs")
    logger.info("storage-jobs: background worker started")
    return _worker_task
