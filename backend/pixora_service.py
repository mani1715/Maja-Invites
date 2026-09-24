"""
pixora_service.py — Pixora, the photographer community layer.

AUDIT (what already existed vs what this adds):
  • Photographer identity/profiles ....... db.admins + photographer_directory.py  (REUSED)
  • Ratings / reviews .................... existing reviews  (REUSED for reputation)
  • Subscriptions / premium gate ......... subscription_service.py  (REUSED)
  • Community feed, reputation score, achievements, monthly challenges,
    leaderboard, hiring board ............ DID NOT EXIST → added here.

This is the core, working community MVP. Higher-tier Pixora spec items
(resource marketplace, learning center, certification, mentor program, events,
portfolio insights) are intentionally NOT stubbed — they layer on top of these
same collections later. Everything here is real: posts persist, likes/comments
work, reputation is computed from actual activity, achievements auto-award.

Collections (JSONB, auto-created):
  pixora_posts        {id, studio_id, kind, title, body, image_url, likes[], created_at}
  pixora_comments     {id, post_id, studio_id, body, created_at}
  pixora_challenges   {id, month, title, prompt, is_active}
  pixora_submissions  {id, challenge_id, studio_id, image_url, caption, votes[], created_at}
  pixora_gigs         {id, studio_id, title, location, budget_inr, description, status, applicants[], created_at}
  pixora_achievements {id, studio_id, key, awarded_at}   (unlocked records)

Wired in server.py:
    from pixora_service import build_pixora_router, seed_pixora
    app.include_router(build_pixora_router(db, require_admin))
    await seed_pixora(db)  # on startup
"""
# NOTE: `from __future__ import annotations` was REMOVED here on purpose.
# It turns every annotation into a string, and FastAPI resolves endpoint
# annotations against MODULE globals - so the request models this file
# defines INSIDE its router factory became unresolvable ForwardRefs,
# breaking /openapi.json AND request-body parsing for those endpoints.
# Without the future-import, function-scoped Pydantic models are fine.

import asyncio
import math
import re
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from pydantic import BaseModel, Field

# Phase 2 — community plan gating (grandfather-safe). ensure_capability raises 403
# with an upgrade prompt; grandfathered/existing studios and test accounts bypass it,
# and it fails OPEN on any error so it can never lock a user out. See community_gating.py.
from community_gating import ensure_capability, capability_state, has_capability
# Phase 3 — one shared storage pool (portfolio + community media). ensure_can_store
# raises 403 when an upload would exceed the studio's plan cap; usage_summary powers
# the storage meter. See storage_accounting.py.
import storage_accounting

# Community media (reels/stories/photo posts) upload targets. Mirrors the portfolio
# upload pipeline; the reverse proxy only forwards /api/*, so served URLs are /api/uploads/...
COMMUNITY_MEDIA_DIR = Path("/app/uploads/community")
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"}
_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".avi"}
_UPLOAD_IMAGE_MAX = 25 * 1024 * 1024     # 25 MB per photo
_UPLOAD_VIDEO_MAX = 200 * 1024 * 1024    # 200 MB per reel/story clip
# The declared MIME must match the file's kind (image/* for photos, video/* for clips);
# generic types (octet-stream / empty) are tolerated because some browsers send them.
_GENERIC_MIMES = {"", "application/octet-stream", "binary/octet-stream"}
# Reject obvious non-media magic bytes so a renamed script/exe/archive can't pose as media.
_REJECT_MAGIC = [b"MZ", b"\x7fELF", b"PK\x03\x04", b"%PDF", b"<!DO", b"<htm", b"<?xm", b"#!/"]
_UPLOAD_RATE_PER_MIN = 30


def _looks_like_media(kind: str, content_type: str, head: bytes) -> Optional[str]:
    """Return an error string if the file fails MIME/magic validation, else None."""
    ct = (content_type or "").lower().strip()
    if ct not in _GENERIC_MIMES:
        want = "image/" if kind == "image" else "video/"
        if not ct.startswith(want):
            return f"File content-type '{ct}' doesn't match a {kind}."
    for sig in _REJECT_MAGIC:
        if head.startswith(sig):
            return "That file doesn't look like a real image or video."
    return None

logger = logging.getLogger("pixora")

# "reel" is here because the composer posts kind="reel" whenever the picked file
# is a video (PixoraCommunity.jsx), and PostIn documents it. It was missing, so
# every reel post 400'd *after* the (slow) upload had already finished — the
# upload appeared to hang and then nothing showed up anywhere.
POST_KINDS = {"showcase", "critique_request", "tip", "discussion", "reel"}

# Post categories — the same vocabulary the spec uses for interest profiles, so
# a post's category and a user's interests are directly comparable. Free text is
# rejected rather than silently stored, or Discover's filter would never match.
POST_CATEGORIES = {"wedding", "portrait", "fashion", "street", "wildlife",
                   "travel", "drone", "product", "food", "event"}

# ---- Adaptive Reels interest engine (pure, DB-free — unit-tested) ----------
# A viewer's taste is a small {topic: weight} vector. Logged-out couples keep it
# in the browser (localStorage) and POST it with each Reels-feed request; a signed-in
# viewer additionally has it persisted server-side (pixora_reel_interests) so it
# follows them across devices. A reel's "type" is the set of topic tokens implied by
# its category/tags, the hashtags in its caption, and the studio's specialties.
# Ranking blends interest affinity with freshness and engagement, so a brand-new
# viewer still gets a sensible trending-style feed and it sharpens as they watch —
# exactly the Instagram behaviour ("watch candid → get more candid").
#
# These functions are deliberately pure (no db, no I/O) so the algorithm can be
# unit-tested directly; the router wraps them with the studio/interest lookups.
_HASHTAG_RE = re.compile(r"#(\w{2,30})")
REEL_RANK_W = {"affinity": 6.0, "engagement": 1.0, "recency": 3.0}
INTEREST_MAX = 20.0     # cap any one topic so a binge can't dominate the feed forever
INTEREST_BUMP = 1.0     # weight added to a topic when the viewer engages with it


def norm_topic(s: Any) -> str:
    """Fold a label/hashtag/service to a comparable token: lowercase, alphanumerics
    only, capped. 'Pre-Wedding' and '#preWedding' both become 'prewedding'."""
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())[:30]


def clean_interests(raw: Any) -> Dict[str, float]:
    """Sanitise a client-supplied interest vector — never trust the browser blindly.
    Bounds the shape (≤200 topics), normalises keys, drops non-positive/NaN weights,
    and caps each weight at INTEREST_MAX."""
    out: Dict[str, float] = {}
    if isinstance(raw, dict):
        for k, v in list(raw.items())[:200]:
            t = norm_topic(k)
            try:
                w = float(v)
            except (TypeError, ValueError):
                continue
            if t and w > 0 and w == w:   # w==w rejects NaN
                out[t] = min(w, INTEREST_MAX)
    return out


def merge_interests(a: Dict[str, float], b: Dict[str, float]) -> Dict[str, float]:
    """Sum two vectors, capping each topic at INTEREST_MAX (server-stored + client)."""
    out = dict(a or {})
    for k, v in (b or {}).items():
        out[k] = min(INTEREST_MAX, out.get(k, 0.0) + v)
    return out


def reel_topics_from(reel: Dict[str, Any], studio_topics: Any = ()) -> set:
    """The set of topic tokens describing one reel: its own category + tags, the
    hashtags in its caption/body, and the topics implied by the studio. Reels created
    before categories existed still get topics from caption hashtags + studio services,
    so the algorithm works on today's data and improves as reels are tagged."""
    toks = set()
    cat = norm_topic(reel.get("category"))
    if cat:
        toks.add(cat)
    for t in (reel.get("tags") or []):
        n = norm_topic(t)
        if n:
            toks.add(n)
    caption = reel.get("caption") or reel.get("body") or reel.get("title") or ""
    for m in _HASHTAG_RE.findall(str(caption)):
        n = norm_topic(m)
        if n:
            toks.add(n)
    for t in (studio_topics or ()):
        n = norm_topic(t)
        if n:
            toks.add(n)
    return toks


def recency_score(created_at: Any, now: Optional[datetime] = None) -> float:
    """1.0 for a fresh reel, ~0.5 at 3 days old, tailing off — keeps the feed lively
    without burying good older reels entirely."""
    now = now or datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return 0.0
    age_h = max(0.0, (now - dt).total_seconds() / 3600.0)
    return 1.0 / (1.0 + age_h / 72.0)


def score_reel(interests: Dict[str, float], topics: set, engagement: float,
               created_at: Any, now: Optional[datetime] = None) -> float:
    """Final rank of one reel for one viewer. Affinity dominates once the viewer has
    a taste vector; with an empty vector affinity is 0 for every reel, so the feed
    gracefully degrades to freshness + engagement (a trending feed) at cold start."""
    affinity = sum(interests.get(t, 0.0) for t in topics)
    if topics:
        # normalise by √(#topics) so a reel tagged with many topics can't win on
        # breadth alone — it still has to match what the viewer actually likes.
        affinity /= (len(topics) ** 0.5)
    return (REEL_RANK_W["affinity"] * affinity
            + REEL_RANK_W["engagement"] * math.log1p(max(0.0, engagement))
            + REEL_RANK_W["recency"] * recency_score(created_at, now))


def group_active_stories(rows: List[Dict[str, Any]], now_iso: str):
    """Pure: from a NEWEST-first list of story docs, drop expired ones and group by
    studio_id, preserving most-recent-studio-first order (so a studio that just posted
    leads the rail). Stories WITHIN a studio come back oldest-first — the natural order
    to watch them. Returns [(studio_id, [stories…]), …]; the endpoint attaches bylines."""
    groups: Dict[str, List[Dict[str, Any]]] = {}
    order: List[str] = []
    for s in rows:
        if (s.get("expires_at") or "") <= now_iso:
            continue
        sid = s.get("studio_id")
        if not sid:
            continue
        if sid not in groups:
            groups[sid] = []
            order.append(sid)
        groups[sid].append(s)
    return [(sid, list(reversed(groups[sid]))) for sid in order]


# ============================================================================
# Recommendation Foundation (C2–C6) — pure, unit-testable primitives.
# These power Nearby, Hashtags, the For You engine, analytics and marketplace-
# in-feed. They are module-level (not closed over the router) precisely so they
# can be exercised with a FakeDB in tests.run_event_suite without HTTP.
# ============================================================================

# Point weights for every countable interaction (the spec's numbers). One place
# so interest-learning, ranking and analytics can never disagree about what a
# signal is worth. `watch50/watch100/rewatch/profile_visit/marketplace` join the
# older like/comment/save/share/view/follow.
SIGNAL_W: Dict[str, int] = {
    "view": 1, "watch50": 3, "watch100": 5, "rewatch": 8,
    "like": 10, "comment": 15, "save": 20, "share": 25,
    "follow": 30, "marketplace": 10, "profile_visit": 5,
}
# One "like" (weight 10) should move a topic by INTEREST_BUMP (1.0), so the unit
# is BUMP/10 and every other event scales from there. A binge is still clamped to
# INTEREST_MAX by clean_interests/merge_interests.
INTEREST_BUMP_UNIT = INTEREST_BUMP / 10.0

# For You blend — the spec's 40/20/20/10/5/5. Every sub-score is normalised to
# 0..1 before weighting, so the weights mean what they say.
FORYOU_W = {"interest": 0.40, "engagement": 0.20, "recency": 0.20,
            "following": 0.10, "locality": 0.05, "novelty": 0.05}

# Camera/lens brand words worth treating as topics ("shot on sony"). A raw
# "Sony A7 IV" norm_topics to a useless "sonya7iv"; splitting words keeps the
# brand token discoverable while dropping model noise.
_GEAR_STOP = {"mm", "f", "is", "ii", "iii", "iv", "mark", "the", "and"}


def gear_topics(item: Dict[str, Any]) -> set:
    """Brand-ish word tokens from an item's camera/lens strings."""
    toks = set()
    for field in ("camera", "lens"):
        for word in re.split(r"[^a-z0-9]+", str(item.get(field) or "").lower()):
            if len(word) >= 3 and not word.isdigit() and word not in _GEAR_STOP:
                n = norm_topic(word)
                if n:
                    toks.add(n)
    return toks


def content_topics_from(item: Dict[str, Any], studio_topics: Any = ()) -> set:
    """Topics describing ANY item (post or reel): reuses reel_topics_from (category
    + tags + caption/body/title hashtags + studio topics) and adds gear brands. This
    is the universal 'topics' currency every phase speaks."""
    return reel_topics_from(item, studio_topics) | gear_topics(item)


def signal_bump(event: str) -> float:
    """How much a single `event` should raise the matched topics in an interest
    vector. Unknown events count as a weak view."""
    return SIGNAL_W.get(event, SIGNAL_W["view"]) * INTEREST_BUMP_UNIT


def apply_signal_to_interests(vec: Dict[str, float], topics: set, event: str) -> Dict[str, float]:
    """Pure: return a NEW interest vector with `topics` bumped by `event`'s weight,
    each capped at INTEREST_MAX. Empty topics → vec unchanged."""
    out = dict(vec or {})
    bump = signal_bump(event)
    for t in topics:
        n = norm_topic(t)
        if n:
            out[n] = min(INTEREST_MAX, out.get(n, 0.0) + bump)
    return out


def _affinity01(interests: Dict[str, float], topics: set) -> float:
    """Interest match normalised to 0..1 (INTEREST_MAX = full match on one topic)."""
    if not topics or not interests:
        return 0.0
    a = sum(interests.get(norm_topic(t), 0.0) for t in topics) / (len(topics) ** 0.5)
    return max(0.0, min(1.0, a / INTEREST_MAX))


def _engagement01(engagement: float) -> float:
    """Log-scaled engagement → 0..1 (saturates around ~1000 weighted points)."""
    return max(0.0, min(1.0, math.log1p(max(0.0, engagement)) / math.log1p(1000)))


def foryou_score(interests: Dict[str, float], topics: set, engagement: float,
                 created_at: Any, following: bool, same_city: bool,
                 already_engaged: bool, now: Optional[datetime] = None) -> float:
    """The blended For You rank of one item for one viewer (the 40/20/20/10/5/5 mix).
    Cold start (empty interests) → interest term is 0, so the feed gracefully becomes
    engagement+recency (a trending feed) until the viewer builds a taste vector."""
    return (FORYOU_W["interest"] * _affinity01(interests, topics)
            + FORYOU_W["engagement"] * _engagement01(engagement)
            + FORYOU_W["recency"] * recency_score(created_at, now)
            + FORYOU_W["following"] * (1.0 if following else 0.0)
            + FORYOU_W["locality"] * (1.0 if same_city else 0.0)
            + FORYOU_W["novelty"] * (0.0 if already_engaged else 1.0))


def diversify(items: List[Dict[str, Any]], key: str = "studio_id") -> List[Dict[str, Any]]:
    """Pure: reorder a score-sorted list so the same studio never appears twice in a
    row (round-robin). Preserves score order otherwise. Prevents a wall of one creator."""
    remaining = list(items)
    out: List[Dict[str, Any]] = []
    while remaining:
        pick = 0
        if out:
            for i, it in enumerate(remaining):
                if it.get(key) != out[-1].get(key):
                    pick = i
                    break
        out.append(remaining.pop(pick))
    return out


def nearby_match(item_city: str, post_location: str, viewer_city: str) -> bool:
    """True if a post's studio city OR free-text location matches the viewer's city.
    Substring both ways so 'Hyderabad' matches 'Hyderabad, Telangana'."""
    v = norm_topic(viewer_city)
    if not v:
        return False
    for hay in (item_city, post_location):
        h = norm_topic(hay)
        if h and (v in h or h in v):
            return True
    return False


def interleave_marketplace(feed: List[Dict[str, Any]], listings: List[Dict[str, Any]],
                           every: int = 4) -> List[Dict[str, Any]]:
    """Pure: inject labelled marketplace cards into a ranked feed at a fixed cadence
    (positions `every`, 2*every, …). Cards are tagged type='listing' and carry a
    `sponsored`/label field so the client renders them as clearly-marked, never as
    organic posts. Honest by construction — order of organic items is untouched."""
    if not listings:
        return list(feed)
    out: List[Dict[str, Any]] = []
    li = 0
    for i, item in enumerate(feed):
        out.append(item)
        if every > 0 and (i + 1) % every == 0 and li < len(listings):
            card = dict(listings[li])
            card["type"] = "listing"
            li += 1
            out.append(card)
    return out


_MENTION_TYPES = {"person", "studio", "product"}


