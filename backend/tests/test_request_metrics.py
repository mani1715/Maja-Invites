"""
test_request_metrics.py -- Lane A9: request metrics + request-id middleware.

    cd backend && python -m tests.test_request_metrics

No network, no Postgres: a tiny FastAPI app in-test for the middleware, the
FakeDB harness for the admin endpoint, and cache_backend's in-memory (no
REDIS_URL) fallback for queue_length.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.pop("REDIS_URL", None)

from fastapi import FastAPI, HTTPException                     # noqa: E402
from fastapi.testclient import TestClient                      # noqa: E402

from tests.test_storage_orchestrator import FakeDB             # noqa: E402
import cache_backend                                            # noqa: E402
import system_health                                            # noqa: E402
import request_metrics as rm                                    # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


def test_route_class_and_buckets():
    ok("first two segments kept", rm._route_class("/api/auth/login") == "/api/auth")
    ok("exactly two segments", rm._route_class("/api/admin") == "/api/admin")
    ok("single segment", rm._route_class("/health") == "/health")
    ok("root path", rm._route_class("/") == "/")

    ok("under first edge -> bucket 0", rm._bucket_index(10) == 0)
    ok("on an edge -> that bucket", rm._bucket_index(100) == 1)
    ok("above last edge -> overflow bucket", rm._bucket_index(99999) == len(rm.BUCKET_EDGES_MS))


def test_approx_p95():
    ok("no samples -> 0", rm._approx_p95([0, 0, 0]) == 0.0)

    buckets = [0] * (len(rm.BUCKET_EDGES_MS) + 1)
    buckets[0] = 100
    ok("all-fast p95 == first edge", rm._approx_p95(buckets) == float(rm.BUCKET_EDGES_MS[0]))

    buckets = [0] * (len(rm.BUCKET_EDGES_MS) + 1)
    buckets[0] = 94
    buckets[-1] = 6  # pushes the 95th sample into the overflow bucket
    ok("mixed p95 reaches the overflow edge", rm._approx_p95(buckets) == float(rm.BUCKET_EDGES_MS[-1]))


def test_middleware():
    app = FastAPI()
    app.add_middleware(rm.RequestMetricsMiddleware)

    @app.get("/api/auth/ping")
    def ping():
        return {"ok": True}

    @app.get("/api/auth/boom")
    def boom():
        raise HTTPException(status_code=500, detail="boom")

    client = TestClient(app)

    r1 = client.get("/api/auth/ping")
    r2 = client.get("/api/auth/ping")
    ok("response carries X-Request-Id", "X-Request-Id" in r1.headers)
    ok("request ids are unique per call", r1.headers["X-Request-Id"] != r2.headers["X-Request-Id"])

    snap = rm.get_metrics_snapshot()
    ok("route-class bucketed both calls", snap["/api/auth"]["count"] == 2)
    ok("no 5xx yet", snap["/api/auth"]["err_5xx"] == 0)

    r3 = client.get("/api/auth/boom")
    ok("5xx surfaced to caller", r3.status_code == 500)
    snap2 = rm.get_metrics_snapshot()
    ok("5xx counted on that route-class", snap2["/api/auth"]["err_5xx"] == 1)
    ok("other route-classes untouched", snap2["/api/auth"]["count"] == 3)


async def _async_checks():
    ok("queue_length with no Redis falls back to 0",
       await cache_backend.queue_length("some:queue") == 0)

    db = FakeDB()
    await db.job_heartbeats.insert_one(
        {"name": "usage_flush", "last_run": "2026-08-11T00:00:00+00:00", "meta": {}})

    router = rm.build_request_metrics_router(db, require_super_admin=lambda: "admin-1")
    handler = router.routes[0].endpoint
    snapshot = await handler(admin_id="admin-1")

    ok("admin snapshot has the expected shape",
       set(snapshot) == {"routes", "face_queue_depth", "job_heartbeats", "redis", "postgres"})
    ok("face queue depth reported (0, no Redis)", snapshot["face_queue_depth"] == 0)
    ok("usage_flush heartbeat surfaced", snapshot["job_heartbeats"]["usage_flush"]["last_run"] is not None)
    ok("missing media_reconcile heartbeat -> None", snapshot["job_heartbeats"]["media_reconcile"]["last_run"] is None)
    ok("redis block is the raw redis_info() shape (no Redis -> unavailable)",
       snapshot["redis"] == {"available": False})
    ok("postgres block is the system_health _comp() shape",
       snapshot["postgres"]["key"] == "postgres" and
       snapshot["postgres"]["status"] == system_health.UNKNOWN)


def main():
    test_route_class_and_buckets()
    test_approx_p95()
    test_middleware()
    asyncio.run(_async_checks())
    print(f"\nRequest Metrics: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    main()
    sys.exit(1 if FAIL else 0)
