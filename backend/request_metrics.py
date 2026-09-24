"""
request_metrics.py -- Lane A9: request metrics + request-id.

RequestMetricsMiddleware is the outermost middleware in server.py (added
last, after CORS) so its timer covers the full stack -- CORS, bot/abuse
checks, the route itself -- not just the route. It stamps every response
with X-Request-Id and buckets latency into a small fixed histogram per
route-class (first two path segments, e.g. /api/auth, /api/admin) in an
in-process dict. No Redis on the hot path; counters are per-worker.

The request id is also threaded into the log formatter via a ContextVar, so
any log line emitted while handling a request (from any module) can be
correlated back to the request that produced it -- `get_request_id()` reads
the same id a handler sees on the response's X-Request-Id header.

    from request_metrics import RequestMetricsMiddleware, build_request_metrics_router
    app.add_middleware(RequestMetricsMiddleware)
    app.include_router(build_request_metrics_router(db, require_super_admin))
"""
import contextvars
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from starlette.middleware.base import BaseHTTPMiddleware

import cache_backend
import face_queue
import system_health


# Client-supplied X-Request-Id must look like this to be trusted (else we
# generate our own) -- keeps an attacker from injecting log-line-splitting
# characters or an oversized value via a request header.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")

# Per-request id, readable from anywhere log/handler code runs inside the
# request's asyncio task. Default "-" matches the common log-format filler
# for "no request in flight" (e.g. a background job's log lines).
_request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def get_request_id() -> str:
    """The current request's id, or "-" outside a request context."""
    return _request_id_ctx.get()


def _sanitize_request_id(raw: Optional[str]) -> Optional[str]:
    if raw and _REQUEST_ID_RE.match(raw):
        return raw
    return None


