"""
test_wishes_visibility.py — a guest's wish shows on the invitation immediately.

    cd backend && python -m tests.test_wishes_visibility

THE BUG THIS COVERS: a wish posted from the public invitation was created with
status "pending", and the public wall only renders "approved" wishes — so the
guest shared a wish and it never appeared (nor did anyone else's, until the studio
happened to open the moderation panel and approve it). Weddings are not a spam
surface, and the live gallery already auto-approves guest photos, so wishes now
auto-approve by default. A studio that wants to vet wishes first can still turn on
pre-moderation via profile.wishes_settings.moderation_required, which must keep the
old "pending" behaviour exactly.

No Postgres / network: the in-memory FakeDB stands in for the database, and the
router's endpoint functions are called directly.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from fastapi import HTTPException                          # noqa: E402
from wishes_features import build_wishes_router, WishCreate  # noqa: E402
from tests.test_storage_orchestrator import FakeDB          # noqa: E402

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


def _fake_request(ip="1.2.3.4"):
    return types.SimpleNamespace(
        client=types.SimpleNamespace(host=ip),
        headers={},
    )


def _endpoints(router):
    """path + method → the endpoint coroutine, so we can call handlers directly."""
    out = {}
    for r in getattr(router, "routes", []):
        for m in (getattr(r, "methods", None) or []):
            out[(r.path, m)] = r.endpoint
    return out


async def _run():
    db = FakeDB()
    ADMIN = {"role": "super_admin"}
    router = build_wishes_router(db, lambda: ADMIN)
    ep = _endpoints(router)
    submit = ep[("/api/invite/{slug}/wishes", "POST")]
    public = ep[("/api/public/invite/{slug}/wishes", "GET")]
    approve = ep[("/api/admin/profiles/{profile_id}/wishes/{wish_id}/approve", "POST")]
    admin_list = ep[("/api/admin/profiles/{profile_id}/wishes", "GET")]

    # --- auto-approve profile (the default) --------------------------------
    await db.profiles.insert_one({"id": "prof1", "slug": "divya-arjun"})

    print("=== a wish auto-approves and shows immediately ===")
    res = await submit("divya-arjun", WishCreate(guest_name="Aanya", message="So happy for you both!"),
                       _fake_request())
    ok("submit reports the wish is already approved", res["status"] == "approved")

    wall = await public("divya-arjun")
    msgs = [w["message"] for w in wall["wishes"]]
    ok("the guest's own wish is on the public wall right away",
       "So happy for you both!" in msgs)
    ok("the approved wish carries an approved_at stamp",
       wall["wishes"][0].get("approved_at"))

    # a second guest, so the wall is not a single-row fluke
    await submit("divya-arjun", WishCreate(guest_name="Ravi", relationship="College friend",
                                           message="Congratulations!"), _fake_request(ip="5.6.7.8"))
    wall = await public("divya-arjun")
    ok("a second guest's wish also shows without moderation", len(wall["wishes"]) == 2)

    print("\n=== pre-moderation can still be turned on per profile ===")
    await db.profiles.insert_one({
        "id": "prof2", "slug": "meera-karthik",
        "wishes_settings": {"moderation_required": True}})
    res2 = await submit("meera-karthik", WishCreate(guest_name="Nikhil", message="Best wishes!"),
                        _fake_request())
    ok("with moderation on, the wish comes back pending", res2["status"] == "pending")
    wall2 = await public("meera-karthik")
    ok("a pending wish is NOT shown publicly", wall2["wishes"] == [])

    listing = await admin_list("prof2", admin_data=ADMIN)
    ok("the studio sees it waiting in the moderation queue", listing["counts"]["pending"] == 1)
    wid = listing["wishes"][0]["id"]
    await approve("prof2", wid, admin_data=ADMIN)
    wall2 = await public("meera-karthik")
    ok("once approved it appears on the wall", len(wall2["wishes"]) == 1)

    print("\n=== one wedding's wishes never leak into another ===")
    ok("prof2's approval did not touch prof1's wall",
       len((await public("divya-arjun"))["wishes"]) == 2)

    print("\n=== the rate limit still holds (3 per guest per day) ===")
    fresh_ip = "9.9.9.9"
    for _ in range(3):
        await submit("divya-arjun", WishCreate(guest_name="Spammer", message="hi"),
                     _fake_request(ip=fresh_ip))
    threw = False
    try:
        await submit("divya-arjun", WishCreate(guest_name="Spammer", message="hi again"),
                     _fake_request(ip=fresh_ip))
    except HTTPException as e:
        threw = (e.status_code == 429)
    ok("a 4th wish from the same guest in a day is refused", threw)

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(_run())
