"""
test_pixora_reco.py — the C2–C6 recommendation Foundation (pure core).

    cd backend && python -m tests.test_pixora_reco

WHAT THIS COVERS: the DB-free primitives that power Nearby (C2), the hashtag index
(C2), the For You engine (C3), create-flow sanitising (C4), and marketplace-in-feed
(C6). The endpoints are thin glue over these — proving the maths here proves the
owner's ask: "engage with a topic → see more of it", a diversified feed (no wall of
one studio), honest Nearby (real city match), and clearly-injected marketplace cards.

No Postgres / network: every helper under test is a pure function.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from pixora_service import (                                    # noqa: E402
    SIGNAL_W, INTEREST_MAX, signal_bump, apply_signal_to_interests,
    content_topics_from, gear_topics, foryou_score, diversify, nearby_match,
    interleave_marketplace, clean_mentions, hashtags_from,
)

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


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def run():
    now = datetime(2026, 8, 3, 12, 0, 0, tzinfo=timezone.utc)

    print("=== SIGNAL_W: the spec's point weights, ordered by strength ===")
    ok("stronger acts weigh more (view<like<save<share<follow)",
       SIGNAL_W["view"] < SIGNAL_W["like"] < SIGNAL_W["save"]
       < SIGNAL_W["share"] < SIGNAL_W["follow"])
    ok("comment sits between like and save",
       SIGNAL_W["like"] < SIGNAL_W["comment"] < SIGNAL_W["save"])
    ok("a like bump equals one INTEREST_BUMP unit", abs(signal_bump("like") - 1.0) < 1e-9)
    ok("an unknown event is treated as a weak view",
       signal_bump("nonsense") == signal_bump("view"))

    print("\n=== apply_signal_to_interests: engaging a topic raises it ===")
    v0 = {}
    v1 = apply_signal_to_interests(v0, {"candid"}, "like")
    ok("a like adds the topic at weight 1.0", v1.get("candid") == 1.0)
    ok("the source vector is not mutated (pure)", v0 == {})
    v2 = apply_signal_to_interests(v1, {"candid"}, "save")
    ok("a save (20) bumps far more than a like (10)", v2["candid"] == 1.0 + 2.0)
    capped = apply_signal_to_interests({"candid": INTEREST_MAX}, {"candid"}, "follow")
    ok("a topic can never exceed INTEREST_MAX", capped["candid"] == INTEREST_MAX)
    ok("empty topics leave the vector unchanged",
       apply_signal_to_interests({"a": 3.0}, set(), "like") == {"a": 3.0})

    print("\n=== content_topics_from + gear_topics: posts speak 'topics' too ===")
    post = {"category": "Wedding", "tags": ["Candid"], "body": "sunset #haldi",
            "camera": "Sony A7 IV", "lens": "85mm f/1.4", "studio_id": "s1"}
    topics = content_topics_from(post, studio_topics=["cinematography"])
    ok("category/tags/hashtags carry over", {"wedding", "candid", "haldi"} <= topics)
    ok("studio topics carry over", "cinematography" in topics)
    ok("the camera brand becomes a topic", "sony" in gear_topics(post))
    ok("model/noise words are dropped from gear", "iv" not in gear_topics(post))

    print("\n=== foryou_score: the 40/20/20/10/5/5 blend ===")
    interests = {"candid": 12.0}
    match = foryou_score(interests, {"candid"}, engagement=2, created_at=_iso(now - timedelta(days=2)),
                         following=False, same_city=False, already_engaged=False, now=now)
    nomatch = foryou_score(interests, {"wildlife"}, engagement=2, created_at=_iso(now - timedelta(hours=1)),
                           following=False, same_city=False, already_engaged=False, now=now)
    ok("a topic the viewer likes outranks a fresher non-match", match > nomatch)

    base = dict(topics={"wildlife"}, engagement=2, created_at=_iso(now - timedelta(days=2)),
                same_city=False, already_engaged=False, now=now)
    not_following = foryou_score({}, following=False, **base)
    following = foryou_score({}, following=True, **base)
    ok("following the author lifts the score", following > not_following)

    base2 = dict(topics={"wildlife"}, engagement=2, created_at=_iso(now - timedelta(days=2)),
                 following=False, already_engaged=False, now=now)
    ok("same city lifts the score",
       foryou_score({}, same_city=True, **base2) > foryou_score({}, same_city=False, **base2))

    base3 = dict(topics={"wildlife"}, engagement=2, created_at=_iso(now - timedelta(days=2)),
                 following=False, same_city=False, now=now)
    ok("already-engaged content is penalised (novelty)",
       foryou_score({}, already_engaged=False, **base3) > foryou_score({}, already_engaged=True, **base3))

    print("\n=== foryou_score: cold start degrades to engagement + recency ===")
    hi = foryou_score({}, {"x"}, engagement=500, created_at=_iso(now - timedelta(days=1)),
                      following=False, same_city=False, already_engaged=False, now=now)
    lo = foryou_score({}, {"x"}, engagement=1, created_at=_iso(now - timedelta(days=1)),
                      following=False, same_city=False, already_engaged=False, now=now)
    ok("with no interests, higher engagement ranks higher", hi > lo)

    print("\n=== diversify: no studio appears twice in a row ===")
    items = [{"id": "1", "studio_id": "A"}, {"id": "2", "studio_id": "A"},
             {"id": "3", "studio_id": "A"}, {"id": "4", "studio_id": "B"},
             {"id": "5", "studio_id": "C"}]
    d = diversify(items)
    adjacent = any(d[i]["studio_id"] == d[i + 1]["studio_id"] for i in range(len(d) - 1))
    ok("output has no back-to-back same studio where avoidable", not adjacent)
    ok("diversify keeps every item exactly once",
       sorted(x["id"] for x in d) == ["1", "2", "3", "4", "5"])

    print("\n=== nearby_match: honest, substring both ways ===")
    ok("exact city matches", nearby_match("Hyderabad", "", "Hyderabad"))
    ok("post location matches when studio city doesn't",
       nearby_match("Mumbai", "Shot in Hyderabad", "hyderabad"))
    ok("partial 'Hyderabad' matches 'Hyderabad, Telangana'",
       nearby_match("Hyderabad, Telangana", "", "Hyderabad"))
    ok("no viewer city → never matches", not nearby_match("Hyderabad", "Hyderabad", ""))
    ok("a different city does not match", not nearby_match("Goa", "", "Delhi"))

    print("\n=== interleave_marketplace: labelled cards at a fixed cadence ===")
    feed = [{"id": f"p{i}", "type": "post"} for i in range(10)]
    listings = [{"id": "l1", "title": "Preset"}, {"id": "l2", "title": "Overlay"}]
    mixed = interleave_marketplace(feed, listings, every=4)
    ok("every organic post is preserved", sum(1 for c in mixed if c.get("type") == "post") == 10)
    ok("both listings were injected", sum(1 for c in mixed if c.get("type") == "listing") == 2)
    ok("the first listing lands at position 4 (after 4 posts)", mixed[4].get("type") == "listing")
    ok("no listings → feed unchanged", interleave_marketplace(feed, [], every=4) == feed)

    print("\n=== clean_mentions: sanitised, typed, capped ===")
    ms = clean_mentions([
        {"type": "studio", "ref": "s_42", "label": "Lens & Light"},
        {"type": "person", "label": "Aarav"},
        {"type": "bogus", "label": "drop me"},
        {"type": "product"},                       # no label/ref → dropped
        "not a dict",
    ])
    ok("valid studio/person mentions kept", len(ms) == 2)
    ok("unknown types are dropped", all(m["type"] in ("studio", "person") for m in ms))
    ok("a mention with neither label nor ref is dropped",
       all(m.get("label") or m.get("ref") for m in ms))
    ok("a non-list yields empty", clean_mentions("nope") == [])

    print("\n=== hashtags_from: explicit tags + text hashtags, deduped ===")
    tags = hashtags_from({"tags": ["Candid", "candid"], "body": "love this #Haldi #candid",
                          "title": "Big day"})
    ok("explicit tags normalised", "candid" in tags)
    ok("text hashtags folded in", "haldi" in tags)
    ok("duplicates collapse", tags.count("candid") == 1)

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    run()
