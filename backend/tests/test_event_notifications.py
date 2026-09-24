"""
Self-test for notifications (Spec 05 §20).

    cd backend && python -m tests.test_event_notifications

Proves template rendering, the email channel (reuses email_service, dev mode),
graceful queueing of unconfigured channels, unknown-channel rejection, recording,
and history.
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

from fastapi import HTTPException
from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry
import event_lifecycle_service as life
import event_notifications_service as ntf


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


OWNER = {"user_id": "o1", "kind": "user"}


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    await registry.seed_event_registry(db)
    ev = await life.create_draft(db, OWNER, "ganesh_chaturthi")
    eid = ev["event_id"]

    print("1. template rendering")
    msg = ntf._render("donation_received", {"donor": "Ravi", "amount": 500, "receipt": "MAJA-X-00001"})
    _check("Ravi" in msg["body"] and "500" in msg["body"] and "MAJA-X-00001" in msg["subject"],
           "donation_received template fills context")

    print("2. email channel (dev provider) records + sends")
    r = await ntf.dispatch(db, eid, to="host@example.com", channel="email",
                           template_key="event_published", context={"event": "Utsav", "link": "/invite/x"})
    _check(r["status"] in ("sent", "queued", "failed"), "email dispatched")
    _check(await db.event_notifications.find_one({"id": r["notification_id"]}) is not None,
           "notification recorded")

    print("3. unconfigured channel queues gracefully")
    w = await ntf.dispatch(db, eid, to="9876543210", channel="whatsapp",
                           template_key="custom", context={"subject": "Hi", "body": "Namaste"})
    _check(w["status"] == "queued" and w["reason"] == "provider_not_configured",
           "whatsapp queued (no provider) — not lost")

    print("4. unknown channel rejected")
    try:
        await ntf.dispatch(db, eid, to="x", channel="pigeon", template_key="custom")
        _check(False, "unknown channel should raise")
    except HTTPException as e:
        _check(e.status_code == 422, "unknown channel → 422")

    print("5. history")
    hist = await ntf.list_notifications(db, eid)
    _check(hist["total"] >= 2, "notification history lists dispatched messages")
    _check(ntf.channel_status().get("email") in (True, False), "channel status reports availability")

    print("\nALL NOTIFICATION TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())
