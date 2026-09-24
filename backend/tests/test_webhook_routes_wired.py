"""Every webhook route must survive FastAPI's own routing + DI layer.

Why this file exists, separately from the settlement tests:

The settlement suites pull `route.endpoint` out of the router and call it
directly with a hand-built fake Request. That proves the SETTLEMENT LOGIC is
right, but it completely bypasses FastAPI's signature resolution — and that is
exactly where a real, silent, money-losing bug lived:

`event_purchase_service.py` uses `from __future__ import annotations` and
imported `Request` INSIDE the router-builder function. Postponed annotations
are resolved against the endpoint's `__globals__`, where a function-local
import does not exist. FastAPI does not raise — it quietly falls back to
treating `request` as a required QUERY parameter, so every real Razorpay
delivery got `422 {"loc": ["query", "request"]}` and the purchase could never
settle server-side. 46/46 settlement tests were green the whole time.

So: assert that each webhook endpoint's type hints actually RESOLVE, and that
the route does not declare a bogus required query parameter. Both checks are
cheap, need no DB and no network, and would have caught the bug on day one.
"""
from __future__ import annotations

import sys
import typing
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.aws_stub import ensure_aws_service
ensure_aws_service()


def _routers():
    """(label, router) for every module that exposes a payment webhook."""
    import event_purchase_service, event_finance_service, subscription_service
    import link_reactivation, studio_storage, portfolio_service, store_features

    async def _dep():
        raise NotImplementedError

    out = []
    out.append(("event_purchase",
                event_purchase_service.build_event_purchase_router(None, _dep)))
    out.append(("event_finance",
                event_finance_service.build_event_finance_router(None, _dep)))
    out.append(("subscription",
                subscription_service.build_subscription_router(None, None, _dep, _dep)))
    out.append(("link_reactivation",
                link_reactivation.build_link_reactivation_router(None, _dep, razorpay_client=None)))
    out.append(("studio_storage", studio_storage.router))
    out.append(("portfolio",
                portfolio_service.build_portfolio_router(None, _dep, _dep)))
    out.append(("store", store_features.build_store_router(None, _dep, None)))
    return out


def _webhook_routes():
    for label, router in _routers():
        for r in getattr(router, "routes", []):
            path = getattr(r, "path", "") or ""
            if "webhook" in path and "POST" in (getattr(r, "methods", None) or set()):
                yield label, path, r


def test_at_least_one_webhook_route_per_expected_module():
    """Guard the guard: if this collection silently found nothing, the checks
    below would vacuously pass."""
    found = {label for label, _p, _r in _webhook_routes()}
    missing = {"event_purchase", "subscription", "link_reactivation",
               "studio_storage", "portfolio", "store"} - found
    assert not missing, f"no webhook route discovered for: {sorted(missing)}"


@pytest.mark.parametrize("case", list(_webhook_routes()),
                         ids=lambda c: f"{c[0]}:{c[1]}")
def test_webhook_annotations_resolve(case):
    """The bug: a function-local `from fastapi import Request` under
    `from __future__ import annotations` makes this raise NameError, and
    FastAPI silently degrades the parameter instead of failing loudly."""
    label, path, route = case
    try:
        typing.get_type_hints(route.endpoint)
    except NameError as e:
        pytest.fail(
            f"{label} {path}: type hints do not resolve ({e}). "
            "Import the annotated type at MODULE scope — FastAPI resolves "
            "postponed annotations against the endpoint's __globals__ and will "
            "otherwise demote the parameter to a required query param, 422-ing "
            "every real webhook delivery."
        )


@pytest.mark.parametrize("case", list(_webhook_routes()),
                         ids=lambda c: f"{c[0]}:{c[1]}")
def test_webhook_declares_no_required_query_params(case):
    """A webhook POST carries a signed body and no query string. Any REQUIRED
    query parameter means the route can never be delivered to successfully —
    which is precisely how the event_purchase bug manifested."""
    label, path, route = case
    required = [q.name for q in (getattr(route, "dependant", None).query_params
                                 if getattr(route, "dependant", None) else [])
                if q.required]
    assert not required, (
        f"{label} {path}: required query params {required} — a real Razorpay "
        f"delivery sends none, so this route would 422 forever."
    )


if __name__ == "__main__":
    cases = list(_webhook_routes())
    print(f"discovered {len(cases)} webhook routes")
    test_at_least_one_webhook_route_per_expected_module()
    for c in cases:
        test_webhook_annotations_resolve(c)
        test_webhook_declares_no_required_query_params(c)
        print(f"  ok  {c[0]}:{c[1]}")
    print("webhook routes are wired correctly")
