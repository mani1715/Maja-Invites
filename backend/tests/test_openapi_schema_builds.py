"""The app's OpenAPI schema must build, and no route may hide a ForwardRef.

This bug class has now bitten twice, silently, in two different modules:

  * `event_purchase_service.py` imported `Request` INSIDE the router builder,
    under `from __future__ import annotations`. FastAPI could not resolve the
    annotation, quietly demoted `request` to a required QUERY parameter, and
    the Razorpay webhook 422'd on every real delivery — money captured, order
    never settled.
  * `founding_admin.py` defined its `SettingsPatch` / `PlanPricePatch` request
    models INSIDE the router builder, same `from __future__ import annotations`.
    Pydantic could not resolve them against module globals, which 500'd
    `/openapi.json` (taking `/docs` and `/redoc` with it) and broke body
    parsing on both PATCH routes — founding pricing readable, never savable.

Both were invisible to the existing tests because those call handler functions
directly and never exercise FastAPI's signature/DI resolution.

`app.openapi()` forces resolution of every route's parameters and body models
at once, so one call catches the whole family. Anything annotated with a name
that only exists in a closure fails here instead of in production.

Imports `server`, so it needs the same env the app needs; no network, no DB
calls are made (schema generation is pure introspection).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
os.environ.setdefault(
    "SUPABASE_DB_URL", "postgresql://postgres@localhost:59999/offline_test_only")


@pytest.fixture(scope="module")
def app():
    # Database.lazy() never connects eagerly, so an unreachable DSN is fine.
    import server
    return server.app


def test_openapi_schema_builds(app):
    """The single check that would have caught both incidents."""
    try:
        schema = app.openapi()
    except Exception as e:                      # noqa: BLE001 - want the real text
        pytest.fail(
            f"app.openapi() raised {type(e).__name__}: {e}\n\n"
            "Almost always a type annotated with a name that is not visible at "
            "MODULE scope — a request model or `Request` imported/defined inside "
            "a router-builder function while the module uses "
            "`from __future__ import annotations`. Move it to module level."
        )
    assert schema.get("paths"), "OpenAPI schema built but contains no paths"


def test_no_route_has_unresolved_forwardref(app):
    """Pinpoint the offending route rather than just failing the whole schema,
    so the next person gets a file name instead of a stack trace."""
    import typing

    from fastapi.routing import APIRoute

    broken = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        try:
            typing.get_type_hints(route.endpoint)
        except Exception as e:                  # noqa: BLE001
            mod = getattr(route.endpoint, "__module__", "?")
            broken.append(f"{sorted(route.methods or [])} {route.path} "
                          f"[{mod}]: {type(e).__name__}: {e}")
    assert not broken, (
        "routes whose type hints do not resolve (FastAPI will silently "
        "mis-bind these parameters):\n  " + "\n  ".join(broken))


if __name__ == "__main__":
    import server as _s
    test_openapi_schema_builds(_s.app)
    print("  ok  openapi schema builds")
    test_no_route_has_unresolved_forwardref(_s.app)
    print("  ok  no unresolved ForwardRefs on any route")
    print("openapi/schema wiring OK")
