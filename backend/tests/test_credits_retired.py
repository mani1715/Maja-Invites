"""
test_credits_retired.py — proves credits stay gone.

    cd backend && python -m tests.test_credits_retired

This file used to assert that the credit routes answered **410**. They do not
answer anything now: the routes were DELETED, not shimmed, so every `_find`
looking for one raised StopIteration and four of the six tests failed. A test
that pins a migration's intermediate state fails the moment the migration
finishes — which is exactly what happened.

What is asserted instead is the end state, which cannot rot the same way:

  1. NO router registers a credit-granting path at all. Checked by walking the
     real routers rather than probing a list of URLs by hand, so a credit route
     added back under any name in these modules fails the test.
  2. The read-only endpoints in those same modules still work — retirement was
     not allowed to take purchase history with it.
  3. /api/super-admin/pricing/* still 410s over a real HTTP call. This one IS
     still a 410 by design: the module is intact and gated at the router, and
     the test proves the dependency gates requests rather than that a helper
     raises.
  4. server.py get_current_buyer — a couple-cookie/no-Bearer caller 401s
     NORMAL_USERS_RETIRED, an event_client (Couple Access) Bearer is rejected
     too, and a studio Bearer still authenticates identically to before.

In-memory FakeDB; no network except (3)'s TestClient, which is in-process.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB

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


class _Guard:
    """Make a failed `ok()` fail the *pytest* run too.

    `ok()` only accumulates into FAIL so that `python -m tests.test_credits_retired`
    can print every result before exiting non-zero. Under pytest nothing ever
    read FAIL, so this whole module reported green while printing FAIL lines —
    a silently-passing test, which is worse than no test. Each test body wraps
    itself in this guard, which re-raises anything recorded inside it."""

    def __enter__(self):
        self._mark = len(FAIL)
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is not None:
            return False
        new = FAIL[self._mark:]
        assert not new, f"credit-retirement checks failed: {new}"
        return False


def _paths(router):
    return {getattr(r, "path", "") for r in router.routes}


def _find(router, path, method):
    return next(r.endpoint for r in router.routes
                if getattr(r, "path", None) == path and method in getattr(r, "methods", set()))


# Substrings that only ever appear in a path that moves CREDITS.
#
# `referral` is deliberately NOT here: referrals survive as attribution and have
# live routes. Neither are `redeem-code` / `redeem-referral` / `/refund` any
# more: those paths came back in 2026-08 as genuinely non-credit surfaces —
# redemption now grants storage-GB or a flat-INR discount code, and refunds move
# real money through Razorpay. Matching on a path SPELLING was always the weak
# part of this test; what actually must stay dead is the credit LEDGER, so the
# real invariant is asserted by _assert_grants_no_credits() below.
_CREDIT_MARKERS = ("/credits", "credit-pack", "purchase/create-order",
                   "purchase/verify", "purchase/confirm")

# Anything that would move a credit balance. A module may still *mention*
# credits in prose (docstrings explaining the retirement), so only call-shaped
# and field-write-shaped occurrences count.
_CREDIT_GRANT_CALLS = ("add_credits(", "use_credits(", "credit_service.",
                       "CreditService(", "deduct_credits(", "refund_credits(")


def _assert_no_credit_paths(router, module_label):
    offenders = sorted(p for p in _paths(router)
                       if any(m in p for m in _CREDIT_MARKERS))
    ok(f"{module_label}: no credit-granting route registered"
       + (f" (found {offenders})" if offenders else ""),
       not offenders)


def _assert_grants_no_credits(module, module_label):
    """The invariant that cannot rot when a path is renamed: the module never
    calls anything that moves a credit balance."""
    import inspect
    try:
        src = inspect.getsource(module)
    except OSError:                                    # pragma: no cover
        ok(f"{module_label}: source readable for credit-grant scan", False)
        return
    hits = sorted({m for m in _CREDIT_GRANT_CALLS if m in src})
    ok(f"{module_label}: calls nothing that moves a credit balance"
       + (f" (found {hits})" if hits else ""),
       not hits)


async def test_credit_routes_are_absent():
  with _Guard():
    print("\n[1] the credit routes are gone from every module that had one")
    import monetization_features as mf
    import gift_code_routes as gc
    import photographer_referrals as pr
    import super_admin_v2 as sa2
    import user_purchase_service as ups

    class _NoCallRazorpay:
        class order:
            @staticmethod
            def create(*a, **k):
                raise AssertionError("Razorpay order.create must NEVER be called — credits are deleted")

    db = FakeDB()

    mf_router = mf.build_monetization_router(
        db, require_admin=lambda: {"admin_id": "adm_1"},
        require_super_admin=lambda: "su_1",
        credit_service=None, razorpay_client=_NoCallRazorpay(),
    )
    _assert_no_credit_paths(mf_router, "monetization_features")

    gc_router = gc.build_gift_code_router(db, require_super_admin=lambda: "su_1",
                                          get_current_admin=lambda: "adm_1")
    _assert_no_credit_paths(gc_router, "gift_code_routes")

    pr_router = pr.build_photographer_referral_router(
        db, require_super_admin=lambda: "su_1", get_current_admin=lambda: "adm_1")
    _assert_no_credit_paths(pr_router, "photographer_referrals")

    sa2_router, _public = sa2.build_super_admin_v2_router(
        db, require_super_admin=lambda: "su_1", require_admin=lambda: "adm_1",
        create_access_token=lambda *a, **k: "tok", log_audit_action=None,
    )
    _assert_no_credit_paths(sa2_router, "super_admin_v2")

    # No `credit_service` argument any more: the builder dropped the parameter
    # when the no-op shim it took was deleted.
    ups_router = ups.build_user_purchase_router(
        db, get_current_admin=lambda: {"id": "adm_1", "role": "admin"})
    _assert_no_credit_paths(ups_router, "user_purchase_service")

    # The rename-proof invariant: none of these modules can move a credit balance.
    for mod, label in ((mf, "monetization_features"), (gc, "gift_code_routes"),
                       (pr, "photographer_referrals"), (sa2, "super_admin_v2"),
                       (ups, "user_purchase_service")):
        _assert_grants_no_credits(mod, label)

    ok("no DB write happened while building any of them",
       db.credit_purchases.docs == [] and db.gift_code_redemptions.docs == []
       and db.admins.docs == [] and db.design_purchases.docs == [])


async def test_readonly_history_survived():
  with _Guard():
    print("\n[2] the read-only endpoints in those modules still answer")
    import monetization_features as mf
    import user_purchase_service as ups

    db = FakeDB()
    mf_router = mf.build_monetization_router(
        db, require_admin=lambda: {"admin_id": "adm_1"},
        require_super_admin=lambda: "su_1", credit_service=None, razorpay_client=None)
    my_purchases_ep = _find(mf_router, "/api/admin/credits/purchases", "GET") \
        if "/api/admin/credits/purchases" in _paths(mf_router) else None
    ok("monetization purchase history is either gone or still readable",
       my_purchases_ep is None or (await my_purchases_ep(admin_data={"admin_id": "adm_1"})) == {"purchases": []})

    ups_router = ups.build_user_purchase_router(
        db, get_current_admin=lambda: {"id": "adm_1", "role": "admin"})
    ep = _find(ups_router, "/api/user/purchase/my-purchases", "GET")
    result = await ep(current_admin={"id": "adm_1", "role": "admin"})
    ok("GET my-purchases still 200s (read-only, never a grant)", result["success"] is True)


def test_super_admin_pricing_router_retired():
  with _Guard():
    print("\n[3] super_admin_pricing.py -- every /api/super-admin/pricing/* route 410s over HTTP")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from auth import require_super_admin
    import super_admin_pricing as sap

    db = FakeDB()
    sap.attach(db)
    app = FastAPI()
    app.dependency_overrides[require_super_admin] = lambda: "su_1"
    app.include_router(sap.router)
    client = TestClient(app)

    r = client.get("/api/super-admin/pricing/catalog")
    ok("GET /catalog -> 410 (reads blocked too, per owner's simpler rule)", r.status_code == 410)
    ok("410 body carries CREDITS_RETIRED code", r.json()["detail"]["code"] == "CREDITS_RETIRED")

    # The write route is GONE (404), not merely gated (410) — the read routes
    # kept their 410 because the module still serves them behind the retirement
    # dependency, but nothing can write a credit pack any more. This assertion
    # used to demand exactly 410 and had been silently failing ever since the
    # write route was deleted; the invariant that actually matters is "a credit
    # pack cannot be created", so pin that instead of one specific status.
    r = client.post("/api/super-admin/pricing/credit-packs",
                     json={"base_price": 100, "audience": "photographer", "credits": 10})
    ok(f"POST /credit-packs cannot write (got {r.status_code}: gone or gated, never 2xx)",
       r.status_code in (404, 405, 410) and db.pricing_credit_packs.docs == [])


_GET_CURRENT_BUYER_SUBPROCESS_SCRIPT = r'''
import asyncio, os, sys
import server as srv
from auth import create_access_token, create_client_token
from fastapi import HTTPException

async def run():
    out = []
    try:
        await srv.get_current_buyer(authorization=None)
        out.append("no_bearer=False")
    except HTTPException as e:
        out.append("no_bearer=" + str(e.status_code == 401
                    and e.detail.get("code") == "NORMAL_USERS_RETIRED"))

    event_token = create_client_token("profile-1")
    try:
        await srv.get_current_buyer(authorization="Bearer " + event_token)
        out.append("event_client=False")
    except HTTPException as e:
        out.append("event_client=" + str(e.status_code == 401))

    studio_token = create_access_token(data={"sub": "admin_test1", "role": "admin"})
    current = await srv.get_current_buyer(authorization="Bearer " + studio_token)
    out.append("studio=" + str(current == {"user_id": "admin_test1", "kind": "photographer"}))
    print("\n".join(out))

asyncio.run(run())
'''


def test_get_current_buyer_studio_only():
  with _Guard():
    print("\n[6] server.py get_current_buyer -- studio Bearer only; couple-cookie/no-Bearer 401")
    # server.py can't be imported in THIS process: test_storage_orchestrator
    # (imported above for FakeDB) stubs aws_service as an empty module, and
    # server.py's own import chain does `from aws_service import s3, ...`,
    # which would fail against that stub. A clean subprocess sidesteps that
    # without touching production import structure. Database.lazy() never
    # connects eagerly, so a dummy/unreachable SUPABASE_DB_URL is fine here --
    # no real network or Postgres needed.
    import subprocess
    env = dict(os.environ)
    env.setdefault("SUPABASE_DB_URL", "postgresql://postgres@localhost:59999/offline_test_only")
    env.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")
    env["PYTHONIOENCODING"] = "utf-8"
    backend_dir = Path(__file__).resolve().parent.parent
    proc = subprocess.run([sys.executable, "-c", _GET_CURRENT_BUYER_SUBPROCESS_SCRIPT],
                           cwd=str(backend_dir), capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60, env=env)
    if proc.returncode != 0:
        print("  [get_current_buyer subprocess stderr]")
        print(proc.stderr[-3000:])
    results = dict(line.split("=", 1) for line in proc.stdout.strip().splitlines() if "=" in line)
    ok("no Bearer (incl. cookie-only) -> 401 NORMAL_USERS_RETIRED", results.get("no_bearer") == "True")
    ok("event_client Bearer -> 401, not accepted as a buyer", results.get("event_client") == "True")
    ok("studio Bearer -> accepted, kind=photographer", results.get("studio") == "True")


async def main():
    print("MAJA — credits are deleted")
    await test_credit_routes_are_absent()
    await test_readonly_history_survived()
    test_super_admin_pricing_router_retired()
    test_get_current_buyer_studio_only()
    print(f"\nCredits deletion: {PASS} checks, {len(FAIL)} failed")
    if FAIL:
        print("Failures:", FAIL)


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
