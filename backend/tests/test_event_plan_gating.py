"""
Ganesh v2 — Phase 5: plan → event feature gating self-test.

    cd backend && python -m tests.test_event_plan_gating

Proves the event renderer gate mirrors the wedding one: permissive while
new_pricing_enabled is OFF and for legacy events, and (flag ON) shows a packable
feature only when the applied plan grants it. Base sections are never gated.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_plan_gating as gate


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _flag(db, on):
    await db.app_settings.update_one({"key": "new_pricing_enabled"},
                                     {"$set": {"key": "new_pricing_enabled", "value": on}}, upsert=True)


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    # a plan (feature pack) mixing wedding + Ganesh keys
    await db.feature_packs.insert_one({"key": "gold", "name": "Gold",
        "features": ["rsvp", "journey", "blessings_wall", "countdown", "money_portal"]})
    await db.events.insert_one({"id": "e1", "event_id": "e1", "event_type": "ganesh_chaturthi"})
    ev = await db.events.find_one({"event_id": "e1"})

    print("1. flag OFF → everything visible")
    await _flag(db, False)
    _check(await gate.event_has_feature(db, ev, "money_portal") is True, "flag OFF permissive")
    r = await gate.apply_event_plan(db, "e1", "gold")
    _check(r["applied"] is False and r["reason"] == "flag_off", "apply is a no-op while flag OFF")

    await _flag(db, True)

    print("2. legacy event (no granted_features) → visible")
    _check(await gate.event_has_feature(db, ev, "blessings_wall") is True, "legacy event permissive")

    print("3. apply plan → granted features intersect the Ganesh vocabulary")
    r = await gate.apply_event_plan(db, "e1", "gold")
    _check(r["applied"] and "journey" in r["granted_features"], "plan applied")
    _check("rsvp" not in r["granted_features"], "non-Ganesh key dropped from event features")
    ev = await db.events.find_one({"event_id": "e1"})

    print("4. runtime gate reflects the plan")
    _check(await gate.event_has_feature(db, ev, "journey") is True, "granted feature visible")
    _check(await gate.event_has_feature(db, ev, "blessings_wall") is True, "granted feature visible")
    _check(await gate.event_has_feature(db, ev, "spending_folders") is False, "un-granted packable feature hidden")
    _check(await gate.event_has_feature(db, ev, "some_base_section") is True, "base (non-packable) never gated")

    print("5. unknown pack rejected; public payload shape")
    r2 = await gate.apply_event_plan(db, "e1", "nope")
    _check(r2["applied"] is False and r2["reason"] == "unknown_pack", "unknown pack rejected")
    _check(sorted(gate.public_event_features(ev)) == sorted(["journey", "blessings_wall", "countdown", "money_portal"]),
           "public_event_features returns the granted list")

    print("6. event_pricing path (apply_event_entitlements) — independent of the wedding flag")
    await _flag(db, False)
    r3 = await gate.apply_event_entitlements(db, "e1", "ganesh_basic",
                                             ["countdown", "prasadam_menu", "rsvp"], active_days=30)
    _check(r3["applied"] and "rsvp" not in r3["granted_features"],
           "entitlements applied with the flag OFF; non-Ganesh key dropped")
    ev = await db.events.find_one({"event_id": "e1"})
    _check(ev.get("link_active_days") == 30, "plan's active-days written onto the event")
    _check(await gate.event_has_feature(db, ev, "countdown") is True, "purchased feature visible")
    _check(await gate.event_has_feature(db, ev, "money_portal") is False,
           "un-purchased feature hidden even with the wedding flag OFF")

    print("7. rollback = clear granted_features → everything visible again")
    await db.events.update_one({"event_id": "e1"}, {"$set": {"granted_features": None}})
    ev = await db.events.find_one({"event_id": "e1"})
    _check(await gate.event_has_feature(db, ev, "money_portal") is True, "cleared grant → permissive")

    print("\nALL GANESH v2 PLAN-GATING TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
