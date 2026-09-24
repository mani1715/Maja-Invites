"""
test_auto_moderation.py — auto-moderation screening + queue feed on the FakeDB.

    cd backend && python -m tests.test_auto_moderation

Proves the text heuristic (spam/abuse/clean), auto-report creation + dedup into
pixora_reports, the batch rescreen sweep, and graceful image-screen degradation.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import auto_moderation as am                                 # noqa: E402

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
    # --- text heuristic -------------------------------------------------------
    f1, r1, s1, _ = am.screen_text("Buy now! Click here www.spam.shop whatsapp me +91 99999 88888")
    ok("spammy text flagged as spam", f1 and "spam" in r1 and s1 >= am.SPAM_THRESHOLD)
    f2, r2, _, _ = am.screen_text("this is a scam and you are an idiot")
    ok("abusive text flagged", f2 and "abuse" in r2)
    f3, r3, _, _ = am.screen_text("nsfw xxx content here")
    ok("inappropriate text flagged", f3 and "inappropriate" in r3)
    f4, r4, _, _ = am.screen_text("Beautiful haldi ceremony at sunrise, loved the candid shots.")
    ok("clean text passes", not f4 and r4 == [])
    f5, _, _, _ = am.screen_text("")
    ok("empty text is not flagged", not f5)

    # --- auto_report into the queue + dedup -----------------------------------
    db = FakeDB()
    rep = await am.auto_report(db, "post", "p1", "Buy now click here www.x.shop free money crypto")
    ok("auto_report creates a report", rep is not None and rep["reporter"] == "system:automod")
    ok("report carries reason + auto flag", rep["reason"] == "spam" and rep["auto"] is True)
    dup = await am.auto_report(db, "post", "p1", "Buy now click here www.x.shop free money crypto")
    ok("dedup: no second open auto-report", dup is None)
    clean = await am.auto_report(db, "post", "p2", "lovely wedding photos")
    ok("clean content yields no report", clean is None)
    reports = await db.pixora_reports.find({}, {"_id": 0}).to_list(100)
    ok("exactly one report stored", len(reports) == 1)

    # --- batch rescreen sweep -------------------------------------------------
    db2 = FakeDB()
    await db2.pixora_posts.insert_one({"id": "post_spam", "title": "cheap followers",
                                       "body": "buy now click here dm me discount code www.a.shop"})
    await db2.pixora_posts.insert_one({"id": "post_ok", "title": "Mehendi", "body": "gorgeous colours"})
    await db2.pixora_reels.insert_one({"id": "reel_ok", "caption": "sunset timelapse"})
    summary = await am.rescreen_recent(db2, limit=100)
    ok("rescreen scanned all content", summary["scanned"] == 3)
    ok("rescreen flagged only the spam post", summary["flagged"] == 1)
    q = await db2.pixora_reports.find({"target_id": "post_spam"}, {"_id": 0}).to_list(10)
    ok("spam post is in the queue", len(q) == 1 and q[0]["reporter"] == "system:automod")
    # heartbeat recorded
    hb = await db2.job_heartbeats.find({"name": "auto_moderation_sweep"}, {"_id": 0}).to_list(10)
    ok("rescreen records a heartbeat", len(hb) == 1)

    # --- image screen degrades cleanly without AWS ----------------------------
    img = am.screen_image("some/s3/key.jpg")
    ok("image screen degrades to unavailable (no AWS)", img.get("available") is False)

    print(f"\nAuto-moderation: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAIL else 0)
