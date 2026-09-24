"""
Self-test for pricing entitlement enforcement (Phases 2 & 3).

    cd backend && python -m tests.test_pricing_activation

Proves: purchased duration writes link_expiry_date (1/2/5 yr + lifetime), grandfathered
links never expire, feature pack writes granted_features, the runtime gate is
backward-compatible, and the whole thing is a no-op while new_pricing_enabled is OFF.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from datetime import datetime, timezone

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from tests.test_storage_orchestrator import FakeDB
import pricing_activation as act


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _flag(db, on):
    await db.app_settings.update_one({"key": "new_pricing_enabled"},
                                     {"$set": {"key": "new_pricing_enabled", "value": on}}, upsert=True)


async def _seed(db):
    for key, days, life in [("1yr", 365, False), ("2yr", 730, False), ("5yr", 1825, False), ("life", 0, True)]:
        await db.link_duration_tiers.insert_one({"id": f"dur_{key}", "key": key, "duration_days": days,
                                                 "lifetime": life, "active": True})
    await db.feature_packs.insert_one({"key": "signature", "name": "Signature",
                                       "features": ["rsvp", "timeline", "maps", "live_gallery", "guest_wishes"]})
    await db.feature_packs.insert_one({"key": "celebration", "name": "Celebration",
                                       "features": ["rsvp", "timeline", "maps"]})


def _order(dur="dur_1yr", pack="signature"):
    return {"id": "ord1", "quote": {"pricing_model": "v2", "duration_id": dur, "package": pack}}


async def run():
    db = FakeDB()
    await _seed(db)

    print("1. flag OFF → total no-op")
    await _flag(db, False)
    await db.profiles.insert_one({"id": "p0", "slug": "a-b"})
    r = await act.apply_order_entitlements(db, _order(), "p0")
    _check(r["applied"] is False and r["reason"] == "flag_off", "no entitlements applied while flag OFF")
    _check(await act.has_feature(db, {"granted_features": ["rsvp"]}, "live_gallery") is True,
           "has_feature permissive while flag OFF")

    await _flag(db, True)

    print("2. duration → expiry (1/2/5 yr)")
    for key, days in [("dur_1yr", 365), ("dur_2yr", 730), ("dur_5yr", 1825)]:
        await db.profiles.insert_one({"id": f"pp_{key}", "slug": key})
        await act.apply_order_entitlements(db, _order(dur=key), f"pp_{key}")
        p = await db.profiles.find_one({"id": f"pp_{key}"})
        exp = act._parse(p["link_expiry_date"])
        delta = (exp - datetime.now(timezone.utc)).days
        _check(p["link_lifetime"] is False and abs(delta - days) <= 1, f"{key} → expiry ~{days}d out")

    print("3. lifetime → never expires")
    await db.profiles.insert_one({"id": "plife", "slug": "life"})
    await act.apply_order_entitlements(db, _order(dur="dur_life"), "plife")
    p = await db.profiles.find_one({"id": "plife"})
    _check(p["link_expiry_date"] is None and p["link_lifetime"] is True, "lifetime link has no expiry")

    print("4. grandfathered link never gets an expiry")
    await db.profiles.insert_one({"id": "pgf", "slug": "gf", "pricing_grandfathered": True})
    await act.apply_order_entitlements(db, _order(dur="dur_1yr"), "pgf")
    p = await db.profiles.find_one({"id": "pgf"})
    _check("link_expiry_date" not in p or p.get("link_expiry_date") is None,
           "grandfathered profile keeps no expiry")

    print("5. feature pack → granted_features + gate")
    await db.profiles.insert_one({"id": "pf", "slug": "f"})
    r = await act.apply_order_entitlements(db, _order(pack="signature"), "pf")
    p = await db.profiles.find_one({"id": "pf"})
    _check(p["feature_pack_key"] == "signature" and "live_gallery" in p["granted_features"],
           "signature pack features stored on the link")
    _check(await act.has_feature(db, p, "live_gallery") is True, "granted feature allowed")
    _check(await act.has_feature(db, p, "ai_face_match") is False, "un-purchased feature blocked")
    _check(await act.has_feature(db, {"slug": "legacy"}, "ai_face_match") is True,
           "legacy link (no granted_features) keeps all features")

    print("6. legacy (non-v2) order ignored")
    await db.profiles.insert_one({"id": "pl", "slug": "l"})
    r = await act.apply_order_entitlements(db, {"id": "o2", "quote": {"package": "premium"}}, "pl")
    _check(r["applied"] is False and r["reason"] == "legacy_order", "legacy ceremony order not enforced")

    print("7. audit trail")
    logs = [x async for x in db.pricing_audit_log.find({"action": "order_entitlements_applied"})]
    _check(len(logs) >= 5, "every entitlement application is audited")

    print("\nALL PRICING ACTIVATION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
