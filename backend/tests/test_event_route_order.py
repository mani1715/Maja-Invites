"""
Event API route-order regression test.

    cd backend && python -m tests.test_event_route_order

Why this exists
    The child-collection router is deliberately generic:
        /api/events/{event_id}/{collection}[/{child_id}[/{action}]]
    FastAPI matches routes in REGISTRATION order, so if that router is included
    before the specific event routers it silently swallows every same-shaped path —
    /api/events/plans/{type}, /api/events/purchase/verify, /api/events/{id}/gallery/upload,
    /api/events/{id}/money-members, /api/events/starter-content/{type} … all 404/403 with
    a confusing "unknown collection" instead of running. That is exactly what made the
    Ganesh buy panel show no prices.

    This test builds the routers in the SAME order as server.py and asserts each of
    those paths resolves to its own handler.

Skips cleanly when the installed FastAPI/Starlette pair cannot construct an APIRouter
(a known local dev-env mismatch); it still runs in CI/production images.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())
os.environ.setdefault("ALLOW_INSECURE_JWT", "1")     # test-only token signing

from tests.test_storage_orchestrator import FakeDB


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _flatten(routes):
    """Every leaf route, in match order.

    FastAPI ≥0.130 wraps each `include_router()` in a container route whose own
    `path` is None and whose children live on `.original_router`; older versions
    splice the routes in flat. Handle both so this test tracks reality, not a
    particular FastAPI release."""
    for route in routes:
        inner = getattr(route, "original_router", None)
        sub = getattr(inner, "routes", None) if inner is not None else None
        if sub is None and getattr(route, "path", None) is None:
            sub = getattr(route, "routes", None)
        if sub:
            yield from _flatten(sub)
        else:
            yield route


def _resolve(app, method, path):
    """The path template of the first route that matches — i.e. what FastAPI calls."""
    from starlette.routing import Match
    scope = {"type": "http", "method": method, "path": path, "headers": [],
             "root_path": "", "query_string": b""}
    for route in _flatten(app.routes):
        match, _ = route.matches(scope)
        if match == Match.FULL:
            return getattr(route, "path", None)
    return None


# the generic child-collection templates that must never win for a specific path
CATCH_ALL = {
    "/api/events/{event_id}/{collection}",
    "/api/events/{event_id}/{collection}/{child_id}",
    "/api/events/{event_id}/{collection}/{child_id}/{action}",
    "/api/events/{event_id}/{collection}/reorder",
}


async def run():
    try:
        from fastapi import FastAPI
        FastAPI()
    except TypeError as e:                       # local dev-env version mismatch
        print(f"SKIPPED — FastAPI/Starlette mismatch in this environment ({e})")
        return

    from fastapi import FastAPI
    import event_lifecycle_service as life
    import event_children_service as children
    import event_media_service as media
    import event_money_service as money
    import event_pricing as pricing
    import event_purchase_service as purchase
    import event_starter_content as starter

    db = FakeDB()
    buyer = lambda: {"user_id": "u1"}            # noqa: E731 - test stub
    su = lambda: "super"                          # noqa: E731 - test stub

    app = FastAPI()
    # SAME order as server.py — children LAST.
    app.include_router(life.build_event_router(db, buyer))
    app.include_router(media.build_event_media_router(db, buyer))
    app.include_router(money.build_event_money_router(db, buyer))
    app.include_router(pricing.build_event_pricing_router(db, su, None))
    app.include_router(purchase.build_event_purchase_router(db, buyer))
    app.include_router(starter.build_event_starter_router(db))
    app.include_router(children.build_event_children_router(db, buyer))

    print("1. specific event paths are NOT swallowed by the child-collection router")
    cases = [
        ("GET", "/api/events/plans/ganesh_chaturthi", "the plan/price sheet"),
        ("POST", "/api/events/purchase/verify", "purchase verification"),
        ("GET", "/api/events/design-offer/ganesh_chaturthi/royal_autumn", "the design offer"),
        ("GET", "/api/events/pricing/ganesh_chaturthi", "the public price sheet"),
        ("POST", "/api/events/pricing/quote", "the quote endpoint"),
        ("GET", "/api/events/starter-content/ganesh_chaturthi", "starter content"),
        ("POST", "/api/events/e1/gallery/upload", "gallery upload"),
        ("GET", "/api/events/e1/days/3/photo-status", "per-day photo status"),
        ("GET", "/api/events/e1/money-members", "money member list"),
    ]
    for method, path, label in cases:
        hit = _resolve(app, method, path)
        _check(hit is not None and hit not in CATCH_ALL,
               f"{label} resolves to its own handler ({hit})")

    print("2. real child-collection routes still reach the generic CRUD router")
    for method, path, label in [
        ("GET", "/api/events/e1/festival_schedule", "list children"),
        ("POST", "/api/events/e1/gallery/g1/approve", "child action"),
    ]:
        _check(_resolve(app, method, path) in CATCH_ALL, f"{label} still routes to child CRUD")

    print("3. the OLD order really did swallow them (proves this test can fail)")
    bad = FastAPI()
    bad.include_router(life.build_event_router(db, buyer))
    bad.include_router(children.build_event_children_router(db, buyer))   # too early
    bad.include_router(purchase.build_event_purchase_router(db, buyer))
    _check(_resolve(bad, "GET", "/api/events/plans/ganesh_chaturthi") in CATCH_ALL,
           "children-first ordering swallows the plan sheet")

    print("\nALL EVENT ROUTE-ORDER TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
