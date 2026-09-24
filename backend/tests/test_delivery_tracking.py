"""
test_delivery_tracking.py — email/SMS delivery observability on the FakeDB.

    cd backend && python -m tests.test_delivery_tracking

Proves send logging, recipient masking, webhook event application with
forward-only status ranking, stats/rates funnel, and provider payload
normalisation.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import delivery_tracking as dt                               # noqa: E402

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


async def main():
    db = FakeDB()

    # --- masking --------------------------------------------------------------
    ok("email masked", dt._mask("email", "aditi@gmail.com") == "a***@gmail.com")
    ok("phone masked", dt._mask("sms", "+91 99999 84321") == "***4321")

    # --- record_send ----------------------------------------------------------
    await dt.record_send(db, "email", "aditi@gmail.com", "resend", message_id="m1", ok=True, tags=["otp"])
    await dt.record_send(db, "email", "b@x.com", "resend", message_id="m2", ok=True)
    await dt.record_send(db, "sms", "+919999984321", "msg91", message_id="s1", ok=True)
    await dt.record_send(db, "email", "c@x.com", "smtp", message_id="m3", ok=False)  # failed send
    rows = await db.delivery_log.find({}, {"_id": 0}).to_list(100)
    ok("all sends logged", len(rows) == 4)
    ok("recipient stored masked, not raw", all("@gmail.com" not in r["recipient_masked"] or r["recipient_masked"].startswith("a***") for r in rows))
    m1 = await db.delivery_log.find_one({"message_id": "m1"}, {"_id": 0})
    ok("send starts at 'sent'", m1["status"] == "sent")

    # --- webhook events advance status forward-only ---------------------------
    await dt.record_event(db, "m1", "delivered")
    await dt.record_event(db, "m1", "opened")
    await dt.record_event(db, "m1", "delivered")  # late duplicate must NOT downgrade
    m1 = await db.delivery_log.find_one({"message_id": "m1"}, {"_id": 0})
    ok("status advanced to opened", m1["status"] == "opened")
    ok("late 'delivered' did not downgrade", m1["status"] == "opened")
    ok("events accumulate", len(m1["events"]) == 4)

    await dt.record_event(db, "m2", "bounced")
    m2 = await db.delivery_log.find_one({"message_id": "m2"}, {"_id": 0})
    ok("bounce recorded", m2["status"] == "bounced")
    ok("unknown message id ignored", await dt.record_event(db, "nope", "opened") is None)
    ok("invalid event ignored", await dt.record_event(db, "s1", "banana") is None)

    # --- stats funnel ---------------------------------------------------------
    st = await dt.delivery_stats(db, days=30)
    t = st["totals"]
    ok("sent total", t["sent"] == 4)
    ok("delivered counts delivered+opened", t["delivered"] == 1)
    ok("opened count", t["opened"] == 1)
    ok("bounced count", t["bounced"] == 1)
    ok("failed count", t["failed"] == 1)
    ok("open rate = opened/delivered = 100%", st["rates_pct"]["open"] == 100.0)
    ok("by_channel split", st["by_channel"].get("email") == 3 and st["by_channel"].get("sms") == 1)

    # --- provider payload normalisation --------------------------------------
    n1 = dt._normalize_webhook("email", {"type": "email.delivered", "data": {"email_id": "m2"}})
    ok("resend payload normalised", n1 == {"message_id": "m2", "event": "delivered"})
    n2 = dt._normalize_webhook("sms", {"MessageSid": "s1", "MessageStatus": "delivered"})
    ok("twilio payload normalised", n2 == {"message_id": "s1", "event": "delivered"})
    n3 = dt._normalize_webhook("email", {"message_id": "m3", "event": "clicked"})
    ok("generic payload normalised", n3 == {"message_id": "m3", "event": "clicked"})
    ok("garbage payload → None", dt._normalize_webhook("email", {"foo": "bar"}) is None)

    print(f"\nDelivery Tracking: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
