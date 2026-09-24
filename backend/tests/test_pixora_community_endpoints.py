"""
test_pixora_community_endpoints.py — C2-C6 endpoints end-to-end on the FakeDB.

    cd backend && python -m tests.test_pixora_community_endpoints

The pure-helper suite (test_pixora_reco) proves the maths; THIS suite proves the
DB-glue: For You, Nearby, the hashtag page + trending, poll voting, highlights and
content analytics actually run against seeded data and return the shapes the frontend
consumes. No Postgres/network — in-memory FakeDB + a minimal anonymous Request.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from starlette.requests import Request                       # noqa: E402
from tests.test_storage_orchestrator import FakeDB           # noqa: E402
import pixora_service as px                                  # noqa: E402

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


def anon_request():
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [],
             "query_string": b"", "client": ("127.0.0.1", 0)}
    return Request(scope)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


async def seed(db):
    now = datetime.now(timezone.utc)
    await db.portfolio_profiles.insert_one({
        "id": "s1", "studio_name": "Lens & Light", "is_published": True,
        "location": {"city": "Hyderabad"}, "services": ["wedding", "candid"]})
    await db.portfolio_profiles.insert_one({
        "id": "s2", "studio_name": "Wild Frames", "is_published": True,
        "location": {"city": "Goa"}, "services": ["wildlife"]})
    await db.admins.insert_one({"admin_id": "s1", "studio_name": "Lens & Light"})
    await db.admins.insert_one({"admin_id": "s2", "studio_name": "Wild Frames"})
    # A Hyderabad wedding post by s1, tagged #candid, with some views.
    await db.pixora_posts.insert_one({
        "id": "pst_1", "studio_id": "s1", "kind": "showcase", "title": "Haldi",
        "body": "sunlit #candid", "image_url": "http://x/img.jpg", "tags": ["candid"],
        "category": "wedding", "location": "Hyderabad", "camera": "Sony A7 IV",
        "likes": ["u2"], "views": 40, "created_at": _iso(now - timedelta(days=1))})
    # A Goa wildlife reel by s2.
    await db.pixora_reels.insert_one({
        "id": "reel_1", "studio_id": "s2", "kind": "video", "url": "http://x/r.mp4",
        "caption": "tiger #wildlife", "tags": ["wildlife"], "likes": [],
        "views": 5, "created_at": _iso(now - timedelta(hours=6))})
    # An active poll story by s1.
    await db.pixora_stories.insert_one({
        "id": "story_1", "studio_id": "s1", "type": "poll", "question": "Film or digital?",
        "options": ["Film", "Digital"], "votes": {"0": 0, "1": 0}, "voters": [],
        "caption": "", "created_at": _iso(now), "expires_at": _iso(now + timedelta(hours=20))})
    # An active marketplace listing by s2.
    await db.pixora_listings.insert_one({
        "id": "lst_1", "studio_id": "s2", "status": "active", "title": "Warm Wedding Preset",
        "kind": "preset", "price_inr": 499, "preview_url": "http://x/p.jpg",
        "created_at": _iso(now)})


def routes(router):
    ep = {}
    for r in router.routes:
        for m in (getattr(r, "methods", None) or []):
            ep[(r.path, m)] = r.endpoint
    return ep


async def run():
    db = FakeDB()
    await seed(db)

    async def require_admin():
        return {"admin_id": "s1"}
    router = px.build_pixora_router(db, require_admin, require_admin)
    ep = routes(router)

    print("=== For You (C3): personalised blend runs & returns cards ===")
    foryou = ep[("/api/public/pixora/foryou", "GET")]
    fy = await foryou(anon_request())
    ok("foryou returns a feed list", isinstance(fy.get("feed"), list))
    ok("foryou surfaces the seeded post and reel", len(fy["feed"]) >= 2)
    ids = {c["id"] for c in fy["feed"]}
    ok("the post is in the feed", "pst_1" in ids)
    ok("the reel is in the feed", "reel_1" in ids)
    ok("organic cards are typed post/reel",
       all(c.get("type") in ("post", "reel") for c in fy["feed"] if c.get("type") != "listing"))

    print("\n=== Marketplace-in-feed (C6): labelled listing card can appear ===")
    # With only 2 organic items the cadence (every 6) won't inject; force a longer feed.
    for i in range(8):
        await db.pixora_posts.insert_one({
            "id": f"pst_x{i}", "studio_id": "s1", "kind": "showcase", "title": f"p{i}",
            "body": "", "image_url": "http://x/i.jpg", "tags": ["candid"], "category": "wedding",
            "likes": [], "views": 1, "created_at": _iso(datetime.now(timezone.utc) - timedelta(days=2 + i))})
    fy2 = await foryou(anon_request())
    listing_cards = [c for c in fy2["feed"] if c.get("type") == "listing"]
    ok("a marketplace card is injected once the feed is long enough", len(listing_cards) >= 1)
    if listing_cards:
        ok("the injected card is clearly labelled", bool(listing_cards[0].get("label")))
        ok("the injected card links to a real listing", listing_cards[0]["id"] == "lst_1")

    print("\n=== Nearby (C2): honest city match ===")
    nearby = ep[("/api/public/pixora/nearby", "GET")]
    nn = await nearby(anon_request(), city="Hyderabad")
    near_ids = {c["id"] for c in nn["feed"]}
    ok("Hyderabad nearby includes the Hyderabad post", "pst_1" in near_ids)
    ok("Hyderabad nearby excludes the Goa reel", "reel_1" not in near_ids)
    no_city = await nearby(anon_request())          # anonymous, no city → prompt
    ok("no city → needs_city prompt with options",
       no_city.get("needs_city") is True and "Hyderabad" in (no_city.get("cities") or []))

    print("\n=== Hashtags (C2): page + trending ===")
    tagpage = ep[("/api/public/pixora/hashtag/{tag}", "GET")]
    tp = await tagpage("candid", anon_request())
    ok("#candid page returns the tagged post", any(p["id"] == "pst_1" for p in tp["posts"]))
    ok("#candid page reports a real post_count", tp["post_count"] >= 1)
    trending = ep[("/api/public/pixora/hashtags/trending", "GET")]
    tr = await trending()
    tags = {t["tag"] for t in tr["tags"]}
    ok("trending computes candid + wildlife from live content", "candid" in tags and "wildlife" in tags)

    print("\n=== Poll voting (C4): one honest vote ===")
    vote = ep[("/api/public/pixora/stories/{story_id}/vote", "POST")]
    v1 = await vote("story_1", SimpleNamespace(option=1), anon_request())
    ok("a vote is counted", v1["votes"]["1"] == 1 and v1["total"] == 1)
    threw = False
    try:
        await vote("story_1", SimpleNamespace(option=0), anon_request())
    except px.HTTPException as e:
        threw = e.status_code == 409
    ok("the same voter can't vote twice", threw)

    print("\n=== Highlights (C4): create from a story, read back publicly ===")
    create_hl = ep[("/api/pixora/highlights", "POST")]
    hl = await create_hl(SimpleNamespace(title="Best of", cover_url=None, story_ids=["story_1"]),
                         {"admin_id": "s1"})
    ok("a highlight is created with a snapshot item",
       hl["highlight"]["title"] == "Best of" and len(hl["highlight"]["items"]) == 1)
    pub_hl = ep[("/api/public/pixora/highlights/{studio_id}", "GET")]
    ph = await pub_hl("s1")
    ok("the highlight appears on the public rail", len(ph["highlights"]) == 1)

    print("\n=== Content analytics (C5): aggregates the studio's own content ===")
    analytics = ep[("/api/pixora/content-analytics", "GET")]
    an = await analytics("all", {"admin_id": "s1"})
    ok("totals count the studio's posts", an["totals"]["posts"] >= 1)
    ok("total views are summed honestly", an["totals"]["views"] >= 40)
    ok("top_content is ranked and shaped", isinstance(an["top_content"], list))
    ok("tag reach surfaces #candid", any(t["tag"] == "candid" for t in an["top_tags"]))

    print("\n=== Signal capture (C3 Foundation): a like sharpens interests ===")
    like = ep[("/api/pixora/posts/{post_id}/like", "POST")]
    await like("reel_1", {"id": "s1", "name": "Lens & Light", "type": "studio"})
    vec = await db.pixora_interests.find_one({"actor_id": "s1"}, {"_id": 0})
    ok("liking a wildlife reel writes a wildlife interest",
       bool(vec) and vec["interests"].get("wildlife", 0) > 0)
    sig = await db.pixora_signals.find({}, {"_id": 0}).to_list(100)
    ok("the like is logged as a signal", any(s["event"] == "like" for s in sig))

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run())