class _RequestIdLogFilter(logging.Filter):
    """Stamps `record.rid` from the current request-id ContextVar so a
    formatter can include `%(rid)s`. A logging.Filter (not a LoggerAdapter)
    because it needs to work for every logger/handler in the process, not
    just ones call sites remember to wrap."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.rid = _request_id_ctx.get()
        return True


def install_rid_logging() -> None:
    """Best-effort: add the request-id filter (and, if a handler's formatter
    doesn't already reference it, a `[rid=...]` suffix) to every handler on
    the ROOT logger. Idempotent -- safe to call once per middleware instance.

    server.py calls logging.basicConfig() elsewhere and this module can be
    imported before or after that, so this only ever *appends* to whatever
    handlers/formatters already exist -- it never replaces logging config.
    Wrapped in try/except: a logging setup bug must never take down request
    handling."""
    try:
        root = logging.getLogger()
        for handler in root.handlers:
            if any(isinstance(f, _RequestIdLogFilter) for f in handler.filters):
                continue  # already installed on this handler
            handler.addFilter(_RequestIdLogFilter())
            fmt = handler.formatter
            existing = fmt._fmt if fmt is not None else None
            if existing and "rid" in existing:
                continue  # caller's own formatter already surfaces it
            new_fmt = f"{existing} [rid=%(rid)s]" if existing else "%(message)s [rid=%(rid)s]"
            handler.setFormatter(logging.Formatter(new_fmt, datefmt=getattr(fmt, "datefmt", None)))
    except Exception:
        pass


# Bucket upper bounds in ms; one extra bucket (index len(EDGES)) catches
# everything above the last edge ("inf").
BUCKET_EDGES_MS = (50, 100, 300, 500, 1000, 3000)

# route_class -> {"count": int, "err_5xx": int, "buckets": [int, ...]}
_metrics: Dict[str, Dict[str, Any]] = {}


def _route_class(path: str) -> str:
    parts = [p for p in path.split("/") if p]
    return "/" + "/".join(parts[:2]) if parts else "/"


def _bucket_index(latency_ms: float) -> int:
    for i, edge in enumerate(BUCKET_EDGES_MS):
        if latency_ms <= edge:
            return i
    return len(BUCKET_EDGES_MS)  # overflow ("inf") bucket


def _record(route_class: str, latency_ms: float, status_code: int) -> None:
    b = _metrics.get(route_class)
    if b is None:
        b = {"count": 0, "err_5xx": 0, "buckets": [0] * (len(BUCKET_EDGES_MS) + 1)}
        _metrics[route_class] = b
    b["count"] += 1
    b["buckets"][_bucket_index(latency_ms)] += 1
    if status_code >= 500:
        b["err_5xx"] += 1


def _approx_p95(buckets: list) -> float:
    """Coarse p95 from bucket counts: the upper edge of the bucket that
    pushes the cumulative count past 95%. This is a histogram estimate
    (bucket-edge resolution), not an exact percentile."""
    total = sum(buckets)
    if not total:
        return 0.0
    target = total * 0.95
    cum = 0
    for i, c in enumerate(buckets):
        cum += c
        if cum >= target:
            return float(BUCKET_EDGES_MS[i]) if i < len(BUCKET_EDGES_MS) else float(BUCKET_EDGES_MS[-1])
    return float(BUCKET_EDGES_MS[-1])


class RequestMetricsMiddleware(BaseHTTPMiddleware):
    """Times every request, stamps X-Request-Id, buckets latency by
    route-class. Must be added LAST (outermost) in server.py's middleware
    chain so it measures the full stack, not just the route."""

    def __init__(self, app):
        super().__init__(app)
        install_rid_logging()

    async def dispatch(self, request: Request, call_next):
        request_id = _sanitize_request_id(request.headers.get("x-request-id")) or uuid.uuid4().hex
        token = _request_id_ctx.set(request_id)
        try:
            route_class = _route_class(request.url.path)
            t0 = time.monotonic()
            try:
                response = await call_next(request)
            except Exception:
                # A bug in an inner middleware (not the route) can raise past
                # call_next; still count it as an error before re-raising so
                # server.py's ServerErrorMiddleware can turn it into a 500.
                _record(route_class, (time.monotonic() - t0) * 1000, 500)
                raise
            latency_ms = (time.monotonic() - t0) * 1000
            _record(route_class, latency_ms, response.status_code)
            response.headers["X-Request-Id"] = request_id
            return response
        finally:
            _request_id_ctx.reset(token)


def get_metrics_snapshot() -> Dict[str, Any]:
    """Point-in-time per-route-class snapshot for the admin endpoint."""
    labels = [str(e) for e in BUCKET_EDGES_MS] + ["inf"]
    out: Dict[str, Any] = {}
    for route_class, b in _metrics.items():
        out[route_class] = {
            "count": b["count"],
            "err_5xx": b["err_5xx"],
            "buckets": dict(zip(labels, b["buckets"])),
            "approx_p95_ms": _approx_p95(b["buckets"]),
        }
    return out


def _age_hours(iso: Optional[str]) -> Optional[float]:
    if not iso:
        return None
    try:
        return round((datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds() / 3600.0, 2)
    except Exception:
        return None


def build_request_metrics_router(db, require_super_admin) -> APIRouter:
    router = APIRouter(tags=["request-metrics"])

    @router.get("/api/admin/system/metrics")
    async def admin_request_metrics(admin_id: str = Depends(require_super_admin)):
        try:
            queue_depth = await cache_backend.queue_length(face_queue.QUEUE)
        except Exception:
            queue_depth = None

        heartbeats: Dict[str, Any] = {}
        for name in ("usage_flush", "media_reconcile"):
            row = await db.job_heartbeats.find_one({"name": name}, {"_id": 0})
            last_run = row.get("last_run") if row else None
            heartbeats[name] = {"last_run": last_run, "age_hours": _age_hours(last_run)}

        return {
            "routes": get_metrics_snapshot(),
            "face_queue_depth": queue_depth,
            "job_heartbeats": heartbeats,
            "redis": await cache_backend.redis_info(),
            "postgres": await system_health._check_postgres(db),
        }

    return router
