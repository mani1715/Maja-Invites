"""
test_pixora_dm.py — direct messages between studios, on FakeDB.

    cd backend && python -m tests.test_pixora_dm
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import pixora_dm as dm                                       # noqa: E402

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


async def err(coro, exc):
    try:
        await coro
        return False
    except exc:
        return True
    except Exception:
        return False


async def main():
    db = FakeDB()
    await db.admins.insert_one({"id": "s1", "name": "Asha Studio"})
    await db.admins.insert_one({"id": "s2", "name": "Vik Films"})
    await db.admins.insert_one({"id": "s3", "name": "Third Studio"})

    # s1 messages s2
    m1 = await dm.send_message(db, "s1", "s2", "Hi, are you free on the 12th?")
    ok("message created", m1["id"].startswith("msg_") and m1["sender_id"] == "s1")

    threads = await db.pixora_dm_threads.find({}, {"_id": 0}).to_list(10)
    ok("exactly one thread", len(threads) == 1)
    ok("thread key sorted pair", threads[0]["key"] == "s1|s2")
    ok("last_body set", threads[0]["last_body"].startswith("Hi, are you free"))

    # reuse thread on a second message (either direction)
    await dm.send_message(db, "s2", "s1", "Yes! Tell me more.")
    ok("thread reused (still one)", len(await db.pixora_dm_threads.find({}, {"_id": 0}).to_list(10)) == 1)
    ok("two messages total", len(await db.pixora_dm_messages.find({}, {"_id": 0}).to_list(10)) == 2)

    # s2's inbox: after s1's first msg then s2 replied (own read updated), unread from s1's later? none new
    lt2 = await dm.list_threads(db, "s2")
    ok("s2 sees one thread", len(lt2["threads"]) == 1)
    ok("s2 thread shows s1's name", lt2["threads"][0]["other_name"] == "Asha Studio")

    # s1 has an unread (s2's reply) since s1 hasn't opened since
    lt1 = await dm.list_threads(db, "s1")
    ok("s1 has 1 unread (s2 reply)", lt1["threads"][0]["unread"] == 1 and lt1["unread_total"] == 1)

    # s1 opens the thread -> marks read -> unread clears
    tid = threads[0]["id"]
    view = await dm.list_messages(db, "s1", tid)
    ok("messages ordered oldest-first", [m["body"][:2] for m in view["messages"]] == ["Hi", "Ye"])
    ok("mine flag correct", view["messages"][0]["mine"] is True and view["messages"][1]["mine"] is False)
    ok("s1 unread cleared after open", (await dm.unread_count(db, "s1")) == 0)

    # security: s3 cannot read s1<->s2 thread
    ok("outsider blocked (403)", await err(dm.list_messages(db, "s3", tid), PermissionError))
    ok("outsider blocked on mark_read", await err(dm.mark_read(db, "s3", tid), PermissionError))

    # validation
    ok("self-message rejected", await err(dm.send_message(db, "s1", "s1", "hi"), ValueError))
    ok("empty body rejected", await err(dm.send_message(db, "s1", "s2", "   "), ValueError))
    ok("unknown recipient -> LookupError", await err(dm.send_message(db, "s1", "ghost", "hi"), LookupError))
    ok("missing thread -> LookupError", await err(dm.list_messages(db, "s1", "nope"), LookupError))

    print(f"\nPixora DM: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