def clean_mentions(raw: Any) -> List[Dict[str, Any]]:
    """Sanitise post/reel mentions: cap 20, whitelist type, trim label/ref."""
    out: List[Dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for m in raw[:20]:
        if not isinstance(m, dict):
            continue
        t = str(m.get("type") or "").strip().lower()
        if t not in _MENTION_TYPES:
            continue
        label = str(m.get("label") or "").strip()[:80]
        ref = str(m.get("ref") or "").strip()[:64] or None
        if not (label or ref):
            continue
        out.append({"type": t, "label": label, "ref": ref})
    return out


def hashtags_from(item: Dict[str, Any]) -> List[str]:
    """The normalised tag tokens a post/reel contributes to the hashtag index:
    its explicit tags + any #hashtags in its text. Deduped, capped."""
    toks: List[str] = []
    for t in (item.get("tags") or []):
        n = norm_topic(t)
        if n and n not in toks:
            toks.append(n)
    text = " ".join(str(item.get(k) or "") for k in ("caption", "body", "title"))
    for m in _HASHTAG_RE.findall(text):
        n = norm_topic(m)
        if n and n not in toks:
            toks.append(n)
    return toks[:20]


# Reputation weights — score is computed from real activity, never hand-set.
REP = {"post": 5, "like_received": 2, "comment_made": 1, "challenge_win": 50, "achievement": 10}

# Reputation → tier ladder (display only).
TIERS = [(0, "Newcomer"), (100, "Rising"), (300, "Pro"), (750, "Master"), (2000, "Luminary")]

# Achievement catalog. `check(stats)` decides if unlocked; auto-awarded on read.
ACHIEVEMENTS: List[Dict[str, Any]] = [
    {"key": "first_post",   "label": "First Frame",     "icon": "camera",  "desc": "Shared your first post",         "need": lambda s: s["posts"] >= 1},
    {"key": "ten_posts",    "label": "Prolific",        "icon": "layers",  "desc": "Shared 10 posts",                "need": lambda s: s["posts"] >= 10},
    {"key": "hundred_likes","label": "Crowd Favourite", "icon": "heart",   "desc": "Earned 100 likes",               "need": lambda s: s["likes_received"] >= 100},
    {"key": "helpful",      "label": "Mentor Spirit",   "icon": "message", "desc": "Left 25 comments",               "need": lambda s: s["comments_made"] >= 25},
    {"key": "challenger",   "label": "Challenger",      "icon": "trophy",  "desc": "Entered a monthly challenge",    "need": lambda s: s["submissions"] >= 1},
    {"key": "champion",     "label": "Champion",        "icon": "crown",   "desc": "Won a monthly challenge",        "need": lambda s: s["challenge_wins"] >= 1},
]


# Learning center — seeded courses/articles. `cert` marks courses that grant a
# certification badge on completion.
LEARNING_CONTENT: List[Dict[str, Any]] = [
    {"id": "lc_lighting", "title": "Mastering Natural Light", "kind": "course", "level": "Beginner",
     "minutes": 45, "cert": True, "summary": "Read, shape and chase light for portraits and ceremonies."},
    {"id": "lc_posing", "title": "Candid Posing for Couples", "kind": "course", "level": "Intermediate",
     "minutes": 60, "cert": True, "summary": "Direct without stiffness — prompts that get real emotion."},
    {"id": "lc_editing", "title": "A Consistent Editing Style", "kind": "course", "level": "Intermediate",
     "minutes": 50, "cert": True, "summary": "Build a signature look and a repeatable Lightroom workflow."},
    {"id": "lc_business", "title": "Pricing Your Wedding Packages", "kind": "article", "level": "All",
     "minutes": 15, "cert": False, "summary": "Package tiers, deposits and contracts that protect you."},
    {"id": "lc_drone", "title": "Drone Coverage Basics", "kind": "course", "level": "Beginner",
     "minutes": 40, "cert": True, "summary": "Safe, cinematic aerial shots for venues and baraats."},
]

# Member benefits/perks — seeded, informational.
BENEFITS: List[Dict[str, Any]] = [
    {"title": "Priority directory placement", "desc": "Premium members rank higher in the photographer directory.", "tier": "Premium"},
    {"title": "Featured on the community feed", "desc": "Showcase posts get boosted to more studios.", "tier": "Premium"},
    {"title": "Marketplace 0% fee", "desc": "Sell presets & templates with no platform cut.", "tier": "Premium"},
    {"title": "Certification badges", "desc": "Complete courses to earn verifiable badges on your profile.", "tier": "All"},
    {"title": "Monthly challenges & awards", "desc": "Win recognition and reputation across the community.", "tier": "All"},
    {"title": "Mentor access", "desc": "Book time with experienced studios.", "tier": "All"},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _payments_configured() -> bool:
    """True only when real Razorpay keys are set (not the committed placeholders).
    Phase 6 marketplace is integration-ready: paid checkout activates the moment
    keys are configured; until then paid buys return a 'pending configuration' notice."""
    import os
    kid = os.environ.get("RAZORPAY_KEY_ID", "")
    ksec = os.environ.get("RAZORPAY_KEY_SECRET", "")
    return bool(kid and ksec and "PLACEHOLDER" not in kid and "PLACEHOLDER" not in ksec)


def _tier(score: int) -> str:
    label = TIERS[0][1]
    for threshold, name in TIERS:
        if score >= threshold:
            label = name
    return label


class PostIn(BaseModel):
    kind: str = "showcase"         # showcase | reel | tip | …  ("reel" drives the Reels tab)
    title: str = ""
    body: str = ""
    image_url: Optional[str] = None
    video_url: Optional[str] = None   # reels: the clip (image_url doubles as its poster)
    tags: List[str] = Field(default_factory=list)   # #candid #hyderabad — discovery
    size_bytes: int = 0            # bytes of the attached media (0 for text posts)
    # Phase 2 — the Create Post fields from the spec. `category` and `location`
    # are what Discover filters on, so they must exist before Discover can.
    category: Optional[str] = None    # one of POST_CATEGORIES
    location: Optional[str] = None    # free text: "Hyderabad", "Goa"
    camera: Optional[str] = None      # "Sony A7 IV"
    lens: Optional[str] = None        # "85mm f/1.4"
    # Phase 9 - carousel. `multi_image_post` was already sold as a Basic-tier
    # capability while the model could only hold one image_url, so the plan
    # promised something the schema could not store. image_url stays the cover.
    images: List[str] = Field(default_factory=list)
    # C4 — tag people / other studios / a marketplace product in a post. Each:
    # {type: person|studio|product, ref?, label}. `ref` for studio = studio_id,
    # for product = listing id; person is a free label. Discovery + attribution.
    mentions: List[Dict[str, Any]] = Field(default_factory=list)


class CommentIn(BaseModel):
    body: str = Field(min_length=1)


class SubmissionIn(BaseModel):
    challenge_id: str
    image_url: Optional[str] = None
    caption: str = ""


class GigIn(BaseModel):
    title: str = Field(min_length=1)
    location: str = ""
    budget_inr: int = 0
    description: str = ""


class CritiqueIn(BaseModel):
    body: str = Field(min_length=1)
    composition: int = 0   # 0-5 per-aspect scores (0 = not rated)
    lighting: int = 0
    editing: int = 0


class MentorIn(BaseModel):
    expertise: str = ""
    bio: str = ""
    rate_inr: int = 0      # 0 = free / pro-bono


class MentorRequestIn(BaseModel):
    mentor_id: str
    message: str = ""


class TeamMemberIn(BaseModel):
    name: str = Field(min_length=1)
    role: str = ""
    photo_url: Optional[str] = None
    instagram: Optional[str] = None


class ListingIn(BaseModel):
    title: str = Field(min_length=1)
    kind: str = "preset"   # preset | template | overlay | guide
    price_inr: int = 0
    description: str = ""
    file_url: Optional[str] = None
    preview_url: Optional[str] = None
    # size_bytes is NOT accepted from the client - it is read server-side from
    # the upload registry (see create_listing).


class EventIn(BaseModel):
    title: str = Field(min_length=1)
    kind: str = "workshop"  # workshop | meetup | webinar | contest
    date: Optional[str] = None
    location: str = ""
    description: str = ""
    # Batch 6 — global events
    country: str = ""
    region: str = ""            # e.g. South Asia, Europe, Middle East
    city: str = ""
    timezone: str = ""          # IANA tz, e.g. Asia/Kolkata
    is_virtual: bool = False
    join_url: str = ""
    cover_url: str = ""
    capacity: int = 0
    fee_amount: float = 0
    fee_currency: str = "INR"


class VideoTestimonialIn(BaseModel):
    client_name: str = ""
    video_url: str = Field(min_length=1)
    event_type: str = ""


class AwardNominationIn(BaseModel):
    award_id: str
    nominee_studio_id: str
    reason: str = ""


class QuoteLineIn(BaseModel):
    label: str
    amount_inr: int = 0


class QuoteIn(BaseModel):
    client_name: str = ""
    event: str = ""
    lines: List[QuoteLineIn] = Field(default_factory=list)
    gst: bool = True


async def seed_pixora(db) -> None:
    """Idempotent — ensure an active monthly challenge + award season exist."""
    active = await db.pixora_challenges.find_one({"is_active": True}, {"_id": 0})
    if not active:
        month = _now()[:7]
        await db.pixora_challenges.insert_one({
            "id": f"chl_{uuid.uuid4().hex[:12]}", "month": month,
            "title": "Golden Hour", "prompt": "Your best portrait shot in natural golden-hour light.",
            "is_active": True, "created_at": _now(),
        })
        logger.info("[pixora] seeded default challenge")
    award = await db.pixora_awards.find_one({"is_active": True}, {"_id": 0})
    if not award:
        await db.pixora_awards.insert_one({
            "id": f"awd_{uuid.uuid4().hex[:12]}", "season": _now()[:7],
            "title": "Studio of the Month", "desc": "Community-nominated & voted studio of the month.",
            "is_active": True, "created_at": _now(),
        })
        logger.info("[pixora] seeded default award")


# Stage 3 — verification levels (admin assigns on approval).
VERIFICATION_LEVELS = {
    1: "Verified Photographer",
    2: "Verified Studio",
    3: "Premium Studio",
    4: "Elite Pixora Professional",
}


# Phase 7 — multi-currency (rates are "1 INR = X <ccy>"; admin-editable).
SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"]
DEFAULT_RATES = {"INR": 1.0, "USD": 0.012, "EUR": 0.011, "GBP": 0.0095, "AED": 0.044}
CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "AED "}
# Phase 7 — push notification categories (user-toggleable prefs).
NOTIF_TYPES = ["like", "comment", "follow", "event_rsvp", "achievement", "connection",
               "verification", "gig_application", "moderation",
               "campaign_application", "campaign_decision", "campaign_deliverable",
               "deliverable_review", "campaign_payment", "brand_verified"]

# Stage 5 — CRM.
CRM_STATUSES = ["lead", "contacted", "quoted", "booked", "shooting", "delivered", "completed", "lost"]
CRM_STAGES = ["inquiry", "meeting", "quotation", "booking", "shoot", "delivery", "review", "repeat"]


class CrmClientIn(BaseModel):
    name: str = Field(min_length=1)
    phone: str = ""
    email: str = ""
    event_type: str = ""
    event_date: str = ""
    status: str = "lead"
    budget_inr: int = 0
    payment_status: str = "unpaid"     # unpaid | advance | partial | paid
    contract_status: str = "none"      # none | sent | signed
    notes: str = ""
    follow_up_date: str = ""


class CrmTimelineIn(BaseModel):
    stage: str
    note: str = ""


class VerificationIn(BaseModel):
    requested_level: int = 1
    gov_id_url: Optional[str] = None
    business_proof_url: Optional[str] = None
    website: str = ""
    instagram: str = ""
    portfolio_link: str = ""
    phone: str = ""
    email: str = ""
    note: str = ""


def build_pixora_router(db, require_admin, require_super_admin=None) -> APIRouter:
    router = APIRouter(tags=["pixora"])

    # ---- who is acting: photographer OR signed-in couple ---------------------
    # Like/comment used to be Depends(require_admin), i.e. photographers only —
    # even though community_gating marks both FREE for everyone. A signed-in
    # couple structurally could not interact, so the public buttons had nothing
    # to call. This resolves EITHER identity from one request.
    async def _resolve_actor(request: Request) -> Optional[Dict[str, Any]]:
        """Returns {id, name, type} for a photographer or a normal user, else None."""
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            tok = auth.split(" ", 1)[1].strip()
            try:
                from auth import decode_access_token
                claims = decode_access_token(tok) or {}
                aid = claims.get("admin_id") or claims.get("sub")
                if aid and claims.get("type") not in ("client", "user"):
                    # The legacy admin JWT carries `sub = admins.id`. Look up BOTH
                    # keys: some records are keyed `id`, others `admin_id`.
                    doc = await db.admins.find_one({"id": aid}, {"_id": 0}) \
                        or await db.admins.find_one({"admin_id": aid}, {"_id": 0})
                    if doc:
                        return {"id": aid, "name": await _studio_name(aid), "type": "studio"}
            except Exception:
                pass  # not an admin JWT — fall through to the user session
        # Normal user: httpOnly cookie (or the same token as a bearer)
        token = request.cookies.get("user_session_token")
        if not token and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
        if not token:
            return None
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if not session:
            return None
        user = await db.users.find_one({"user_id": session.get("user_id")}, {"_id": 0})
        if not user or (user.get("status") or "active").lower() in ("blocked", "suspended"):
            return None
        return {"id": user["user_id"],
                "name": user.get("name") or user.get("email") or "Guest",
                "type": "user"}

    async def require_actor(request: Request) -> Dict[str, Any]:
        actor = await _resolve_actor(request)
        if not actor:
            raise HTTPException(401, "Sign in to continue")
        return actor

    async def _actor_name(aid: str) -> str:
        """Display name for a like/comment author — studio first, then user."""
        doc = await db.admins.find_one({"admin_id": aid}, {"_id": 0})
        if doc:
            return doc.get("studio_name") or doc.get("name") or "Studio"
        u = await db.users.find_one({"user_id": aid}, {"_id": 0})
        return (u or {}).get("name") or "Guest"

    async def _find_likeable(post_id: str):
        """Posts and Reels-tab reels are separate collections but share the feed,
        so an interaction has to look in both. Returns (doc, collection)."""
        doc = await db.pixora_posts.find_one({"id": post_id}, {"_id": 0})
        if doc:
            return doc, db.pixora_posts
        doc = await db.pixora_reels.find_one({"id": post_id}, {"_id": 0})
        if doc:
            return doc, db.pixora_reels
        return None, None

    async def _studio_name(sid: str) -> str:
        doc = await db.admins.find_one({"admin_id": sid}, {"_id": 0}) or await db.admins.find_one({"id": sid}, {"_id": 0})
        return (doc or {}).get("studio_name") or (doc or {}).get("name") or "Studio"

    async def _author_card(sid: str) -> Dict[str, Any]:
        """The byline every public post carries: who posted, their photo, and where
        their profile lives — so a visitor can always go from a post to the
        photographer (Instagram's core loop). Falls back to the admin record when a
        portfolio hasn't been built yet, so a post is never anonymous."""
        prof = await db.portfolio_profiles.find_one({"admin_id": sid}, {"_id": 0}) \
            or await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        loc = prof.get("location") or {}
        slug = prof.get("slug") or prof.get("id") or sid
        return {
            "studio_id": sid,
            "name": prof.get("studio_name") or await _studio_name(sid),
            "avatar": prof.get("avatar") or prof.get("hero_image") or None,
            "city": loc.get("city") or "",
            "slug": slug,
            "profile_url": f"/p/{slug}",
        }

    # ---- P1: admin audit log (every super-admin action is recorded) --------
    async def _audit(actor: str, action: str, target_type: Optional[str] = None,
                     target_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> None:
        try:
            await db.admin_action_log.insert_one({
                "id": f"log_{uuid.uuid4().hex[:12]}", "actor": actor or "super-admin",
                "action": action, "target_type": target_type, "target_id": target_id,
                "meta": meta or {}, "created_at": _now()})
        except Exception:
            logger.warning("[pixora] audit log failed", exc_info=True)

    # ---- P1: content moderation helpers -----------------------------------
    # Maps a report/moderation target type → its collection (for preview/delete).
    _MOD_COLLECTIONS = {
        "post": "pixora_posts", "comment": "pixora_comments", "gig": "pixora_gigs",
        "event": "pixora_events", "submission": "pixora_submissions",
    }

    async def _mod_doc(target_type: str, target_id: str):
        coll = _MOD_COLLECTIONS.get(target_type)
        if not coll:
            return None
        return await getattr(db, coll).find_one({"id": target_id}, {"_id": 0})

    async def _mod_preview(target_type: str, target_id: str) -> str:
        if target_type == "member":
            return await _studio_name(target_id)
        d = await _mod_doc(target_type, target_id)
        if not d:
            return "(deleted)"
        return (d.get("title") or d.get("body") or d.get("caption")
                or d.get("description") or "(no text)")[:160]

    async def _mod_owner(target_type: str, target_id: str) -> Optional[str]:
        if target_type == "member":
            return target_id
        d = await _mod_doc(target_type, target_id)
        return (d or {}).get("studio_id")

    async def _mod_delete(target_type: str, target_id: str) -> bool:
        coll = _MOD_COLLECTIONS.get(target_type)
        if not coll:
            return False
        await getattr(db, coll).delete_one({"id": target_id})
        if target_type == "post":  # cascade a post's comments + critiques
            await db.pixora_comments.delete_many({"post_id": target_id})
            await db.pixora_critiques.delete_many({"post_id": target_id})
        return True

    async def _verification_of(sid: str) -> Dict[str, Any]:
        """A studio's current verification: approved level (0 if none) + status of
        any pending application. Used to render badges + gate the apply form."""
        v = await db.pixora_verifications.find_one({"studio_id": sid}, {"_id": 0})
        level = int((v or {}).get("level") or 0) if (v or {}).get("status") == "approved" else 0
        return {
            "status": (v or {}).get("status"),          # None | pending | approved | rejected
            "level": level,
            "level_label": VERIFICATION_LEVELS.get(level),
            "verified": level > 0,
        }

    # ---- Stage 2: in-app notifications ------------------------------------
    async def _notify(recipient: str, ntype: str, text: str,
                      actor: Optional[str] = None, entity_id: Optional[str] = None,
                      link: Optional[str] = None) -> None:
        """Create an in-app notification. No-op if the actor is the recipient
        (you never get notified about your own action). Best-effort — a
        notification failure must never break the underlying action."""
        try:
            if recipient and actor and recipient == actor:
                return
            if not recipient:
                return
            await db.pixora_notifications.insert_one({
                "id": f"ntf_{uuid.uuid4().hex[:12]}", "recipient": recipient,
                "type": ntype, "text": text, "actor": actor,
                "actor_name": (await _studio_name(actor)) if actor else None,
                "entity_id": entity_id, "link": link,
                "read": False, "created_at": _now(),
            })
            await _send_push(recipient, ntype, text)   # best-effort push fan-out
        except Exception:
            logger.warning("[pixora] notify failed", exc_info=True)

    # ---- Phase 7: push provider abstraction (FCM/APNs-ready stub) ----------
    async def _send_push(recipient: str, ntype: str, body: str) -> None:
        """Provider-agnostic push. Respects the user's notification prefs, looks
        up their device tokens, and dispatches. Real delivery activates once
        FCM_SERVER_KEY / APNs creds are configured (see external checklist);
        until then it records intent so nothing is lost."""
        try:
            prefs_doc = await db.notification_prefs.find_one({"studio_id": recipient}, {"_id": 0})
            prefs = (prefs_doc or {}).get("prefs") or {}
            if prefs.get(ntype) is False:      # user disabled this category
                return
            tokens = await db.push_tokens.find({"studio_id": recipient}, {"_id": 0}).to_list(20)
            if not tokens:
                return
            import os as _os
            fcm = _os.getenv("FCM_SERVER_KEY")
            for t in tokens:
                if fcm:
                    # TODO(final step): POST to FCM/APNs using t['token'] + fcm key.
                    logger.info("[push] deliver -> %s (%s)", recipient, t.get("platform"))
                else:
                    await db.push_outbox.insert_one({
                        "id": f"po_{uuid.uuid4().hex[:10]}", "recipient": recipient,
                        "token": t.get("token"), "platform": t.get("platform"),
                        "type": ntype, "body": body, "status": "pending", "created_at": _now()})
        except Exception:
            logger.warning("[pixora] push failed", exc_info=True)

    async def _stats(sid: str) -> Dict[str, int]:
        posts = await db.pixora_posts.find({"studio_id": sid}, {"_id": 0}).to_list(100000)
        likes_received = sum(len(p.get("likes", [])) for p in posts)
        comments_made = await db.pixora_comments.count_documents({"studio_id": sid})
        submissions = await db.pixora_submissions.count_documents({"studio_id": sid})
        subs = await db.pixora_submissions.find({"studio_id": sid, "won": True}, {"_id": 0}).to_list(1000)
        return {
            "posts": len(posts), "likes_received": likes_received,
            "comments_made": comments_made, "submissions": submissions,
            "challenge_wins": len(subs),
        }

    async def _sync_achievements(sid: str, stats: Dict[str, int]) -> List[Dict[str, Any]]:
        owned = {a["key"] for a in await db.pixora_achievements.find({"studio_id": sid}, {"_id": 0}).to_list(100)}
        unlocked = []
        for a in ACHIEVEMENTS:
            has = a["key"] in owned
            if not has and a["need"](stats):
                await db.pixora_achievements.insert_one({
                    "id": f"ach_{uuid.uuid4().hex[:12]}", "studio_id": sid,
                    "key": a["key"], "awarded_at": _now()})
                has = True
                await _notify(sid, "achievement", f"You earned the “{a['label']}” achievement!",
                              actor=None, entity_id=a["key"])
            unlocked.append({"key": a["key"], "label": a["label"], "icon": a["icon"],
                             "desc": a["desc"], "unlocked": has})
        return unlocked

    def _reputation(stats: Dict[str, int], n_achievements: int) -> int:
        return (stats["posts"] * REP["post"]
                + stats["likes_received"] * REP["like_received"]
                + stats["comments_made"] * REP["comment_made"]
                + stats["challenge_wins"] * REP["challenge_win"]
                + n_achievements * REP["achievement"])

    # ---- my community profile (reputation + achievements) -----------------
    # ---- P2: Community Score (owner spec formula) -------------------------
    #   Profile completion = 20 · Portfolio published = 50 · each post = 5 ·
    #   each follower = 1 · each daily check-in = 1.
    async def _community_score(sid: str) -> Dict[str, Any]:
        prof = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        loc = prof.get("location") or {}
        checks = [prof.get("studio_name"), prof.get("tagline"), prof.get("about"),
                  loc.get("city") or loc.get("state"), (prof.get("services") or []),
                  prof.get("hero_image") or prof.get("avatar")]
        filled = sum(1 for c in checks if c)
        profile_pts = round(20 * filled / len(checks))
        published_pts = 50 if prof.get("is_published") else 0
        posts = await db.pixora_posts.count_documents({"studio_id": sid})
        followers = await db.pixora_follows.count_documents({"followee": sid})
        checkins = await db.pixora_checkins.count_documents({"studio_id": sid})
        breakdown = {"profile_completion": profile_pts, "portfolio_published": published_pts,
                     "posts": posts * 5, "followers": followers * 1, "daily_logins": checkins * 1}
        return {"score": sum(breakdown.values()), "breakdown": breakdown}

    @router.get("/api/pixora/me")
    async def me(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        stats = await _stats(sid)
        achievements = await _sync_achievements(sid, stats)
        n = sum(1 for a in achievements if a["unlocked"])
        score = _reputation(stats, n)
        return {"studio_id": sid, "name": await _studio_name(sid), "stats": stats,
                "reputation": score, "tier": _tier(score), "achievements": achievements,
                "verification": await _verification_of(sid),
                "community_score": await _community_score(sid)}

    # ---- Phase 2: plan capabilities (what this studio can do) --------------
    # The frontend reads this to show lock badges + "Upgrade" prompts on gated
    # actions. Grandfathered/existing studios report every capability True, so
    # their UI never changes. See community_gating.py.
    @router.get("/api/pixora/post-meta")
    async def post_meta():
        """Vocabulary for the composer + Discover filters, served from the one
        place it is defined so the two can never drift apart."""
        return {"kinds": sorted(POST_KINDS), "categories": sorted(POST_CATEGORIES)}

    @router.get("/api/pixora/capabilities")
    async def my_capabilities(admin: dict = Depends(require_admin)):
        return await capability_state(db, admin["admin_id"])

    @router.get("/api/public/community/capabilities")
    async def public_capabilities():
        """What a portfolio plan unlocks in the community, for a signed-out buyer.

        The gating exists and works, but the only way to see it was to already
        own a plan (/api/pixora/capabilities needs auth), so the pricing page
        could not tell anyone what they were buying. Returns no studio data —
        just the tier matrix, with the admin's Pricing Hub overrides applied so
        the page never promises something the server would refuse.
        """
        from community_gating import public_capability_matrix
        return await public_capability_matrix(db)

    @router.post("/api/pixora/checkin")
    async def daily_checkin(admin: dict = Depends(require_admin)):
        """Awards the once-a-day community-score point and snapshots the score
        into history (idempotent per calendar day)."""
        sid = admin["admin_id"]
        day = _now()[:10]
        existing = await db.pixora_checkins.find_one({"studio_id": sid, "day": day}, {"_id": 0})
        if not existing:
            await db.pixora_checkins.insert_one({
                "id": f"chk_{uuid.uuid4().hex[:10]}", "studio_id": sid, "day": day, "created_at": _now()})
            cs = await _community_score(sid)
            await db.pixora_score_history.insert_one({
                "id": f"sh_{uuid.uuid4().hex[:10]}", "studio_id": sid, "day": day,
                "score": cs["score"], "created_at": _now()})
            return {"checked_in": True, "community_score": cs}
        return {"checked_in": False, "community_score": await _community_score(sid)}

    @router.get("/api/pixora/score-history")
    async def score_history(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.pixora_score_history.find({"studio_id": sid}, {"_id": 0}).sort("day", 1).to_list(365)
        return {"history": rows, "current": await _community_score(sid)}

    # ---- Phase 8: Wedding Budget Planner ----------------------------------
    class _BudgetItemIn(BaseModel):
        event_name: str = ""
        category: str = ""
        allocated_inr: int = 0
        spent_inr: int = 0
        note: str = ""

    @router.get("/api/pixora/budget")
    async def get_budget(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        items = await db.pixora_budget_items.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        ta = sum(int(i.get("allocated_inr") or 0) for i in items)
        ts = sum(int(i.get("spent_inr") or 0) for i in items)
        return {"items": items, "summary": {"allocated": ta, "spent": ts, "remaining": ta - ts}}

    @router.post("/api/pixora/budget/items")
    async def add_budget_item(payload: _BudgetItemIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        doc = {"id": f"bud_{uuid.uuid4().hex[:12]}", "studio_id": sid,
               "event_name": (payload.event_name or "").strip()[:80], "category": (payload.category or "").strip()[:60],
               "allocated_inr": max(0, int(payload.allocated_inr or 0)), "spent_inr": max(0, int(payload.spent_inr or 0)),
               "note": (payload.note or "").strip()[:200], "created_at": _now()}
        await db.pixora_budget_items.insert_one(doc)
        return {"item": {k: v for k, v in doc.items() if k != "_id"}}

    @router.put("/api/pixora/budget/items/{item_id}")
    async def update_budget_item(item_id: str, payload: _BudgetItemIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.pixora_budget_items.update_one({"id": item_id, "studio_id": sid}, {"$set": {
            "event_name": payload.event_name, "category": payload.category,
            "allocated_inr": max(0, int(payload.allocated_inr or 0)), "spent_inr": max(0, int(payload.spent_inr or 0)),
            "note": payload.note, "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/pixora/budget/items/{item_id}")
    async def delete_budget_item(item_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.pixora_budget_items.delete_one({"id": item_id, "studio_id": sid})
        return {"deleted": True}

    # ---- Phase 7: Creator Revenue Center (tracking/rollup only) -----------
    @router.get("/api/pixora/revenue")
    async def revenue_center(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        fin = await db.pixora_finance_entries.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        income = sum(int(f.get("amount_inr") or 0) for f in fin if f.get("kind") == "income")
        expense = sum(int(f.get("amount_inr") or 0) for f in fin if f.get("kind") == "expense")
        clients = await db.pixora_crm_clients.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        booked = sum(int(c.get("budget_inr") or 0) for c in clients if c.get("status") in ("booked", "shooting", "delivered"))
        completed = sum(int(c.get("budget_inr") or 0) for c in clients if c.get("status") == "completed")
        packages = await db.pixora_packages.count_documents({"studio_id": sid})
        return {"income": income, "expense": expense, "profit": income - expense,
                "booked_pipeline": booked, "completed_revenue": completed, "packages": packages,
                "sources": [
                    {"label": "Tracked income", "value": income},
                    {"label": "Completed bookings", "value": completed},
                    {"label": "Booked pipeline", "value": booked},
                ]}

    # ---- Phase 8: Wedding Package Marketplace -----------------------------
    class _PackageIn(BaseModel):
        name: str = Field(min_length=1)
        tier: str = "starter"      # starter | premium | luxury | custom
        price_inr: int = 0
        includes: List[str] = Field(default_factory=list)
        description: str = ""

    @router.get("/api/pixora/packages")
    async def my_packages(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.pixora_packages.find({"studio_id": sid}, {"_id": 0}).sort("price_inr", 1).to_list(200)
        return {"packages": rows}

    @router.post("/api/pixora/packages")
    async def create_package(payload: _PackageIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        tier = payload.tier if payload.tier in ("starter", "premium", "luxury", "custom") else "starter"
        doc = {"id": f"pkg_{uuid.uuid4().hex[:12]}", "studio_id": sid, "name": payload.name.strip()[:80],
               "tier": tier, "price_inr": max(0, int(payload.price_inr or 0)),
               "includes": [str(x).strip()[:80] for x in (payload.includes or [])][:20],
               "description": (payload.description or "").strip()[:400], "created_at": _now()}
        await db.pixora_packages.insert_one(doc)
        return {"package": {k: v for k, v in doc.items() if k != "_id"}}

    @router.delete("/api/pixora/packages/{package_id}")
    async def delete_package(package_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.pixora_packages.delete_one({"id": package_id, "studio_id": sid})
        return {"deleted": True}

    @router.get("/api/public/pixora/packages/{studio_id}")
    async def public_packages(studio_id: str):
        rows = await db.pixora_packages.find({"studio_id": studio_id}, {"_id": 0}).sort("price_inr", 1).to_list(200)
        return {"packages": rows}

    # ---- Stage 6: Regional Community Chapters -----------------------------
    PIXORA_CHAPTERS = ["Hyderabad", "Vijayawada", "Visakhapatnam", "Bangalore", "Chennai",
                       "Mumbai", "Delhi", "Pune", "Kolkata", "Kochi"]

    @router.get("/api/pixora/chapters")
    async def list_chapters(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        mine = {m["chapter"] for m in await db.pixora_chapter_members.find({"studio_id": me}, {"_id": 0}).to_list(100)}
        out = []
        for ch in PIXORA_CHAPTERS:
            out.append({"chapter": ch,
                        "members": await db.pixora_chapter_members.count_documents({"chapter": ch}),
                        "joined": ch in mine})
        return {"chapters": out}

    @router.post("/api/pixora/chapters/{chapter}/join")
    async def toggle_chapter(chapter: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        if chapter not in PIXORA_CHAPTERS:
            raise HTTPException(400, "Unknown chapter")
        existing = await db.pixora_chapter_members.find_one({"chapter": chapter, "studio_id": me}, {"_id": 0})
        if existing:
            await db.pixora_chapter_members.delete_one({"chapter": chapter, "studio_id": me})
            return {"joined": False}
        await db.pixora_chapter_members.insert_one({
            "id": f"cm_{uuid.uuid4().hex[:10]}", "chapter": chapter, "studio_id": me, "joined_at": _now()})
        return {"joined": True}

    # ---- Stage 3: Business Tools — expense & revenue tracker --------------
    class _FinanceIn(BaseModel):
        kind: str = "income"      # income | expense
        category: str = ""
        amount_inr: int = 0
        note: str = ""
        date: str = ""

    @router.post("/api/pixora/finance")
    async def add_finance(payload: _FinanceIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        kind = "expense" if payload.kind == "expense" else "income"
        doc = {"id": f"fin_{uuid.uuid4().hex[:12]}", "studio_id": sid, "kind": kind,
               "category": (payload.category or "").strip()[:60], "amount_inr": max(0, int(payload.amount_inr or 0)),
               "note": (payload.note or "").strip()[:200], "date": (payload.date or _now()[:10]),
               "created_at": _now()}
        await db.pixora_finance_entries.insert_one(doc)
        return {"entry": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/finance")
    async def list_finance(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.pixora_finance_entries.find({"studio_id": sid}, {"_id": 0}).sort("date", -1).to_list(5000)
        income = sum(r["amount_inr"] for r in rows if r["kind"] == "income")
        expense = sum(r["amount_inr"] for r in rows if r["kind"] == "expense")
        by_month: Dict[str, Dict[str, int]] = {}
        for r in rows:
            m = (r.get("date") or "")[:7]
            by_month.setdefault(m, {"income": 0, "expense": 0})
            by_month[m][r["kind"]] += r["amount_inr"]
        return {"entries": rows, "summary": {"income": income, "expense": expense, "profit": income - expense},
                "by_month": [{"month": k, **v, "profit": v["income"] - v["expense"]} for k, v in sorted(by_month.items())]}

    @router.delete("/api/pixora/finance/{entry_id}")
    async def delete_finance(entry_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.pixora_finance_entries.delete_one({"id": entry_id, "studio_id": sid})
        return {"deleted": True}

    # ---- Stage 3/5: Networking Hub — connection requests ------------------
    CONNECTION_TYPES = {"connect", "collaborate", "partnership", "project"}

    class _ConnRequestIn(BaseModel):
        recipient: str
        type: str = "connect"
        message: str = ""

    class _ConnRespondIn(BaseModel):
        action: str          # accept | decline

    @router.post("/api/pixora/connections/request")
    async def request_connection(payload: _ConnRequestIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        if payload.recipient == me:
            raise HTTPException(400, "You can't connect with yourself")
        ctype = payload.type if payload.type in CONNECTION_TYPES else "connect"
        # dedupe: a pending request either direction blocks a new one
        dup = await db.pixora_connections.find_one({"status": "pending", "$or": [
            {"requester": me, "recipient": payload.recipient},
            {"requester": payload.recipient, "recipient": me}]}, {"_id": 0})
        if dup:
            return {"requested": True, "already": True}
        doc = {"id": f"con_{uuid.uuid4().hex[:12]}", "requester": me, "recipient": payload.recipient,
               "type": ctype, "message": payload.message, "status": "pending", "created_at": _now()}
        await db.pixora_connections.insert_one(doc)
        await _notify(payload.recipient, "connection",
                      f"{await _studio_name(me)} sent you a {ctype} request.", actor=me, entity_id=doc["id"])
        return {"requested": True}

    @router.get("/api/pixora/connections")
    async def my_connections(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        rows = await db.pixora_connections.find({"$or": [{"requester": me}, {"recipient": me}]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        incoming, outgoing, accepted = [], [], []
        for r in rows:
            other = r["requester"] if r["recipient"] == me else r["recipient"]
            r["other_id"] = other
            r["other_name"] = await _studio_name(other)
            if r["status"] == "pending" and r["recipient"] == me:
                incoming.append(r)
            elif r["status"] == "pending":
                outgoing.append(r)
            elif r["status"] == "accepted":
                accepted.append(r)
        return {"incoming": incoming, "outgoing": outgoing, "accepted": accepted}

    @router.post("/api/pixora/connections/{cid}/respond")
    async def respond_connection(cid: str, payload: _ConnRespondIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        c = await db.pixora_connections.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Request not found")
        if c["recipient"] != me:
            raise HTTPException(403, "Not your request to answer")
        status = "accepted" if payload.action == "accept" else "declined"
        await db.pixora_connections.update_one({"id": cid}, {"$set": {"status": status, "responded_at": _now()}})
        if status == "accepted":
            await _notify(c["requester"], "connection",
                          f"{await _studio_name(me)} accepted your {c.get('type')} request.", actor=me, entity_id=cid)
        return {"status": status}

    # ---- Phase 7/8: Analytics & event-tracking infrastructure -------------
    # Generic event sink. Public (view/click tracking needs no auth). Stored in
    # analytics_events; aggregated in Python (pg_adapter is equality-oriented).
    class _TrackIn(BaseModel):
        type: str = "view"                 # portfolio_view | profile_view | post_view | click | ...
        target_type: str = ""
        target_id: str = ""
        meta: Dict[str, Any] = Field(default_factory=dict)

    @router.post("/api/track")
    async def track_event(payload: _TrackIn):
        if not payload.type:
            return {"ok": False}
        doc = {"id": f"ev_{uuid.uuid4().hex[:12]}", "type": str(payload.type)[:40],
               "target_type": str(payload.target_type or "")[:40], "target_id": str(payload.target_id or "")[:120],
               "meta": {str(k)[:40]: str(v)[:120] for k, v in list((payload.meta or {}).items())[:10]},
               "day": _now()[:10], "created_at": _now()}
        try:
            await db.analytics_events.insert_one(doc)
        except Exception:
            pass
        return {"ok": True}

    @router.get("/api/pixora/analytics")
    async def studio_analytics(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        prof = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        slug = prof.get("slug")
        events = []
        for t in {sid, slug}:
            if t:
                events += await db.analytics_events.find({"target_id": t}, {"_id": 0}).to_list(50000)
        views = [e for e in events if e.get("type") in ("portfolio_view", "profile_view")]
        by_day: Dict[str, int] = {}
        for e in views:
            by_day[e.get("day")] = by_day.get(e.get("day"), 0) + 1
        series = [{"day": k, "views": v} for k, v in sorted(by_day.items())][-30:]
        return {"portfolio_views": len(views), "by_day": series,
                "followers": await db.pixora_follows.count_documents({"followee": sid}),
                "posts": await db.pixora_posts.count_documents({"studio_id": sid}),
                "community_score": (await _community_score(sid))["score"]}

    if require_super_admin is not None:
        @router.get("/api/admin/analytics/overview")
        async def global_analytics(_super=Depends(require_super_admin)):
            events = await db.analytics_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(100000)
            by_type: Dict[str, int] = {}
            by_day: Dict[str, int] = {}
            for e in events:
                by_type[e.get("type")] = by_type.get(e.get("type"), 0) + 1
                by_day[e.get("day")] = by_day.get(e.get("day"), 0) + 1
            series = [{"day": k, "events": v} for k, v in sorted(by_day.items())][-30:]
            return {
                "total_events": len(events),
                "by_type": [{"type": k, "count": v} for k, v in sorted(by_type.items(), key=lambda x: -x[1])],
                "by_day": series,
                "studios": await db.admins.count_documents({}),
                "posts": await db.pixora_posts.count_documents({}),
                "portfolios_published": await db.portfolio_profiles.count_documents({"is_published": True}),
                "verified": await db.pixora_verifications.count_documents({"status": "approved"}),
                "connections": await db.pixora_connections.count_documents({"status": "accepted"}),
                "crm_clients": await db.pixora_crm_clients.count_documents({}),
            }

    # ---- Batch 3: Wedding Workspace OS (workspaces/bookings/tasks) --------
    BOOKING_STAGES = ["inquiry", "quotation", "negotiation", "accepted", "rejected",
                      "confirmed", "completed", "cancelled", "disputed"]
    DEFAULT_WS_TASKS = [
        ("6mo", "Book photographer & videographer"), ("6mo", "Finalize & book the venue"),
        ("3mo", "Book makeup artist & decorator"), ("3mo", "Send out invitations"),
        ("1mo", "Confirm all vendors & payments"), ("1mo", "Finalize the guest list"),
        ("1wk", "Confirm the day-of timeline with the team"),
        ("day", "Coordinate vendors on the wedding day"),
        ("post", "Collect photos, deliverables & leave reviews"),
    ]

    def _ws_role(ws: Dict[str, Any], uid: str) -> Optional[str]:
        if ws.get("created_by") == uid:
            return "owner"
        for m in ws.get("team", []):
            if m.get("member_id") == uid:
                return m.get("role", "assistant")
        return None

    def _ws_can(ws: Dict[str, Any], uid: str, need: str) -> bool:
        role = _ws_role(ws, uid)
        if role is None:
            return False
        if role in ("owner", "planner"):
            return True                      # full manage
        perms = next((m.get("permissions", []) for m in ws.get("team", []) if m.get("member_id") == uid), [])
        if need in ("view", "comment"):
            return True                      # any member can view/comment
        return need in perms

    async def _require_ws(workspace_id: str, uid: str, need: str = "view") -> Dict[str, Any]:
        ws = await db.pixora_workspaces.find_one({"id": workspace_id}, {"_id": 0})
        if not ws:
            raise HTTPException(404, "Workspace not found")
        if not _ws_can(ws, uid, need):
            raise HTTPException(403, "You don't have permission for this workspace")
        return ws

    async def _ws_activity(workspace_id: str, actor: str, atype: str, text: str):
        try:
            await db.pixora_workspace_activity.insert_one({
                "id": f"wa_{uuid.uuid4().hex[:10]}", "workspace_id": workspace_id,
                "actor": actor, "actor_name": await _studio_name(actor), "type": atype,
                "text": text, "created_at": _now()})
        except Exception:
            pass

    class _WorkspaceIn(BaseModel):
        wedding_name: str = Field(min_length=1)
        bride_name: str = ""
        groom_name: str = ""
        wedding_date: str = ""
        location: str = ""
        budget_inr: int = 0
        guest_count: int = 0
        notes: str = ""

    @router.post("/api/pixora/workspaces")
    async def create_workspace(payload: _WorkspaceIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        wid = f"ws_{uuid.uuid4().hex[:14]}"
        doc = {"id": wid, "created_by": me, **payload.model_dump(), "status": "planning",
               "team": [], "created_at": _now(), "updated_at": _now()}
        await db.pixora_workspaces.insert_one(doc)
        # auto-generate the default planning checklist
        for phase, title in DEFAULT_WS_TASKS:
            await db.pixora_tasks.insert_one({
                "id": f"tsk_{uuid.uuid4().hex[:12]}", "workspace_id": wid, "title": title,
                "phase": phase, "parent_id": None, "deadline": "", "priority": "normal",
                "owner_id": me, "status": "todo", "created_at": _now()})
        await _ws_activity(wid, me, "update", "created this wedding workspace")
        return {"workspace": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/workspaces")
    async def list_workspaces(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        rows = await db.pixora_workspaces.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        mine = [w for w in rows if _ws_role(w, me) is not None]
        for w in mine:
            w["my_role"] = _ws_role(w, me)
        return {"workspaces": mine}

    @router.get("/api/pixora/workspaces/{workspace_id}")
    async def get_workspace(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        ws = await _require_ws(workspace_id, me, "view")
        ws["my_role"] = _ws_role(ws, me)
        for m in ws.get("team", []):
            m["name"] = await _studio_name(m.get("member_id"))
        tasks = await db.pixora_tasks.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(2000)
        bookings = await db.pixora_bookings.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(2000)
        guests = await db.pixora_guests.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(5000)
        return {"workspace": ws, "tasks": tasks, "bookings": bookings, "guests_count": len(guests)}

    @router.put("/api/pixora/workspaces/{workspace_id}")
    async def update_workspace(workspace_id: str, payload: _WorkspaceIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "manage")
        await db.pixora_workspaces.update_one({"id": workspace_id}, {"$set": {**payload.model_dump(), "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/pixora/workspaces/{workspace_id}")
    async def delete_workspace(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        ws = await db.pixora_workspaces.find_one({"id": workspace_id}, {"_id": 0})
        if not ws:
            raise HTTPException(404, "Not found")
        if ws.get("created_by") != me:
            raise HTTPException(403, "Only the owner can delete a workspace")
        await db.pixora_workspaces.delete_one({"id": workspace_id})
        for coll in ("pixora_tasks", "pixora_bookings", "pixora_guests", "pixora_documents", "pixora_workspace_activity"):
            await getattr(db, coll).delete_many({"workspace_id": workspace_id})
        return {"deleted": True}

    # ---- team builder ----
    class _WsTeamIn(BaseModel):
        member_id: str
        role: str = "vendor"          # planner | vendor | assistant
        permissions: List[str] = Field(default_factory=list)

    @router.post("/api/pixora/workspaces/{workspace_id}/team")
    async def add_ws_member(workspace_id: str, payload: _WsTeamIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        ws = await _require_ws(workspace_id, me, "manage")
        team = [m for m in ws.get("team", []) if m.get("member_id") != payload.member_id]
        team.append({"member_id": payload.member_id, "role": payload.role, "permissions": payload.permissions})
        await db.pixora_workspaces.update_one({"id": workspace_id}, {"$set": {"team": team, "updated_at": _now()}})
        await _notify(payload.member_id, "connection", f"You were added to the wedding workspace “{ws.get('wedding_name')}”.", actor=me, entity_id=workspace_id)
        await _ws_activity(workspace_id, me, "update", f"added a {payload.role} to the team")
        return {"added": True}

    @router.delete("/api/pixora/workspaces/{workspace_id}/team/{member_id}")
    async def remove_ws_member(workspace_id: str, member_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        ws = await _require_ws(workspace_id, me, "manage")
        team = [m for m in ws.get("team", []) if m.get("member_id") != member_id]
        await db.pixora_workspaces.update_one({"id": workspace_id}, {"$set": {"team": team, "updated_at": _now()}})
        return {"removed": True}

    # ---- tasks ----
    class _TaskIn(BaseModel):
        title: str = Field(min_length=1)
        phase: str = ""
        parent_id: Optional[str] = None
        deadline: str = ""
        priority: str = "normal"

    @router.post("/api/pixora/workspaces/{workspace_id}/tasks")
    async def add_task(workspace_id: str, payload: _TaskIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "edit")
        doc = {"id": f"tsk_{uuid.uuid4().hex[:12]}", "workspace_id": workspace_id, **payload.model_dump(),
               "owner_id": me, "status": "todo", "created_at": _now()}
        await db.pixora_tasks.insert_one(doc)
        return {"task": {k: v for k, v in doc.items() if k != "_id"}}

    class _TaskUpdIn(BaseModel):
        status: Optional[str] = None
        title: Optional[str] = None
        deadline: Optional[str] = None
        priority: Optional[str] = None

    @router.put("/api/pixora/tasks/{task_id}")
    async def update_task(task_id: str, payload: _TaskUpdIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        t = await db.pixora_tasks.find_one({"id": task_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Task not found")
        await _require_ws(t["workspace_id"], me, "edit")
        sets = {k: v for k, v in payload.model_dump().items() if v is not None}
        sets["updated_at"] = _now()
        await db.pixora_tasks.update_one({"id": task_id}, {"$set": sets})
        return {"updated": True}

    @router.delete("/api/pixora/tasks/{task_id}")
    async def delete_task(task_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        t = await db.pixora_tasks.find_one({"id": task_id}, {"_id": 0})
        if t:
            await _require_ws(t["workspace_id"], me, "edit")
            await db.pixora_tasks.delete_one({"id": task_id})
        return {"deleted": True}

    # ---- bookings (full lifecycle + history) ----
    class _BookingIn(BaseModel):
        vendor_id: str
        package_id: Optional[str] = None
        amount_inr: int = 0
        notes: str = ""

    @router.post("/api/pixora/workspaces/{workspace_id}/bookings")
    async def create_booking(workspace_id: str, payload: _BookingIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "edit")
        vendor = await db.pixora_vendors.find_one({"id": payload.vendor_id}, {"_id": 0})
        if not vendor:
            raise HTTPException(404, "Vendor not found")
        doc = {"id": f"bkg_{uuid.uuid4().hex[:14]}", "workspace_id": workspace_id, "vendor_id": payload.vendor_id,
               "vendor_owner_id": vendor.get("owner_id"), "vendor_name": vendor.get("business_name"),
               "couple_id": me, "package_id": payload.package_id, "amount_inr": max(0, int(payload.amount_inr or 0)),
               "advance_inr": 0, "balance_inr": max(0, int(payload.amount_inr or 0)), "status": "inquiry",
               "notes": payload.notes, "created_at": _now(), "updated_at": _now()}
        await db.pixora_bookings.insert_one(doc)
        await db.pixora_booking_history.insert_one({"id": f"bh_{uuid.uuid4().hex[:10]}", "booking_id": doc["id"],
                                                    "from_status": None, "to_status": "inquiry", "by": me, "note": "inquiry sent", "created_at": _now()})
        await _notify(vendor.get("owner_id"), "gig_application", f"New booking inquiry for “{vendor.get('business_name')}”.", actor=me, entity_id=doc["id"])
        await _ws_activity(workspace_id, me, "booking", f"sent a booking inquiry to {vendor.get('business_name')}")
        return {"booking": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/bookings/mine")
    async def my_vendor_bookings(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        rows = await db.pixora_bookings.find({"vendor_owner_id": me}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"bookings": rows}

    @router.get("/api/pixora/bookings/{booking_id}/history")
    async def booking_history(booking_id: str, admin: dict = Depends(require_admin)):
        rows = await db.pixora_booking_history.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"history": rows}

    class _BookingStatusIn(BaseModel):
        status: str
        note: str = ""
        amount_inr: Optional[int] = None
        advance_inr: Optional[int] = None

    @router.post("/api/pixora/bookings/{booking_id}/status")
    async def set_booking_status(booking_id: str, payload: _BookingStatusIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        b = await db.pixora_bookings.find_one({"id": booking_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Booking not found")
        # only the couple (workspace editor) or the vendor owner can transition
        is_vendor = b.get("vendor_owner_id") == me
        ws = await db.pixora_workspaces.find_one({"id": b["workspace_id"]}, {"_id": 0}) or {}
        if not is_vendor and not _ws_can(ws, me, "edit"):
            raise HTTPException(403, "Not allowed to change this booking")
        new = payload.status if payload.status in BOOKING_STAGES else b["status"]
        sets = {"status": new, "updated_at": _now()}
        if payload.amount_inr is not None:
            sets["amount_inr"] = max(0, int(payload.amount_inr))
        if payload.advance_inr is not None:
            sets["advance_inr"] = max(0, int(payload.advance_inr))
        amt = sets.get("amount_inr", b.get("amount_inr", 0))
        adv = sets.get("advance_inr", b.get("advance_inr", 0))
        sets["balance_inr"] = max(0, amt - adv)
        await db.pixora_bookings.update_one({"id": booking_id}, {"$set": sets})
        await db.pixora_booking_history.insert_one({"id": f"bh_{uuid.uuid4().hex[:10]}", "booking_id": booking_id,
                                                    "from_status": b["status"], "to_status": new, "by": me,
                                                    "note": payload.note[:300], "created_at": _now()})
        other = b.get("couple_id") if is_vendor else b.get("vendor_owner_id")
        await _notify(other, "gig_application", f"Booking “{b.get('vendor_name')}” is now {new}.", actor=me, entity_id=booking_id)
        return {"status": new}

    # ---- guests ----
    class _GuestIn(BaseModel):
        name: str = Field(min_length=1)
        status: str = "invited"       # invited | confirmed | pending | declined
        notes: str = ""

    @router.get("/api/pixora/workspaces/{workspace_id}/guests")
    async def list_guests(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "view")
        rows = await db.pixora_guests.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(5000)
        counts: Dict[str, int] = {}
        for g in rows:
            counts[g.get("status")] = counts.get(g.get("status"), 0) + 1
        return {"guests": rows, "counts": counts}

    @router.post("/api/pixora/workspaces/{workspace_id}/guests")
    async def add_guest(workspace_id: str, payload: _GuestIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "edit")
        doc = {"id": f"gst_{uuid.uuid4().hex[:12]}", "workspace_id": workspace_id, **payload.model_dump(), "created_at": _now()}
        await db.pixora_guests.insert_one(doc)
        return {"guest": {k: v for k, v in doc.items() if k != "_id"}}

    @router.put("/api/pixora/guests/{guest_id}")
    async def update_guest(guest_id: str, payload: _GuestIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        g = await db.pixora_guests.find_one({"id": guest_id}, {"_id": 0})
        if not g:
            raise HTTPException(404, "Guest not found")
        await _require_ws(g["workspace_id"], me, "edit")
        await db.pixora_guests.update_one({"id": guest_id}, {"$set": payload.model_dump()})
        return {"updated": True}

    @router.delete("/api/pixora/guests/{guest_id}")
    async def delete_guest(guest_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        g = await db.pixora_guests.find_one({"id": guest_id}, {"_id": 0})
        if g:
            await _require_ws(g["workspace_id"], me, "edit")
            await db.pixora_guests.delete_one({"id": guest_id})
        return {"deleted": True}

    # ---- documents ----
    class _DocIn(BaseModel):
        name: str = Field(min_length=1)
        kind: str = "other"
        url: str = ""

    @router.get("/api/pixora/workspaces/{workspace_id}/documents")
    async def list_documents(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "view")
        return {"documents": await db.pixora_documents.find({"workspace_id": workspace_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)}

    @router.post("/api/pixora/workspaces/{workspace_id}/documents")
    async def add_document(workspace_id: str, payload: _DocIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "upload")
        doc = {"id": f"doc_{uuid.uuid4().hex[:12]}", "workspace_id": workspace_id, **payload.model_dump(),
               "uploaded_by": me, "created_at": _now()}
        await db.pixora_documents.insert_one(doc)
        return {"document": {k: v for k, v in doc.items() if k != "_id"}}

    @router.delete("/api/pixora/documents/{doc_id}")
    async def delete_document(doc_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        d = await db.pixora_documents.find_one({"id": doc_id}, {"_id": 0})
        if d:
            await _require_ws(d["workspace_id"], me, "manage")
            await db.pixora_documents.delete_one({"id": doc_id})
        return {"deleted": True}

    # ---- activity / communication ----
    @router.get("/api/pixora/workspaces/{workspace_id}/activity")
    async def get_activity(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "view")
        return {"activity": await db.pixora_workspace_activity.find({"workspace_id": workspace_id}, {"_id": 0}).sort("created_at", -1).to_list(500)}

    class _CommentIn2(BaseModel):
        text: str = Field(min_length=1)

    @router.post("/api/pixora/workspaces/{workspace_id}/comment")
    async def add_ws_comment(workspace_id: str, payload: _CommentIn2, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "comment")
        await _ws_activity(workspace_id, me, "comment", payload.text[:500])
        return {"ok": True}

    # ---- workspace analytics ----
    @router.get("/api/pixora/workspaces/{workspace_id}/analytics")
    async def workspace_analytics(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        ws = await _require_ws(workspace_id, me, "view")
        tasks = await db.pixora_tasks.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(2000)
        done = sum(1 for t in tasks if t.get("status") == "done")
        bookings = await db.pixora_bookings.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(2000)
        confirmed = sum(1 for b in bookings if b.get("status") in ("confirmed", "completed"))
        spent = sum(int(b.get("advance_inr") or 0) for b in bookings)
        committed = sum(int(b.get("amount_inr") or 0) for b in bookings if b.get("status") in ("accepted", "confirmed", "completed"))
        guests = await db.pixora_guests.find({"workspace_id": workspace_id}, {"_id": 0}).to_list(5000)
        return {
            "task_progress": round(done / len(tasks) * 100) if tasks else 0, "tasks_total": len(tasks), "tasks_done": done,
            "booking_progress": round(confirmed / len(bookings) * 100) if bookings else 0, "bookings_total": len(bookings), "bookings_confirmed": confirmed,
            "budget": ws.get("budget_inr", 0), "committed": committed, "paid": spent,
            "remaining": max(0, (ws.get("budget_inr", 0) or 0) - committed),
            "guests_total": len(guests), "guests_confirmed": sum(1 for g in guests if g.get("status") == "confirmed"),
        }

    if require_super_admin is not None:
        @router.get("/api/admin/workspaces")
        async def admin_workspaces(_super=Depends(require_super_admin)):
            rows = await db.pixora_workspaces.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
            for w in rows:
                w["owner_name"] = await _studio_name(w.get("created_by"))
                w["bookings"] = await db.pixora_bookings.count_documents({"workspace_id": w["id"]})
            return {"workspaces": rows, "count": len(rows)}

        @router.get("/api/admin/workspaces/analytics")
        async def admin_workspaces_analytics(_super=Depends(require_super_admin)):
            by_status: Dict[str, int] = {}
            for w in await db.pixora_workspaces.find({}, {"_id": 0, "status": 1}).to_list(5000):
                by_status[w.get("status") or "planning"] = by_status.get(w.get("status") or "planning", 0) + 1
            book_status: Dict[str, int] = {}
            for b in await db.pixora_bookings.find({}, {"_id": 0, "status": 1}).to_list(20000):
                book_status[b.get("status")] = book_status.get(b.get("status"), 0) + 1
            return {"workspaces": await db.pixora_workspaces.count_documents({}), "by_status": by_status,
                    "bookings": await db.pixora_bookings.count_documents({}), "booking_status": book_status,
                    "disputed": book_status.get("disputed", 0)}

        @router.post("/api/admin/bookings/{booking_id}/resolve")
        async def admin_resolve_booking(booking_id: str, payload: _BookingStatusIn, _super=Depends(require_super_admin)):
            b = await db.pixora_bookings.find_one({"id": booking_id}, {"_id": 0})
            if not b:
                raise HTTPException(404, "Booking not found")
            new = payload.status if payload.status in BOOKING_STAGES else b["status"]
            await db.pixora_bookings.update_one({"id": booking_id}, {"$set": {"status": new, "updated_at": _now()}})
            await db.pixora_booking_history.insert_one({"id": f"bh_{uuid.uuid4().hex[:10]}", "booking_id": booking_id,
                                                        "from_status": b["status"], "to_status": new, "by": "admin",
                                                        "note": f"admin: {payload.note}"[:300], "created_at": _now()})
            await _audit(_super, "booking_resolve", "booking", booking_id, {"to": new})
            return {"resolved": True, "status": new}

    # ---- Batch 4: Project Management (milestones) -------------------------
    class _MilestoneIn(BaseModel):
        title: str = Field(min_length=1)
        due_date: str = ""
        status: str = "pending"       # pending | in_progress | done

    @router.get("/api/pixora/workspaces/{workspace_id}/milestones")
    async def list_milestones(workspace_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "view")
        return {"milestones": await db.pixora_milestones.find({"workspace_id": workspace_id}, {"_id": 0}).sort("due_date", 1).to_list(500)}

    @router.post("/api/pixora/workspaces/{workspace_id}/milestones")
    async def add_milestone(workspace_id: str, payload: _MilestoneIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        await _require_ws(workspace_id, me, "edit")
        doc = {"id": f"ms_{uuid.uuid4().hex[:12]}", "workspace_id": workspace_id, **payload.model_dump(), "created_at": _now()}
        await db.pixora_milestones.insert_one(doc)
        return {"milestone": {k: v for k, v in doc.items() if k != "_id"}}

    @router.put("/api/pixora/milestones/{milestone_id}")
    async def update_milestone(milestone_id: str, payload: _MilestoneIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        m = await db.pixora_milestones.find_one({"id": milestone_id}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Milestone not found")
        await _require_ws(m["workspace_id"], me, "edit")
        await db.pixora_milestones.update_one({"id": milestone_id}, {"$set": payload.model_dump()})
        return {"updated": True}

    @router.delete("/api/pixora/milestones/{milestone_id}")
    async def delete_milestone(milestone_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        m = await db.pixora_milestones.find_one({"id": milestone_id}, {"_id": 0})
        if m:
            await _require_ws(m["workspace_id"], me, "edit")
            await db.pixora_milestones.delete_one({"id": milestone_id})
        return {"deleted": True}

    # ---- Batch 4: Wedding Business Intelligence (vendor/studio-facing) ----
    @router.get("/api/pixora/wedding-bi")
    async def wedding_bi(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        bookings = await db.pixora_bookings.find({"vendor_owner_id": me}, {"_id": 0}).to_list(20000)
        by_status: Dict[str, int] = {}
        by_month: Dict[str, int] = {}
        won = []
        for b in bookings:
            by_status[b.get("status")] = by_status.get(b.get("status"), 0) + 1
            by_month[(b.get("created_at") or "")[:7]] = by_month.get((b.get("created_at") or "")[:7], 0) + 1
            if b.get("status") in ("confirmed", "completed"):
                won.append(b)
        revenue = sum(int(b.get("amount_inr") or 0) for b in won)
        total = len(bookings)
        return {
            "total_bookings": total, "won": len(won), "revenue": revenue,
            "avg_deal": round(revenue / len(won)) if won else 0,
            "conversion_pct": round(len(won) / total * 100) if total else 0,
            "by_status": by_status,
            "monthly": [{"month": k, "count": v} for k, v in sorted(by_month.items()) if k][-12:],
        }

    if require_super_admin is not None:
        @router.get("/api/admin/industry-analytics")
        async def industry_analytics(_super=Depends(require_super_admin)):
            vendors = await db.pixora_vendors.find({}, {"_id": 0, "id": 1, "category": 1, "state": 1, "country": 1}).to_list(10000)
            vmap = {v["id"]: v for v in vendors}
            bookings = await db.pixora_bookings.find({}, {"_id": 0}).to_list(50000)
            revenue = 0
            by_category: Dict[str, int] = {}
            by_region: Dict[str, int] = {}
            by_month: Dict[str, int] = {}
            by_status: Dict[str, int] = {}
            for b in bookings:
                by_status[b.get("status")] = by_status.get(b.get("status"), 0) + 1
                by_month[(b.get("created_at") or "")[:7]] = by_month.get((b.get("created_at") or "")[:7], 0) + 1
                if b.get("status") in ("confirmed", "completed"):
                    revenue += int(b.get("amount_inr") or 0)
                v = vmap.get(b.get("vendor_id")) or {}
                cat = v.get("category") or "—"
                reg = v.get("state") or v.get("country") or "—"
                by_category[cat] = by_category.get(cat, 0) + 1
                by_region[reg] = by_region.get(reg, 0) + 1
            return {
                "workspaces": await db.pixora_workspaces.count_documents({}),
                "vendors": await db.pixora_vendors.count_documents({}),
                "bookings": len(bookings), "revenue": revenue,
                "by_status": by_status,
                "by_category": [{"k": k, "v": v} for k, v in sorted(by_category.items(), key=lambda x: -x[1])][:12],
                "by_region": [{"k": k, "v": v} for k, v in sorted(by_region.items(), key=lambda x: -x[1])][:12],
                "monthly": [{"month": k, "count": v} for k, v in sorted(by_month.items()) if k][-12:],
            }

    # ---- Batch 5: Pixora Talent Agency ------------------------------------
    class _TalentIn(BaseModel):
        headline: str = ""
        specialties: List[str] = Field(default_factory=list)
        showreel_url: str = ""
        rate_card: str = ""
        bio: str = ""

    @router.get("/api/pixora/talent/me")
    async def my_talent(admin: dict = Depends(require_admin)):
        return {"talent": await db.pixora_talent.find_one({"owner_id": admin["admin_id"]}, {"_id": 0})}

    @router.post("/api/pixora/talent")
    async def apply_talent(payload: _TalentIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        existing = await db.pixora_talent.find_one({"owner_id": me}, {"_id": 0})
        doc = {"owner_id": me, **payload.model_dump(), "updated_at": _now()}
        if existing:
            doc["id"] = existing["id"]
            doc["created_at"] = existing.get("created_at", _now())
            doc["featured"] = existing.get("featured", False)
            doc["status"] = "pending" if existing.get("status") == "rejected" else existing.get("status", "pending")
            await db.pixora_talent.update_one({"owner_id": me}, {"$set": doc}, upsert=True)
        else:
            doc.update({"id": f"tal_{uuid.uuid4().hex[:12]}", "status": "pending", "featured": False, "created_at": _now()})
            await db.pixora_talent.insert_one(doc)
        return {"saved": True, "status": doc.get("status", "pending")}

    @router.get("/api/pixora/talent")
    async def discover_talent(admin: dict = Depends(require_admin)):
        rows = await db.pixora_talent.find({"status": "approved"}, {"_id": 0}).to_list(1000)
        for t in rows:
            t["name"] = await _studio_name(t["owner_id"])
            t["verified_level"] = (await _verification_of(t["owner_id"]))["level"]
            t["community_score"] = (await _community_score(t["owner_id"]))["score"]
            prof = await db.portfolio_profiles.find_one({"id": t["owner_id"]}, {"_id": 0})
            t["portfolio_slug"] = (prof or {}).get("slug")
        rows.sort(key=lambda t: (not t.get("featured"), -(t.get("community_score") or 0)))
        return {"talent": rows}

    # ---- Batch 5: AI Career Growth Engine ---------------------------------
    def _career_fallback(sig: Dict[str, Any], cs: int, won: int) -> Dict[str, Any]:
        stage = ("Emerging" if cs < 60 else "Established" if cs < 150 else "Elite")
        return {"stage": stage, "skills": [
            "Sharpen candid storytelling & low-light technique",
            "Learn short-form reels editing to grow reach",
            "Build a repeatable client-delivery workflow",
        ], "career": [
            f"You're at the {stage} stage (community score {cs}). Publish consistently and get verified to climb.",
            "Turn every completed booking into a testimonial + community post.",
            "Network with planners/decorators — cross-referrals compound bookings.",
        ], "business": [
            "Package your services into Starter/Premium/Luxury tiers.",
            "Track leads in the CRM and follow up within 24 hours.",
        ]}

    @router.get("/api/pixora/career")
    async def get_career(admin: dict = Depends(require_admin)):
        return {"report": await db.pixora_career_reports.find_one({"studio_id": admin["admin_id"]}, {"_id": 0})}

    @router.post("/api/pixora/career/generate")
    async def generate_career(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        sig = await _portfolio_signals(me)
        cs = (await _community_score(me))["score"]
        wonrows = await db.pixora_bookings.find({"vendor_owner_id": me}, {"_id": 0, "status": 1}).to_list(20000)
        won = sum(1 for b in wonrows if b.get("status") in ("confirmed", "completed"))
        fb = _career_fallback(sig, cs, won)
        ai = None
        try:
            from ai_service import gemini_generate
            facts = (f"Community score {cs}, {sig['followers']} followers, {sig['posts']} posts, "
                     f"{sig['works_count']} portfolio photos, {sig['testimonials']} testimonials, "
                     f"{won} confirmed bookings, published={sig['is_published']}.")
            ai = await gemini_generate(
                "You are a career coach for wedding photographers in India. Using ONLY these facts, "
                "give a short career roadmap: current stage, 3 skill recommendations, 3 growth/career "
                "steps and 2 business recommendations. Do NOT invent numbers. Under 220 words.", facts)
        except Exception:
            pass
        doc = {"studio_id": me, "stage": fb["stage"], "fallback": fb, "ai_summary": ai, "generated_at": _now()}
        await db.pixora_career_reports.update_one({"studio_id": me}, {"$set": doc}, upsert=True)
        return {"report": doc}

    # ---- Batch 5: AI Pricing Intelligence ---------------------------------
    @router.get("/api/pixora/pricing-intelligence")
    async def pricing_intelligence(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        prof = await db.portfolio_profiles.find_one({"id": me}, {"_id": 0}) or {}
        loc = prof.get("location") or {}
        city = (loc.get("city") or "").lower()
        exp = prof.get("experience_years") or 0
        cs = (await _community_score(me))["score"]
        myvendor = await db.pixora_vendors.find_one({"owner_id": me}, {"_id": 0})
        category = (myvendor or {}).get("category")
        # local competition: approved vendors, same city + category
        peers = []
        for v in await db.pixora_vendors.find({"status": "approved"}, {"_id": 0}).to_list(3000):
            if v.get("owner_id") == me:
                continue
            if category and (v.get("category") or "") != category:
                continue
            if city and city not in (v.get("city") or "").lower():
                continue
            if v.get("price_min_inr"):
                peers.append(int(v["price_min_inr"]))
        peer_avg = round(sum(peers) / len(peers)) if peers else 0
        # heuristic band (reasoning-based, anchored to real peer data when present)
        base = peer_avg or (25000 + exp * 5000)
        factor = 1.0 + min(0.4, cs / 500) + (0.1 if (await _verification_of(me))["level"] else 0)
        low = round(base * 0.85)
        high = round(base * factor * 1.25)
        return {
            "suggested_min": low, "suggested_max": high, "peer_avg": peer_avg, "peers": len(peers),
            "signals": {"experience_years": exp, "community_score": cs, "city": loc.get("city"), "category": category},
            "reasoning": (f"Anchored to {len(peers)} local peers (avg starting ₹{peer_avg}). " if peers
                          else "No local peer pricing yet — anchored to experience. ")
            + f"Adjusted up for your community score ({cs}) and verification. Benchmark 2–3 local studios before fixing prices; sell delivery speed + storytelling, don't undercut.",
        }

    if require_super_admin is not None:
        @router.get("/api/admin/talent")
        async def admin_list_talent(_super=Depends(require_super_admin)):
            rows = await db.pixora_talent.find({}, {"_id": 0}).sort("updated_at", -1).to_list(2000)
            for t in rows:
                t["name"] = await _studio_name(t["owner_id"])
            return {"talent": rows}

        class _TalentActionIn(BaseModel):
            action: str

        @router.post("/api/admin/talent/{talent_id}/action")
        async def admin_talent_action(talent_id: str, payload: _TalentActionIn, _super=Depends(require_super_admin)):
            t = await db.pixora_talent.find_one({"id": talent_id}, {"_id": 0})
            if not t:
                raise HTTPException(404, "Talent not found")
            a = payload.action
            sets = {}
            if a in ("approve", "reject"):
                sets["status"] = "approved" if a == "approve" else "rejected"
            elif a == "feature":
                sets["featured"] = True
            elif a == "unfeature":
                sets["featured"] = False
            elif a == "delete":
                await db.pixora_talent.delete_one({"id": talent_id})
                await _audit(_super, "talent_delete", "talent", talent_id)
                return {"deleted": True}
            else:
                raise HTTPException(400, "Unknown action")
            sets["updated_at"] = _now()
            await db.pixora_talent.update_one({"id": talent_id}, {"$set": sets})
            await _audit(_super, f"talent_{a}", "talent", talent_id)
            if a == "approve":
                await _notify(t["owner_id"], "verification", "You've been approved into Pixora Talent!", entity_id=talent_id)
            return {"ok": True, "action": a}

    # ---- Batch 2: Vendor ecosystem (categories, profiles, reviews) --------
    VENDOR_CATEGORY_SEED = [
        "Photographer", "Videographer", "Drone Team", "Makeup Artist", "Wedding Planner",
        "Decorator", "Venue", "Caterer", "Entertainment", "Travel Service",
        "Invitation Designer", "Album Designer", "Printing Service", "Rental Service", "Other",
    ]

    async def _ensure_vendor_categories():
        if await db.pixora_vendor_categories.count_documents({}) == 0:
            for i, label in enumerate(VENDOR_CATEGORY_SEED):
                await db.pixora_vendor_categories.insert_one({
                    "id": f"vc_{uuid.uuid4().hex[:8]}", "key": label.lower().replace(" ", "_"),
                    "label": label, "active": True, "sort": i, "created_at": _now()})

    def _vendor_completeness(v: Dict[str, Any]) -> float:
        fields = [v.get("business_name"), v.get("description"), v.get("category"), v.get("city"),
                  v.get("services"), v.get("profile_photo"), v.get("contact")]
        return sum(1 for f in fields if f) / len(fields)

    def _vendor_rank(v: Dict[str, Any]) -> float:
        return ((v.get("rating") or 0) * 10 + min(v.get("community_score") or 0, 200) / 2
                + (v.get("verified_level") or 0) * 8 + _vendor_completeness(v) * 20
                + (v.get("response_rate") or 0) / 5 + (50 if v.get("featured") else 0))

    async def _vendor_enrich(v: Dict[str, Any]) -> Dict[str, Any]:
        owner = v.get("owner_id")
        v["verified_level"] = (await _verification_of(owner))["level"]
        v["community_score"] = (await _community_score(owner))["score"]
        reviews = await db.pixora_vendor_reviews.find({"vendor_id": v["id"], "status": "published"}, {"_id": 0}).to_list(5000)
        ratings = [int(r["rating"]) for r in reviews if r.get("rating")]
        v["rating"] = round(sum(ratings) / len(ratings), 1) if ratings else None
        v["review_count"] = len(reviews)
        v["rating_distribution"] = {str(i): sum(1 for x in ratings if x == i) for i in range(1, 6)}
        responded = sum(1 for r in reviews if r.get("response"))
        v["response_rate"] = round(responded / len(reviews) * 100) if reviews else 0
        prof = await db.portfolio_profiles.find_one({"id": owner}, {"_id": 0})
        if prof:   # single source of truth: link to the existing photographer portfolio
            v["portfolio_slug"] = prof.get("slug")
        return v

    class _VendorIn(BaseModel):
        business_name: str = Field(min_length=1)
        owner_name: str = ""
        category: str = ""
        subcategories: List[str] = Field(default_factory=list)
        description: str = ""
        country: str = "India"
        state: str = ""
        city: str = ""
        experience_years: int = 0
        price_min_inr: int = 0
        price_max_inr: int = 0
        services: List[str] = Field(default_factory=list)
        contact: Dict[str, str] = Field(default_factory=dict)
        website: str = ""
        instagram: str = ""
        portfolio_url: str = ""
        availability_status: str = "Available"
        profile_photo: str = ""
        cover_photo: str = ""

    @router.get("/api/pixora/vendor-categories")
    async def vendor_categories():
        await _ensure_vendor_categories()
        rows = await db.pixora_vendor_categories.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(200)
        return {"categories": rows}

    @router.get("/api/pixora/vendor/me")
    async def my_vendor(admin: dict = Depends(require_admin)):
        v = await db.pixora_vendors.find_one({"owner_id": admin["admin_id"]}, {"_id": 0})
        if not v:
            return {"vendor": None, "reviews": []}
        reviews = await db.pixora_vendor_reviews.find({"vendor_id": v["id"], "status": "published"}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"vendor": await _vendor_enrich(v), "reviews": reviews}

    @router.post("/api/pixora/vendor")
    async def upsert_vendor(payload: _VendorIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        existing = await db.pixora_vendors.find_one({"owner_id": sid}, {"_id": 0})
        base = {"owner_id": sid, **payload.model_dump(), "updated_at": _now()}
        if existing:
            base["id"] = existing["id"]
            base["created_at"] = existing.get("created_at", _now())
            base["featured"] = existing.get("featured", False)
            base["hidden"] = existing.get("hidden", False)
            # editing a rejected/suspended profile re-enters review
            base["status"] = "pending" if existing.get("status") in ("rejected", "suspended") else existing.get("status", "pending")
            await db.pixora_vendors.update_one({"owner_id": sid}, {"$set": base}, upsert=True)
        else:
            base.update({"id": f"vnd_{uuid.uuid4().hex[:14]}", "status": "pending",
                         "featured": False, "hidden": False, "created_at": _now()})
            await db.pixora_vendors.insert_one(base)
        return {"saved": True, "status": base.get("status", "pending")}

    @router.get("/api/pixora/vendors")
    async def list_vendors(category: str = "", country: str = "", state: str = "", city: str = "",
                           min_rating: float = 0, verified: int = 0, q: str = "", sort: str = "rank"):
        rows = await db.pixora_vendors.find({"status": "approved"}, {"_id": 0}).to_list(2000)
        rows = [v for v in rows if not v.get("hidden")]
        out = []
        ql = q.strip().lower()
        for v in rows:
            if category and (v.get("category") or "").lower() != category.lower():
                continue
            if country and (v.get("country") or "").lower() != country.lower():
                continue
            if state and (v.get("state") or "").lower() != state.lower():
                continue
            if city and city.lower() not in (v.get("city") or "").lower():
                continue
            if ql:
                hay = " ".join([v.get("business_name", ""), v.get("description", ""), " ".join(v.get("services") or []), v.get("city", "")]).lower()
                if ql not in hay:
                    continue
            v = await _vendor_enrich(v)
            if min_rating and (v.get("rating") or 0) < min_rating:
                continue
            if verified and (v.get("verified_level") or 0) < verified:
                continue
            v["rank_score"] = round(_vendor_rank(v), 1)
            out.append(v)
        if sort == "rating":
            out.sort(key=lambda x: -(x.get("rating") or 0))
        elif sort == "reviews":
            out.sort(key=lambda x: -(x.get("review_count") or 0))
        else:
            out.sort(key=lambda x: -x["rank_score"])
        facets = {
            "categories": sorted({v["category"] for v in out if v.get("category")}),
            "countries": sorted({v["country"] for v in out if v.get("country")}),
            "states": sorted({v["state"] for v in out if v.get("state")}),
        }
        return {"vendors": out, "count": len(out), "facets": facets}

    @router.get("/api/pixora/vendors/{vendor_id}")
    async def get_vendor(vendor_id: str):
        v = await db.pixora_vendors.find_one({"id": vendor_id}, {"_id": 0})
        if not v or v.get("hidden") or v.get("status") != "approved":
            raise HTTPException(404, "Vendor not found")
        v = await _vendor_enrich(v)
        reviews = await db.pixora_vendor_reviews.find({"vendor_id": vendor_id, "status": "published"}, {"_id": 0}).sort("created_at", -1).to_list(500)
        for r in reviews:
            r["author"] = r.get("author_name") or await _studio_name(r.get("reviewer_id", ""))
        return {"vendor": v, "reviews": reviews}

    class _VendorReviewIn(BaseModel):
        rating: int = 5
        text: str = ""
        kind: str = "text"           # text | photo | video
        media_url: str = ""

    @router.post("/api/pixora/vendors/{vendor_id}/reviews")
    async def add_vendor_review(vendor_id: str, payload: _VendorReviewIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        v = await db.pixora_vendors.find_one({"id": vendor_id}, {"_id": 0})
        if not v:
            raise HTTPException(404, "Vendor not found")
        owner = v.get("owner_id")
        if owner == me:
            raise HTTPException(400, "You can't review your own vendor profile")
        if await db.pixora_vendor_reviews.find_one({"vendor_id": vendor_id, "reviewer_id": me}, {"_id": 0}):
            raise HTTPException(400, "You have already reviewed this vendor")
        # verified = a confirmed collaboration (accepted connection) with the vendor owner
        conn = await db.pixora_connections.find_one({"status": "accepted", "$or": [
            {"requester": me, "recipient": owner}, {"requester": owner, "recipient": me}]}, {"_id": 0})
        doc = {"id": f"vrv_{uuid.uuid4().hex[:12]}", "vendor_id": vendor_id, "reviewer_id": me,
               "author_name": await _studio_name(me), "rating": max(1, min(5, int(payload.rating or 5))),
               "text": (payload.text or "").strip()[:1000], "kind": payload.kind if payload.kind in ("text", "photo", "video") else "text",
               "media_url": (payload.media_url or "").strip()[:400], "verified": bool(conn),
               "status": "published", "response": None, "created_at": _now()}
        await db.pixora_vendor_reviews.insert_one(doc)
        await _notify(owner, "connection", f"{await _studio_name(me)} left a review on your vendor profile.", actor=me, entity_id=vendor_id)
        return {"review": {k: val for k, val in doc.items() if k != "_id"}}

    class _VendorRespondIn(BaseModel):
        text: str = ""

    @router.post("/api/pixora/vendor-reviews/{review_id}/respond")
    async def respond_vendor_review(review_id: str, payload: _VendorRespondIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        r = await db.pixora_vendor_reviews.find_one({"id": review_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Review not found")
        v = await db.pixora_vendors.find_one({"id": r["vendor_id"]}, {"_id": 0}) or {}
        if v.get("owner_id") != me:
            raise HTTPException(403, "Only the vendor can respond")
        await db.pixora_vendor_reviews.update_one({"id": review_id}, {"$set": {"response": {"text": payload.text.strip()[:600], "at": _now()}}})
        return {"responded": True}

    # ---- Batch 2: admin vendor controls -----------------------------------
    if require_super_admin is not None:
        @router.get("/api/admin/vendor-categories")
        async def admin_list_categories(_super=Depends(require_super_admin)):
            await _ensure_vendor_categories()
            return {"categories": await db.pixora_vendor_categories.find({}, {"_id": 0}).sort("sort", 1).to_list(500)}

        class _CategoryIn(BaseModel):
            label: str
            active: bool = True

        @router.post("/api/admin/vendor-categories")
        async def admin_add_category(payload: _CategoryIn, _super=Depends(require_super_admin)):
            n = await db.pixora_vendor_categories.count_documents({})
            doc = {"id": f"vc_{uuid.uuid4().hex[:8]}", "key": payload.label.lower().replace(" ", "_"),
                   "label": payload.label.strip()[:60], "active": payload.active, "sort": n, "created_at": _now()}
            await db.pixora_vendor_categories.insert_one(doc)
            await _audit(_super, "vendor_category_add", "category", doc["id"], {"label": doc["label"]})
            return {"category": {k: v for k, v in doc.items() if k != "_id"}}

        @router.delete("/api/admin/vendor-categories/{cat_id}")
        async def admin_del_category(cat_id: str, _super=Depends(require_super_admin)):
            await db.pixora_vendor_categories.delete_one({"id": cat_id})
            await _audit(_super, "vendor_category_delete", "category", cat_id)
            return {"deleted": True}

        @router.get("/api/admin/vendors")
        async def admin_list_vendors(status: str = "", _super=Depends(require_super_admin)):
            q = {} if not status else {"status": status}
            rows = await db.pixora_vendors.find(q, {"_id": 0}).sort("updated_at", -1).to_list(2000)
            for v in rows:
                await _vendor_enrich(v)
            return {"vendors": rows, "count": len(rows)}

        class _VendorActionIn(BaseModel):
            action: str   # approve|reject|suspend|verify|feature|unfeature|hide|unhide|delete

        @router.post("/api/admin/vendors/{vendor_id}/action")
        async def admin_vendor_action(vendor_id: str, payload: _VendorActionIn, _super=Depends(require_super_admin)):
            v = await db.pixora_vendors.find_one({"id": vendor_id}, {"_id": 0})
            if not v:
                raise HTTPException(404, "Vendor not found")
            a = payload.action
            sets = {}
            if a in ("approve", "reject", "suspend"):
                sets["status"] = {"approve": "approved", "reject": "rejected", "suspend": "suspended"}[a]
            elif a == "feature":
                sets["featured"] = True
            elif a == "unfeature":
                sets["featured"] = False
            elif a == "hide":
                sets["hidden"] = True
            elif a == "unhide":
                sets["hidden"] = False
            elif a == "verify":
                # verification lives on the owner (single source of truth).
                # admins docs are keyed by "id", not "admin_id" — the old filter
                # matched zero rows so the badge was never set.
                await db.admins.update_one({"id": v["owner_id"]}, {"$set": {"is_verified": True, "pixora_verified_level": max(1, int((await _verification_of(v["owner_id"]))["level"]))}})
            elif a == "delete":
                await db.pixora_vendors.delete_one({"id": vendor_id})
                await db.pixora_vendor_reviews.delete_many({"vendor_id": vendor_id})
                await _audit(_super, "vendor_delete", "vendor", vendor_id)
                return {"deleted": True}
            else:
                raise HTTPException(400, "Unknown action")
            if sets:
                sets["updated_at"] = _now()
                await db.pixora_vendors.update_one({"id": vendor_id}, {"$set": sets})
            await _audit(_super, f"vendor_{a}", "vendor", vendor_id)
            return {"ok": True, "action": a}

        @router.delete("/api/admin/vendor-reviews/{review_id}")
        async def admin_remove_vendor_review(review_id: str, _super=Depends(require_super_admin)):
            await db.pixora_vendor_reviews.update_one({"id": review_id}, {"$set": {"status": "removed"}})
            await _audit(_super, "vendor_review_remove", "vendor_review", review_id)
            return {"removed": True}

        @router.get("/api/admin/vendors/analytics")
        async def admin_vendor_analytics(_super=Depends(require_super_admin)):
            rows = await db.pixora_vendors.find({}, {"_id": 0}).to_list(5000)
            by_cat: Dict[str, int] = {}
            by_status: Dict[str, int] = {}
            by_country: Dict[str, int] = {}
            for v in rows:
                by_cat[v.get("category") or "—"] = by_cat.get(v.get("category") or "—", 0) + 1
                by_status[v.get("status") or "pending"] = by_status.get(v.get("status") or "pending", 0) + 1
                by_country[v.get("country") or "—"] = by_country.get(v.get("country") or "—", 0) + 1
            reviews_total = await db.pixora_vendor_reviews.count_documents({"status": "published"})
            verified_reviews = await db.pixora_vendor_reviews.count_documents({"status": "published", "verified": True})
            return {"total_vendors": len(rows), "by_category": by_cat, "by_status": by_status,
                    "by_country": by_country, "reviews_total": reviews_total, "verified_reviews": verified_reviews}

    # ---- Phase 7: Multi-currency system -----------------------------------
    async def _currency_rates() -> Dict[str, float]:
        doc = await db.app_settings.find_one({"id": "currency_rates"}, {"_id": 0})
        saved = (doc or {}).get("rates") or {}
        merged = dict(DEFAULT_RATES)
        for k, v in saved.items():
            if k in SUPPORTED_CURRENCIES:
                try:
                    merged[k] = float(v)
                except (TypeError, ValueError):
                    pass
        merged["INR"] = 1.0
        return merged

    @router.get("/api/currency/rates")
    async def currency_rates():
        return {"base": "INR", "currencies": SUPPORTED_CURRENCIES,
                "symbols": CURRENCY_SYMBOLS, "rates": await _currency_rates()}

    class _RatesIn(BaseModel):
        rates: Dict[str, float] = Field(default_factory=dict)

    # ---- Phase 7: Push registration + preferences -------------------------
    class _PushRegIn(BaseModel):
        token: str
        platform: str = "web"

    @router.post("/api/push/register")
    async def push_register(payload: _PushRegIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        if not payload.token:
            raise HTTPException(400, "Missing token")
        await db.push_tokens.update_one(
            {"studio_id": sid, "token": payload.token},
            {"$set": {"id": f"pt_{uuid.uuid4().hex[:10]}", "studio_id": sid, "token": payload.token,
                      "platform": payload.platform, "updated_at": _now()}}, upsert=True)
        return {"registered": True}

    class _PrefsIn(BaseModel):
        prefs: Dict[str, bool] = Field(default_factory=dict)

    @router.get("/api/push/preferences")
    async def get_push_prefs(admin: dict = Depends(require_admin)):
        doc = await db.notification_prefs.find_one({"studio_id": admin["admin_id"]}, {"_id": 0})
        return {"prefs": (doc or {}).get("prefs") or {}, "types": NOTIF_TYPES}

    @router.put("/api/push/preferences")
    async def set_push_prefs(payload: _PrefsIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        prefs = {k: bool(v) for k, v in payload.prefs.items() if k in NOTIF_TYPES}
        await db.notification_prefs.update_one({"studio_id": sid},
            {"$set": {"studio_id": sid, "prefs": prefs, "updated_at": _now()}}, upsert=True)
        return {"saved": True, "prefs": prefs}

    if require_super_admin is not None:
        @router.get("/api/admin/currency/rates")
        async def admin_get_rates(_super=Depends(require_super_admin)):
            return {"rates": await _currency_rates(), "currencies": SUPPORTED_CURRENCIES, "symbols": CURRENCY_SYMBOLS}

        @router.put("/api/admin/currency/rates")
        async def admin_set_rates(payload: _RatesIn, _super=Depends(require_super_admin)):
            rates = {}
            for k, v in payload.rates.items():
                if k in SUPPORTED_CURRENCIES:
                    try:
                        rates[k] = float(v)
                    except (TypeError, ValueError):
                        pass
            rates["INR"] = 1.0
            await db.app_settings.update_one({"id": "currency_rates"},
                {"$set": {"id": "currency_rates", "rates": rates, "updated_at": _now()}}, upsert=True)
            await _audit(_super, "currency_rates_update", meta={"rates": rates})
            return {"saved": True, "rates": rates}

        @router.get("/api/admin/push/stats")
        async def admin_push_stats(_super=Depends(require_super_admin)):
            by_platform: Dict[str, int] = {}
            for t in await db.push_tokens.find({}, {"_id": 0, "platform": 1}).to_list(100000):
                p = t.get("platform") or "web"
                by_platform[p] = by_platform.get(p, 0) + 1
            return {"tokens": await db.push_tokens.count_documents({}),
                    "by_platform": by_platform,
                    "outbox_pending": await db.push_outbox.count_documents({"status": "pending"})}

    # ---- feed --------------------------------------------------------------
    @router.get("/api/pixora/feed")
    async def feed(kind: Optional[str] = None, limit: int = 50, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        q: Dict[str, Any] = {}
        if kind and kind in POST_KINDS:
            q["kind"] = kind
        posts = await db.pixora_posts.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
        out = []
        vcache: Dict[str, int] = {}
        for p in posts:
            aid = p["studio_id"]
            if aid not in vcache:
                vcache[aid] = (await _verification_of(aid))["level"]
            out.append({**p, "author": await _studio_name(aid),
                        "author_verified_level": vcache[aid],
                        "like_count": len(p.get("likes", [])),
                        "comment_count": await db.pixora_comments.count_documents({"post_id": p["id"]}),
                        "save_count": await db.pixora_saves.count_documents({"post_id": p["id"]}),
                        "share_count": await db.pixora_shares.count_documents({"post_id": p["id"]}),
                        "view_count": int(p.get("views") or 0),
                        "viewer_liked": me in (p.get("likes") or []),
                        "viewer_saved": bool(await db.pixora_saves.find_one(
                            {"actor_id": me, "post_id": p["id"]}, {"_id": 0}))})
        return {"posts": out}

    @router.post("/api/pixora/posts")
    async def create_post(payload: PostIn, admin: dict = Depends(require_admin)):
        if payload.kind not in POST_KINDS:
            raise HTTPException(400, f"Unknown post kind '{payload.kind}'")
        sid = admin["admin_id"]
        # Plan gate: a post carrying media is a media upload → Basic+ for a photo,
        # Premium for a video (same "reels" capability create_reel charges).
        # Text-only posts stay free so Free members can still discuss.
        #
        # This used to look at image_url ONLY. A video post sends image_url=null,
        # so it skipped both the capability check AND consume_upload — the upload
        # stayed `consumed: False` forever and permanently ate the studio's quota
        # as pending bytes.
        size = 0
        media_url = payload.image_url or payload.video_url
        if media_url:
            await ensure_capability(db, sid, "reels" if payload.video_url else "photo_post")
            # Server-authoritative size: read the REAL uploaded size from the registry,
            # never the client's size_bytes. Quota was already enforced at upload time.
            size = await storage_accounting.consume_upload(db, sid, media_url)
        # Carousel: every extra frame is its own upload and must be charged too,
        # or the same pending-bytes leak reappears one image at a time.
        extra = [u for u in (payload.images or []) if u and u != payload.image_url][:9]
        if extra:
            await ensure_capability(db, sid, "multi_image_post")
            for u in extra:
                size += await storage_accounting.consume_upload(db, sid, u)
        # tags: normalised to lowercase, no '#', deduped, capped — they drive
        # discovery, so they must be consistent rather than free-form noise.
        tags = []
        for t in (payload.tags or [])[:12]:
            t = str(t or "").strip().lstrip("#").lower()[:24]
            if t and t not in tags:
                tags.append(t)
        category = (payload.category or "").strip().lower() or None
        if category and category not in POST_CATEGORIES:
            raise HTTPException(400, f"Unknown category '{category}'.")
        doc = {"id": f"pst_{uuid.uuid4().hex[:14]}", "studio_id": sid,
               "kind": payload.kind, "title": payload.title, "body": payload.body,
               "image_url": payload.image_url, "video_url": payload.video_url,
               "images": ([payload.image_url] + extra) if extra and payload.image_url else extra,
               "tags": tags, "size_bytes": size,
               "category": category,
               "location": (payload.location or "").strip()[:80] or None,
               "camera": (payload.camera or "").strip()[:60] or None,
               "lens": (payload.lens or "").strip()[:60] or None,
               "mentions": clean_mentions(payload.mentions),
               "likes": [], "views": 0, "created_at": _now()}
        await db.pixora_posts.insert_one(doc)
        await _bump_hashtags(hashtags_from(doc))
        # Auto-moderation (Phase 9): screen the new post's text; a hit files an
        # auto-report into this same queue. Guarded + non-blocking.
        try:
            from auto_moderation import auto_report
            await auto_report(db, "post", doc["id"],
                              f"{doc.get('title', '')} {doc.get('body', '')}",
                              owner_id=doc.get("studio_id"))
        except Exception:
            pass
        return {"post": {k: v for k, v in doc.items() if k != "_id"}}

    @router.post("/api/pixora/posts/{post_id}/like")
    async def toggle_like(post_id: str, actor: dict = Depends(require_actor)):
        # `actor` is a photographer OR a signed-in couple (see _resolve_actor).
        # The studio panel keeps sending its admin bearer, so it is unaffected.
        sid = actor["id"]
        post, coll = await _find_likeable(post_id)
        if not post:
            raise HTTPException(404, "Post not found")
        likes = set(post.get("likes", []))
        liked = sid not in likes
        likes.discard(sid) if not liked else likes.add(sid)
        await coll.update_one({"id": post_id}, {"$set": {"likes": list(likes)}})
        if liked:
            # Name the content type so a studio's like reads naturally, e.g.
            # "Mani Studio liked your reel." A logged-in photographer likes with
            # their STUDIO identity (actor['name'] = studio name) — no separate
            # normal-user login needed; _resolve_actor accepts the admin bearer.
            kind_word = "reel" if (post.get("kind") == "reel" or post.get("video_url")) else "post"
            await _notify(post.get("studio_id"), "like",
                          f"{actor['name']} liked your {kind_word}.",
                          actor=sid, entity_id=post_id)
            await _write_signal(sid, post_id, post.get("kind") or "post", "like",
                                await _signal_topics_for(post))
        return {"liked": liked, "like_count": len(likes)}

    # ---- engagement: save / share / view ----------------------------------
    # These three did not exist anywhere before. They are the missing inputs to
    # the ranking formula (Likes×1 + Comments×3 + Saves×5 + Shares×7 + Visits×2),
    # so Saved, Trending and Discover ranking all sit on top of this.
    #
    # `actor_id` (not studio_id) throughout: a couple can save and share too.

    class _SaveIn(BaseModel):
        collection_id: Optional[str] = None   # None → the studio's default collection

    @router.post("/api/pixora/posts/{post_id}/save")
    async def toggle_save(post_id: str, payload: _SaveIn, actor: dict = Depends(require_actor)):
        """Toggle. Re-saving into a DIFFERENT collection moves it rather than
        un-saving, which is what people expect from a bookmark UI."""
        aid = actor["id"]
        post, _coll = await _find_likeable(post_id)
        if not post:
            raise HTTPException(404, "Post not found")
        existing = await db.pixora_saves.find_one({"actor_id": aid, "post_id": post_id}, {"_id": 0})
        if existing:
            if payload.collection_id and payload.collection_id != existing.get("collection_id"):
                await db.pixora_saves.update_one(
                    {"actor_id": aid, "post_id": post_id},
                    {"$set": {"collection_id": payload.collection_id}})
                saved = True
            else:
                await db.pixora_saves.delete_one({"actor_id": aid, "post_id": post_id})
                saved = False
        else:
            await db.pixora_saves.insert_one({
                "id": f"sav_{uuid.uuid4().hex[:12]}", "actor_id": aid, "post_id": post_id,
                "collection_id": payload.collection_id, "created_at": _now()})
            saved = True
            await _notify(post.get("studio_id"), "save",
                          f"{actor['name']} saved your post.", actor=aid, entity_id=post_id)
            await _write_signal(aid, post_id, post.get("kind") or "post", "save",
                                await _signal_topics_for(post))
        return {"saved": saved,
                "save_count": await db.pixora_saves.count_documents({"post_id": post_id})}

    @router.get("/api/pixora/saved")
    async def list_saved(collection_id: Optional[str] = None, limit: int = 50,
                         actor: dict = Depends(require_actor)):
        """The Saved tab. Hydrates each save into the full post card so the tab
        renders the same component the feed does."""
        aid = actor["id"]
        q: Dict[str, Any] = {"actor_id": aid}
        if collection_id:
            q["collection_id"] = collection_id
        rows = await db.pixora_saves.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
        cards, out = {}, []
        for r in rows:
            post, _c = await _find_likeable(r["post_id"])
            if not post:
                continue          # source post was deleted — skip, don't 500
            card = await _public_post_card(post, cards)
            card["saved_at"] = r.get("created_at")
            card["collection_id"] = r.get("collection_id")
            card["viewer_saved"] = True
            out.append(card)
        return {"posts": out}

    class _CollectionIn(BaseModel):
        name: str = Field(min_length=1, max_length=60)
        is_private: bool = False

    @router.get("/api/pixora/collections")
    async def list_collections(actor: dict = Depends(require_actor)):
        aid = actor["id"]
        rows = await db.pixora_collections.find({"actor_id": aid}, {"_id": 0}).sort("created_at", -1).to_list(100)
        for r in rows:
            r["count"] = await db.pixora_saves.count_documents({"actor_id": aid, "collection_id": r["id"]})
        return {"collections": rows}

    @router.post("/api/pixora/collections")
    async def create_collection(payload: _CollectionIn, actor: dict = Depends(require_actor)):
        doc = {"id": f"col_{uuid.uuid4().hex[:12]}", "actor_id": actor["id"],
               "name": payload.name.strip(), "is_private": payload.is_private,
               "created_at": _now()}
        await db.pixora_collections.insert_one(doc)
        return {"collection": {k: v for k, v in doc.items() if k != "_id"}}

    @router.delete("/api/pixora/collections/{collection_id}")
    async def delete_collection(collection_id: str, actor: dict = Depends(require_actor)):
        aid = actor["id"]
        await db.pixora_collections.delete_one({"id": collection_id, "actor_id": aid})
        # Saves survive the collection — they fall back to "uncollected" rather
        # than being silently deleted with it.
        await db.pixora_saves.update_many({"actor_id": aid, "collection_id": collection_id},
                                          {"$set": {"collection_id": None}})
        return {"deleted": True}

    class _ShareIn(BaseModel):
        channel: str = "link"    # link | whatsapp | instagram | external

    @router.post("/api/pixora/posts/{post_id}/share")
    async def record_share(post_id: str, payload: _ShareIn, request: Request):
        """Open to logged-out visitors on purpose: a share is the strongest
        distribution signal and most shares happen before anyone signs in."""
        post, _coll = await _find_likeable(post_id)
        if not post:
            raise HTTPException(404, "Post not found")
        actor = await _resolve_actor(request)
        await db.pixora_shares.insert_one({
            "id": f"shr_{uuid.uuid4().hex[:12]}", "post_id": post_id,
            "actor_id": (actor or {}).get("id"),
            "channel": (payload.channel or "link")[:24], "created_at": _now()})
        await _write_signal((actor or {}).get("id"), post_id, post.get("kind") or "post",
                            "share", await _signal_topics_for(post))
        return {"share_count": await db.pixora_shares.count_documents({"post_id": post_id})}

    @router.post("/api/pixora/posts/{post_id}/view")
    async def record_view(post_id: str, request: Request):
        """Total views + unique viewers. One row per (viewer, post) keeps unique
        counting honest without storing a row per scroll."""
        post, coll = await _find_likeable(post_id)
        if not post:
            raise HTTPException(404, "Post not found")
        actor = await _resolve_actor(request)
        aid = (actor or {}).get("id")
        views = int(post.get("views") or 0) + 1
        await coll.update_one({"id": post_id}, {"$set": {"views": views}})
        first_view = False
        if aid and not await db.pixora_views.find_one({"post_id": post_id, "actor_id": aid}, {"_id": 0}):
            await db.pixora_views.insert_one({
                "id": f"vw_{uuid.uuid4().hex[:12]}", "post_id": post_id,
                "actor_id": aid, "created_at": _now()})
            first_view = True
        # Learn from a viewer's FIRST view only (weak +1) — re-scrolls shouldn't
        # keep inflating interest. Anonymous views still log for analytics.
        if first_view:
            await _write_signal(aid, post_id, post.get("kind") or "post", "view",
                                await _signal_topics_for(post))
        return {"views": views}

    @router.get("/api/pixora/posts/{post_id}/comments")
    async def list_comments(post_id: str):
        rows = await db.pixora_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
        for r in rows:
            # author_name is written by new comments (a commenter may be a couple,
            # not a studio); older rows fall back to the studio lookup.
            r["author"] = r.get("author_name") or await _actor_name(r.get("studio_id"))
        return {"comments": rows}

    @router.post("/api/pixora/posts/{post_id}/comment")
    async def add_comment(post_id: str, payload: CommentIn, actor: dict = Depends(require_actor)):
        post, _coll = await _find_likeable(post_id)
        if not post:
            raise HTTPException(404, "Post not found")
        sid = actor["id"]
        doc = {"id": f"cmt_{uuid.uuid4().hex[:12]}", "post_id": post_id,
               "studio_id": sid, "author_name": actor["name"],
               "author_type": actor["type"], "body": payload.body, "created_at": _now()}
        await db.pixora_comments.insert_one(doc)
        await _notify(post.get("studio_id"), "comment",
                      f"{actor['name']} commented on your post.",
                      actor=sid, entity_id=post_id)
        await _write_signal(sid, post_id, post.get("kind") or "post", "comment",
                            await _signal_topics_for(post))
        return {"comment": {**{k: v for k, v in doc.items() if k != "_id"}, "author": actor["name"]}}

    # ---- owner edit / delete for their own posts & comments ---------------
    @router.put("/api/pixora/posts/{post_id}")
    async def edit_post(post_id: str, payload: PostIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        post = await db.pixora_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Post not found")
        if post.get("studio_id") != sid:
            raise HTTPException(403, "You can only edit your own post")
        if payload.kind not in POST_KINDS:
            raise HTTPException(400, f"Unknown post kind '{payload.kind}'")
        # Edits must re-run plan + storage checks — closes the "text post → edit in an
        # image" bypass. Attaching new media requires photo_post; swapped-out media is
        # reclaimed; size is taken from the server registry, never the client.
        old_url, new_url = post.get("image_url"), payload.image_url
        size = int(post.get("size_bytes") or 0)
        if new_url and new_url != old_url:
            await ensure_capability(db, sid, "photo_post")
            await storage_accounting.consume_upload(db, sid, new_url)
            size = await storage_accounting.registered_size(db, sid, new_url)
            if old_url:
                await storage_accounting.release_media(db, sid, old_url)
        elif not new_url and old_url:
            await storage_accounting.release_media(db, sid, old_url)
            size = 0
        await db.pixora_posts.update_one({"id": post_id}, {"$set": {
            "kind": payload.kind, "title": payload.title, "body": payload.body,
            "image_url": payload.image_url, "size_bytes": size, "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/pixora/posts/{post_id}")
    async def delete_post(post_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        post = await db.pixora_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Post not found")
        if post.get("studio_id") != sid:
            raise HTTPException(403, "You can only delete your own post")
        await db.pixora_posts.delete_one({"id": post_id})
        # reclaim the physical file + registry (DB-quota frees automatically with the doc)
        if post.get("image_url"):
            await storage_accounting.release_media(db, sid, post.get("image_url"))
        # cascade: remove the post's comments & critiques so nothing is orphaned
        await db.pixora_comments.delete_many({"post_id": post_id})
        await db.pixora_critiques.delete_many({"post_id": post_id})
        return {"deleted": True}

    @router.put("/api/pixora/comments/{comment_id}")
    async def edit_comment(comment_id: str, payload: CommentIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_comments.find_one({"id": comment_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Comment not found")
        if c.get("studio_id") != sid:
            raise HTTPException(403, "You can only edit your own comment")
        await db.pixora_comments.update_one({"id": comment_id}, {"$set": {"body": payload.body, "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/pixora/comments/{comment_id}")
    async def delete_comment(comment_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_comments.find_one({"id": comment_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Comment not found")
        # a comment can be removed by its author OR by the post's owner (moderation)
        post = await db.pixora_posts.find_one({"id": c.get("post_id")}, {"_id": 0}) or {}
        if c.get("studio_id") != sid and post.get("studio_id") != sid:
            raise HTTPException(403, "You can only delete your own comment")
        await db.pixora_comments.delete_one({"id": comment_id})
        return {"deleted": True}

    # ---- monthly challenges -----------------------------------------------
    @router.get("/api/pixora/challenges")
    async def challenges(admin: dict = Depends(require_admin)):
        rows = await db.pixora_challenges.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
        active = next((c for c in rows if c.get("is_active")), None)
        subs = []
        if active:
            subs = await db.pixora_submissions.find({"challenge_id": active["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
            for s in subs:
                s["author"] = await _studio_name(s["studio_id"])
                s["vote_count"] = len(s.get("votes", []))
        return {"challenges": rows, "active": active, "submissions": subs}

    @router.post("/api/pixora/challenges/submit")
    async def submit_entry(payload: SubmissionIn, admin: dict = Depends(require_admin)):
        ch = await db.pixora_challenges.find_one({"id": payload.challenge_id, "is_active": True}, {"_id": 0})
        if not ch:
            raise HTTPException(404, "Challenge not open")
        # STORAGE LEAK FIX: pixora_submissions is counted but was never charged,
        # so a challenge entry's bytes stayed pending against the studio forever.
        sid = admin["admin_id"]
        size = await storage_accounting.consume_upload(db, sid, payload.image_url) \
            if payload.image_url else 0
        doc = {"id": f"sub_{uuid.uuid4().hex[:12]}", "challenge_id": payload.challenge_id,
               "studio_id": sid, "image_url": payload.image_url,
               "size_bytes": size,
               "caption": payload.caption, "votes": [], "won": False, "created_at": _now()}
        await db.pixora_submissions.insert_one(doc)
        return {"submission": {k: v for k, v in doc.items() if k != "_id"}}

    @router.delete("/api/pixora/submissions/{sub_id}")
    async def delete_submission(sub_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        sub = await db.pixora_submissions.find_one({"id": sub_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Submission not found")
        if sub.get("studio_id") != sid:
            raise HTTPException(403, "You can only delete your own submission")
        await db.pixora_submissions.delete_one({"id": sub_id})
        return {"deleted": True}

    @router.post("/api/pixora/submissions/{sub_id}/vote")
    async def vote(sub_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        sub = await db.pixora_submissions.find_one({"id": sub_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Submission not found")
        votes = set(sub.get("votes", []))
        voted = sid not in votes
        votes.discard(sid) if not voted else votes.add(sid)
        await db.pixora_submissions.update_one({"id": sub_id}, {"$set": {"votes": list(votes)}})
        return {"voted": voted, "vote_count": len(votes)}

    # ---- leaderboard (top studios) ----------------------------------------
    # Ranked on the SAME community score the Home dashboard shows. It used to
    # rank on `_reputation` while the dashboard displayed `_community_score` -
    # two unrelated formulas, so a studio's rank never matched its own number.
    # `reputation` is still returned (it drives the tier ladder), but it no
    # longer decides the order.
    LEADERBOARD_SORTS = {"score", "followers", "engagement", "awards"}

    @router.get("/api/pixora/leaderboard")
    async def leaderboard(limit: int = 20, sort: str = "score",
                          admin: dict = Depends(require_admin)):
        sort = sort if sort in LEADERBOARD_SORTS else "score"
        author_ids = set()
        for p in await db.pixora_posts.find({}, {"_id": 0, "studio_id": 1}).to_list(100000):
            author_ids.add(p["studio_id"])
        rows = []
        for sid in author_ids:
            stats = await _stats(sid)
            n_ach = await db.pixora_achievements.count_documents({"studio_id": sid})
            score = _reputation(stats, n_ach)
            community = (await _community_score(sid))["score"]
            followers = await db.pixora_follows.count_documents({"followee": sid})
            engagement = 0
            for pp in await db.pixora_posts.find({"studio_id": sid}, {"_id": 0}).to_list(500):
                engagement += await _engagement_score(pp["id"], len(pp.get("likes") or []))
                engagement += int(pp.get("views") or 0) * RANK_W["view"]
            # The adapter creates collections lazily, so a missing table must not
            # take the whole leaderboard down.
            try:
                awards = await db.pixora_awards.count_documents({"studio_id": sid})
            except Exception:
                awards = 0
            rows.append({"studio_id": sid, "name": await _studio_name(sid),
                         "reputation": score, "tier": _tier(score), "posts": stats["posts"],
                         "community_score": community, "followers": followers,
                         "engagement": engagement, "awards": awards})
        key = {"score": "community_score", "followers": "followers",
               "engagement": "engagement", "awards": "awards"}[sort]
        rows.sort(key=lambda r: r[key], reverse=True)
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        return {"leaderboard": rows[:min(limit, 100)], "sort": sort,
                "sorts": sorted(LEADERBOARD_SORTS)}

    # ---- hiring board ------------------------------------------------------
    @router.get("/api/pixora/gigs")
    async def gigs(admin: dict = Depends(require_admin)):
        rows = await db.pixora_gigs.find({"status": "open"}, {"_id": 0}).sort("created_at", -1).to_list(200)
        for r in rows:
            r["poster"] = await _studio_name(r["studio_id"])
            r["applicant_count"] = len(r.get("applicants", []))
        return {"gigs": rows}

    @router.post("/api/pixora/gigs")
    async def post_gig(payload: GigIn, admin: dict = Depends(require_admin)):
        doc = {"id": f"gig_{uuid.uuid4().hex[:12]}", "studio_id": admin["admin_id"],
               "title": payload.title, "location": payload.location, "budget_inr": payload.budget_inr,
               "description": payload.description, "status": "open", "applicants": [], "created_at": _now()}
        await db.pixora_gigs.insert_one(doc)
        return {"gig": {k: v for k, v in doc.items() if k != "_id"}}

    @router.post("/api/pixora/gigs/{gig_id}/apply")
    async def apply_gig(gig_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        gig = await db.pixora_gigs.find_one({"id": gig_id}, {"_id": 0})
        if not gig:
            raise HTTPException(404, "Gig not found")
        if gig["studio_id"] == sid:
            raise HTTPException(400, "You can't apply to your own gig")
        applicants = set(gig.get("applicants", []))
        applicants.add(sid)
        await db.pixora_gigs.update_one({"id": gig_id}, {"$set": {"applicants": list(applicants)}})
        await _notify(gig.get("studio_id"), "gig_application",
                      f"{await _studio_name(sid)} applied to your gig “{gig.get('title', '')}”.",
                      actor=sid, entity_id=gig_id)
        return {"applied": True, "applicant_count": len(applicants)}

    @router.put("/api/pixora/gigs/{gig_id}")
    async def edit_gig(gig_id: str, payload: GigIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        gig = await db.pixora_gigs.find_one({"id": gig_id}, {"_id": 0})
        if not gig:
            raise HTTPException(404, "Gig not found")
        if gig.get("studio_id") != sid:
            raise HTTPException(403, "You can only edit your own gig")
        await db.pixora_gigs.update_one({"id": gig_id}, {"$set": {
            "title": payload.title, "location": payload.location,
            "budget_inr": payload.budget_inr, "description": payload.description,
            "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/pixora/gigs/{gig_id}")
    async def delete_gig(gig_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        gig = await db.pixora_gigs.find_one({"id": gig_id}, {"_id": 0})
        if not gig:
            raise HTTPException(404, "Gig not found")
        if gig.get("studio_id") != sid:
            raise HTTPException(403, "You can only delete your own gig")
        await db.pixora_gigs.delete_one({"id": gig_id})
        return {"deleted": True}

    # ---- photo critique (structured, on critique_request posts) -----------
    @router.post("/api/pixora/posts/{post_id}/critique")
    async def add_critique(post_id: str, payload: CritiqueIn, admin: dict = Depends(require_admin)):
        post = await db.pixora_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Post not found")
        doc = {"id": f"crt_{uuid.uuid4().hex[:12]}", "post_id": post_id,
               "studio_id": admin["admin_id"], "body": payload.body,
               "composition": payload.composition, "lighting": payload.lighting,
               "editing": payload.editing, "created_at": _now()}
        await db.pixora_critiques.insert_one(doc)
        # a critique also counts as a comment for reputation/achievements
        await db.pixora_comments.insert_one({"id": f"cmt_{uuid.uuid4().hex[:12]}", "post_id": post_id,
                                             "studio_id": admin["admin_id"], "body": payload.body, "created_at": _now()})
        return {"critique": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/posts/{post_id}/critiques")
    async def list_critiques(post_id: str):
        rows = await db.pixora_critiques.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
        for r in rows:
            r["author"] = await _studio_name(r["studio_id"])
        agg = {}
        for k in ("composition", "lighting", "editing"):
            vals = [r[k] for r in rows if r.get(k)]
            agg[k] = round(sum(vals) / len(vals), 1) if vals else None
        return {"critiques": rows, "averages": agg}

    # ---- mentor program ---------------------------------------------------
    @router.post("/api/pixora/mentors")
    async def become_mentor(payload: MentorIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        doc = {"id": sid, "studio_id": sid, "expertise": payload.expertise,
               "bio": payload.bio, "rate_inr": payload.rate_inr, "updated_at": _now()}
        if await db.pixora_mentors.find_one({"id": sid}, {"_id": 0}):
            await db.pixora_mentors.update_one({"id": sid}, {"$set": doc})
        else:
            doc["created_at"] = _now()
            await db.pixora_mentors.insert_one(doc)
        return {"mentor": doc}

    @router.get("/api/pixora/mentors")
    async def list_mentors(admin: dict = Depends(require_admin)):
        rows = await db.pixora_mentors.find({}, {"_id": 0}).to_list(200)
        for r in rows:
            r["name"] = await _studio_name(r["studio_id"])
        return {"mentors": rows}

    @router.post("/api/pixora/mentors/request")
    async def request_mentor(payload: MentorRequestIn, admin: dict = Depends(require_admin)):
        doc = {"id": f"mrq_{uuid.uuid4().hex[:12]}", "mentor_id": payload.mentor_id,
               "requester_id": admin["admin_id"], "message": payload.message,
               "status": "pending", "created_at": _now()}
        await db.pixora_mentor_requests.insert_one(doc)
        return {"requested": True, "request": {k: v for k, v in doc.items() if k != "_id"}}

    # ---- team profiles ----------------------------------------------------
    @router.get("/api/pixora/team")
    async def list_team(admin: dict = Depends(require_admin)):
        rows = await db.pixora_team.find({"studio_id": admin["admin_id"]}, {"_id": 0}).to_list(100)
        return {"team": rows}

    @router.post("/api/pixora/team")
    async def add_team_member(payload: TeamMemberIn, admin: dict = Depends(require_admin)):
        doc = {"id": f"tm_{uuid.uuid4().hex[:12]}", "studio_id": admin["admin_id"],
               **payload.model_dump(), "created_at": _now()}
        await db.pixora_team.insert_one(doc)
        return {"member": doc}

    @router.delete("/api/pixora/team/{member_id}")
    async def delete_team_member(member_id: str, admin: dict = Depends(require_admin)):
        await db.pixora_team.delete_one({"id": member_id, "studio_id": admin["admin_id"]})
        return {"deleted": True}

    # ---- networking hub (follow graph) ------------------------------------
    @router.post("/api/pixora/follow/{studio_id}")
    async def toggle_follow(studio_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        if studio_id == me:
            raise HTTPException(400, "Can't follow yourself")
        existing = await db.pixora_follows.find_one({"follower": me, "followee": studio_id}, {"_id": 0})
        if existing:
            await db.pixora_follows.delete_one({"follower": me, "followee": studio_id})
            return {"following": False}
        await db.pixora_follows.insert_one({"id": f"flw_{uuid.uuid4().hex[:12]}", "follower": me,
                                            "followee": studio_id, "created_at": _now()})
        await _notify(studio_id, "follow", f"{await _studio_name(me)} started following you.",
                      actor=me, entity_id=me)
        # Following a studio is the strongest taste signal (+30): learn its topics.
        await _write_signal(me, studio_id, "studio", "follow",
                            await _studio_topics(studio_id, {}))
        return {"following": True}

    @router.get("/api/pixora/network")
    async def my_network(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        following = await db.pixora_follows.find({"follower": me}, {"_id": 0}).to_list(1000)
        followers = await db.pixora_follows.find({"followee": me}, {"_id": 0}).to_list(1000)
        return {"following_count": len(following), "followers_count": len(followers),
                "following": [f["followee"] for f in following]}

    # ---- resource marketplace ---------------------------------------------
    @router.get("/api/pixora/marketplace")
    async def list_listings(admin: dict = Depends(require_admin)):
        rows = await db.pixora_listings.find({"status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(200)
        now = _now()
        for r in rows:
            r["seller"] = await _studio_name(r["studio_id"])
            r["rating_avg"] = r.get("rating_avg") or 0
            r["rating_count"] = r.get("rating_count") or 0
            r["is_featured"] = bool(r.get("featured_until") and r.get("featured_until") > now)
        # paid Featured Listings surface first (Phase 9 revenue), then newest.
        rows.sort(key=lambda r: (not r["is_featured"],))
        return {"listings": rows, "payments_configured": _payments_configured()}

    @router.post("/api/pixora/marketplace")
    async def create_listing(payload: ListingIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "marketplace_sell")   # Basic+
        # STORAGE LEAK FIX: pixora_listings is counted by storage_accounting, but
        # nothing ever charged it. The bytes stayed `uploaded_pending` forever,
        # silently eating the studio's quota. Same class as the video-post leak.
        size = 0
        for u in (payload.file_url, payload.preview_url):
            if u:
                size += await storage_accounting.consume_upload(db, sid, u)
        doc = {"id": f"lst_{uuid.uuid4().hex[:12]}", "studio_id": sid,
               **payload.model_dump(), "size_bytes": size,
               "status": "active", "sales": 0, "created_at": _now()}
        await db.pixora_listings.insert_one(doc)
        return {"listing": doc}

    @router.post("/api/pixora/marketplace/{listing_id}/buy")
    async def buy_listing(listing_id: str, admin: dict = Depends(require_admin)):
        lst = await db.pixora_listings.find_one({"id": listing_id}, {"_id": 0})
        if not lst:
            raise HTTPException(404, "Listing not found")
        price = int(lst.get("price_inr") or 0)
        buyer = admin["admin_id"]
        # Free resources are delivered immediately.
        if price <= 0:
            await db.pixora_purchases.insert_one({"id": f"buy_{uuid.uuid4().hex[:12]}", "listing_id": listing_id,
                                                  "buyer_id": buyer, "amount_inr": 0, "status": "completed",
                                                  "created_at": _now()})
            await db.pixora_listings.update_one({"id": listing_id}, {"$set": {"sales": lst.get("sales", 0) + 1}})
            return {"status": "purchased", "purchased": True, "file_url": lst.get("file_url")}
        # Paid resources need payment. Integration-ready: without real keys we record
        # a pending order and tell the user checkout isn't configured yet.
        order = {"id": f"buy_{uuid.uuid4().hex[:12]}", "listing_id": listing_id, "buyer_id": buyer,
                 "amount_inr": price, "status": "payment_pending", "created_at": _now()}
        await db.pixora_purchases.insert_one(order)
        if not _payments_configured():
            return {"status": "payment_pending", "purchased": False, "order_id": order["id"],
                    "amount_inr": price, "message": "Payment integration pending configuration."}
        # Keys are configured → checkout can proceed (order creation wires in here).
        return {"status": "payment_ready", "purchased": False, "order_id": order["id"],
                "amount_inr": price, "message": "Proceed to payment to complete your purchase."}

    class _ListingReviewIn(BaseModel):
        rating: int = 5
        text: str = ""

    @router.post("/api/pixora/marketplace/{listing_id}/review")
    async def review_listing(listing_id: str, payload: _ListingReviewIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        lst = await db.pixora_listings.find_one({"id": listing_id}, {"_id": 0})
        if not lst:
            raise HTTPException(404, "Listing not found")
        rating = max(1, min(5, int(payload.rating or 5)))
        # one review per buyer per listing (upsert)
        existing = await db.pixora_listing_reviews.find_one({"listing_id": listing_id, "studio_id": sid}, {"_id": 0})
        if existing:
            await db.pixora_listing_reviews.update_one(
                {"listing_id": listing_id, "studio_id": sid},
                {"$set": {"rating": rating, "text": (payload.text or "").strip()[:600], "updated_at": _now()}})
        else:
            await db.pixora_listing_reviews.insert_one({
                "id": f"lrv_{uuid.uuid4().hex[:12]}", "listing_id": listing_id, "studio_id": sid,
                "rating": rating, "text": (payload.text or "").strip()[:600], "created_at": _now()})
        # recompute aggregate rating on the listing
        revs = await db.pixora_listing_reviews.find({"listing_id": listing_id}, {"_id": 0}).to_list(5000)
        ratings = [int(r.get("rating") or 0) for r in revs if r.get("rating")]
        avg = round(sum(ratings) / len(ratings), 2) if ratings else 0
        await db.pixora_listings.update_one({"id": listing_id},
                                            {"$set": {"rating_avg": avg, "rating_count": len(ratings)}})
        return {"reviewed": True, "rating_avg": avg, "rating_count": len(ratings)}

    @router.get("/api/pixora/marketplace/{listing_id}/reviews")
    async def listing_reviews(listing_id: str, admin: dict = Depends(require_admin)):
        rows = await db.pixora_listing_reviews.find({"listing_id": listing_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
        for r in rows:
            r["author"] = await _studio_name(r["studio_id"])
        ratings = [int(r.get("rating") or 0) for r in rows if r.get("rating")]
        return {"reviews": rows, "rating_avg": round(sum(ratings) / len(ratings), 2) if ratings else 0,
                "rating_count": len(ratings)}

    # ---- Phase 9: marketplace completion (purchases / storefront) ---------
    @router.get("/api/pixora/marketplace/purchases")
    async def my_marketplace_purchases(admin: dict = Depends(require_admin)):
        """Purchased resources + download history for the current studio."""
        sid = admin["admin_id"]
        rows = await db.pixora_purchases.find({"buyer_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(500)
        for r in rows:
            lst = await db.pixora_listings.find_one({"id": r.get("listing_id")}, {"_id": 0}) or {}
            r["title"] = lst.get("title")
            r["kind"] = lst.get("kind")
            r["file_url"] = lst.get("file_url") if (lst.get("price_inr") or 0) <= 0 or r.get("status") == "completed" else None
            r["seller"] = await _studio_name(lst.get("studio_id")) if lst.get("studio_id") else None
        return {"purchases": rows}

    @router.get("/api/pixora/marketplace/creator/{studio_id}")
    async def creator_storefront(studio_id: str, admin: dict = Depends(require_admin)):
        """A creator's storefront — all their active listings + seller summary."""
        rows = await db.pixora_listings.find({"studio_id": studio_id, "status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(200)
        now = _now()
        for r in rows:
            r["rating_avg"] = r.get("rating_avg") or 0
            r["rating_count"] = r.get("rating_count") or 0
            r["is_featured"] = bool(r.get("featured_until") and r.get("featured_until") > now)
        return {"seller": await _studio_name(studio_id), "studio_id": studio_id,
                "listings": rows, "sales_total": sum(int(r.get("sales") or 0) for r in rows)}

    # ---- Phase 9 (Part 7): admin storage + marketplace overviews ----------
    if require_super_admin is not None:
        @router.get("/api/admin/storage/overview")
        async def admin_storage_overview(_s=Depends(require_super_admin)):
            """Platform storage: total bytes + the top consuming studios."""
            by_studio: Dict[str, int] = {}
            for coll in ("portfolio_works", "pixora_posts", "pixora_reels", "pixora_stories", "pixora_listings"):
                for d in await getattr(db, coll).find({}, {"_id": 0}).to_list(100000):
                    sidk = d.get("studio_id")
                    if sidk:
                        by_studio[sidk] = by_studio.get(sidk, 0) + int(d.get("size_bytes") or 0)
            total = sum(by_studio.values())
            top = sorted(by_studio.items(), key=lambda x: -x[1])[:20]
            top_out = []
            for sidk, b in top:
                top_out.append({"studio_id": sidk, "name": await _studio_name(sidk),
                                "used_mb": round(b / (1024 * 1024), 1)})
            return {"total_used_gb": round(total / (1024 ** 3), 2),
                    "studios_with_media": len(by_studio), "top_consumers": top_out}

        @router.get("/api/admin/marketplace/activity")
        async def admin_marketplace_activity(_s=Depends(require_super_admin)):
            listings = await db.pixora_listings.count_documents({"status": "active"})
            purchases = await db.pixora_purchases.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
            gross = sum(int(p.get("amount_inr") or 0) for p in purchases if p.get("status") == "completed")
            recent = purchases[:50]
            for r in recent:
                r["buyer"] = await _studio_name(r.get("buyer_id")) if r.get("buyer_id") else None
            return {"active_listings": listings, "total_purchases": len(purchases),
                    "marketplace_gross_inr": gross, "recent": recent,
                    "payments_configured": _payments_configured()}

    # ---- Phase 6: global search (photographers/posts/resources/vendors/learning)
    @router.get("/api/pixora/search")
    async def global_search(q: str = "", limit: int = 10, admin: dict = Depends(require_admin)):
        ql = (q or "").strip().lower()
        empty = {"photographers": [], "posts": [], "resources": [], "vendors": [], "learning": []}
        if not ql:
            return {"query": q, "results": empty, "counts": {k: 0 for k in empty}, "total": 0}
        cap = max(1, min(int(limit or 10), 25))

        photographers, seen = [], set()
        profs = await db.portfolio_profiles.find({}, {"_id": 0}).to_list(5000)
        for p in profs:
            if p.get("is_demo"):
                continue
            loc = p.get("location") or {}
            hay = " ".join(str(x) for x in [p.get("studio_name"), p.get("slug"), loc.get("city"),
                  loc.get("state"), " ".join(p.get("services") or []), " ".join(p.get("styles") or [])]).lower()
            if ql in hay:
                pid = p.get("id")
                if pid and pid not in seen:
                    seen.add(pid)
                    photographers.append({"id": pid, "name": p.get("studio_name") or "Studio",
                                          "slug": p.get("slug"), "city": loc.get("city"),
                                          "url": f"/p/{p.get('slug') or pid}"})
        if len(photographers) < cap:
            for a in await db.admins.find({}, {"_id": 0}).to_list(5000):
                aid = a.get("id") or a.get("admin_id")
                if not aid or aid in seen:
                    continue
                if ql in " ".join(str(x) for x in [a.get("name"), a.get("studio_name"), a.get("username")]).lower():
                    seen.add(aid)
                    photographers.append({"id": aid, "name": a.get("studio_name") or a.get("name") or "Studio",
                                          "slug": None, "city": None, "url": f"/p/{aid}"})

        posts = await db.pixora_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(3000)
        post_hits = [{"id": p["id"], "title": p.get("title"), "kind": p.get("kind"), "studio_id": p.get("studio_id")}
                     for p in posts if ql in (str(p.get("title", "")) + " " + str(p.get("body", ""))).lower()]
        for h in post_hits[:cap]:
            h["author"] = await _studio_name(h["studio_id"])

        listings = await db.pixora_listings.find({"status": "active"}, {"_id": 0}).to_list(2000)
        res_hits = [{"id": l["id"], "title": l.get("title"), "kind": l.get("kind"), "price_inr": l.get("price_inr")}
                    for l in listings if ql in (str(l.get("title", "")) + " " + str(l.get("description", "")) + " " + str(l.get("kind", ""))).lower()]

        vendors = await db.pixora_vendors.find({}, {"_id": 0}).to_list(3000)
        ven_hits = [{"id": v["id"], "name": v.get("business_name"), "category": v.get("category")}
                    for v in vendors if ql in (str(v.get("business_name", "")) + " " + str(v.get("category", ""))).lower()]

        learn_hits = [{"id": c["id"], "title": c["title"], "kind": c.get("kind"), "level": c.get("level")}
                      for c in LEARNING_CONTENT if ql in (c["title"] + " " + c.get("summary", "")).lower()]

        results = {"photographers": photographers[:cap], "posts": post_hits[:cap],
                   "resources": res_hits[:cap], "vendors": ven_hits[:cap], "learning": learn_hits[:cap]}
        return {"query": q, "results": results,
                "counts": {k: len(v) for k, v in results.items()},
                "total": sum(len(v) for v in results.values())}

    # ---- Phase 3: community media (reels / stories) + shared storage ------
    # All community media flows through the SAME portfolio-storage pool
    # (storage_accounting). Free members can't upload (Basic+ via `photo_post`);
    # reels & stories are Premium. Every upload is quota-checked before it's written.
    @router.post("/api/pixora/media/upload")
    async def upload_community_media(file: UploadFile = File(...),
                                     admin: dict = Depends(require_admin)):
        """Upload one community photo/video. Basic+ (Free members cannot upload).
        Quota-checked against the shared storage pool. Returns {url, size_bytes, kind}."""
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "photo_post")   # Free cannot upload media
        if not storage_accounting.allow_upload(sid, _UPLOAD_RATE_PER_MIN):
            raise HTTPException(429, "Too many uploads — please wait a minute and try again.")
        name = (file.filename or "").strip()
        ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
        if ext in _IMAGE_EXTS:
            kind, cap = "image", _UPLOAD_IMAGE_MAX
        elif ext in _VIDEO_EXTS:
            kind, cap = "video", _UPLOAD_VIDEO_MAX
        else:
            raise HTTPException(400, f"Unsupported file type '{ext or name}'.")
        data = await file.read()
        size = len(data)
        if size == 0:
            raise HTTPException(400, "That file is empty.")
        if size > cap:
            raise HTTPException(413, f"{kind.title()} is too large ({size // (1024*1024)} MB). "
                                     f"Max {cap // (1024*1024)} MB.")
        # MIME + magic-byte validation (a renamed exe/script/archive is rejected)
        err = _looks_like_media(kind, file.content_type, data[:16])
        if err:
            raise HTTPException(400, err)
        # shared-pool quota check BEFORE writing (counts committed + pending uploads)
        await storage_accounting.ensure_can_store(db, sid, size)
        out_dir = COMMUNITY_MEDIA_DIR / sid
        try:
            fname = f"{uuid.uuid4().hex[:16]}{ext}"
            # Off the event loop: writing a 100-200 MB reel synchronously here
            # blocked the whole single-threaded server for the duration of the
            # write — the upload AND every other in-flight request crawled.
            def _write():
                out_dir.mkdir(parents=True, exist_ok=True)
                (out_dir / fname).write_bytes(data)
            await asyncio.to_thread(_write)
        except Exception as e:
            logger.exception("community media write failed")
            raise HTTPException(500, f"Could not save the file: {e}")
        url = f"/api/uploads/community/{sid}/{fname}"
        # record the REAL size server-side so create endpoints can't be lied to
        await storage_accounting.register_upload(db, sid, url, size, kind=kind,
                                                 filename=name, disk_path=str(out_dir / fname), area="community")
        # best-effort mirror into the multi-drive storage pool (flag-gated, never fails upload)
        try:
            from storage_pool_hooks import mirror_upload
            mirror_upload(db, photographer_id=sid, area="community",
                          filename=name or fname, data=data,
                          content_type=file.content_type or "application/octet-stream",
                          source_ref={"kind": "disk", "path": str(out_dir / fname)})
        except Exception:
            pass
        return {"url": url, "kind": kind, "size_bytes": size, "filename": name}

    class _ReelIn(BaseModel):
        url: str = Field(min_length=1)
        thumbnail_url: Optional[str] = None
        caption: str = ""
        size_bytes: int = 0
        # Optional classification — powers the adaptive Reels feed. Old reels without
        # it still get topics from caption hashtags + the studio's specialties.
        category: Optional[str] = None
        tags: List[str] = Field(default_factory=list)
        # C4 — tag people/studios/products in a reel (same shape as posts).
        mentions: List[Dict[str, Any]] = Field(default_factory=list)

    @router.post("/api/pixora/reels")
    async def create_reel(payload: _ReelIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "reels")   # Premium
        # server-authoritative size from the upload registry (quota already enforced at upload)
        size = await storage_accounting.consume_upload(db, sid, payload.url)
        doc = {"id": f"reel_{uuid.uuid4().hex[:14]}", "studio_id": sid,
               "url": payload.url, "thumbnail_url": payload.thumbnail_url,
               "caption": (payload.caption or "").strip()[:400],
               "category": (norm_topic(payload.category) or None),
               "tags": [t for t in (norm_topic(x) for x in (payload.tags or [])) if t][:10],
               "mentions": clean_mentions(payload.mentions),
               "size_bytes": size, "kind": "video",
               "likes": [], "views": 0, "created_at": _now()}
        await db.pixora_reels.insert_one(doc)
        await _bump_hashtags(hashtags_from(doc))
        return {"reel": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/reels")
    async def list_reels(limit: int = 50, admin: dict = Depends(require_admin)):
        rows = await db.pixora_reels.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
        for r in rows:
            r["author"] = await _studio_name(r["studio_id"])
            r["like_count"] = len(r.get("likes", []))
        return {"reels": rows}

    @router.delete("/api/pixora/reels/{reel_id}")
    async def delete_reel(reel_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        r = await db.pixora_reels.find_one({"id": reel_id}, {"_id": 0})
        if r and r.get("studio_id") != sid:
            raise HTTPException(403, "You can only delete your own reel")
        await db.pixora_reels.delete_one({"id": reel_id, "studio_id": sid})
        if r and r.get("url"):
            await storage_accounting.release_media(db, sid, r.get("url"))   # reclaim file
        return {"deleted": True}

    class _StoryIn(BaseModel):
        url: str = ""                       # required for photo/video, empty for text/poll
        caption: str = ""
        size_bytes: int = 0
        # C4 — story types. photo|video use `url`; text renders `text`+`bg`; poll
        # renders `question`+`options` and collects votes.
        type: str = "photo"                 # photo | video | text | poll
        text: str = ""                      # text stories
        bg: str = ""                        # text/poll background (hex or preset name)
        question: str = ""                  # poll
        options: List[str] = Field(default_factory=list)  # poll (2-4)

    _STORY_TYPES = {"photo", "video", "text", "poll"}

    @router.post("/api/pixora/stories")
    async def create_story(payload: _StoryIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "stories")   # Premium
        stype = (payload.type or "photo").strip().lower()
        if stype not in _STORY_TYPES:
            raise HTTPException(400, f"Unknown story type '{stype}'.")
        now = datetime.now(timezone.utc)
        doc: Dict[str, Any] = {
            "id": f"story_{uuid.uuid4().hex[:14]}", "studio_id": sid, "type": stype,
            "caption": (payload.caption or "").strip()[:280],
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=24)).isoformat()}
        if stype in ("photo", "video"):
            if not payload.url:
                raise HTTPException(400, "A photo/video story needs a media url.")
            # server-authoritative size from the upload registry (quota already enforced)
            doc["url"] = payload.url
            doc["size_bytes"] = await storage_accounting.consume_upload(db, sid, payload.url)
        elif stype == "text":
            if not payload.text.strip():
                raise HTTPException(400, "A text story needs text.")
            doc.update({"url": "", "size_bytes": 0,
                        "text": payload.text.strip()[:280],
                        "bg": (payload.bg or "").strip()[:32]})
        else:  # poll
            opts = [o.strip()[:60] for o in (payload.options or []) if o and o.strip()][:4]
            if not payload.question.strip() or len(opts) < 2:
                raise HTTPException(400, "A poll needs a question and at least 2 options.")
            doc.update({"url": "", "size_bytes": 0,
                        "question": payload.question.strip()[:140], "options": opts,
                        "bg": (payload.bg or "").strip()[:32],
                        "votes": {str(i): 0 for i in range(len(opts))}, "voters": []})
        await db.pixora_stories.insert_one(doc)
        return {"story": {k: v for k, v in doc.items() if k != "_id"}}

    class _StoryVoteIn(BaseModel):
        option: int = 0

    @router.post("/api/public/pixora/stories/{story_id}/vote")
    async def vote_story_poll(story_id: str, payload: _StoryVoteIn, request: Request):
        """Public poll vote — one per actor (signed-in) or per anonymous session token.
        Honest counts only; a second vote from the same voter is rejected, not double-counted."""
        story = await db.pixora_stories.find_one({"id": story_id}, {"_id": 0})
        if not story or story.get("type") != "poll":
            raise HTTPException(404, "Poll not found")
        if (story.get("expires_at") or "") <= _now():
            raise HTTPException(410, "This poll has ended")
        options = story.get("options") or []
        idx = int(payload.option)
        if idx < 0 or idx >= len(options):
            raise HTTPException(400, "Invalid option")
        actor = await _resolve_actor(request)
        voter = (actor or {}).get("id") or request.cookies.get("user_session_token") \
            or (request.client.host if request.client else "anon")
        voters = story.get("voters") or []
        if voter in voters:
            raise HTTPException(409, "You have already voted")
        votes = story.get("votes") or {str(i): 0 for i in range(len(options))}
        votes[str(idx)] = int(votes.get(str(idx), 0)) + 1
        voters.append(voter)
        await db.pixora_stories.update_one({"id": story_id},
                                           {"$set": {"votes": votes, "voters": voters}})
        total = sum(int(v) for v in votes.values())
        return {"ok": True, "votes": votes, "total": total, "options": options}

    @router.get("/api/pixora/stories")
    async def list_stories(admin: dict = Depends(require_admin)):
        # opportunistic cleanup of lapsed stories (frees quota + reclaims files), then
        # return only the non-expired ones, newest first.
        try:
            await storage_accounting.purge_expired_stories(db)
        except Exception:
            pass
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = await db.pixora_stories.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        active = [s for s in rows if (s.get("expires_at") or "") > now_iso]
        for s in active:
            s["author"] = await _studio_name(s["studio_id"])
        return {"stories": active}

    @router.delete("/api/pixora/stories/{story_id}")
    async def delete_story(story_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        s = await db.pixora_stories.find_one({"id": story_id}, {"_id": 0})
        if s and s.get("studio_id") != sid:
            raise HTTPException(403, "You can only delete your own story")
        await db.pixora_stories.delete_one({"id": story_id, "studio_id": sid})
        if s and s.get("url"):
            await storage_accounting.release_media(db, sid, s.get("url"))
        return {"deleted": True}

    @router.get("/api/pixora/storage")
    async def my_storage(admin: dict = Depends(require_admin)):
        """Shared storage usage for the meter (portfolio + all community media)."""
        return await storage_accounting.usage_summary(db, admin["admin_id"])

    # ---- Phase 4: PUBLIC unified profile at /p/<username> -----------------
    # username == the studio's portfolio slug (every photographer auto-gets one).
    # View-only: portfolio + community. Interaction endpoints (like/comment/follow)
    # stay behind require_admin, so a logged-out visitor physically cannot act —
    # the auth boundary is enforced server-side, the frontend only prompts to log in.
    @router.get("/api/public/p/{username}")
    async def public_pixora_profile(username: str):
        from portfolio_service import (_resolve_studio, _merge_defaults,
                                        _ensure_slug, _portfolio_tier)
        sid, raw = await _resolve_studio(db, username)
        admin = await db.admins.find_one({"id": sid}, {"_id": 0})
        if not raw and not admin:
            raise HTTPException(404, "Photographer not found")
        # Privacy: a studio that explicitly unpublished its profile is not shown publicly.
        # (Absent/None is treated as public for backward compatibility with legacy rows.)
        if (raw or {}).get("is_published") is False:
            raise HTTPException(404, "This profile is not public.")
        profile = _merge_defaults(raw)
        if admin and not (raw or {}).get("studio_name"):
            profile["studio_name"] = admin.get("name") or profile["studio_name"]
        slug = await _ensure_slug(db, sid, raw)

        # Never surface drafts/hidden items publicly.
        def _public(d):
            return d.get("is_published") is not False and d.get("draft") is not True \
                and d.get("status") not in ("draft", "hidden", "archived")

        works = [w for w in await db.portfolio_works.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200) if _public(w)]
        featured = [w for w in works if w.get("featured")] or works[:6]
        posts = await db.pixora_posts.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(60)
        pub_posts = [p for p in posts if p.get("image_url") and _public(p)]
        reels = [r for r in await db.pixora_reels.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(60) if _public(r)]
        owned = {a["key"] for a in await db.pixora_achievements.find({"studio_id": sid}, {"_id": 0}).to_list(100)}
        awards = [{"key": a["key"], "label": a["label"], "icon": a["icon"], "desc": a["desc"]}
                  for a in ACHIEVEMENTS if a["key"] in owned]
        verification = await _verification_of(sid)
        followers = await db.pixora_follows.count_documents({"followee": sid})
        following = await db.pixora_follows.count_documents({"follower": sid})
        return {
            "studio": {"id": sid, "slug": slug, "username": slug,
                       "name": profile.get("studio_name"),
                       "avatar": profile.get("avatar"), "hero_image": profile.get("hero_image"),
                       "verified": verification.get("verified"),
                       "verified_level": verification.get("level"),
                       "verified_label": verification.get("level_label")},
            "bio": profile.get("about"),
            "tier": await _portfolio_tier(db, sid),
            "profile": profile,
            "works": works, "featured": featured,
            "posts": pub_posts, "reels": reels,
            "awards": awards, "certifications": profile.get("certifications") or [],
            "followers_count": followers, "following_count": following,
            "counts": {"works": len(works), "posts": len(pub_posts), "reels": len(reels),
                       "followers": followers, "following": following},
            "portfolio_path": f"/photographer/{slug}/portfolio",
        }

    # ---- HIGH-1: PUBLIC community discovery (no login) --------------------
    # Visitors may VIEW the feed and search photographers. All interaction
    # endpoints (like/comment/follow/save) stay behind require_admin, so viewing
    # is the only thing a logged-out visitor can do here.
    def _public_item(d):
        return d.get("is_published") is not False and d.get("draft") is not True \
            and d.get("status") not in ("draft", "hidden", "archived")

    async def _public_post_card(p: Dict[str, Any], cards: Dict[str, Any]) -> Dict[str, Any]:
        """One feed item, with the photographer's byline attached (cached per studio
        so a 30-post feed does not issue 30 profile lookups)."""
        sid = p.get("studio_id")
        if sid not in cards:
            cards[sid] = await _author_card(sid)
        a = cards[sid]
        return {
            "id": p["id"], "kind": p.get("kind"), "title": p.get("title"),
            "body": p.get("body"), "image_url": p.get("image_url"),
            "video_url": p.get("video_url"), "tags": p.get("tags") or [],
            "category": p.get("category"), "location": p.get("location"),
            "camera": p.get("camera"), "lens": p.get("lens"),
            "images": p.get("images") or [],
            "studio_id": sid,
            "author": a["name"], "author_avatar": a["avatar"], "author_city": a["city"],
            "author_slug": a["slug"], "author_url": a["profile_url"],
            "like_count": len(p.get("likes", [])),
            "comment_count": await db.pixora_comments.count_documents({"post_id": p["id"]}),
            # Phase 1 engagement counters — also the ranking formula's inputs.
            "save_count": await db.pixora_saves.count_documents({"post_id": p["id"]}),
            "share_count": await db.pixora_shares.count_documents({"post_id": p["id"]}),
            "view_count": int(p.get("views") or 0),
            "created_at": p.get("created_at"),
        }

    @router.get("/api/public/pixora/feed")
    async def public_feed(request: Request, limit: int = 30, kind: str = ""):
        """Public, read-only feed. `kind=reel` returns only reels (the Reels tab),
        `kind=post` everything else. Interaction stays auth-gated.

        A signed-in viewer (photographer or couple) also gets `viewer_liked` per
        item so the heart renders in the right state instead of always empty."""
        viewer = await _resolve_actor(request)
        viewer_id = viewer["id"] if viewer else None
        posts = await db.pixora_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
        # Reels published from the studio Reels tab live in their OWN collection
        # (POST /api/pixora/reels -> db.pixora_reels), which this feed never read.
        # Every such reel was therefore invisible on the home page and in the
        # public Reels tab. Normalise them into the post shape and merge.
        reels = await db.pixora_reels.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
        for r in reels:
            posts.append({**r, "kind": "reel",
                          "video_url": r.get("video_url") or r.get("url"),
                          "image_url": r.get("cover_url") or r.get("thumbnail_url"),
                          # a reel carries `caption`; the card renders title/body
                          "title": r.get("title") or "",
                          "body": r.get("body") or r.get("caption") or "",
                          "likes": r.get("likes") or []})
        posts.sort(key=lambda p: p.get("created_at") or "", reverse=True)
        out, cards = [], {}
        want = (kind or "").strip().lower()
        for p in posts:
            if not _public_item(p):
                continue
            is_reel = (p.get("kind") == "reel") or bool(p.get("video_url"))
            if want == "reel" and not is_reel:
                continue
            if want == "post" and is_reel:
                continue
            card = await _public_post_card(p, cards)
            card["viewer_liked"] = bool(viewer_id and viewer_id in (p.get("likes") or []))
            card["viewer_saved"] = bool(viewer_id and await db.pixora_saves.find_one(
                {"actor_id": viewer_id, "post_id": p["id"]}, {"_id": 0}))
            out.append(card)
            if len(out) >= min(limit, 100):
                break
        return {"posts": out, "auth_required_to_interact": True,
                "viewer": {"signed_in": bool(viewer_id),
                           "type": viewer["type"] if viewer else None}}

    # NOTE: a photographer's public page (portfolio + posts + reels) already exists at
    # GET /api/public/p/{username}, rendered by PixoraPublicProfile at /p/:username.
    # The feed's `author_url` points there rather than duplicating that surface here.

    # ---- Phase 4/5: Following, Trending, Discover -------------------------
    # Ranking uses the spec weights. Saves and Shares only became countable in
    # Phase 1, so this is the first point at which the formula can be honoured.
    RANK_W = {"like": 1, "comment": 3, "save": 5, "share": 7, "view": 2}

    async def _engagement_score(post_id: str, likes: int) -> int:
        return (likes * RANK_W["like"]
                + await db.pixora_comments.count_documents({"post_id": post_id}) * RANK_W["comment"]
                + await db.pixora_saves.count_documents({"post_id": post_id}) * RANK_W["save"]
                + await db.pixora_shares.count_documents({"post_id": post_id}) * RANK_W["share"])

    async def _all_items(limit_each: int = 300):
        """Posts + Reels-tab reels as one list, newest first - the same union the
        public feed builds, reused so the tabs can never disagree about what exists."""
        posts = await db.pixora_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit_each)
        reels = await db.pixora_reels.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit_each)
        for r in reels:
            posts.append({**r, "kind": "reel",
                          "video_url": r.get("video_url") or r.get("url"),
                          "image_url": r.get("cover_url") or r.get("thumbnail_url"),
                          "title": r.get("title") or "",
                          "body": r.get("body") or r.get("caption") or "",
                          "likes": r.get("likes") or []})
        posts.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return [p for p in posts if _public_item(p)]

    @router.get("/api/pixora/following")
    async def following_feed(limit: int = 50, actor: dict = Depends(require_actor)):
        """Only studios this actor follows. The follow graph already existed; there
        was simply never a query that used it for a feed."""
        me = actor["id"]
        follows = await db.pixora_follows.find({"follower": me}, {"_id": 0}).to_list(2000)
        followee_ids = {f["followee"] for f in follows}
        if not followee_ids:
            return {"posts": [], "following_count": 0}
        cards, out = {}, []
        for p in await _all_items():
            if p.get("studio_id") not in followee_ids:
                continue
            card = await _public_post_card(p, cards)
            card["viewer_liked"] = me in (p.get("likes") or [])
            card["viewer_saved"] = bool(await db.pixora_saves.find_one(
                {"actor_id": me, "post_id": p["id"]}, {"_id": 0}))
            out.append(card)
            if len(out) >= min(limit, 100):
                break
        return {"posts": out, "following_count": len(followee_ids)}

    @router.get("/api/pixora/trending")
    async def trending(request: Request, window: str = "7d", limit: int = 30):
        """Spec time windows. Public: trending is a discovery surface, and gating
        it behind login would defeat the point."""
        hours = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30, "all": None}.get(
            (window or "7d").lower(), 24 * 7)
        cutoff = None
        if hours:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        viewer = await _resolve_actor(request)
        vid = viewer["id"] if viewer else None
        cards, scored = {}, []
        for p in await _all_items():
            if cutoff and (p.get("created_at") or "") < cutoff:
                continue
            score = await _engagement_score(p["id"], len(p.get("likes") or []))
            score += int(p.get("views") or 0) * RANK_W["view"]
            scored.append((score, p))
        scored.sort(key=lambda t: t[0], reverse=True)
        out = []
        for score, p in scored[:min(limit, 100)]:
            card = await _public_post_card(p, cards)
            card["trend_score"] = score
            card["viewer_liked"] = bool(vid and vid in (p.get("likes") or []))
            card["viewer_saved"] = bool(vid and await db.pixora_saves.find_one(
                {"actor_id": vid, "post_id": p["id"]}, {"_id": 0}))
            out.append(card)
        return {"posts": out, "window": (window or "7d").lower(), "weights": RANK_W}

    # ---- Adaptive Reels feed (interest-personalised, Instagram-style) --------
    # Uses the pure ranking helpers at module top (norm_topic / reel_topics_from /
    # score_reel / merge_interests). This layer adds the db lookups: the studio's
    # topics, the signed-in viewer's stored interest vector, and engagement counts.
    async def _studio_topics(sid: str, cache: Dict[str, set]) -> set:
        """Topics implied by WHO made a reel — the studio's services/styles/specialties.
        `cache` is REQUEST-scoped (like the byline cache) so one feed doesn't re-query
        the same profile 30 times, yet a studio editing its services is reflected on the
        very next request rather than being pinned for the life of the process."""
        if sid in cache:
            return cache[sid]
        pr = await db.portfolio_profiles.find_one({"admin_id": sid}, {"_id": 0}) \
            or await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        toks = set()
        for key in ("services", "styles", "specialties"):
            for x in (pr.get(key) or []):
                n = norm_topic(x)
                if n:
                    toks.add(n)
        cat = norm_topic(pr.get("category"))
        if cat:
            toks.add(cat)
        cache[sid] = toks
        return toks

    async def _reel_topics(reel: Dict[str, Any], cache: Dict[str, set]) -> set:
        return reel_topics_from(reel, await _studio_topics(reel.get("studio_id"), cache))

    async def _content_topics(item: Dict[str, Any], cache: Dict[str, set]) -> set:
        """Universal topics for a post OR reel (C1-Foundation): item topics + gear +
        the studio's topics. Used by the For You engine and signal learning."""
        return content_topics_from(item, await _studio_topics(item.get("studio_id"), cache))

    async def _load_interests(actor: Optional[Dict[str, Any]]) -> Dict[str, float]:
        """Read the actor's ONE interest vector. C3 generalised the reels-only store
        into db.pixora_interests; the old db.pixora_reel_interests is read as a fallback
        so vectors built before the generalisation still personalise the feed."""
        if not actor:
            return {}
        doc = await db.pixora_interests.find_one({"actor_id": actor["id"]}, {"_id": 0})
        if not doc:
            doc = await db.pixora_reel_interests.find_one({"actor_id": actor["id"]}, {"_id": 0})
        return clean_interests((doc or {}).get("interests"))

    async def _save_interests(actor: Optional[Dict[str, Any]], vec: Dict[str, float]) -> None:
        if not actor or not vec:
            return
        await db.pixora_interests.update_one(
            {"actor_id": actor["id"]},
            {"$set": {"actor_id": actor["id"], "interests": vec, "updated_at": _now()}},
            upsert=True)

    async def _write_signal(actor_id: Optional[str], target_id: str, target_type: str,
                            event: str, topics: Any = ()) -> None:
        """The single write that powers C3 (interest learning), C5 (analytics) and
        C6/novelty (already-engaged dedupe). Best-effort: an interaction must never
        fail because logging a signal did. Anonymous events are logged (for analytics)
        but only a signed-in actor's interest vector is sharpened."""
        toks = {norm_topic(t) for t in (topics or ())}
        toks.discard("")
        try:
            await db.pixora_signals.insert_one({
                "id": f"sig_{uuid.uuid4().hex[:12]}", "actor_id": actor_id,
                "target_id": target_id, "target_type": target_type, "event": event,
                "weight": SIGNAL_W.get(event, 1), "topics": sorted(toks),
                "created_at": _now()})
        except Exception:
            logger.warning("[pixora] signal write failed", exc_info=True)
        if actor_id and toks:
            try:
                vec = await _load_interests({"id": actor_id})
                await _save_interests({"id": actor_id},
                                      apply_signal_to_interests(vec, toks, event))
            except Exception:
                logger.warning("[pixora] interest update failed", exc_info=True)

    async def _signal_topics_for(post: Dict[str, Any]) -> set:
        """Topics of a post/reel for signal learning (request-scoped studio cache)."""
        try:
            return await _content_topics(post, {})
        except Exception:
            return content_topics_from(post)

    async def _bump_hashtags(tags: List[str]) -> None:
        """Increment the usage counter for each tag (C2 hashtag index). Best-effort;
        the hashtag pages can also compute from posts, so a miss here is not fatal."""
        for t in tags:
            try:
                existing = await db.pixora_hashtags.find_one({"tag": t}, {"_id": 0})
                if existing:
                    await db.pixora_hashtags.update_one(
                        {"tag": t}, {"$set": {"uses": int(existing.get("uses") or 0) + 1,
                                              "last_used": _now()}})
                else:
                    await db.pixora_hashtags.insert_one(
                        {"tag": t, "uses": 1, "last_used": _now()})
            except Exception:
                logger.warning("[pixora] hashtag bump failed", exc_info=True)

    class _ReelFeedIn(BaseModel):
        # Accept Any and defer to clean_interests() (the real trust boundary, which
        # returns {} for a non-dict). The browser sends `interests: []` for "no
        # vector"; a strict Dict type 422'd that before sanitising ever ran.
        interests: Any = Field(default_factory=dict)
        exclude: List[str] = Field(default_factory=list, max_length=500)   # reel ids seen this session
        limit: int = Field(default=12, ge=1, le=50)
        pin: Optional[str] = Field(default=None, max_length=64)    # a specific reel to lead with

    @router.post("/api/public/pixora/reels/feed")
    async def public_reels_feed(payload: _ReelFeedIn, request: Request):
        """The adaptive Reels feed a couple scrolls full-screen. The body carries the
        viewer's browser-local interest vector (so it works with NO login); a signed-in
        viewer's server-stored vector is blended in. Each returned reel includes its
        `topics` so the client can sharpen the local vector as the viewer watches."""
        viewer = await _resolve_actor(request)
        vid = viewer["id"] if viewer else None
        interests = merge_interests(await _load_interests(viewer),
                                    clean_interests(payload.interests))
        exclude = set(payload.exclude or [])
        limit = max(1, min(int(payload.limit or 12), 30))
        now = datetime.now(timezone.utc)
        stopic_cache: Dict[str, set] = {}      # request-scoped studio→topics cache
        scored = []
        for p in await _all_items():
            is_reel = (p.get("kind") == "reel") or bool(p.get("video_url"))
            if not is_reel:
                continue
            if vid and p.get("studio_id") == vid:
                continue  # never feed a studio its own reels
            topics = await _reel_topics(p, stopic_cache)
            engagement = await _engagement_score(p["id"], len(p.get("likes") or []))
            engagement += int(p.get("views") or 0) * RANK_W["view"]
            s = score_reel(interests, topics, engagement, p.get("created_at"), now)
            scored.append((s, p, sorted(topics)))
        scored.sort(key=lambda t: t[0], reverse=True)
        # Prefer unseen reels; if the viewer has seen them all, allow repeats so the
        # player never dead-ends — a couple can keep scrolling.
        fresh = [t for t in scored if t[1]["id"] not in exclude]
        pool = fresh if fresh else scored
        cards, out = {}, []

        async def _card(p, topics):
            card = await _public_post_card(p, cards)
            card["topics"] = topics
            card["viewer_liked"] = bool(vid and vid in (p.get("likes") or []))
            card["viewer_saved"] = bool(vid and await db.pixora_saves.find_one(
                {"actor_id": vid, "post_id": p["id"]}, {"_id": 0}))
            return card

        for s, p, topics in pool[:limit]:
            out.append(await _card(p, topics))
        # Deep-link: if a specific reel was tapped, make sure it LEADS the feed even if
        # ranking/exclude would have placed it lower or off this page.
        if payload.pin and (not out or out[0]["id"] != payload.pin):
            pinned = next((t for t in scored if t[1]["id"] == payload.pin), None)
            if pinned:
                out = [c for c in out if c["id"] != payload.pin]
                out.insert(0, await _card(pinned[1], pinned[2]))
        return {"reels": out, "personalized": bool(interests),
                "count": len(out), "viewer": {"signed_in": bool(vid)}}

    class _ReelSignalIn(BaseModel):
        event: str = "view"          # view | watch | like | skip
        topics: List[str] = Field(default_factory=list)

    @router.post("/api/public/pixora/reels/{reel_id}/view")
    async def public_reel_view(reel_id: str, payload: _ReelSignalIn, request: Request):
        """Count a view and — for a SIGNED-IN viewer — sharpen their stored interest by
        the reel's topics. Logged-out viewers update their own local vector client-side
        (the feed already returns each reel's `topics`), so this call is optional for
        them and never required to make the algorithm work."""
        reel, coll = await _find_likeable(reel_id)
        if not reel:
            raise HTTPException(404, "Reel not found")
        new_views = int(reel.get("views") or 0) + 1
        try:
            await coll.update_one({"id": reel_id}, {"$set": {"views": new_views}})
        except Exception:
            logger.warning("[pixora] reel view count update failed", exc_info=True)
        viewer = await _resolve_actor(request)
        if viewer and payload.event in ("view", "watch", "like"):
            topics = {norm_topic(t) for t in (payload.topics or []) if norm_topic(t)} \
                or await _reel_topics(reel, {})
            bump = INTEREST_BUMP * (2.0 if payload.event == "like" else 1.0)
            vec = await _load_interests(viewer)
            for t in topics:
                vec[t] = min(INTEREST_MAX, vec.get(t, 0.0) + bump)
            await _save_interests(viewer, vec)
        return {"ok": True, "view_count": new_views}

    @router.get("/api/public/pixora/stories")
    async def public_stories(limit_groups: int = 40):
        """Active (non-expired) stories for the public Home rail, grouped by photographer
        and ordered most-recent-first. Read-only; tapping a ring opens the story viewer."""
        now_iso = datetime.now(timezone.utc).isoformat()
        rows = await db.pixora_stories.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        cards, out = {}, []
        for sid, stories in group_active_stories(rows, now_iso):
            if sid not in cards:
                cards[sid] = await _author_card(sid)
            a = cards[sid]
            shaped = []
            for s in stories:
                url = s.get("url") or ""
                stype = s.get("type") or ("video" if re.search(
                    r"\.(mp4|mov|webm|m4v|avi)(\?|$)", url, re.I) else "photo")
                item = {"id": s["id"], "type": stype, "url": url,
                        "caption": s.get("caption") or "",
                        "is_video": stype == "video", "created_at": s.get("created_at")}
                if stype == "text":
                    item.update({"text": s.get("text") or "", "bg": s.get("bg") or ""})
                elif stype == "poll":
                    votes = s.get("votes") or {}
                    item.update({"question": s.get("question") or "",
                                 "options": s.get("options") or [], "bg": s.get("bg") or "",
                                 "votes": votes,
                                 "total_votes": sum(int(v) for v in votes.values())})
                shaped.append(item)
            out.append({"studio_id": sid, "name": a["name"], "avatar": a["avatar"],
                        "city": a["city"], "slug": a["slug"], "url": a["profile_url"],
                        "stories": shaped})
            if len(out) >= max(1, min(int(limit_groups or 40), 60)):
                break
        return {"groups": out, "count": len(out)}

    # ======================================================================
    # C2/C3/C6 — For You, Nearby, Hashtags (public, read-only discovery).
    # These reuse _all_items / _public_post_card / _engagement_score / the
    # interest vector, and the pure helpers foryou_score / diversify /
    # nearby_match / interleave_marketplace.
    # ======================================================================
    async def _actor_city(vid: Optional[str]) -> str:
        """The viewer's city for locality/Nearby: a studio's portfolio city, else ''."""
        if not vid:
            return ""
        pr = await db.portfolio_profiles.find_one({"id": vid}, {"_id": 0}) \
            or await db.portfolio_profiles.find_one({"admin_id": vid}, {"_id": 0}) or {}
        return (pr.get("location") or {}).get("city") or ""

    async def _following_ids(vid: Optional[str]) -> set:
        if not vid:
            return set()
        return {f["followee"] for f in
                await db.pixora_follows.find({"follower": vid}, {"_id": 0}).to_list(4000)}

    async def _engaged_ids(vid: Optional[str]) -> set:
        """Targets this actor already interacted with — the novelty penalty input."""
        if not vid:
            return set()
        rows = await db.pixora_signals.find({"actor_id": vid}, {"_id": 0}).to_list(4000)
        return {r.get("target_id") for r in rows if r.get("target_id")}

    async def _marketplace_cards_for(interests: Dict[str, float], vid: Optional[str],
                                     limit: int, scache: Dict[str, set]) -> List[Dict[str, Any]]:
        """Listings ranked by topic match to the viewer, for C6 in-feed injection.
        Excludes the viewer's own listings. Each card is clearly labelled downstream."""
        rows = await db.pixora_listings.find({"status": "active"}, {"_id": 0}) \
            .sort("created_at", -1).to_list(120)
        scored = []
        for r in rows:
            if vid and r.get("studio_id") == vid:
                continue
            stopics = await _studio_topics(r.get("studio_id"), scache)
            ltopics = {norm_topic(r.get("kind"))} | {norm_topic(w) for w in
                      re.split(r"[^a-z0-9]+", str(r.get("title") or "").lower())
                      if len(w) >= 4} | stopics
            ltopics.discard("")
            aff = _affinity01(interests, ltopics)
            scored.append((aff, r))
        scored.sort(key=lambda t: t[0], reverse=True)
        out = []
        for aff, r in scored[:max(0, limit)]:
            out.append({"id": r["id"], "type": "listing", "listing_kind": r.get("kind"),
                        "title": r.get("title"), "price_inr": r.get("price_inr") or 0,
                        "preview_url": r.get("preview_url") or r.get("file_url"),
                        "studio_id": r.get("studio_id"),
                        "seller": await _studio_name(r.get("studio_id")),
                        "label": "From the marketplace", "sponsored": False,
                        "match": round(aff, 3)})
        return out

    @router.get("/api/public/pixora/foryou")
    async def public_foryou(request: Request, limit: int = 24, kind: str = "",
                            marketplace: bool = True):
        """The personalised For You feed — the 40/20/20/10/5/5 blend with a diversity
        guard, and (optionally) labelled marketplace cards interleaved. Works logged-out
        (interest term = 0 → trending-like), sharpens as the viewer engages."""
        viewer = await _resolve_actor(request)
        vid = viewer["id"] if viewer else None
        interests = await _load_interests(viewer)
        following = await _following_ids(vid)
        engaged = await _engaged_ids(vid)
        my_city = await _actor_city(vid)
        now = datetime.now(timezone.utc)
        want = (kind or "").strip().lower()
        scache: Dict[str, set] = {}
        city_cache: Dict[str, str] = {}
        scored = []
        for p in await _all_items():
            is_reel = (p.get("kind") == "reel") or bool(p.get("video_url"))
            if want == "reel" and not is_reel:
                continue
            if want == "post" and is_reel:
                continue
            if vid and p.get("studio_id") == vid:
                continue  # don't feed a studio its own content
            topics = await _content_topics(p, scache)
            engagement = await _engagement_score(p["id"], len(p.get("likes") or []))
            engagement += int(p.get("views") or 0) * RANK_W["view"]
            sid = p.get("studio_id")
            if sid not in city_cache:
                city_cache[sid] = (await _author_card(sid)).get("city") or ""
            same_city = bool(my_city and nearby_match(
                city_cache[sid], p.get("location") or "", my_city))
            s = foryou_score(interests, topics, engagement, p.get("created_at"),
                             sid in following, same_city, p["id"] in engaged, now)
            scored.append((s, p, sorted(topics)))
        scored.sort(key=lambda t: t[0], reverse=True)
        cap = min(max(1, int(limit or 24)), 60)
        cards, out = {}, []
        for s, p, topics in scored[: cap * 2]:
            card = await _public_post_card(p, cards)
            card["topics"] = topics
            card["type"] = "reel" if ((p.get("kind") == "reel") or p.get("video_url")) else "post"
            card["viewer_liked"] = bool(vid and vid in (p.get("likes") or []))
            card["viewer_saved"] = bool(vid and await db.pixora_saves.find_one(
                {"actor_id": vid, "post_id": p["id"]}, {"_id": 0}))
            out.append(card)
        out = diversify(out)[:cap]
        # C6 — interleave labelled marketplace cards (honest, clearly marked).
        if marketplace:
            listings = await _marketplace_cards_for(interests, vid, max(2, cap // 6), scache)
            out = interleave_marketplace(out, listings, every=6)
        return {"feed": out, "count": len(out),
                "personalized": bool(interests),
                "viewer": {"signed_in": bool(vid), "city": my_city}}

    @router.get("/api/public/pixora/nearby")
    async def public_nearby(request: Request, city: str = "", limit: int = 30):
        """Nearby feed — honest, city-based. Priority: explicit ?city=, else the
        signed-in viewer's own city. With neither, returns needs_city so the UI can
        prompt (never silent geolocation, never faked)."""
        viewer = await _resolve_actor(request)
        vid = viewer["id"] if viewer else None
        use_city = (city or "").strip() or await _actor_city(vid)
        if not use_city:
            return {"feed": [], "needs_city": True,
                    "cities": await _cities_with_content()}
        interests = await _load_interests(viewer)
        following = await _following_ids(vid)
        engaged = await _engaged_ids(vid)
        now = datetime.now(timezone.utc)
        scache: Dict[str, set] = {}
        cards, scored = {}, []
        for p in await _all_items():
            author = await _author_card(p.get("studio_id"))  # cached inside cards via _public_post_card
            if not nearby_match(author.get("city") or "", p.get("location") or "", use_city):
                continue
            topics = await _content_topics(p, scache)
            engagement = await _engagement_score(p["id"], len(p.get("likes") or []))
            s = foryou_score(interests, topics, engagement, p.get("created_at"),
                             p.get("studio_id") in following, True, p["id"] in engaged, now)
            scored.append((s, p, sorted(topics)))
        scored.sort(key=lambda t: t[0], reverse=True)
        out = []
        for s, p, topics in scored[: min(max(1, int(limit or 30)), 60)]:
            card = await _public_post_card(p, cards)
            card["topics"] = topics
            card["near"] = use_city
            out.append(card)
        return {"feed": diversify(out), "count": len(out), "city": use_city}

    async def _cities_with_content() -> List[str]:
        """Distinct studio cities that actually have published content — the Nearby
        picker only offers cities that will return something."""
        seen, cities = set(), []
        for pr in await db.portfolio_profiles.find({}, {"_id": 0}).to_list(3000):
            if pr.get("is_demo"):
                continue
            c = (pr.get("location") or {}).get("city")
            key = norm_topic(c)
            if c and key and key not in seen:
                seen.add(key)
                cities.append(c)
        return sorted(cities)[:60]

    @router.get("/api/public/pixora/hashtag/{tag}")
    async def public_hashtag(tag: str, request: Request, limit: int = 40):
        """A hashtag page: every post/reel carrying {tag}, ranked, plus a header. Computed
        from real content so it is always correct even without the counter collection."""
        t = norm_topic(tag)
        if not t:
            raise HTTPException(404, "Unknown tag")
        viewer = await _resolve_actor(request)
        vid = viewer["id"] if viewer else None
        cards, matched, total_views, studios = {}, [], 0, set()
        for p in await _all_items():
            if t not in hashtags_from(p):
                continue
            total_views += int(p.get("views") or 0)
            studios.add(p.get("studio_id"))
            score = await _engagement_score(p["id"], len(p.get("likes") or []))
            score += int(p.get("views") or 0) * RANK_W["view"]
            matched.append((score, p))
        matched.sort(key=lambda x: x[0], reverse=True)
        out = []
        for score, p in matched[: min(max(1, int(limit or 40)), 100)]:
            card = await _public_post_card(p, cards)
            card["viewer_liked"] = bool(vid and vid in (p.get("likes") or []))
            out.append(card)
        return {"tag": t, "posts": out, "post_count": len(matched),
                "total_views": total_views, "studio_count": len(studios)}

    @router.get("/api/public/pixora/hashtags/trending")
    async def public_hashtags_trending(window: str = "7d", limit: int = 12):
        """Trending hashtags by REAL usage. Prefers the counter collection; if empty
        (nothing created since counters existed), falls back to counting live content."""
        cap = min(max(1, int(limit or 12)), 40)
        rows = await db.pixora_hashtags.find({}, {"_id": 0}).to_list(2000)
        if rows:
            rows = [r for r in rows if r.get("tag")]
            rows.sort(key=lambda r: (int(r.get("uses") or 0), r.get("last_used") or ""),
                      reverse=True)
            return {"tags": [{"tag": r["tag"], "uses": int(r.get("uses") or 0)}
                             for r in rows[:cap]], "source": "counter"}
        counts: Dict[str, int] = {}
        for p in await _all_items():
            for tg in hashtags_from(p):
                counts[tg] = counts.get(tg, 0) + 1
        top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:cap]
        return {"tags": [{"tag": k, "uses": v} for k, v in top], "source": "computed"}

    # ======================================================================
    # C4 — Story Highlights (permanent, on the studio profile). A highlight
    # SNAPSHOTS each story's media so an expired 24h story still shows — no
    # re-upload, and deleting/expiring the original story doesn't break it.
    # ======================================================================
    class _HighlightIn(BaseModel):
        title: str = Field(min_length=1, max_length=60)
        cover_url: Optional[str] = None
        story_ids: List[str] = Field(default_factory=list)

    async def _snapshot_stories(sid: str, story_ids: List[str]) -> List[Dict[str, Any]]:
        items = []
        for stid in (story_ids or [])[:50]:
            s = await db.pixora_stories.find_one({"id": stid, "studio_id": sid}, {"_id": 0})
            if s:
                items.append({"story_id": stid, "type": s.get("type") or "photo",
                              "url": s.get("url") or "", "caption": s.get("caption") or "",
                              "text": s.get("text") or "", "bg": s.get("bg") or ""})
        return items

    @router.post("/api/pixora/highlights")
    async def create_highlight(payload: _HighlightIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        items = await _snapshot_stories(sid, payload.story_ids)
        doc = {"id": f"hl_{uuid.uuid4().hex[:12]}", "studio_id": sid,
               "title": payload.title.strip()[:60],
               "cover_url": payload.cover_url or (items[0]["url"] if items else None),
               "items": items, "created_at": _now()}
        await db.pixora_highlights.insert_one(doc)
        return {"highlight": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/highlights")
    async def list_my_highlights(admin: dict = Depends(require_admin)):
        rows = await db.pixora_highlights.find({"studio_id": admin["admin_id"]}, {"_id": 0}) \
            .sort("created_at", -1).to_list(100)
        return {"highlights": rows}

    @router.patch("/api/pixora/highlights/{highlight_id}")
    async def update_highlight(highlight_id: str, payload: _HighlightIn,
                               admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        hl = await db.pixora_highlights.find_one({"id": highlight_id, "studio_id": sid}, {"_id": 0})
        if not hl:
            raise HTTPException(404, "Highlight not found")
        items = await _snapshot_stories(sid, payload.story_ids) if payload.story_ids else hl.get("items")
        await db.pixora_highlights.update_one(
            {"id": highlight_id, "studio_id": sid},
            {"$set": {"title": payload.title.strip()[:60],
                      "cover_url": payload.cover_url or hl.get("cover_url"),
                      "items": items}})
        return {"updated": True}

    @router.delete("/api/pixora/highlights/{highlight_id}")
    async def delete_highlight(highlight_id: str, admin: dict = Depends(require_admin)):
        await db.pixora_highlights.delete_one(
            {"id": highlight_id, "studio_id": admin["admin_id"]})
        return {"deleted": True}

    @router.get("/api/public/pixora/profile/{studio_id}")
    async def public_studio_profile(studio_id: str, request: Request, limit: int = 30):
        """A photographer's public community profile, by studio id OR slug.

        `/p/{slug}` is where EVERY public post links — `_author_card` builds
        that URL and the feed puts it on every card — and there was no endpoint
        behind it. The page that serves that route called a binding that did not
        exist, so following any byline in the community threw a TypeError and
        hit the error boundary.

        Composed from what already exists rather than adding a second source of
        truth: the byline card for identity, the studio's own posts for the
        grid, and the same counters the feed uses.
        """
        sid = studio_id
        # Accept a slug: portfolio_profiles owns the pretty URL.
        prof = await db.portfolio_profiles.find_one({"slug": studio_id}, {"_id": 0})
        if prof:
            sid = prof.get("admin_id") or prof.get("id") or studio_id

        card = await _author_card(sid)
        admin = await db.admins.find_one({"id": sid}, {"_id": 0, "password_hash": 0})
        if not admin and not prof:
            raise HTTPException(404, "Photographer not found")

        viewer = await _resolve_actor(request)
        vid = viewer["id"] if viewer else None

        rows = await db.pixora_posts.find({"studio_id": sid}, {"_id": 0}) \
            .sort("created_at", -1).to_list(max(1, min(int(limit or 30), 60)))
        cards: Dict[str, Any] = {}
        posts = []
        for p in rows:
            c = await _public_post_card(p, cards)
            c["viewer_liked"] = bool(vid and vid in (p.get("likes") or []))
            posts.append(c)

        # pixora_follows keys on follower/followee, NOT actor_id/studio_id.
        # Guessing the field names would have made every count a silent zero.
        followers = await db.pixora_follows.count_documents({"followee": sid})
        following_count = await db.pixora_follows.count_documents({"follower": sid})
        viewer_follows = bool(vid and await db.pixora_follows.find_one(
            {"follower": vid, "followee": sid}, {"_id": 0}))

        return {
            "studio": {
                "id": sid,
                "name": card["name"],
                "avatar": card["avatar"],
                "city": card["city"],
                "slug": card["slug"],
                "bio": (prof or {}).get("bio") or "",
                "portfolio_url": f"/photographer/{card['slug']}",
            },
            "posts": posts,
            "counts": {
                "posts": len(posts),
                "followers": followers,
                "following": following_count,
            },
            "viewer": {"signed_in": bool(vid), "following": viewer_follows},
        }

    @router.get("/api/public/pixora/highlights/{studio_id}")
    async def public_highlights(studio_id: str):
        """A studio's highlight rail for its public profile — read-only."""
        rows = await db.pixora_highlights.find({"studio_id": studio_id}, {"_id": 0}) \
            .sort("created_at", -1).to_list(100)
        return {"highlights": [{"id": r["id"], "title": r.get("title"),
                                "cover_url": r.get("cover_url"),
                                "count": len(r.get("items") or [])} for r in rows]}

    @router.get("/api/public/pixora/highlight/{highlight_id}")
    async def public_highlight_items(highlight_id: str):
        hl = await db.pixora_highlights.find_one({"id": highlight_id}, {"_id": 0})
        if not hl:
            raise HTTPException(404, "Highlight not found")
        a = await _author_card(hl.get("studio_id"))
        return {"id": hl["id"], "title": hl.get("title"), "items": hl.get("items") or [],
                "studio": {"name": a["name"], "avatar": a["avatar"], "url": a["profile_url"]}}

    # ======================================================================
    # C5 — Photographer content analytics. Aggregates over the studio's own
    # posts/reels + the signal log; no new data, honest counts only.
    # ======================================================================
    @router.get("/api/pixora/content-analytics")
    async def content_analytics(window: str = "30d", admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        hours = {"7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90, "all": None}.get(
            (window or "30d").lower(), 24 * 30)
        cutoff = None
        if hours:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

        posts = await db.pixora_posts.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        reels = await db.pixora_reels.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        items = posts + [{**r, "kind": "reel"} for r in reels]

        totals = {"posts": len(posts), "reels": len(reels), "views": 0, "likes": 0,
                  "comments": 0, "saves": 0, "shares": 0}
        perf, tag_reach = [], {}
        for p in items:
            pid = p["id"]
            likes = len(p.get("likes") or [])
            comments = await db.pixora_comments.count_documents({"post_id": pid})
            saves = await db.pixora_saves.count_documents({"post_id": pid})
            shares = await db.pixora_shares.count_documents({"post_id": pid})
            views = int(p.get("views") or 0)
            totals["views"] += views; totals["likes"] += likes
            totals["comments"] += comments; totals["saves"] += saves; totals["shares"] += shares
            eng = (likes * RANK_W["like"] + comments * RANK_W["comment"]
                   + saves * RANK_W["save"] + shares * RANK_W["share"] + views * RANK_W["view"])
            for tg in hashtags_from(p):
                tag_reach[tg] = tag_reach.get(tg, 0) + views + saves
            perf.append({"id": pid, "kind": p.get("kind"), "title": p.get("title") or p.get("caption") or "",
                         "thumbnail": p.get("image_url") or p.get("thumbnail_url"),
                         "views": views, "likes": likes, "comments": comments,
                         "saves": saves, "shares": shares, "engagement": eng,
                         "created_at": p.get("created_at")})
        perf.sort(key=lambda x: x["engagement"], reverse=True)

        # Follower growth in the window (from follow rows' created_at).
        follows = await db.pixora_follows.find({"followee": sid}, {"_id": 0}).to_list(20000)
        new_followers = sum(1 for f in follows
                            if not cutoff or (f.get("created_at") or "") >= cutoff)

        # Best posting time — bucket the studio's engaged content by weekday/hour.
        # Honest: only from real created_at; needs a threshold to be meaningful.
        buckets: Dict[str, int] = {}
        for p in perf:
            try:
                dt = datetime.fromisoformat(str(p["created_at"]).replace("Z", "+00:00"))
                key = f"{dt.weekday()}:{dt.hour}"
                buckets[key] = buckets.get(key, 0) + p["engagement"]
            except Exception:
                continue
        best_time = None
        if sum(buckets.values()) >= 20 and buckets:
            wd, hr = max(buckets, key=buckets.get).split(":")
            best_time = {"weekday": int(wd), "hour": int(hr)}

        # Audience topics — what the studio's engagers also like (from signals).
        # Fetch all and filter in Python: the pg_adapter is Mongo-compatible but we
        # avoid $in operators against a JSONB text field.
        my_ids = {p["id"] for p in items}
        sig = await db.pixora_signals.find({}, {"_id": 0}).to_list(50000)
        engager_topics: Dict[str, int] = {}
        for s in sig:
            if s.get("target_id") in my_ids:
                for t in (s.get("topics") or []):
                    engager_topics[t] = engager_topics.get(t, 0) + int(s.get("weight") or 1)
        audience = [{"topic": k, "weight": v} for k, v in
                    sorted(engager_topics.items(), key=lambda kv: kv[1], reverse=True)[:12]]

        return {"window": (window or "30d").lower(), "totals": totals,
                "top_content": perf[:5], "needs_work": perf[-5:][::-1] if len(perf) > 5 else [],
                "top_tags": [{"tag": k, "reach": v} for k, v in
                             sorted(tag_reach.items(), key=lambda kv: kv[1], reverse=True)[:8]],
                "new_followers": new_followers, "total_followers": len(follows),
                "best_time": best_time, "audience_topics": audience,
                "engagement_weights": RANK_W}

    @router.get("/api/pixora/creators/suggested")
    async def suggested_creators(limit: int = 8, actor: dict = Depends(require_actor)):
        """Who to follow next. Scored on the spec's factors - same city, shared
        category, community score, recent activity - and never suggests someone
        already followed (or the caller)."""
        me = actor["id"]
        following = {f["followee"] for f in
                     await db.pixora_follows.find({"follower": me}, {"_id": 0}).to_list(2000)}
        mine = await db.portfolio_profiles.find_one({"id": me}, {"_id": 0}) or {}
        my_city = ((mine.get("location") or {}).get("city") or "").lower()
        my_services = {str(x).lower() for x in (mine.get("services") or [])}
        out = []
        for pr in await db.portfolio_profiles.find({}, {"_id": 0}).to_list(2000):
            sid = pr.get("id")
            if (not sid or sid == me or sid in following
                    or pr.get("is_published") is False or pr.get("is_demo")):
                continue
            loc = pr.get("location") or {}
            services = {str(x).lower() for x in (pr.get("services") or [])}
            score = 0
            if my_city and (loc.get("city") or "").lower() == my_city:
                score += 30
            score += 10 * len(my_services & services)
            score += min(40, (await _community_score(sid))["score"] // 25)
            score += min(20, await db.pixora_posts.count_documents({"studio_id": sid}) * 2)
            level = (await _verification_of(sid))["level"]
            score += level * 5
            card = await _author_card(sid)
            out.append({"studio_id": sid, "name": card["name"], "avatar": card["avatar"],
                        "city": card["city"], "url": card["profile_url"],
                        "services": pr.get("services") or [], "verified_level": level,
                        "followers": await db.pixora_follows.count_documents({"followee": sid}),
                        "match_score": score, "reason": (
                            "Near you" if my_city and (loc.get("city") or "").lower() == my_city
                            else ("Shoots what you shoot" if my_services & services else "Active on Pixora"))})
        out.sort(key=lambda r: r["match_score"], reverse=True)
        return {"creators": out[:min(limit, 30)]}

    @router.get("/api/pixora/creators/featured")
    async def featured_creators(limit: int = 8):
        """Only paid featured placement, award winners and verified pros may
        appear - the spec is explicit about that, and `featured_placement` is
        already a sold Premium capability that nothing consumed until now."""
        out = []
        for pr in await db.portfolio_profiles.find({}, {"_id": 0}).to_list(2000):
            sid = pr.get("id")
            if not sid or pr.get("is_published") is False or pr.get("is_demo"):
                continue
            level = (await _verification_of(sid))["level"]
            paid = await has_capability(db, sid, "featured_placement")
            try:
                awards = await db.pixora_awards.count_documents({"studio_id": sid})
            except Exception:
                awards = 0
            if not (paid or awards or level):
                continue
            card = await _author_card(sid)
            out.append({"studio_id": sid, "name": card["name"], "avatar": card["avatar"],
                        "city": card["city"], "url": card["profile_url"],
                        "verified_level": level, "awards": awards, "featured": paid,
                        "reason": "Featured" if paid else ("Award winner" if awards else "Verified pro")})
        out.sort(key=lambda r: (r["featured"], r["awards"], r["verified_level"]), reverse=True)
        return {"creators": out[:min(limit, 30)]}

    @router.get("/api/pixora/discover")
    async def discover(city: str = "", category: str = "", verified: bool = False,
                       min_followers: int = 0, experience: str = "", q: str = "",
                       limit: int = 30):
        """Structured photographer discovery. The old /search was a substring scan
        with no filters at all; these are the five facets the spec asks for."""
        profs = await db.portfolio_profiles.find({}, {"_id": 0}).to_list(5000)
        ql, cityl, catl = q.strip().lower(), city.strip().lower(), category.strip().lower()
        out = []
        for pr in profs:
            if pr.get("is_published") is False:
                continue
            sid = pr.get("id")
            # Sample/showcase portfolios demonstrate a design; they are not real
            # studios and must never compete with one in discovery.
            if not sid or pr.get("is_demo"):
                continue
            loc = pr.get("location") or {}
            hay_city = str(loc.get("city") or "") + " " + str(loc.get("state") or "")
            if cityl and cityl not in hay_city.lower():
                continue
            services = [str(x).lower() for x in (pr.get("services") or [])]
            if catl and catl not in " ".join(services + [str(pr.get("category") or "").lower()]):
                continue
            if experience and experience.strip().lower() not in str(pr.get("experience") or "").lower():
                continue
            level = (await _verification_of(sid))["level"]
            if verified and not level:
                continue
            followers = await db.pixora_follows.count_documents({"followee": sid})
            if min_followers and followers < min_followers:
                continue
            if ql:
                hay = " ".join(str(x) for x in [pr.get("studio_name"), pr.get("tagline"),
                                                loc.get("city"), " ".join(services)]).lower()
                if ql not in hay:
                    continue
            card = await _author_card(sid)
            out.append({"studio_id": sid, "name": card["name"], "avatar": card["avatar"],
                        "city": card["city"], "slug": card["slug"], "url": card["profile_url"],
                        "followers": followers, "verified_level": level,
                        "services": pr.get("services") or [],
                        "community_score": (await _community_score(sid))["score"]})
        out.sort(key=lambda r: (r["verified_level"], r["community_score"], r["followers"]), reverse=True)
        return {"photographers": out[:min(limit, 100)],
                "filters": {"city": city, "category": category, "verified": verified,
                            "min_followers": min_followers, "experience": experience, "q": q}}

    @router.get("/api/public/pixora/search")
    async def public_search(q: str = "", limit: int = 10):
        ql = (q or "").strip().lower()
        empty = {"photographers": [], "posts": [], "resources": [], "learning": []}
        if not ql:
            return {"query": q, "results": empty, "total": 0}
        cap = max(1, min(int(limit or 10), 25))
        photographers, seen = [], set()
        for p in await db.portfolio_profiles.find({}, {"_id": 0}).to_list(5000):
            if (p or {}).get("is_published") is False:
                continue
            loc = p.get("location") or {}
            hay = " ".join(str(x) for x in [p.get("studio_name"), p.get("slug"), loc.get("city"),
                  " ".join(p.get("services") or []), " ".join(p.get("styles") or [])]).lower()
            if ql in hay and p.get("id") not in seen:
                seen.add(p.get("id"))
                photographers.append({"id": p.get("id"), "name": p.get("studio_name") or "Studio",
                                      "slug": p.get("slug"), "city": loc.get("city"),
                                      "url": f"/p/{p.get('slug') or p.get('id')}"})
        posts = await db.pixora_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(3000)
        # Enrich each post hit with a byline + thumbnail + a link (posts live on the
        # photographer's public profile), and search tags too — so a couple can find a
        # post by #candid, not just words in the caption.
        post_hits, pcards = [], {}
        for p in posts:
            if not _public_item(p):
                continue
            hay = (str(p.get("title", "")) + " " + str(p.get("body", "")) + " "
                   + " ".join(p.get("tags") or []) + " " + str(p.get("category") or "")).lower()
            if ql not in hay:
                continue
            sid = p.get("studio_id")
            if sid not in pcards:
                pcards[sid] = await _author_card(sid)
            a = pcards[sid]
            post_hits.append({"id": p["id"], "title": p.get("title") or (str(p.get("body", ""))[:60]),
                              "kind": p.get("kind"), "image_url": p.get("image_url"),
                              "author": a["name"], "author_url": a["profile_url"]})
            if len(post_hits) >= cap:
                break
        listings = await db.pixora_listings.find({"status": "active"}, {"_id": 0}).to_list(2000)
        res_hits = [{"id": l["id"], "title": l.get("title"), "kind": l.get("kind"), "price_inr": l.get("price_inr")}
                    for l in listings if ql in (str(l.get("title", "")) + " " + str(l.get("description", ""))).lower()]
        learn_hits = [{"id": c["id"], "title": c["title"], "kind": c.get("kind"), "level": c.get("level")}
                      for c in LEARNING_CONTENT if ql in (c["title"] + " " + c.get("summary", "")).lower()]
        results = {"photographers": photographers[:cap], "posts": post_hits[:cap],
                   "resources": res_hits[:cap], "learning": learn_hits[:cap]}
        return {"query": q, "results": results, "total": sum(len(v) for v in results.values())}

    # ---- community events --------------------------------------------------
    @router.get("/api/pixora/events")
    async def list_events(country: str = "", region: str = "", kind: str = "",
                          scope: str = "", virtual: str = "", q: str = "",
                          admin: dict = Depends(require_admin)):
        # Batch 6 — global directory: filter in Python (adapter-safe), build facets.
        rows = await db.pixora_events.find({}, {"_id": 0}).sort("date", 1).to_list(2000)
        me = admin["admin_id"]
        today = _now()[:10]
        countries, regions, kinds = set(), set(), set()
        out = []
        ql = (q or "").strip().lower()
        for r in rows:
            if r.get("country"):
                countries.add(r["country"])
            if r.get("region"):
                regions.add(r["region"])
            if r.get("kind"):
                kinds.add(r["kind"])
            if country and r.get("country") != country:
                continue
            if region and r.get("region") != region:
                continue
            if kind and r.get("kind") != kind:
                continue
            if virtual == "1" and not r.get("is_virtual"):
                continue
            if virtual == "0" and r.get("is_virtual"):
                continue
            d = (r.get("date") or "")[:10]
            if scope == "upcoming" and d and d < today:
                continue
            if scope == "past" and (not d or d >= today):
                continue
            if ql and ql not in (
                f"{r.get('title','')} {r.get('description','')} {r.get('location','')} "
                f"{r.get('city','')} {r.get('country','')}").lower():
                continue
            r["host"] = await _studio_name(r["studio_id"])
            r["rsvp_count"] = len(r.get("rsvps", []))
            r["rsvped"] = me in r.get("rsvps", [])
            r["is_full"] = bool(r.get("capacity")) and r["rsvp_count"] >= r.get("capacity", 0)
            out.append(r)
        return {"events": out, "facets": {
            "countries": sorted(countries), "regions": sorted(regions), "kinds": sorted(kinds)}}

    @router.post("/api/pixora/events")
    async def create_event(payload: EventIn, admin: dict = Depends(require_admin)):
        doc = {"id": f"evt_{uuid.uuid4().hex[:12]}", "studio_id": admin["admin_id"],
               **payload.model_dump(), "rsvps": [], "created_at": _now()}
        await db.pixora_events.insert_one(doc)
        return {"event": doc}

    @router.post("/api/pixora/events/{event_id}/rsvp")
    async def rsvp_event(event_id: str, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        ev = await db.pixora_events.find_one({"id": event_id}, {"_id": 0})
        if not ev:
            raise HTTPException(404, "Event not found")
        rsvps = set(ev.get("rsvps", []))
        going = me not in rsvps
        if going and ev.get("capacity") and len(rsvps) >= ev.get("capacity", 0):
            raise HTTPException(400, "This event is full")
        rsvps.discard(me) if not going else rsvps.add(me)
        await db.pixora_events.update_one({"id": event_id}, {"$set": {"rsvps": list(rsvps)}})
        if going:
            await _notify(ev.get("studio_id"), "event_rsvp",
                          f"{await _studio_name(me)} is attending your event “{ev.get('title', '')}”.",
                          actor=me, entity_id=event_id)
        return {"going": going, "rsvp_count": len(rsvps)}

    # ---- learning center + certification ----------------------------------
    @router.get("/api/pixora/learn")
    async def learn(admin: dict = Depends(require_admin)):
        done = {c["content_id"] for c in await db.pixora_completions.find({"studio_id": admin["admin_id"]}, {"_id": 0}).to_list(200)}
        content = [{**c, "completed": c["id"] in done} for c in LEARNING_CONTENT]
        return {"content": content}

    @router.post("/api/pixora/learn/{content_id}/complete")
    async def complete_course(content_id: str, admin: dict = Depends(require_admin)):
        item = next((c for c in LEARNING_CONTENT if c["id"] == content_id), None)
        if not item:
            raise HTTPException(404, "Course not found")
        sid = admin["admin_id"]
        if not await db.pixora_completions.find_one({"studio_id": sid, "content_id": content_id}, {"_id": 0}):
            await db.pixora_completions.insert_one({"id": f"cmp_{uuid.uuid4().hex[:12]}", "studio_id": sid,
                                                    "content_id": content_id, "cert": item.get("cert", False),
                                                    "title": item["title"], "created_at": _now()})
        return {"completed": True, "certified": item.get("cert", False)}

    @router.get("/api/pixora/certifications")
    async def certifications(admin: dict = Depends(require_admin)):
        rows = await db.pixora_completions.find({"studio_id": admin["admin_id"], "cert": True}, {"_id": 0}).to_list(200)
        return {"certifications": rows}

    # ---- awards (nominate + vote) -----------------------------------------
    @router.get("/api/pixora/awards")
    async def awards(admin: dict = Depends(require_admin)):
        rows = await db.pixora_awards.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
        active = next((a for a in rows if a.get("is_active")), None)
        noms = []
        if active:
            raw = await db.pixora_award_noms.find({"award_id": active["id"]}, {"_id": 0}).to_list(500)
            # aggregate votes per nominee
            by_nom: Dict[str, Dict[str, Any]] = {}
            for n in raw:
                key = n["nominee_studio_id"]
                if key not in by_nom:
                    by_nom[key] = {"nominee_studio_id": key, "name": await _studio_name(key),
                                   "reasons": [], "votes": set()}
                if n.get("reason"):
                    by_nom[key]["reasons"].append(n["reason"])
                by_nom[key]["votes"].add(n["nominator_id"])
            noms = [{**v, "vote_count": len(v["votes"]), "votes": None} for v in by_nom.values()]
            noms.sort(key=lambda x: x["vote_count"], reverse=True)
        return {"awards": rows, "active": active, "nominations": noms}

    @router.post("/api/pixora/awards/nominate")
    async def nominate(payload: AwardNominationIn, admin: dict = Depends(require_admin)):
        # one vote per (award, nominee, nominator)
        await db.pixora_award_noms.delete_many({"award_id": payload.award_id,
                                                "nominee_studio_id": payload.nominee_studio_id,
                                                "nominator_id": admin["admin_id"]})
        await db.pixora_award_noms.insert_one({"id": f"nom_{uuid.uuid4().hex[:12]}",
                                               "award_id": payload.award_id,
                                               "nominee_studio_id": payload.nominee_studio_id,
                                               "nominator_id": admin["admin_id"],
                                               "reason": payload.reason, "created_at": _now()})
        return {"nominated": True}

    # ---- testimonial videos -----------------------------------------------
    @router.get("/api/pixora/testimonial-videos")
    async def list_video_testimonials(admin: dict = Depends(require_admin)):
        rows = await db.pixora_video_testimonials.find({"studio_id": admin["admin_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"videos": rows}

    @router.post("/api/pixora/testimonial-videos")
    async def add_video_testimonial(payload: VideoTestimonialIn, admin: dict = Depends(require_admin)):
        doc = {"id": f"vt_{uuid.uuid4().hex[:12]}", "studio_id": admin["admin_id"],
               **payload.model_dump(), "created_at": _now()}
        await db.pixora_video_testimonials.insert_one(doc)
        return {"video": doc}

    # ---- portfolio insights + growth dashboard ----------------------------
    @router.get("/api/pixora/insights")
    async def insights(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        stats = await _stats(sid)
        n_ach = await db.pixora_achievements.count_documents({"studio_id": sid})
        score = _reputation(stats, n_ach)
        followers = await db.pixora_follows.count_documents({"followee": sid})
        following = await db.pixora_follows.count_documents({"follower": sid})
        works = await db.portfolio_works.count_documents({"studio_id": sid})
        albums = await db.portfolio_albums.count_documents({"studio_id": sid})
        certs = await db.pixora_completions.count_documents({"studio_id": sid, "cert": True})
        listings = await db.pixora_listings.count_documents({"studio_id": sid, "status": "active"})
        sales = await db.pixora_purchases.count_documents({})  # marketplace-wide activity
        # rank on the leaderboard
        lb = await list_leaderboard_ids()
        rank = next((i + 1 for i, s in enumerate(lb) if s == sid), None)
        return {
            "reputation": score, "tier": _tier(score),
            "engagement": {"posts": stats["posts"], "likes_received": stats["likes_received"],
                           "comments_made": stats["comments_made"], "followers": followers,
                           "following": following},
            "portfolio": {"works": works, "albums": albums},
            "growth": {"achievements": n_ach, "certifications": certs,
                       "challenge_wins": stats["challenge_wins"], "leaderboard_rank": rank,
                       "marketplace_listings": listings, "marketplace_activity": sales},
        }

    async def list_leaderboard_ids() -> List[str]:
        ids = set()
        for p in await db.pixora_posts.find({}, {"_id": 0, "studio_id": 1}).to_list(100000):
            ids.add(p["studio_id"])
        scored = []
        for s in ids:
            st = await _stats(s)
            na = await db.pixora_achievements.count_documents({"studio_id": s})
            scored.append((s, _reputation(st, na)))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [s for s, _ in scored]

    # ---- business tools: quote / invoice generator ------------------------
    @router.post("/api/pixora/business/quote")
    async def make_quote(payload: QuoteIn, admin: dict = Depends(require_admin)):
        subtotal = sum(max(0, l.amount_inr) for l in payload.lines)
        gst = int(round(subtotal * 0.18)) if payload.gst else 0
        total = subtotal + gst
        doc = {"id": f"qt_{uuid.uuid4().hex[:10].upper()}", "studio_id": admin["admin_id"],
               "client_name": payload.client_name, "event": payload.event,
               "lines": [l.model_dump() for l in payload.lines],
               "subtotal_inr": subtotal, "gst_inr": gst, "total_inr": total,
               "studio_name": await _studio_name(admin["admin_id"]), "created_at": _now()}
        await db.pixora_quotes.insert_one(doc)
        return {"quote": {k: v for k, v in doc.items() if k != "_id"}}

    # ---- member benefits ---------------------------------------------------
    @router.get("/api/pixora/benefits")
    async def benefits():
        return {"benefits": BENEFITS}

    # ---- Stage 2: notifications inbox -------------------------------------
    class _CommunitySettingsIn(BaseModel):
        # notifications
        notify_follow: bool = True
        notify_like: bool = True
        notify_comment: bool = True
        notify_save: bool = True
        notify_marketplace: bool = True
        # privacy
        profile_public: bool = True
        show_in_discover: bool = True
        allow_messages: bool = True

    @router.get("/api/pixora/settings")
    async def get_settings(admin: dict = Depends(require_admin)):
        """Community settings. Defaults are returned for a studio that has never
        saved any, so the screen never renders blank."""
        sid = admin["admin_id"]
        row = await db.pixora_settings.find_one({"studio_id": sid}, {"_id": 0}) or {}
        defaults = _CommunitySettingsIn().model_dump()
        defaults.update({k: v for k, v in row.items() if k in defaults})
        prof = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        used = await storage_accounting.used_bytes(db, sid)
        return {"settings": defaults,
                "account": {"name": await _studio_name(sid),
                            "slug": prof.get("slug"),
                            "is_published": prof.get("is_published") is not False},
                "storage": {"used_bytes": used},
                "plan": await capability_state(db, sid)}

    @router.put("/api/pixora/settings")
    async def put_settings(payload: _CommunitySettingsIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        doc = payload.model_dump()
        await db.pixora_settings.update_one({"studio_id": sid},
                                            {"$set": {**doc, "studio_id": sid, "updated_at": _now()}},
                                            upsert=True)
        # Privacy is authoritative on the profile, not a duplicate copy here.
        await db.portfolio_profiles.update_one(
            {"id": sid}, {"$set": {"is_published": payload.profile_public}}, upsert=True)
        return {"saved": True, "settings": doc}

    @router.get("/api/pixora/notifications")
    async def list_notifications(admin: dict = Depends(require_admin), limit: int = 50):
        me = admin["admin_id"]
        rows = await db.pixora_notifications.find({"recipient": me}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 200))
        unread = await db.pixora_notifications.count_documents({"recipient": me, "read": False})
        return {"notifications": rows, "unread": unread}

    @router.get("/api/pixora/notifications/unread-count")
    async def unread_count(admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        return {"unread": await db.pixora_notifications.count_documents({"recipient": me, "read": False})}

    class _NotifReadIn(BaseModel):
        notification_id: Optional[str] = None   # None → mark all read

    @router.post("/api/pixora/notifications/read")
    async def mark_read(payload: _NotifReadIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        q: Dict[str, Any] = {"recipient": me, "read": False}
        if payload.notification_id:
            q["id"] = payload.notification_id
        await db.pixora_notifications.update_many(q, {"$set": {"read": True, "read_at": _now()}})
        return {"ok": True, "unread": await db.pixora_notifications.count_documents({"recipient": me, "read": False})}

    # ---- Stage 2: content reporting --------------------------------------
    REPORT_TARGETS = {"post", "comment", "gig", "event", "member", "story", "reel", "submission"}
    REPORT_REASONS = {"spam", "fake", "abuse", "copyright", "inappropriate", "other"}

    class _ReportIn(BaseModel):
        target_type: str
        target_id: str
        reason: str
        note: str = ""

    @router.post("/api/pixora/report")
    async def submit_report(payload: _ReportIn, admin: dict = Depends(require_admin)):
        me = admin["admin_id"]
        if payload.target_type not in REPORT_TARGETS:
            raise HTTPException(400, "Unknown report target")
        reason = payload.reason if payload.reason in REPORT_REASONS else "other"
        # one open report per user per target — avoids report spam
        existing = await db.pixora_reports.find_one(
            {"reporter": me, "target_type": payload.target_type, "target_id": payload.target_id, "status": "open"}, {"_id": 0})
        if existing:
            return {"reported": True, "already": True}
        doc = {"id": f"rpt_{uuid.uuid4().hex[:12]}", "reporter": me,
               "reporter_name": await _studio_name(me),
               "target_type": payload.target_type, "target_id": payload.target_id,
               "reason": reason, "note": (payload.note or "")[:1000],
               "status": "open", "created_at": _now()}
        await db.pixora_reports.insert_one(doc)
        return {"reported": True}

    # ---- Stage 5: Pixora CRM (owner-scoped client management) --------------
    @router.get("/api/pixora/crm/meta")
    async def crm_meta():
        return {"statuses": CRM_STATUSES, "stages": CRM_STAGES,
                "payment_statuses": ["unpaid", "advance", "partial", "paid"],
                "contract_statuses": ["none", "sent", "signed"]}

    @router.get("/api/pixora/crm/clients")
    async def crm_list_clients(admin: dict = Depends(require_admin), status: Optional[str] = None):
        sid = admin["admin_id"]
        q: Dict[str, Any] = {"studio_id": sid}
        if status:
            q["status"] = status
        rows = await db.pixora_crm_clients.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        # counts by status for the pipeline summary
        counts: Dict[str, int] = {}
        for r in await db.pixora_crm_clients.find({"studio_id": sid}, {"_id": 0, "status": 1}).to_list(5000):
            k = r.get("status") or "lead"
            counts[k] = counts.get(k, 0) + 1
        return {"clients": rows, "counts": counts}

    @router.post("/api/pixora/crm/clients")
    async def crm_create_client(payload: CrmClientIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "crm")   # Premium
        status = payload.status if payload.status in CRM_STATUSES else "lead"
        doc = {"id": f"cli_{uuid.uuid4().hex[:14]}", "studio_id": sid,
               **payload.model_dump(), "status": status, "created_at": _now(), "updated_at": _now()}
        await db.pixora_crm_clients.insert_one(doc)
        return {"client": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/crm/clients/{client_id}")
    async def crm_get_client(client_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_crm_clients.find_one({"id": client_id, "studio_id": sid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Client not found")
        timeline = await db.pixora_crm_timeline.find({"client_id": client_id, "studio_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        return {"client": c, "timeline": timeline}

    @router.put("/api/pixora/crm/clients/{client_id}")
    async def crm_update_client(client_id: str, payload: CrmClientIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_crm_clients.find_one({"id": client_id, "studio_id": sid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Client not found")
        status = payload.status if payload.status in CRM_STATUSES else c.get("status", "lead")
        await db.pixora_crm_clients.update_one({"id": client_id, "studio_id": sid},
            {"$set": {**payload.model_dump(), "status": status, "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/pixora/crm/clients/{client_id}")
    async def crm_delete_client(client_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.pixora_crm_clients.delete_one({"id": client_id, "studio_id": sid})
        await db.pixora_crm_timeline.delete_many({"client_id": client_id, "studio_id": sid})
        return {"deleted": True}

    @router.post("/api/pixora/crm/clients/{client_id}/timeline")
    async def crm_add_timeline(client_id: str, payload: CrmTimelineIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        if not await db.pixora_crm_clients.find_one({"id": client_id, "studio_id": sid}, {"_id": 0}):
            raise HTTPException(404, "Client not found")
        stage = payload.stage if payload.stage in CRM_STAGES else (payload.stage or "note")
        doc = {"id": f"tl_{uuid.uuid4().hex[:12]}", "studio_id": sid, "client_id": client_id,
               "stage": stage, "note": payload.note, "created_at": _now()}
        await db.pixora_crm_timeline.insert_one(doc)
        return {"event": {k: v for k, v in doc.items() if k != "_id"}}

    @router.delete("/api/pixora/crm/timeline/{event_id}")
    async def crm_delete_timeline(event_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.pixora_crm_timeline.delete_one({"id": event_id, "studio_id": sid})
        return {"deleted": True}

    # ---- Stage 5: Automated Lead Management (reminders + prioritization) ---
    def _lead_priority(c: Dict[str, Any]) -> int:
        """0-100 heuristic: warmer status + bigger budget + due follow-up rank higher."""
        status_w = {"lead": 20, "contacted": 35, "quoted": 60, "booked": 80,
                    "shooting": 70, "delivered": 40, "completed": 10, "lost": 0}
        score = status_w.get(c.get("status") or "lead", 20)
        budget = int(c.get("budget_inr") or 0)
        score += min(30, budget // 20000)          # +1 per ₹20k, capped at +30
        return max(0, min(100, score))

    @router.get("/api/pixora/crm/followups")
    async def crm_followups(admin: dict = Depends(require_admin), days: int = 7):
        sid = admin["admin_id"]
        today = _now()[:10]
        horizon = (datetime.now(timezone.utc).date() + timedelta(days=max(0, days))).isoformat()
        clients = await db.pixora_crm_clients.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        due = []
        for c in clients:
            fd = c.get("follow_up_date")
            if fd and (c.get("status") not in ("completed", "lost")) and fd <= horizon:
                due.append({**c, "overdue": fd < today, "priority": _lead_priority(c)})
        due.sort(key=lambda x: (not x["overdue"], x.get("follow_up_date") or ""))
        # top open leads by priority (for the "work these next" list)
        open_leads = [c for c in clients if (c.get("status") not in ("completed", "lost"))]
        for c in open_leads:
            c["priority"] = _lead_priority(c)
        open_leads.sort(key=lambda x: x["priority"], reverse=True)
        return {"followups": due, "count": len(due),
                "overdue_count": sum(1 for d in due if d["overdue"]),
                "top_leads": open_leads[:8]}

    # ---- Stage 4: AI portfolio review assistant ---------------------------
    async def _portfolio_signals(sid: str) -> Dict[str, Any]:
        """Gather REAL portfolio signals for the review (never fabricated)."""
        profile = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        works = await db.portfolio_works.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        albums = await db.portfolio_albums.count_documents({"studio_id": sid})
        testimonials = await db.portfolio_testimonials.count_documents({"studio_id": sid})
        cats = sorted({(w.get("event_category") or "").strip() for w in works if w.get("event_category")})
        stats = await _stats(sid)
        followers = await db.pixora_follows.count_documents({"followee": sid})
        loc = profile.get("location") or {}
        social = profile.get("social") or {}
        contact = profile.get("contact") or {}
        fields = {
            "studio_name": bool(profile.get("studio_name")),
            "tagline": bool(profile.get("tagline")),
            "about": bool(profile.get("about")),
            "cover_description": bool(profile.get("cover_description")),
            "location": bool(loc.get("city") or loc.get("state")),
            "experience": bool(profile.get("experience_years")),
            "services": len(profile.get("services") or []) >= 3,
            "phone": bool(contact.get("phone") or social.get("whatsapp")),
            "social": any(social.get(k) for k in ("instagram", "facebook", "youtube", "website")),
            "hero_or_avatar": bool(profile.get("hero_image") or profile.get("avatar")),
        }
        return {
            "profile": profile, "works_count": len(works), "albums": albums,
            "testimonials": testimonials, "categories": cats, "followers": followers,
            "posts": stats["posts"], "likes_received": stats["likes_received"],
            "is_published": bool(profile.get("is_published")),
            "has_design": bool(profile.get("design_id")), "fields": fields,
        }

    def _score_portfolio(sig: Dict[str, Any]) -> Dict[str, Any]:
        f = sig["fields"]
        completeness = round(sum(1 for v in f.values() if v) / len(f) * 30)
        gallery = round(min(sig["works_count"] / 12, 1) * 25)
        categories = round(min(len(sig["categories"]) / 5, 1) * 10)
        testimonials = round(min(sig["testimonials"] / 3, 1) * 15)
        engagement = round(min((sig["posts"] * 2 + sig["followers"]) / 20, 1) * 10)
        polish = (5 if sig["has_design"] else 0) + (5 if sig["is_published"] else 0)
        subs = {"profile_completeness": completeness, "gallery": gallery,
                "categories": categories, "testimonials": testimonials,
                "engagement": engagement, "polish": polish}
        overall = min(100, sum(subs.values()))
        # rule-based, concrete suggestions (always available, even without AI)
        tips: List[str] = []
        missing = [k for k, v in f.items() if not v]
        if missing:
            tips.append("Complete your profile: add " + ", ".join(m.replace("_", " ") for m in missing[:5]) + ".")
        if sig["works_count"] < 12:
            tips.append(f"Add more portfolio photos — you have {sig['works_count']}; aim for 12+ across your best shoots.")
        if len(sig["categories"]) < 3:
            tips.append("Cover more event categories (e.g. Wedding, Haldi, Mehendi, Reception, Engagement) so more clients find you.")
        if sig["testimonials"] < 3:
            tips.append("Add at least 3 client testimonials — social proof strongly lifts bookings.")
        if not sig["is_published"]:
            tips.append("Publish your portfolio so it's publicly visible.")
        if not sig["has_design"]:
            tips.append("Pick a portfolio design to give your page a polished, branded look.")
        if sig["posts"] + sig["followers"] < 5:
            tips.append("Post in the Pixora community and grow followers to boost visibility and ranking.")
        return {"overall": overall, "subscores": subs, "suggestions": tips}

    @router.get("/api/pixora/portfolio-review")
    async def get_portfolio_review(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        r = await db.pixora_portfolio_reviews.find_one({"studio_id": sid}, {"_id": 0})
        return {"review": r}

    @router.post("/api/pixora/portfolio-review/generate")
    async def generate_portfolio_review(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "ai_review")   # Premium
        sig = await _portfolio_signals(sid)
        scored = _score_portfolio(sig)
        ai_summary = None
        # Optional AI narrative — graceful fallback if Gemini isn't configured.
        try:
            from ai_service import gemini_generate
            facts = (f"Overall score: {scored['overall']}/100. Subscores: {scored['subscores']}. "
                     f"Photos: {sig['works_count']}, albums: {sig['albums']}, categories covered: {sig['categories']}, "
                     f"testimonials: {sig['testimonials']}, community posts: {sig['posts']}, followers: {sig['followers']}, "
                     f"published: {sig['is_published']}, has design: {sig['has_design']}, "
                     f"missing profile fields: {[k for k,v in sig['fields'].items() if not v]}.")
            sys_msg = ("You are a senior wedding-photography portfolio consultant. Using ONLY the real "
                       "facts provided, write a concise, encouraging report card for the photographer. "
                       "Do NOT invent data or numbers. Output plain text with: a 2-sentence overview, then "
                       "a short 'Improvement roadmap' of 4-6 prioritized bullet points covering missing "
                       "categories, weak areas, profile/SEO/visibility and business tips. Keep it under 220 words.")
            ai_summary = await gemini_generate(sys_msg, facts)
        except Exception:
            logger.info("[pixora] portfolio-review AI unavailable; using rule-based only")
        doc = {"studio_id": sid, "overall": scored["overall"], "subscores": scored["subscores"],
               "suggestions": scored["suggestions"], "ai_summary": ai_summary,
               "signals": {"works_count": sig["works_count"], "albums": sig["albums"],
                           "categories": sig["categories"], "testimonials": sig["testimonials"],
                           "followers": sig["followers"], "posts": sig["posts"],
                           "is_published": sig["is_published"]},
               "generated_at": _now()}
        await db.pixora_portfolio_reviews.update_one({"studio_id": sid}, {"$set": doc}, upsert=True)
        return {"review": doc, "ai_available": ai_summary is not None}

    # ---- Stage 5: AI Business Assistant -----------------------------------
    async def _business_signals(sid: str) -> Dict[str, Any]:
        sig = await _portfolio_signals(sid)
        try:
            from portfolio_service import _portfolio_tier
            tier = await _portfolio_tier(db, sid)
        except Exception:
            tier = "normal"
        cs = await _community_score(sid)
        prof = sig.get("profile") or {}
        loc = prof.get("location") or {}
        clients = await db.pixora_crm_clients.find({"studio_id": sid}, {"_id": 0}).to_list(5000)
        by_status: Dict[str, int] = {}
        booked_value = 0
        for c in clients:
            st = c.get("status") or "lead"
            by_status[st] = by_status.get(st, 0) + 1
            if st in ("booked", "shooting", "delivered", "completed"):
                booked_value += int(c.get("budget_inr") or 0)
        pipeline = sum(by_status.get(s, 0) for s in ("lead", "contacted", "quoted"))
        won = sum(by_status.get(s, 0) for s in ("booked", "shooting", "delivered", "completed"))
        total_leads = pipeline + won + by_status.get("lost", 0)
        conv = round(won / total_leads * 100) if total_leads else 0
        return {"tier": tier, "experience_years": prof.get("experience_years") or 0,
                "city": loc.get("city") or "", "state": loc.get("state") or "",
                "works_count": sig["works_count"], "categories": sig["categories"],
                "testimonials": sig["testimonials"], "community_score": cs["score"],
                "followers": sig["followers"], "posts": sig["posts"],
                "clients_total": len(clients), "by_status": by_status,
                "booked_value_inr": booked_value, "conversion_pct": conv}

    def _business_fallback(b: Dict[str, Any]) -> Dict[str, Any]:
        exp = b.get("experience_years") or 0
        city = b.get("city") or "your city"
        pricing = (f"With {exp} years' experience on the {b['tier']} tier, position your starting "
                   f"package in a mid-to-premium band for {city}. Benchmark 2–3 local studios before "
                   f"fixing numbers — don't undercut; sell your storytelling and delivery speed.")
        packages = [
            "Starter — half-day coverage, edited highlights, online gallery.",
            "Premium — full-day photo + video, curated album, teaser reel.",
            "Luxury — multi-day, cinematic film, drone, premium album, same-week teaser.",
        ]
        marketing = [
            "Post 3× a week in the Pixora community to grow visibility and score.",
            "Collect 3+ client testimonials — social proof lifts bookings.",
            "Keep your availability + portfolio current; get verified for trust.",
        ]
        growth = (f"Lead→booking conversion is {b['conversion_pct']}% "
                  f"({sum(v for k,v in b['by_status'].items() if k in ('booked','shooting','delivered','completed'))} won). "
                  f"Follow up pending leads within 24 hours — speed is the #1 conversion lever.")
        return {"pricing": pricing, "packages": packages, "marketing": marketing, "growth": growth}

    @router.get("/api/pixora/business-assistant")
    async def get_business_report(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        r = await db.pixora_business_reports.find_one({"studio_id": sid}, {"_id": 0})
        return {"report": r}

    @router.post("/api/pixora/business-assistant/generate")
    async def generate_business_report(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await ensure_capability(db, sid, "ai_assistant")   # Premium
        b = await _business_signals(sid)
        fb = _business_fallback(b)
        ai_text = None
        try:
            from ai_service import gemini_generate
            facts = (f"Tier: {b['tier']}. Experience: {b['experience_years']} yrs. Location: {b['city']}, {b['state']}. "
                     f"Portfolio: {b['works_count']} photos, categories {b['categories']}, {b['testimonials']} testimonials. "
                     f"Community: score {b['community_score']}, {b['followers']} followers, {b['posts']} posts. "
                     f"CRM: {b['clients_total']} clients, statuses {b['by_status']}, "
                     f"booked pipeline value ₹{b['booked_value_inr']}, lead→booking conversion {b['conversion_pct']}%.")
            sys_msg = ("You are a senior wedding-photography business consultant for the Indian market. "
                       "Using ONLY the facts provided, give practical advice. Do NOT invent market numbers, "
                       "competitor names, or statistics. Output plain text with sections: Pricing guidance "
                       "(reasoning-based, tell them to benchmark locally), 3 Package ideas, 3-5 Marketing "
                       "actions, a short Growth analysis (use their conversion), and a prioritized Action plan. "
                       "Keep under 260 words, encouraging and concrete.")
            ai_text = await gemini_generate(sys_msg, facts)
        except Exception:
            logger.info("[pixora] business-assistant AI unavailable; using rule-based only")
        doc = {"studio_id": sid, "signals": b, "fallback": fb, "ai_summary": ai_text, "generated_at": _now()}
        await db.pixora_business_reports.update_one({"studio_id": sid}, {"$set": doc}, upsert=True)
        return {"report": doc, "ai_available": ai_text is not None}

    # ---- Stage 3: verification system -------------------------------------
    @router.get("/api/pixora/verification/me")
    async def my_verification(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        v = await db.pixora_verifications.find_one({"studio_id": sid}, {"_id": 0})
        return {"verification": v, "status": await _verification_of(sid),
                "levels": [{"level": k, "label": lbl} for k, lbl in VERIFICATION_LEVELS.items()]}

    @router.post("/api/pixora/verification/apply")
    async def apply_verification(payload: VerificationIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        lvl = payload.requested_level if payload.requested_level in VERIFICATION_LEVELS else 1
        existing = await db.pixora_verifications.find_one({"studio_id": sid}, {"_id": 0})
        if existing and existing.get("status") == "approved":
            raise HTTPException(400, "You are already verified.")
        doc = {"studio_id": sid, "studio_name": await _studio_name(sid),
               "requested_level": lvl, "gov_id_url": payload.gov_id_url,
               "business_proof_url": payload.business_proof_url, "website": payload.website,
               "instagram": payload.instagram, "portfolio_link": payload.portfolio_link,
               "phone": payload.phone, "email": payload.email, "note": payload.note,
               "status": "pending", "level": 0, "updated_at": _now()}
        if existing:
            doc["id"] = existing.get("id")
            doc["created_at"] = existing.get("created_at", _now())
            await db.pixora_verifications.update_one({"studio_id": sid}, {"$set": doc}, upsert=True)
        else:
            doc["id"] = f"vrf_{uuid.uuid4().hex[:12]}"
            doc["created_at"] = _now()
            await db.pixora_verifications.insert_one(doc)
        return {"submitted": True, "status": "pending"}

    @router.get("/api/pixora/verification/status/{studio_id}")
    async def public_verification(studio_id: str):
        return await _verification_of(studio_id)

    # ---- admin: verification review (super-admin) -------------------------
    if require_super_admin is not None:
        @router.get("/api/admin/pixora/verifications")
        async def admin_list_verifications(status: Optional[str] = None, _super=Depends(require_super_admin)):
            q: Dict[str, Any] = {}
            if status:
                q["status"] = status
            rows = await db.pixora_verifications.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)
            return {"verifications": rows}

        class _VerifyReviewIn(BaseModel):
            decision: str          # approve | reject
            level: Optional[int] = None
            reason: str = ""

        @router.post("/api/admin/pixora/verifications/{studio_id}/review")
        async def admin_review_verification(studio_id: str, payload: _VerifyReviewIn, _super=Depends(require_super_admin)):
            v = await db.pixora_verifications.find_one({"studio_id": studio_id}, {"_id": 0})
            if not v:
                raise HTTPException(404, "Application not found")
            if payload.decision == "approve":
                level = payload.level if (payload.level in VERIFICATION_LEVELS) else v.get("requested_level", 1)
                await db.pixora_verifications.update_one({"studio_id": studio_id},
                    {"$set": {"status": "approved", "level": level, "reviewed_at": _now()}})
                # reflect on the studio's admin doc so other surfaces can read it
                # (admins are keyed by "id"; "admin_id" matched zero rows).
                await db.admins.update_one({"id": studio_id},
                    {"$set": {"pixora_verified_level": level, "is_verified": True}})
                await _notify(studio_id, "verification",
                              f"You're now verified — {VERIFICATION_LEVELS.get(level)}!", entity_id=str(level))
                await _audit(_super, "verification_approve", "member", studio_id, {"level": level})
                return {"reviewed": True, "status": "approved", "level": level}
            await db.pixora_verifications.update_one({"studio_id": studio_id},
                {"$set": {"status": "rejected", "level": 0, "reject_reason": payload.reason, "reviewed_at": _now()}})
            await _notify(studio_id, "verification", "Your verification application was not approved.")
            await _audit(_super, "verification_reject", "member", studio_id, {"reason": payload.reason})
            return {"reviewed": True, "status": "rejected"}

        # ---- P1: reports moderation queue ---------------------------------
        @router.get("/api/admin/pixora/reports")
        async def admin_list_reports(status: str = "open", _super=Depends(require_super_admin)):
            q: Dict[str, Any] = {} if status == "all" else {"status": status}
            rows = await db.pixora_reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
            for r in rows:
                r["target_preview"] = await _mod_preview(r.get("target_type"), r.get("target_id"))
                owner = await _mod_owner(r.get("target_type"), r.get("target_id"))
                r["owner_name"] = await _studio_name(owner) if owner else None
            return {"reports": rows, "count": len(rows)}

        class _ReportResolveIn(BaseModel):
            action: str          # dismiss | delete | warn

        @router.post("/api/admin/pixora/reports/{report_id}/resolve")
        async def admin_resolve_report(report_id: str, payload: _ReportResolveIn, _super=Depends(require_super_admin)):
            r = await db.pixora_reports.find_one({"id": report_id}, {"_id": 0})
            if not r:
                raise HTTPException(404, "Report not found")
            action = payload.action
            tt, tid = r.get("target_type"), r.get("target_id")
            if action == "delete":
                await _mod_delete(tt, tid)
                owner = await _mod_owner(tt, tid)  # None now (deleted) — capture before? best-effort
                await db.pixora_reports.update_one({"id": report_id},
                    {"$set": {"status": "resolved", "resolution": "deleted", "resolved_at": _now()}})
            elif action == "warn":
                owner = await _mod_owner(tt, tid)
                if owner:
                    await _notify(owner, "moderation",
                                  "A moderator reviewed a report about your content. Please follow community guidelines.")
                await db.pixora_reports.update_one({"id": report_id},
                    {"$set": {"status": "resolved", "resolution": "warned", "resolved_at": _now()}})
            else:  # dismiss
                await db.pixora_reports.update_one({"id": report_id},
                    {"$set": {"status": "dismissed", "resolution": "dismissed", "resolved_at": _now()}})
            await _audit(_super, f"report_{action}", tt, tid, {"report_id": report_id, "reason": r.get("reason")})
            return {"resolved": True, "action": action}

        # ---- P1: super-admin force-moderate any content -------------------
        @router.delete("/api/admin/pixora/content/{target_type}/{target_id}")
        async def admin_delete_content(target_type: str, target_id: str, _super=Depends(require_super_admin)):
            if target_type not in _MOD_COLLECTIONS:
                raise HTTPException(400, "Unsupported content type")
            owner = await _mod_owner(target_type, target_id)
            ok = await _mod_delete(target_type, target_id)
            if not ok:
                raise HTTPException(404, "Content not found")
            if owner:
                await _notify(owner, "moderation", f"A moderator removed one of your {target_type}s for a guideline issue.")
            await _audit(_super, "content_delete", target_type, target_id)
            return {"deleted": True}

        # ---- P1: community members overview (moderation) ------------------
        @router.get("/api/admin/pixora/members")
        async def admin_members(_super=Depends(require_super_admin)):
            author_ids = set()
            for p in await db.pixora_posts.find({}, {"_id": 0, "studio_id": 1}).to_list(100000):
                author_ids.add(p.get("studio_id"))
            members = []
            for sid in list(author_ids)[:1000]:
                members.append({
                    "studio_id": sid, "name": await _studio_name(sid),
                    "posts": await db.pixora_posts.count_documents({"studio_id": sid}),
                    "followers": await db.pixora_follows.count_documents({"followee": sid}),
                    "verified_level": (await _verification_of(sid))["level"],
                })
            members.sort(key=lambda m: m["followers"], reverse=True)
            return {"members": members, "count": len(members)}

        # ---- P1: admin audit log viewer -----------------------------------
        @router.get("/api/admin/pixora/audit-log")
        async def admin_audit_log(limit: int = 200, _super=Depends(require_super_admin)):
            rows = await db.admin_action_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
            return {"log": rows}

    # ======================================================================
    # BATCH 6 — Brand Campaign Marketplace + Global Events + Global Analytics
    # ======================================================================
    CAMPAIGN_STATUSES = {"open", "closed", "completed", "removed"}
    APP_STATUSES = {"pending", "accepted", "rejected", "withdrawn"}
    DELIVERABLE_STATUSES = {"submitted", "approved", "revision"}

    async def _brand_of(sid: str) -> Optional[Dict[str, Any]]:
        return await db.pixora_brands.find_one({"studio_id": sid}, {"_id": 0})

    async def _campaign_enrich(c: Dict[str, Any]) -> Dict[str, Any]:
        brand = await db.pixora_brands.find_one({"id": c.get("brand_id")}, {"_id": 0}) or {}
        c["brand_name"] = brand.get("name") or await _studio_name(c.get("studio_id", ""))
        c["brand_logo"] = brand.get("logo_url", "")
        c["brand_verified"] = bool(brand.get("verified"))
        c["applicant_count"] = await db.pixora_campaign_apps.count_documents({"campaign_id": c["id"]})
        return c

    class _BrandIn(BaseModel):
        name: str = Field(min_length=1)
        logo_url: str = ""
        website: str = ""
        about: str = ""
        industry: str = ""
        country: str = ""

    @router.post("/api/pixora/brands")
    async def upsert_brand(payload: _BrandIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        existing = await _brand_of(sid)
        now = _now()
        if existing:
            await db.pixora_brands.update_one({"id": existing["id"]},
                {"$set": {**payload.model_dump(), "updated_at": now}})
            doc = {**existing, **payload.model_dump(), "updated_at": now}
        else:
            doc = {"id": f"brd_{uuid.uuid4().hex[:12]}", "studio_id": sid, **payload.model_dump(),
                   "verified": False, "created_at": now, "updated_at": now}
            await db.pixora_brands.insert_one(doc)
        return {"brand": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/brands/me")
    async def my_brand(admin: dict = Depends(require_admin)):
        return {"brand": await _brand_of(admin["admin_id"])}

    @router.get("/api/pixora/brands")
    async def list_brands(admin: dict = Depends(require_admin)):
        rows = await db.pixora_brands.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        for r in rows:
            r["open_campaigns"] = await db.pixora_campaigns.count_documents({"brand_id": r["id"], "status": "open"})
        rows.sort(key=lambda b: (not b.get("verified"), -b.get("open_campaigns", 0)))
        return {"brands": rows}

    class _CampaignIn(BaseModel):
        title: str = Field(min_length=1)
        brief: str = ""
        category: str = "photography"      # photography | videography | reels | editing | mixed
        deliverables_spec: str = ""
        region: str = ""
        country: str = ""
        budget_amount: float = 0
        budget_currency: str = "INR"
        slots: int = 1
        deadline: str = ""

    @router.post("/api/pixora/campaigns")
    async def create_campaign(payload: _CampaignIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        brand = await _brand_of(sid)
        if not brand:
            raise HTTPException(400, "Create a brand profile before posting a campaign")
        cur = payload.budget_currency if payload.budget_currency in SUPPORTED_CURRENCIES else "INR"
        doc = {"id": f"cmp_{uuid.uuid4().hex[:12]}", "brand_id": brand["id"], "studio_id": sid,
               **payload.model_dump(), "budget_currency": cur, "status": "open",
               "featured": False, "created_at": _now(), "updated_at": _now()}
        await db.pixora_campaigns.insert_one(doc)
        await _audit(sid, "campaign_create", "campaign", doc["id"], {"title": payload.title})
        return {"campaign": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/campaigns")
    async def browse_campaigns(category: str = "", country: str = "", region: str = "",
                               q: str = "", admin: dict = Depends(require_admin)):
        rows = await db.pixora_campaigns.find({"status": "open"}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        cats, countries, regions = set(), set(), set()
        ql = (q or "").strip().lower()
        out = []
        for c in rows:
            if c.get("category"):
                cats.add(c["category"])
            if c.get("country"):
                countries.add(c["country"])
            if c.get("region"):
                regions.add(c["region"])
            if category and c.get("category") != category:
                continue
            if country and c.get("country") != country:
                continue
            if region and c.get("region") != region:
                continue
            if ql and ql not in f"{c.get('title','')} {c.get('brief','')} {c.get('deliverables_spec','')}".lower():
                continue
            out.append(await _campaign_enrich(c))
        # rows already newest-first from the query; stable-sort featured to the top.
        out.sort(key=lambda c: not c.get("featured"))
        return {"campaigns": out, "facets": {
            "categories": sorted(cats), "countries": sorted(countries), "regions": sorted(regions)}}

    @router.get("/api/pixora/campaigns/mine")
    async def my_campaigns(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        as_brand = await db.pixora_campaigns.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(500)
        for c in as_brand:
            await _campaign_enrich(c)
        my_apps = await db.pixora_campaign_apps.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(500)
        as_creator = []
        for a in my_apps:
            c = await db.pixora_campaigns.find_one({"id": a["campaign_id"]}, {"_id": 0})
            if c:
                as_creator.append({**await _campaign_enrich(c), "my_application": a})
        return {"as_brand": as_brand, "as_creator": as_creator}

    @router.get("/api/pixora/campaigns/{campaign_id}")
    async def campaign_detail(campaign_id: str, admin: dict = Depends(require_admin)):
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c or c.get("status") == "removed":
            raise HTTPException(404, "Campaign not found")
        await _campaign_enrich(c)
        sid = admin["admin_id"]
        c["is_owner"] = c.get("studio_id") == sid
        c["my_application"] = await db.pixora_campaign_apps.find_one(
            {"campaign_id": campaign_id, "studio_id": sid}, {"_id": 0})
        return {"campaign": c}

    class _ApplyIn(BaseModel):
        pitch: str = ""
        quote_amount: float = 0
        quote_currency: str = "INR"

    @router.post("/api/pixora/campaigns/{campaign_id}/apply")
    async def apply_campaign(campaign_id: str, payload: _ApplyIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c or c.get("status") != "open":
            raise HTTPException(400, "Campaign is not open for applications")
        if c.get("studio_id") == sid:
            raise HTTPException(400, "You cannot apply to your own campaign")
        if await db.pixora_campaign_apps.find_one({"campaign_id": campaign_id, "studio_id": sid}, {"_id": 0}):
            raise HTTPException(400, "You have already applied")
        cur = payload.quote_currency if payload.quote_currency in SUPPORTED_CURRENCIES else "INR"
        doc = {"id": f"app_{uuid.uuid4().hex[:12]}", "campaign_id": campaign_id, "studio_id": sid,
               "pitch": payload.pitch, "quote_amount": payload.quote_amount, "quote_currency": cur,
               "status": "pending", "created_at": _now()}
        await db.pixora_campaign_apps.insert_one(doc)
        await _notify(c.get("studio_id"), "campaign_application",
                      f"{await _studio_name(sid)} applied to your campaign “{c.get('title','')}”.",
                      actor=sid, entity_id=campaign_id)
        return {"applied": True, "application": {k: v for k, v in doc.items() if k != "_id"}}

    @router.post("/api/pixora/campaigns/{campaign_id}/close")
    async def close_campaign(campaign_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        if c.get("studio_id") != sid:
            raise HTTPException(403, "Only the campaign owner can close it")
        await db.pixora_campaigns.update_one({"id": campaign_id},
            {"$set": {"status": "closed", "updated_at": _now()}})
        return {"closed": True}

    @router.get("/api/pixora/campaigns/{campaign_id}/applications")
    async def campaign_applications(campaign_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        if c.get("studio_id") != sid:
            raise HTTPException(403, "Only the campaign owner can view applications")
        apps = await db.pixora_campaign_apps.find({"campaign_id": campaign_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        for a in apps:
            a["creator_name"] = await _studio_name(a["studio_id"])
            a["creator_verified"] = (await _verification_of(a["studio_id"]))["level"]
        return {"applications": apps}

    class _DecisionIn(BaseModel):
        decision: str  # accepted | rejected

    @router.post("/api/pixora/applications/{application_id}/decision")
    async def decide_application(application_id: str, payload: _DecisionIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        a = await db.pixora_campaign_apps.find_one({"id": application_id}, {"_id": 0})
        if not a:
            raise HTTPException(404, "Application not found")
        c = await db.pixora_campaigns.find_one({"id": a["campaign_id"]}, {"_id": 0})
        if not c or c.get("studio_id") != sid:
            raise HTTPException(403, "Only the campaign owner can decide")
        if payload.decision not in ("accepted", "rejected"):
            raise HTTPException(400, "Invalid decision")
        await db.pixora_campaign_apps.update_one({"id": application_id},
            {"$set": {"status": payload.decision, "decided_at": _now()}})
        await _notify(a["studio_id"], "campaign_decision",
                      f"Your application for “{c.get('title','')}” was {payload.decision}.",
                      actor=sid, entity_id=a["campaign_id"])
        await _audit(sid, f"campaign_app_{payload.decision}", "campaign", a["campaign_id"], {"application_id": application_id})
        return {"updated": True, "status": payload.decision}

    class _DeliverableIn(BaseModel):
        title: str = Field(min_length=1)
        url: str = ""
        note: str = ""

    @router.post("/api/pixora/applications/{application_id}/deliverables")
    async def submit_deliverable(application_id: str, payload: _DeliverableIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        a = await db.pixora_campaign_apps.find_one({"id": application_id}, {"_id": 0})
        if not a or a.get("studio_id") != sid:
            raise HTTPException(403, "Not your application")
        if a.get("status") != "accepted":
            raise HTTPException(400, "Your application must be accepted before submitting deliverables")
        doc = {"id": f"dlv_{uuid.uuid4().hex[:12]}", "campaign_id": a["campaign_id"], "application_id": application_id,
               "studio_id": sid, **payload.model_dump(), "status": "submitted", "review_note": "", "created_at": _now()}
        await db.pixora_deliverables.insert_one(doc)
        c = await db.pixora_campaigns.find_one({"id": a["campaign_id"]}, {"_id": 0}) or {}
        await _notify(c.get("studio_id"), "campaign_deliverable",
                      f"{await _studio_name(sid)} submitted a deliverable for “{c.get('title','')}”.",
                      actor=sid, entity_id=a["campaign_id"])
        return {"deliverable": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/pixora/campaigns/{campaign_id}/deliverables")
    async def list_deliverables(campaign_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        rows = await db.pixora_deliverables.find({"campaign_id": campaign_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        if c.get("studio_id") != sid:
            rows = [r for r in rows if r.get("studio_id") == sid]   # creators see only their own
        for r in rows:
            r["creator_name"] = await _studio_name(r["studio_id"])
        return {"deliverables": rows}

    class _ReviewDeliverableIn(BaseModel):
        decision: str          # approved | revision
        note: str = ""

    @router.post("/api/pixora/deliverables/{deliverable_id}/review")
    async def review_deliverable(deliverable_id: str, payload: _ReviewDeliverableIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        d = await db.pixora_deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Deliverable not found")
        c = await db.pixora_campaigns.find_one({"id": d["campaign_id"]}, {"_id": 0})
        if not c or c.get("studio_id") != sid:
            raise HTTPException(403, "Only the campaign owner can review")
        if payload.decision not in ("approved", "revision"):
            raise HTTPException(400, "Invalid decision")
        await db.pixora_deliverables.update_one({"id": deliverable_id},
            {"$set": {"status": payload.decision, "review_note": payload.note, "reviewed_at": _now()}})
        await _notify(d["studio_id"], "deliverable_review",
                      f"Your deliverable for “{c.get('title','')}” was marked {payload.decision}.",
                      actor=sid, entity_id=d["campaign_id"])
        return {"updated": True, "status": payload.decision}

    class _PaymentIn(BaseModel):
        application_id: str
        amount: float
        currency: str = "INR"
        note: str = ""

    @router.post("/api/pixora/campaigns/{campaign_id}/payments")
    async def record_payment(campaign_id: str, payload: _PaymentIn, admin: dict = Depends(require_admin)):
        # PLACEHOLDER LEDGER ONLY — records an intended payout; performs NO real transfer.
        # Real gateway/payout integration is the final external step (owner-configured).
        sid = admin["admin_id"]
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c or c.get("studio_id") != sid:
            raise HTTPException(403, "Only the campaign owner can record payments")
        a = await db.pixora_campaign_apps.find_one({"id": payload.application_id}, {"_id": 0})
        if not a or a.get("campaign_id") != campaign_id:
            raise HTTPException(404, "Application not found for this campaign")
        cur = payload.currency if payload.currency in SUPPORTED_CURRENCIES else "INR"
        doc = {"id": f"pay_{uuid.uuid4().hex[:12]}", "campaign_id": campaign_id, "brand_id": c.get("brand_id"),
               "application_id": payload.application_id, "studio_id": a["studio_id"], "amount": payload.amount,
               "currency": cur, "status": "recorded", "method": "placeholder", "note": payload.note,
               "created_at": _now()}
        await db.pixora_campaign_payments.insert_one(doc)
        await _audit(sid, "campaign_payment_record", "campaign", campaign_id,
                     {"amount": payload.amount, "currency": cur, "creator": a["studio_id"]})
        await _notify(a["studio_id"], "campaign_payment",
                      f"A payment of {cur} {payload.amount:,.0f} was recorded for “{c.get('title','')}”.",
                      actor=sid, entity_id=campaign_id)
        return {"recorded": True, "payment": {k: v for k, v in doc.items() if k != "_id"},
                "note": "Ledger entry only — no funds were transferred by the platform."}

    @router.get("/api/pixora/campaigns/{campaign_id}/report")
    async def campaign_report(campaign_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not c or c.get("studio_id") != sid:
            raise HTTPException(403, "Only the campaign owner can view the report")
        apps = await db.pixora_campaign_apps.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(5000)
        dlv = await db.pixora_deliverables.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(5000)
        pays = await db.pixora_campaign_payments.find({"campaign_id": campaign_id}, {"_id": 0}).to_list(5000)
        rates = await _currency_rates()

        def _to_inr(amt, cur):
            # rates[cur] = units of `cur` per 1 INR, so cur→INR divides.
            try:
                rate = float(rates.get(cur or "INR", 1.0)) or 1.0
                return float(amt or 0) / rate
            except (TypeError, ValueError, ZeroDivisionError):
                return 0.0
        by_app_status: Dict[str, int] = {}
        for a in apps:
            by_app_status[a.get("status", "pending")] = by_app_status.get(a.get("status", "pending"), 0) + 1
        by_dlv_status: Dict[str, int] = {}
        for d in dlv:
            by_dlv_status[d.get("status", "submitted")] = by_dlv_status.get(d.get("status", "submitted"), 0) + 1
        return {
            "campaign": await _campaign_enrich(c),
            "applications_total": len(apps),
            "applications_by_status": by_app_status,
            "accepted": by_app_status.get("accepted", 0),
            "deliverables_total": len(dlv),
            "deliverables_by_status": by_dlv_status,
            "approved_deliverables": by_dlv_status.get("approved", 0),
            "payments_count": len(pays),
            "payments_total_inr": round(sum(_to_inr(p.get("amount"), p.get("currency")) for p in pays), 2),
        }

    if require_super_admin is not None:
        # ---- Batch 6: admin — brand & campaign moderation ------------------
        @router.get("/api/admin/campaigns")
        async def admin_campaigns(_super=Depends(require_super_admin)):
            rows = await db.pixora_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
            for c in rows:
                await _campaign_enrich(c)
            brands = await db.pixora_brands.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
            for b in brands:
                b["campaigns"] = await db.pixora_campaigns.count_documents({"brand_id": b["id"]})
            return {"campaigns": rows, "brands": brands,
                    "totals": {"campaigns": len(rows), "brands": len(brands),
                               "open": sum(1 for c in rows if c.get("status") == "open")}}

        class _CampaignActionIn(BaseModel):
            action: str        # feature | unfeature | remove | reopen

        @router.post("/api/admin/campaigns/{campaign_id}/action")
        async def admin_campaign_action(campaign_id: str, payload: _CampaignActionIn, _super=Depends(require_super_admin)):
            c = await db.pixora_campaigns.find_one({"id": campaign_id}, {"_id": 0})
            if not c:
                raise HTTPException(404, "Campaign not found")
            updates = {"feature": {"featured": True}, "unfeature": {"featured": False},
                       "remove": {"status": "removed"}, "reopen": {"status": "open"}}.get(payload.action)
            if updates is None:
                raise HTTPException(400, "Invalid action")
            await db.pixora_campaigns.update_one({"id": campaign_id}, {"$set": {**updates, "updated_at": _now()}})
            await _audit(_super, f"campaign_{payload.action}", "campaign", campaign_id)
            return {"updated": True, "action": payload.action}

        @router.post("/api/admin/brands/{brand_id}/verify")
        async def admin_verify_brand(brand_id: str, _super=Depends(require_super_admin)):
            b = await db.pixora_brands.find_one({"id": brand_id}, {"_id": 0})
            if not b:
                raise HTTPException(404, "Brand not found")
            newv = not b.get("verified")
            await db.pixora_brands.update_one({"id": brand_id}, {"$set": {"verified": newv, "updated_at": _now()}})
            await _audit(_super, "brand_verify" if newv else "brand_unverify", "brand", brand_id)
            if newv:
                await _notify(b.get("studio_id"), "brand_verified",
                              f"Your brand “{b.get('name','')}” is now verified on Pixora.", actor=_super, entity_id=brand_id)
            return {"verified": newv}

        # ---- Batch 6: admin — global events management ---------------------
        @router.get("/api/admin/events")
        async def admin_events(_super=Depends(require_super_admin)):
            rows = await db.pixora_events.find({}, {"_id": 0}).sort("date", -1).to_list(5000)
            by_country: Dict[str, int] = {}
            for r in rows:
                r["host"] = await _studio_name(r["studio_id"])
                r["rsvp_count"] = len(r.get("rsvps", []))
                by_country[r.get("country") or "—"] = by_country.get(r.get("country") or "—", 0) + 1
            return {"events": rows, "by_country": [{"country": k, "count": v} for k, v in sorted(by_country.items(), key=lambda x: -x[1])]}

        @router.delete("/api/admin/events/{event_id}")
        async def admin_delete_event(event_id: str, _super=Depends(require_super_admin)):
            ev = await db.pixora_events.find_one({"id": event_id}, {"_id": 0})
            if not ev:
                raise HTTPException(404, "Event not found")
            await db.pixora_events.delete_one({"id": event_id})
            await _audit(_super, "event_delete", "event", event_id, {"title": ev.get("title")})
            return {"deleted": True}

        # ---- Batch 6: Global Analytics Center (country/region/growth/rev) --
        @router.get("/api/admin/analytics/global")
        async def global_analytics_center(_super=Depends(require_super_admin)):
            # Creator geography from portfolio profiles (adapter-safe: scan + aggregate in Python).
            profiles = await db.portfolio_profiles.find({}, {"_id": 0}).to_list(100000)
            by_country: Dict[str, int] = {}
            by_state: Dict[str, int] = {}
            for p in profiles:
                c = (p.get("country") or "").strip() or "Unspecified"
                by_country[c] = by_country.get(c, 0) + 1
                s = (p.get("state") or "").strip()
                if s:
                    by_state[s] = by_state.get(s, 0) + 1

            # Growth — new studios & posts per day (last 30d).
            def _daily(rows: List[Dict[str, Any]], field: str = "created_at") -> List[Dict[str, Any]]:
                d: Dict[str, int] = {}
                for r in rows:
                    day = (r.get(field) or "")[:10]
                    if day:
                        d[day] = d.get(day, 0) + 1
                return [{"day": k, "count": v} for k, v in sorted(d.items())][-30:]

            studios = await db.admins.find({}, {"_id": 0}).to_list(100000)
            posts = await db.pixora_posts.find({}, {"_id": 0}).to_list(100000)
            events = await db.analytics_events.find({}, {"_id": 0}).to_list(200000)

            # Engagement — posts/comments/likes/follows.
            likes = sum(len(p.get("likes", [])) for p in posts)
            comments = await db.pixora_comments.count_documents({})
            follows = await db.pixora_follows.count_documents({})

            # Revenue — campaign payment ledger, normalized to INR.
            rates = await _currency_rates()
            pays = await db.pixora_campaign_payments.find({}, {"_id": 0}).to_list(50000)
            rev_inr = 0.0
            rev_by_currency: Dict[str, float] = {}
            for p in pays:
                cur = p.get("currency") or "INR"
                amt = float(p.get("amount") or 0)
                rev_by_currency[cur] = rev_by_currency.get(cur, 0) + amt
                rev_inr += amt / (float(rates.get(cur, 1.0)) or 1.0)

            # Creator leaderboard by followers (top 10).
            fol_counts: Dict[str, int] = {}
            for f in await db.pixora_follows.find({}, {"_id": 0, "followee": 1}).to_list(200000):
                fol_counts[f.get("followee")] = fol_counts.get(f.get("followee"), 0) + 1
            top = sorted(fol_counts.items(), key=lambda x: -x[1])[:10]
            top_creators = [{"studio_id": sid, "name": await _studio_name(sid), "followers": n} for sid, n in top]

            return {
                "geography": {
                    "by_country": [{"country": k, "creators": v} for k, v in sorted(by_country.items(), key=lambda x: -x[1])],
                    "by_state": [{"state": k, "creators": v} for k, v in sorted(by_state.items(), key=lambda x: -x[1])][:25],
                    "countries_active": len([k for k in by_country if k != "Unspecified"]),
                },
                "growth": {
                    "studios_daily": _daily(studios),
                    "posts_daily": _daily(posts),
                    "events_daily": _daily(events),
                },
                "engagement": {
                    "posts": len(posts), "comments": comments, "likes": likes, "follows": follows,
                    "avg_likes_per_post": round(likes / len(posts), 2) if posts else 0,
                },
                "revenue": {
                    "campaign_payouts_inr": round(rev_inr, 2),
                    "by_currency": [{"currency": k, "amount": round(v, 2)} for k, v in sorted(rev_by_currency.items())],
                    "payments_count": len(pays),
                },
                "creators": {
                    "total": len(studios),
                    "verified": await db.pixora_verifications.count_documents({"status": "approved"}),
                    "brands": await db.pixora_brands.count_documents({}),
                    "campaigns": await db.pixora_campaigns.count_documents({}),
                    "top": top_creators,
                },
            }

    return router
