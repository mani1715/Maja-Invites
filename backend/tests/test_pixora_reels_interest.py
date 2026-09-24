"""
test_pixora_reels_interest.py — the adaptive Reels ranking engine.

    cd backend && python -m tests.test_pixora_reels_interest

WHAT THIS COVERS: the pure, DB-free core of the Instagram-style Reels feed — how a
reel's "type" is derived, how a viewer's interest vector is sanitised/merged, and how
a reel is scored for a viewer. The endpoint layer is thin glue over these functions
(studio/interest db lookups + engagement counts), so proving the algorithm here proves
the behaviour the owner asked for: "watch candid → get more candid", while a brand-new
viewer with no interests still gets a sensible trending-style feed.

No Postgres / network: every helper under test is a pure function.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from pixora_service import (                                   # noqa: E402
    norm_topic, clean_interests, merge_interests, reel_topics_from,
    recency_score, score_reel, INTEREST_MAX,
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
    now = datetime(2026, 8, 2, 12, 0, 0, tzinfo=timezone.utc)

    print("=== norm_topic folds labels/hashtags to one comparable token ===")
    ok("lowercases and strips punctuation", norm_topic("Pre-Wedding") == "prewedding")
    ok("a hashtag folds to the same token", norm_topic("#preWedding") == "prewedding")
    ok("spaces and symbols removed", norm_topic("Baby  Shower!") == "babyshower")
    ok("empty/None is empty", norm_topic(None) == "" and norm_topic("") == "")

    print("\n=== reel_topics_from: a reel's 'type' comes from every available signal ===")
    reel = {"category": "Wedding", "tags": ["Candid", "emotional"],
            "caption": "Big day! #haldi #candid", "studio_id": "s1"}
    topics = reel_topics_from(reel, studio_topics=["Cinematography", "wedding"])
    ok("category is included", "wedding" in topics)
    ok("tags are included", "candid" in topics and "emotional" in topics)
    ok("caption hashtags are included", "haldi" in topics)
    ok("studio specialties are included", "cinematography" in topics)
    ok("duplicate signals collapse to one token", sorted(topics).count("wedding") == 1)

    # A reel created BEFORE categories existed — only a caption + studio — still classifies.
    legacy = {"caption": "candid moments #candid", "studio_id": "s2"}
    legacy_topics = reel_topics_from(legacy, studio_topics=["portrait"])
    ok("a legacy reel (no category/tags) still gets topics", legacy_topics == {"candid", "portrait"})

    print("\n=== clean_interests: never trust the browser's vector ===")
    dirty = {"Candid": 3, "wedding": "2.5", "junk": "notanumber",
             "neg": -5, "nan": float("nan"), "  Baby Shower ": 40}
    cleaned = clean_interests(dirty)
    ok("string weights are coerced", cleaned.get("wedding") == 2.5)
    ok("keys are normalised", cleaned.get("candid") == 3)
    ok("non-numeric weights dropped", "junk" not in cleaned)
    ok("non-positive weights dropped", "neg" not in cleaned)
    ok("NaN weights dropped", "nan" not in cleaned)
    ok("weights are capped at INTEREST_MAX", cleaned.get("babyshower") == INTEREST_MAX)
    ok("a non-dict yields an empty vector", clean_interests("nope") == {})

    print("\n=== merge_interests: server-stored + client, capped ===")
    merged = merge_interests({"candid": 5}, {"candid": 4, "wedding": 2})
    ok("shared topics add up", merged["candid"] == 9)
    ok("new topics are carried in", merged["wedding"] == 2)
    ok("the sum is capped at INTEREST_MAX",
       merge_interests({"candid": INTEREST_MAX}, {"candid": 10})["candid"] == INTEREST_MAX)

    print("\n=== recency_score: fresh outranks old, always positive ===")
    fresh = recency_score(_iso(now - timedelta(hours=1)), now)
    threeday = recency_score(_iso(now - timedelta(days=3)), now)
    old = recency_score(_iso(now - timedelta(days=30)), now)
    ok("a fresh reel scores near 1.0", fresh > 0.98)
    ok("~0.5 at three days old", 0.45 < threeday < 0.55)
    ok("recency strictly decreases with age", fresh > threeday > old > 0)
    ok("an unparseable timestamp scores 0 (never crashes)", recency_score("garbage", now) == 0.0)

    print("\n=== score_reel: the viewer's taste drives the order ===")
    interests = {"candid": 8.0, "sad": 6.0}
    candid_reel = {"id": "r_candid", "topics": {"candid"}, "created_at": _iso(now - timedelta(days=2))}
    wildlife_reel = {"id": "r_wild", "topics": {"wildlife"}, "created_at": _iso(now - timedelta(hours=1))}
    s_candid = score_reel(interests, candid_reel["topics"], engagement=2, created_at=candid_reel["created_at"], now=now)
    s_wild = score_reel(interests, wildlife_reel["topics"], engagement=2, created_at=wildlife_reel["created_at"], now=now)
    ok("a matching reel outranks a non-matching FRESHER one",
       s_candid > s_wild)

    print("\n=== score_reel: cold start falls back to freshness + engagement ===")
    empty = {}
    a = score_reel(empty, {"wedding"}, engagement=100, created_at=_iso(now - timedelta(days=1)), now=now)
    b = score_reel(empty, {"wedding"}, engagement=1, created_at=_iso(now - timedelta(days=1)), now=now)
    ok("with no interests, higher engagement ranks higher", a > b)
    fresh_c = score_reel(empty, {"wedding"}, engagement=5, created_at=_iso(now - timedelta(hours=1)), now=now)
    stale_c = score_reel(empty, {"wedding"}, engagement=5, created_at=_iso(now - timedelta(days=20)), now=now)
    ok("with no interests, fresher ranks higher", fresh_c > stale_c)

    print("\n=== score_reel: affinity is normalised so breadth can't game it ===")
    # One reel matches the viewer's single strong interest; another is padded with
    # many weakly/again-matched topics. The focused match should not lose to padding.
    focused = score_reel({"candid": 10.0}, {"candid"}, engagement=2, created_at=_iso(now - timedelta(days=2)), now=now)
    padded = score_reel({"candid": 10.0}, {"candid", "a", "b", "c", "d", "e"},
                        engagement=2, created_at=_iso(now - timedelta(days=2)), now=now)
    ok("a focused match beats a topic-stuffed reel with the same interest",
       focused > padded)

    print("\n=== end-to-end: ranking a small reel set for a candid-lover ===")
    viewer = {"candid": 9.0}
    reels = [
        {"id": "A", "topics": {"wildlife"}, "eng": 3, "age_d": 1},
        {"id": "B", "topics": {"candid"}, "eng": 1, "age_d": 4},
        {"id": "C", "topics": {"product"}, "eng": 2, "age_d": 1},
    ]
    ranked = sorted(
        reels,
        key=lambda r: score_reel(viewer, r["topics"], r["eng"], _iso(now - timedelta(days=r["age_d"])), now),
        reverse=True,
    )
    ok("the candid reel sorts to the top for a candid-lover", ranked[0]["id"] == "B")

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    run()
