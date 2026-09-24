"""
test_users_retired.py -- Lane D: normal-user accounts are retired.

    cd backend && python -m tests.test_users_retired

PRODUCT PIVOT (owner-decided, final): photographers/studios are the only
account holders. Every public normal-user (couple/buyer) account endpoint in
user_auth.py + user_features.py now answers 410 NORMAL_USERS_RETIRED, and the
store buyer guard (store_features.py) requires a photographer/studio Bearer
JWT -- a couple-session cookie (or an event_client Couple Access token) no
longer authenticates an order.

Covers:
  1. user_auth.py: register/login (and every other public account route) 410.
  2. user_features.py: every user-owned invitation/dashboard route 410.
  3. store_features.py: /api/store/order/create 401 with no Bearer, 401 with
     a couple-cookie, 401 with an event_client (Couple Access) Bearer, and
     PASSES the guard with a studio Bearer (downstream monkeypatched via an
     is_test admin so it never touches Razorpay).
  4. Public store READ endpoints (packages / price / quote) stay open, no auth.
  5. photographer_clients.py (Couple Access portal) is untouched -- its
     router still builds.

In-memory FakeDB; no network, no Postgres.
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
os.environ.setdefault("ALLOW_INSECURE_JWT", "1")

from fastapi import FastAPI                                    # noqa: E402
from fastapi.testclient import TestClient                      # noqa: E402

from tests.test_storage_orchestrator import FakeDB              # noqa: E402
import user_auth                                                 # noqa: E402
import user_features                                             # noqa: E402
import store_features as store                                   # noqa: E402
import photographer_clients                                      # noqa: E402
from auth import create_access_token, create_client_token        # noqa: E402

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


def _retired_detail(r):
    try:
        d = r.json().get("detail")
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# 1+2. user_auth.py + user_features.py: every user-owned route 410
# ---------------------------------------------------------------------------
def test_user_auth_and_features_retired():
    print("\n[1] user_auth.py + user_features.py -- every route answers 410")
    db = FakeDB()
    app = FastAPI()

    auth_router, _get_current_user = user_auth.build_user_auth_router(db)
    app.include_router(auth_router)
    app.include_router(user_features.build_user_features_router(
        db,
        require_super_admin=lambda: {"admin_id": "sa1"},
        get_current_public_user=lambda: {"user_id": "u1"},
        razorpay_client=None,
        sanitize_html=lambda s: s,
        generate_slug=lambda a, b: "slug",
        calculate_expiry_date=lambda a, b: None,
        calculate_invitation_expires_at=lambda a, b: None,
    ))
    client = TestClient(app)

    retired_routes = [
        # user_auth.py -- public account endpoints
        ("POST", "/api/users/register", {"email": "a@b.com", "name": "A", "password": "pw12345678"}),
        ("POST", "/api/users/login", {"email": "a@b.com", "password": "pw12345678"}),
        ("GET", "/api/users/auth/google/login", None),
        ("GET", "/api/users/auth/google/callback", None),
        ("GET", "/api/users/me", None),
        ("POST", "/api/users/logout", None),
        # user_features.py -- user-owned invitation/dashboard endpoints
        ("POST", "/api/users/profiles/p1/buy-addon", {"addon_id": "music"}),
        ("POST", "/api/users/credits/purchase/create-order", {"pack_id": "p1"}),
        ("POST", "/api/users/credits/purchase/verify",
         {"razorpay_order_id": "o", "razorpay_payment_id": "p", "razorpay_signature": "s"}),
        ("GET", "/api/users/credits/purchases", None),
        ("GET", "/api/users/profiles/p1/insights", None),
        ("POST", "/api/users/profiles", {"design_id": "d1"}),
        ("GET", "/api/users/profiles", None),
        ("GET", "/api/users/profiles/p1", None),
        ("PATCH", "/api/users/profiles/p1", {"venue": "x"}),
        ("DELETE", "/api/users/profiles/p1", None),
        ("GET", "/api/users/credits/ledger", None),
        ("POST", "/api/users/upload-image", None),
    ]
    for method, path, body in retired_routes:
        r = client.request(method, path, json=body)
        ok(f"{method} {path} -> 410 NORMAL_USERS_RETIRED",
           r.status_code == 410 and _retired_detail(r).get("code") == "NORMAL_USERS_RETIRED")

    # register/login must 410 regardless of what's posted -- no validation
    # gate blocks the retirement message (a malformed body must not 422 first).
    r = client.post("/api/users/register", json={"garbage": True})
    ok("register 410s even on a malformed body (no 422 first)", r.status_code == 410)

    # super-admin CRUD (design-pricing, user management) is OUT of Lane D's
    # scope -- confirm it is untouched, still reachable through its own guard.
    r = client.get("/api/super-admin/design-pricing")
    ok("super-admin design-pricing route still exists (dependency-gated, not 410)",
       r.status_code != 410)
    # Was /api/public/expiry-tiers, which is deleted: it priced link durations
    # in CREDITS and fed the normal-user purchase wizard, and both of those are
    # retired. The assertion's point — retiring accounts must not close public
    # catalogue reads — is kept, pointed at a catalogue that still exists.
    r = client.get("/api/public/pricing/portfolio")
    ok("public catalog reads stay open (no account needed to browse)", r.status_code == 200)


# ---------------------------------------------------------------------------
# 3+4. store_features.py buyer guard
# ---------------------------------------------------------------------------
async def _seed_test_studio(db, admin_id="admin_test1"):
    await db.admins.insert_one({"id": admin_id, "is_test": True})


def test_store_buyer_guard():
    print("\n[2] store_features.py -- ordering requires a studio Bearer")
    db = FakeDB()
    asyncio.run(_seed_test_studio(db))

    app = FastAPI()
    app.include_router(store.build_store_router(
        db, razorpay_client=None,
        get_current_public_user=lambda: {"user_id": "unused", "kind": "user"}))
    client = TestClient(app)

    order_body = {"design_id": "d1", "esign_agreed": True}

    # -- no credentials at all -----------------------------------------
    r = client.post("/api/store/order/create", json=order_body)
    ok("order/create with no Bearer -> 401 NORMAL_USERS_RETIRED",
       r.status_code == 401 and _retired_detail(r).get("code") == "NORMAL_USERS_RETIRED")

    # -- a couple-session cookie no longer authenticates ----------------
    r = client.post("/api/store/order/create", json=order_body,
                     cookies={"user_session_token": "usr_whatever"})
    ok("order/create with only a couple-cookie -> still 401 (cookie retired)",
       r.status_code == 401)

    # -- an event_client (Couple Access) Bearer must NOT pass ------------
    event_token = create_client_token("some-profile-id")
    r = client.post("/api/store/order/create", json=order_body,
                     headers={"Authorization": f"Bearer {event_token}"})
    ok("order/create with a Couple Access (event_client) Bearer -> 401, not accepted as a buyer",
       r.status_code == 401)

    # -- a valid studio Bearer passes the guard --------------------------
    studio_token = create_access_token(data={"sub": "admin_test1", "role": "admin"})
    r = client.post("/api/store/order/create", json=order_body,
                     headers={"Authorization": f"Bearer {studio_token}"})
    ok("order/create with a studio Bearer -> guard passes (200)", r.status_code == 200)
    body = r.json() if r.status_code == 200 else {}
    ok("is_test bypass fired (downstream monkeypatched -- never touched Razorpay)",
       body.get("free") is True)

    orders = asyncio.run(db.invitation_orders.find({}, {"_id": 0}).to_list(10))
    ok("order recorded under the studio's admin id, buyer_kind=photographer",
       len(orders) == 1 and orders[0]["user_id"] == "admin_test1"
       and orders[0]["buyer_kind"] == "photographer")

    # -- public store READ endpoints stay open, no auth ------------------
    r = client.get("/api/store/packages")
    ok("GET /api/store/packages stays public", r.status_code == 200)
    r = client.get("/api/store/design/d1/price")
    ok("GET /api/store/design/{id}/price stays public", r.status_code == 200)
    r = client.post("/api/store/quote", json={"design_id": "d1"})
    ok("POST /api/store/quote stays public", r.status_code == 200)

    # -- my-orders / get_order also require the studio Bearer now -------
    r = client.get("/api/store/my-orders")
    ok("GET /api/store/my-orders with no Bearer -> 401", r.status_code == 401)
    r = client.get("/api/store/my-orders", headers={"Authorization": f"Bearer {studio_token}"})
    ok("GET /api/store/my-orders with a studio Bearer -> 200", r.status_code == 200)


# ---------------------------------------------------------------------------
# 5. photographer_clients.py (Couple Access portal) untouched
# ---------------------------------------------------------------------------
def test_photographer_clients_untouched():
    print("\n[3] photographer_clients.py -- Couple Access portal still builds")

    async def _fake_admin():
        return {"admin_id": "a1", "role": "admin"}

    async def _fake_event_client():
        return "profile-1"

    db = FakeDB()
    router = photographer_clients.build_photographer_clients_router(
        db, _fake_admin, _fake_event_client)
    ok("build_photographer_clients_router still builds an APIRouter",
       type(router).__name__ == "APIRouter" and len(router.routes) > 0)
    ok("client login route is still mounted",
       any(getattr(r, "path", "") == "/api/client/login" for r in router.routes))


def main():
    test_user_auth_and_features_retired()
    test_store_buyer_guard()
    test_photographer_clients_untouched()
    print(f"\nUsers Retired: {PASS} checks, {len(FAIL)} failed")
    if FAIL:
        print("FAILED:")
        for f in FAIL:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
    sys.exit(1 if FAIL else 0)
