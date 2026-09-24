"""
Ganesh v2 — "I need an extra feature on my link" self-test.

    cd backend && python -m tests.test_event_feature_requests

Proves: a host can request a sellable feature or describe a custom one; requests are
ownership-scoped; the owner can decline, or APPROVE and have the feature actually land
on that one event's granted_features (so the invitation gains it immediately); and the
approve path never accidentally starts gating an ungated event.
In-memory FakeDB.
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

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_feature_requests as fr
import event_plan_gating as gate


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def _expect(coro, status, label):
    try:
        await coro
        _check(False, f"{label} (expected {status})")
    except HTTPException as e:
        _check(e.status_code == status, f"{label} → {status}")


HOST = {"user_id": "host1", "kind": "user"}
OTHER = {"user_id": "host2", "kind": "user"}


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    await db.events.insert_one({
        "id": "e1", "event_id": "e1", "event_type": "ganesh_chaturthi",
        "owner_id": "host1", "title": "Sharma Ganesh 2026",
        "granted_features": ["countdown", "prasadam_menu"],   # a Basic-plan buyer
    })

    print("1. catalog lists every sellable feature with a price")
    cat = await fr.catalog(db, "ganesh_chaturthi")
    _check(len(cat["features"]) == len(registry.GANESH_FEATURE_KEYS), "all features offered")
    _check(all("price" in f for f in cat["features"]), "each carries a price")

    print("2. a host raises a request")
    r = await fr.create_request(db, "e1", HOST, feature_keys=["money_portal"],
                                message="We want the money logins for our committee.",
                                contact="98765xxxxx")
    _check(r["status"] == "new" and r["feature_keys"] == ["money_portal"], "request recorded as new")
    _check(r["event_title"] == "Sharma Ganesh 2026", "carries the event for the owner's queue")

    print("3. custom (not-yet-sold) asks are allowed; empty ones are not")
    c = await fr.create_request(db, "e1", HOST, feature_keys=[],
                                message="A live video stream of the evening aarti.")
    _check(c["feature_keys"] == [] and c["message"], "free-text request accepted")
    await _expect(fr.create_request(db, "e1", HOST, feature_keys=[], message="pls"),
                  422, "empty/too-short request rejected")
    await _expect(fr.create_request(db, "e1", HOST, feature_keys=["not_a_feature"], message=""),
                  422, "unknown feature key alone is not a request")

    print("4. requests are ownership-scoped")
    await _expect(fr.list_for_event(db, "e1", OTHER), 403, "a stranger cannot read them")
    await _expect(fr.create_request(db, "e1", OTHER, feature_keys=["donations"], message=""),
                  403, "a stranger cannot raise one")
    mine = await fr.list_for_event(db, "e1", HOST)
    _check(len(mine["requests"]) == 2, "the host sees their own two")

    print("5. owner declines")
    d = await fr.admin_update(db, c["id"], status="declined", note="Not offered this season.")
    _check(d["request"]["status"] == "declined" and d["request"]["owner_note"], "decline recorded with a note")
    _check(d["granted"] == [], "declining grants nothing")

    print("6. owner approves → the feature really lands on the invitation")
    ev = await db.events.find_one({"event_id": "e1"})
    _check(await gate.event_has_feature(db, ev, "money_portal") is False, "not available before approval")
    a = await fr.admin_update(db, r["id"], grant=True, note="Added — talk to you tomorrow.")
    _check(a["granted"] == ["money_portal"] and a["request"]["status"] == "approved", "approved + granted")
    ev = await db.events.find_one({"event_id": "e1"})
    _check(await gate.event_has_feature(db, ev, "money_portal") is True, "invitation now has the feature")
    _check("countdown" in ev["granted_features"], "existing plan features are kept")

    print("7. approving on an UNGATED event does not accidentally start gating it")
    await db.events.insert_one({"id": "e2", "event_id": "e2", "event_type": "ganesh_chaturthi",
                                "owner_id": "host1", "title": "Legacy"})   # granted_features absent
    r2 = await fr.create_request(db, "e2", HOST, feature_keys=["donations"], message="")
    a2 = await fr.admin_update(db, r2["id"], grant=True)
    ev2 = await db.events.find_one({"event_id": "e2"})
    _check(a2["granted"] == [] and ev2.get("granted_features") is None,
           "ungated event left ungated (everything stays visible)")

    print("8. runaway protection")
    for i in range(fr.MAX_OPEN_PER_EVENT):
        try:
            await fr.create_request(db, "e1", HOST, feature_keys=[], message=f"another idea number {i}")
        except HTTPException:
            break
    await _expect(fr.create_request(db, "e1", HOST, feature_keys=[], message="one more idea please"),
                  409, "too many open requests refused")

    print("\nALL EVENT FEATURE-REQUEST TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
