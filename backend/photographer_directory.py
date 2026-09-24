"""
Photographer directory — a public, filterable listing of photographers.

Couples can browse photographers by city and by who is AVAILABLE RIGHT NOW
(the photographer toggles their own availability). Directory fields live on the
photographer's `admins` document so we reuse the existing identity:
  directory_listed (bool), available_now (bool), available_at (iso),
  service_cities (list[str] lowercased), bio (str), portfolio_images (list[str]).

Availability auto-expires: a photographer is "available now" only if they toggled
it on within the last AVAILABILITY_TTL minutes (so a forgotten toggle doesn't
show them as available days later).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("photographer_directory")

AVAILABILITY_TTL_MIN = 120  # "available now" is fresh for 2 hours


def _now():
    return datetime.now(timezone.utc)


# Grace window after current_period_end during which a lapsed sub still reads
# as entitled. Duplicated from portfolio_service._sub_is_current — small
# enough that importing across these two modules isn't worth the coupling;
# keep both copies in sync if the grace window or the field name ever changes.
_SUB_GRACE_DAYS = 3


def _sub_is_current(sub: dict) -> bool:
    if (sub or {}).get("status") != "active":
        return False
    end = (sub or {}).get("current_period_end")
    if not end:
        return True
    try:
        end_dt = datetime.fromisoformat(str(end))
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return True
    return (end_dt + timedelta(days=_SUB_GRACE_DAYS)) >= _now()


def _created_epoch(row: dict) -> float:
    """Sortable numeric timestamp for created_at (0.0 for missing/unparsable —
    sorts oldest, never crashes the sort)."""
    v = row.get("created_at")
    if not v:
        return 0.0
    try:
        dt = datetime.fromisoformat(str(v))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except (ValueError, TypeError):
        return 0.0


def _is_available(doc: dict) -> bool:
    if not doc.get("available_now"):
        return False
    at = doc.get("available_at")
    if not at:
        return False
    try:
        t = datetime.fromisoformat(at)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t > _now() - timedelta(minutes=AVAILABILITY_TTL_MIN)
    except Exception:
        return False


class AvailabilityIn(BaseModel):
    available_now: bool


class ProfileIn(BaseModel):
    directory_listed: bool = True
    bio: str = ""
    service_cities: List[str] = Field(default_factory=list)
    portfolio_images: List[str] = Field(default_factory=list)
    # each: {"url": str, "poster": str, "label": str, "event": str}
    portfolio_videos: List[dict] = Field(default_factory=list)
    starting_price: Optional[int] = None  # ₹ package starting price


class ReviewIn(BaseModel):
    """A past client's feedback for a photographer."""
    author: str = Field(default="", max_length=80)
    text: str = Field(min_length=3, max_length=600)
    rating: int = Field(ge=1, le=5)
    event_type: Optional[str] = Field(default=None, max_length=60)


def _public_view(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "name": doc.get("name") or doc.get("studio_name") or "Studio",
        "studio_name": doc.get("studio_name"),
        "bio": doc.get("bio", ""),
        "service_cities": doc.get("service_cities", []),
        "portfolio_images": (doc.get("portfolio_images") or [])[:6],
        "portfolio_videos": (doc.get("portfolio_videos") or [])[:6],
        "available_now": _is_available(doc),
        "city": (doc.get("service_cities") or [None])[0],
        "starting_price": doc.get("starting_price"),
        "is_demo": bool(doc.get("is_demo")),
    }


def _review_view(r: dict) -> dict:
    return {
        "id": r.get("id"),
        "author": r.get("author") or "Verified client",
        "text": r.get("text", ""),
        "rating": r.get("rating"),
        "event_type": r.get("event_type"),
        "created_at": r.get("created_at"),
    }


async def _reviews_index(db, pids: list) -> dict:
    """Return {photographer_id: [raw review, ...]} (newest first) for the
    published reviews belonging to the given photographer ids."""
    pids = [p for p in pids if p]
    if not pids:
        return {}
    try:
        cur = db.photographer_reviews.find(
            {"photographer_id": {"$in": pids}, "status": "published"}, {"_id": 0}
        )
        rows = await cur.to_list(5000)
    except Exception:
        logger.warning("reviews index query failed", exc_info=True)
        rows = []
    idx: dict = {}
    for r in rows:
        idx.setdefault(r.get("photographer_id"), []).append(r)
    for pid in idx:
        idx[pid].sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return idx


def _attach_reviews(view: dict, reviews: list, *, limit: int = 3) -> dict:
    """Fold rating average + count + recent reviews into a public view."""
    ratings = [r.get("rating") for r in reviews if isinstance(r.get("rating"), int)]
    view["review_count"] = len(reviews)
    view["rating"] = round(sum(ratings) / len(ratings), 1) if ratings else None
    view["reviews"] = [_review_view(r) for r in reviews[:limit]]
    return view


async def query_directory(db, *, city: str = "", available: int = 0, state: str = "",
                          q: str = "", category: str = "", skill: str = "",
                          min_experience: int = 0, verified: int = 0,
                          min_rating: float = 0, sort: str = "", country: str = "",
                          min_budget: int = 0, max_budget: int = 0) -> dict:
    """The directory query, module-level so the public listing endpoint AND the
    SEO discovery endpoints share ONE implementation (no duplicated filter logic).
    Returns {photographers, count, facets}. Behaviour is unchanged from the
    original endpoint; it additionally attaches each row's portfolio `slug` so
    callers can build crawlable /photographer/<slug>/portfolio links."""
    # Fetch all studios; visibility is decided below by the PLAN GATE +
    # an opt-OUT (a studio is listed once it holds a Basic/Premium plan,
    # unless it explicitly set directory_listed = False).
    cur = db.admins.find({}, {"_id": 0, "password_hash": 0})
    rows = await cur.to_list(5000)

    # Enrich with portfolio-profile data (state / experience / services / styles)
    # so the directory can filter on them, and with the S3-A verification level.
    profiles: dict = {}
    try:
        for p in await db.portfolio_profiles.find({}, {"_id": 0}).to_list(5000):
            profiles[p.get("id")] = p
    except Exception:
        pass

    # ---- PLAN GATE (core logic) --------------------------------------
    # A photographer appears in the public directory ONLY while they hold an
    # active *portfolio* subscription (Basic or Premium). Free/'normal'
    # studios are never listed. Premium studios surface first (see sort).
    # `tier_by_id` maps studio_id -> 'basic' | 'premium' from the plan's
    # `portfolio_tier`. Curated demo showcase studios (is_demo) are exempt.
    tier_by_id: dict = {}
    try:
        subs = await db.subscriptions.find(
            {"product": "portfolio", "status": "active"}, {"_id": 0}).to_list(5000)
        plan_cache: dict = {}
        for s in subs:
            if not _sub_is_current(s):
                continue
            sid = s.get("studio_id")
            if not sid:
                continue
            pid_ = s.get("plan_id")
            if pid_ not in plan_cache:
                plan_cache[pid_] = await db.subscription_plans.find_one(
                    {"id": pid_}, {"_id": 0}) or {}
            plan_row = plan_cache[pid_]
            t = str((plan_row.get("portfolio_tier") or "")).strip().lower()
            if t not in ("premium", "basic"):
                # Plan predates portfolio_tier — infer from the tier name so a
                # paid Professional/Studio still counts as premium.
                name = str((plan_row.get("tier") or s.get("tier") or "")).strip().lower()
                t = "premium" if name in {"professional", "studio", "premium", "elite", "pro", "enterprise"} else "basic"
            # a studio may hold several rows over time; premium wins.
            if tier_by_id.get(sid) == "premium":
                continue
            tier_by_id[sid] = "premium" if t == "premium" else "basic"
    except Exception:
        logger.warning("directory: portfolio tier map failed", exc_info=True)

    city_l = (city or "").strip().lower()
    state_l = (state or "").strip().lower()
    country_l = (country or "").strip().lower()
    q_l = (q or "").strip().lower()
    cat_l = (category or "").strip().lower()
    skill_l = (skill or "").strip().lower()

    out = []
    for d in rows:
        pid = d.get("id")
        is_demo = bool(d.get("is_demo"))
        # opt-OUT: a studio can hide itself from the directory.
        if d.get("directory_listed") is False:
            continue
        # PLAN GATE: skip anyone without an active Basic/Premium portfolio
        # plan (demo showcases excepted).
        if not is_demo and pid not in tier_by_id:
            continue
        prof = profiles.get(pid) or profiles.get(d.get("admin_id")) or {}
        loc = prof.get("location") or {}
        services = prof.get("services") or d.get("services") or []
        styles = prof.get("styles") or d.get("styles") or []
        # City is normally mirrored onto the admins doc when the portfolio is
        # saved; fall back to the portfolio form (location.city + coverage_areas)
        # for profiles saved before that sync existed, so filters never go blank.
        cities_all = list(d.get("service_cities") or [])
        for c in [loc.get("city")] + list(prof.get("coverage_areas") or []):
            c = str(c or "").strip().lower()
            if c and c not in cities_all:
                cities_all.append(c)
        v = _public_view(d)
        v["service_cities"] = cities_all
        v["city"] = (cities_all or [None])[0]
        # Portfolio slug → crawlable /photographer/<slug>/portfolio links
        # (directory cards + discovery ItemList). Falls back to the id, which
        # the portfolio route also resolves.
        v["slug"] = prof.get("slug") or pid
        # Budget: prefer the directory value, else the portfolio starting price.
        price = d.get("starting_price")
        if price in (None, "", 0):
            price = prof.get("starting_price")
        v["starting_price"] = price
        v["state"] = loc.get("state") or ""
        v["country"] = loc.get("country") or ("India" if (loc.get("state") or loc.get("city")) else "")
        v["experience_years"] = prof.get("experience_years") or 0
        v["services"] = services
        v["styles"] = styles
        # Studio vs freelance, and the coarse availability status — both drive
        # home-directory filters and are set in the portfolio form.
        v["portfolio_type"] = (prof.get("portfolio_type") or "studio").lower()
        v["availability_status"] = prof.get("availability_status") or "Available"
        v["tier"] = tier_by_id.get(pid, "premium" if is_demo else "basic")
        v["verified_level"] = int(d.get("pixora_verified_level") or 0)
        v["created_at"] = d.get("created_at")

        # ---- filters ----
        # skill = the photographer's shooting styles (Candid, Cinematic, …)
        if skill_l and not any(skill_l in (s or "").lower() for s in styles):
            continue
        if city_l:
            cities = [c.lower() for c in cities_all]
            if city_l not in cities and not any(city_l in c for c in cities):
                continue
        if state_l and state_l not in (v["state"] or "").lower():
            continue
        if country_l and country_l not in (v["country"] or "").lower():
            continue
        if available and not _is_available(d):
            continue
        if min_experience and v["experience_years"] < min_experience:
            continue
        # Budget band. A studio that hasn't set a price is NOT hidden by a
        # budget filter (better to show an unpriced studio than lose it) — we
        # only exclude when the price is known and falls outside the band.
        if (min_budget or max_budget) and price not in (None, "", 0):
            if min_budget and price < min_budget:
                continue
            if max_budget and price > max_budget:
                continue
        if verified and v["verified_level"] < verified:
            continue
        if cat_l and not any(cat_l in (s or "").lower() for s in services):
            continue
        if q_l:
            hay = " ".join([str(v.get("name") or ""), str(v.get("studio_name") or ""),
                            " ".join(v.get("service_cities") or []), " ".join(services),
                            v.get("state") or ""]).lower()
            if q_l not in hay:
                continue
        out.append(v)

    # (tier is set per-row from the plan gate above; premium surfaces first.)

    # fold in rating + recent past-client feedback (single grouped query)
    ridx = await _reviews_index(db, [v["id"] for v in out])
    for v in out:
        _attach_reviews(v, ridx.get(v["id"], []))

    # rating filter (needs reviews attached first)
    if min_rating:
        out = [v for v in out if (v.get("rating") or 0) >= min_rating]

    # ---- sort ----
    if sort == "rating":
        out.sort(key=lambda x: (x["tier"] != "premium", -(x.get("rating") or 0), (x["name"] or "").lower()))
    elif sort == "experience":
        out.sort(key=lambda x: (x["tier"] != "premium", -(x.get("experience_years") or 0), (x["name"] or "").lower()))
    elif sort == "newest":
        # single sort key: premium-first, then newest-first within each tier.
        # (previously: two separate .sort() calls where the second discarded
        # the premium-first ordering entirely — see recon-portfolio-studio §15.6)
        out.sort(key=lambda x: (x["tier"] != "premium", -_created_epoch(x)))
    elif sort == "name":
        out.sort(key=lambda x: (x["name"] or "").lower())
    else:  # relevance: premium, then verified, then available, then rating
        out.sort(key=lambda x: (x["tier"] != "premium", -(x.get("verified_level") or 0),
                                not x["available_now"], -(x.get("rating") or 0), (x["name"] or "").lower()))

    # facets so the UI can populate filter dropdowns from live data
    facets = {
        "countries": sorted({v["country"] for v in out if v.get("country")}),
        "states": sorted({v["state"] for v in out if v.get("state")}),
        "cities": sorted({c for v in out for c in (v.get("service_cities") or []) if c}),
        "categories": sorted({s for v in out for s in (v.get("services") or []) if s}),
        "skills": sorted({s for v in out for s in (v.get("styles") or []) if s}),
    }
    return {"photographers": out, "count": len(out), "facets": facets}


async def resolve_discovery_page(db, segment_a: str, segment_b: Optional[str] = None):
    """Turn discovery URL segments into a full page payload, or None (→ 404).

    Shared by the JSON discovery endpoints AND the server-side crawler renderer
    (server._render_og_for_discovery), so both agree on resolution, the listed
    photographers, the SEO and the >= threshold index decision. Reuses
    query_directory (no duplicate filter logic) + discovery.py (pure resolver)."""
    from discovery import (resolve_single, resolve_combined, discovery_filters,
                           discovery_seo, collection_jsonld)
    base = await query_directory(db)
    cities = set(base["facets"].get("cities") or [])
    resolved = (resolve_combined(segment_a, segment_b, cities) if segment_b
                else resolve_single(segment_a, cities))
    if not resolved:
        return None
    res = await query_directory(db, **discovery_filters(resolved))
    photographers = res["photographers"]
    count = len([p for p in photographers if not p.get("is_demo")])
    seo = discovery_seo(resolved, count)
    return {
        "resolved": {"kind": resolved.get("kind"), "city": resolved.get("city"),
                     "service": (resolved.get("service") or {}).get("slug")},
        "photographers": photographers,
        "count": res["count"],
        "facets": res["facets"],
        "seo": seo,
        "indexable": seo["indexable"],
        "json_ld": collection_jsonld(resolved, photographers, seo),
    }


async def enumerate_discovery_pages(db, *, max_combined: int = 1000) -> List[str]:
    """The discovery page paths that clear the >= MIN_PHOTOGRAPHERS threshold —
    the ones the sitemap should list. One directory scan; counts per service, per
    city, and per (city, service).

    Counting mirrors query_directory's substring match but uses EXACT city
    membership, so a count here is a lower bound on what resolve_discovery_page
    reports — i.e. every path returned is guaranteed indexable when crawled (never
    a noindex page smuggled into the sitemap)."""
    from discovery import SERVICE_TAXONOMY, MIN_PHOTOGRAPHERS, _norm

    base = await query_directory(db)
    photographers = [p for p in base["photographers"] if not p.get("is_demo")]

    def _matches(p, svc) -> bool:
        field = "styles" if svc.get("field") == "skill" else "services"
        return any(svc["match"] in (s or "").lower() for s in (p.get(field) or []))

    paths: List[str] = []

    # category pages
    for svc in SERVICE_TAXONOMY:
        if sum(1 for p in photographers if _matches(p, svc)) >= MIN_PHOTOGRAPHERS:
            paths.append(f"/photographers/{svc['slug']}")

    # location pages
    city_counts: dict = {}
    for p in photographers:
        for c in {_norm(c) for c in (p.get("service_cities") or []) if c}:
            city_counts[c] = city_counts.get(c, 0) + 1
    for c in sorted(city_counts):
        if city_counts[c] >= MIN_PHOTOGRAPHERS:
            paths.append(f"/photographers/{c}")

    # combined pages (capped)
    combo: dict = {}
    for p in photographers:
        pcities = {_norm(c) for c in (p.get("service_cities") or []) if c}
        for svc in SERVICE_TAXONOMY:
            if _matches(p, svc):
                for c in pcities:
                    combo[(c, svc["slug"])] = combo.get((c, svc["slug"]), 0) + 1
    combined_paths = [f"/photographers/{c}/{s}" for (c, s), n in sorted(combo.items())
                      if n >= MIN_PHOTOGRAPHERS]
    paths.extend(combined_paths[:max_combined])
    return paths


def build_photographer_directory_router(db, get_current_admin) -> APIRouter:
    router = APIRouter(tags=["photographer-directory"])

    # ---- public: browse photographers (national directory) ----------------
    @router.get("/api/public/photographers")
    async def list_photographers(city: str = "", available: int = 0, state: str = "",
                                 q: str = "", category: str = "", skill: str = "",
                                 min_experience: int = 0,
                                 verified: int = 0, min_rating: float = 0, sort: str = "",
                                 country: str = "", min_budget: int = 0, max_budget: int = 0):
        return await query_directory(
            db, city=city, available=available, state=state, q=q, category=category,
            skill=skill, min_experience=min_experience, verified=verified,
            min_rating=min_rating, sort=sort, country=country,
            min_budget=min_budget, max_budget=max_budget)

    # ---- public: SEO discovery pages (category / location / combined) -------
    # Pretty crawlable URLs resolved to a directory filter + page SEO, via the
    # shared module-level resolve_discovery_page (also used by the crawler
    # renderer). Thin pages (< discovery.MIN_PHOTOGRAPHERS) render but are marked
    # non-indexable and stay out of the sitemap.
    @router.get("/api/public/discovery/{segment}")
    async def discovery_single(segment: str):
        page = await resolve_discovery_page(db, segment)
        if not page:
            raise HTTPException(404, "No such discovery page")
        return page

    @router.get("/api/public/discovery/{city_seg}/{service_seg}")
    async def discovery_combined(city_seg: str, service_seg: str):
        page = await resolve_discovery_page(db, city_seg, service_seg)
        if not page:
            raise HTTPException(404, "No such discovery page")
        return page

    # ---- public: a single photographer's full portfolio + all reviews ------
    @router.get("/api/public/photographers/{photographer_id}")
    async def get_photographer(photographer_id: str):
        doc = await db.admins.find_one(
            {"id": photographer_id, "directory_listed": True},
            {"_id": 0, "password_hash": 0},
        )
        if not doc:
            return {"photographer": None}
        view = _public_view(doc)
        view["portfolio_images"] = (doc.get("portfolio_images") or [])[:12]
        view["portfolio_videos"] = (doc.get("portfolio_videos") or [])[:12]
        revs = (await _reviews_index(db, [photographer_id])).get(photographer_id, [])
        _attach_reviews(view, revs, limit=len(revs))  # full list on the detail view
        return {"photographer": view}

    # ---- public: a past client submits feedback ----------------------------
    @router.post("/api/public/photographers/{photographer_id}/reviews")
    async def submit_review(photographer_id: str, payload: ReviewIn, request: Request):
        # H3: anti-abuse — rate-limit submissions per IP so a script can't flood
        # a photographer's rating up or down.
        try:
            from cache_backend import rate_limit_allow
            ip = request.client.host if request and request.client else "unknown"
            if not await rate_limit_allow(f"review:{ip}", limit=3, window_seconds=3600):
                raise HTTPException(status_code=429, detail="Too many reviews submitted. Please try again later.")
        except HTTPException:
            raise
        except Exception:
            pass  # never block on rate-limit backend failure
        doc = await db.admins.find_one(
            {"id": photographer_id, "directory_listed": True}, {"_id": 0, "id": 1}
        )
        if not doc:
            return {"ok": False, "error": "photographer_not_found"}
        rec = {
            "id": uuid.uuid4().hex,
            "photographer_id": photographer_id,
            "author": (payload.author or "").strip()[:80] or "Verified client",
            "text": payload.text.strip()[:600],
            "rating": int(payload.rating),
            "event_type": (payload.event_type or None),
            # H3: moderation — public reviews are held for approval, NOT shown
            # until a super-admin publishes them (_reviews_index only reads
            # status=="published"). This blocks rating manipulation + spam.
            "status": "pending",
            "created_at": _now().isoformat(),
        }
        await db.photographer_reviews.insert_one(rec)
        return {"ok": True, "pending": True,
                "message": "Thank you! Your review is awaiting moderation."}

    # ---- photographer: toggle availability --------------------------------
    @router.post("/api/admin/photographer/availability")
    async def set_availability(payload: AvailabilityIn, admin_id: str = Depends(get_current_admin)):
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {"available_now": payload.available_now,
                      "available_at": _now().isoformat() if payload.available_now else None}},
        )
        return {"available_now": payload.available_now}

    # ---- photographer: profile (bio, cities, portfolio, listed) -----------
    @router.get("/api/admin/photographer/profile")
    async def get_profile(admin_id: str = Depends(get_current_admin)):
        doc = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
        return {
            "directory_listed": bool(doc.get("directory_listed")),
            "bio": doc.get("bio", ""),
            "service_cities": doc.get("service_cities", []),
            "portfolio_images": doc.get("portfolio_images", []),
            "available_now": _is_available(doc),
        }

    @router.post("/api/admin/photographer/profile")
    async def save_profile(payload: ProfileIn, admin_id: str = Depends(get_current_admin)):
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {
                "directory_listed": payload.directory_listed,
                "bio": payload.bio.strip(),
                "service_cities": [c.strip().lower() for c in payload.service_cities if c.strip()],
                "portfolio_images": payload.portfolio_images[:12],
                "portfolio_videos": (payload.portfolio_videos or [])[:12],
                "starting_price": payload.starting_price,
            }},
        )
        return {"saved": True}

    # ---- photographer: read my own client feedback ------------------------
    @router.get("/api/admin/photographer/reviews")
    async def my_reviews(admin_id: str = Depends(get_current_admin)):
        revs = (await _reviews_index(db, [admin_id])).get(admin_id, [])
        ratings = [r.get("rating") for r in revs if isinstance(r.get("rating"), int)]
        return {
            "reviews": [_review_view(r) for r in revs],
            "review_count": len(revs),
            "rating": round(sum(ratings) / len(ratings), 1) if ratings else None,
        }

    # ---- super-admin: moderate pending public reviews (H3) ----------------
    async def _require_super(admin_id: str):
        a = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not a or a.get("role") != "super_admin":
            raise HTTPException(status_code=403, detail="Super admin required")

    @router.get("/api/admin/photographer-reviews/pending")
    async def pending_reviews(admin_id: str = Depends(get_current_admin)):
        await _require_super(admin_id)
        rows = await db.photographer_reviews.find({"status": "pending"}, {"_id": 0}).to_list(1000)
        rows.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"reviews": rows, "count": len(rows)}

    @router.post("/api/admin/photographer-reviews/{review_id}/moderate")
    async def moderate_review(review_id: str, action: str, admin_id: str = Depends(get_current_admin)):
        await _require_super(admin_id)
        new_status = "published" if action == "approve" else "rejected"
        await db.photographer_reviews.update_one(
            {"id": review_id},
            {"$set": {"status": new_status, "moderated_by": admin_id, "moderated_at": _now().isoformat()}},
        )
        return {"ok": True, "status": new_status}

    return router


# ───────────────────────────────────────────────────────────────────────────
# DEMO SEED — sample photographers with portfolios (photo + video samples) and
# real seeded reviews. Ratings are NOT hardcoded: every rating shown is the
# average of the seeded review ratings, so the number is honest. Marked
# is_demo=True so they can be cleared once real studios subscribe.
# ───────────────────────────────────────────────────────────────────────────
_IMG = "https://images.unsplash.com/photo-{id}?w=900&q=80&auto=format&fit=crop"
def _img(i):
    return _IMG.format(id=i)

# Free, always-available sample films (Google's public sample bucket).
_VID = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/{name}.mp4"
def _vid(name, poster, label, event):
    return {"url": _VID.format(name=name), "poster": poster, "label": label, "event": event}

DEMO_PHOTOGRAPHERS = [
    {
        "id": "demo_photog_lens_lotus",
        "name": "Lens & Lotus Studio",
        "studio_name": "Lens & Lotus Studio",
        "account_type": "photographer",
        "is_demo": True,
        "directory_listed": True,
        "available_now": True,  # available_at stamped at seed time
        "starting_price": 45000,
        "bio": "Candid South-Indian wedding storytellers — Telugu temple weddings, haldi mornings and engagement films, shot across Telangana & AP for 9+ years.",
        "service_cities": ["hyderabad", "vijayawada", "warangal"],
        "services": ["Wedding Photography", "Engagement Photography", "Pre-Wedding Shoots"],
        "styles": ["Candid", "Cinematic", "Traditional"],
        "portfolio_images": [
            _img("1606216794074-735e91aa2c92"), _img("1519741497674-611481863552"),
            _img("1583939003579-730e3918a45a"), _img("1465495976277-4387d4b0b4c6"),
            _img("1511285560929-80b456fea0bc"), _img("1525258946800-98cfd641d0de"),
        ],
        "portfolio_videos": [
            _vid("ForBiggerJoyrides", _img("1606216794074-735e91aa2c92"), "Wedding film — Telugu ceremony", "Marriage"),
            _vid("ForBiggerBlazes", _img("1583939003579-730e3918a45a"), "Engagement teaser", "Engagement"),
        ],
    },
    {
        "id": "demo_photog_saptapadi",
        "name": "Saptapadi Films",
        "studio_name": "Saptapadi Films",
        "account_type": "photographer",
        "is_demo": True,
        "directory_listed": True,
        "available_now": False,
        "starting_price": 35000,
        "bio": "Cinematic Tamil wedding films & portraits. Kovil mandapam ceremonies, mehendi reels and reception highlights with a documentary touch.",
        "service_cities": ["chennai", "coimbatore", "madurai"],
        "services": ["Wedding Videography", "Wedding Photography", "Pre-Wedding Shoots"],
        "styles": ["Cinematic", "Documentary", "Candid"],
        "portfolio_images": [
            _img("1604017011826-d3b4c23f8914"), _img("1601471075416-8c19a6a565c5"),
            _img("1530103862676-de8c9debad1d"), _img("1519225421980-715cb0215aed"),
            _img("1537633552985-df8429e8048b"), _img("1529636798458-92182e662485"),
        ],
        "portfolio_videos": [
            _vid("BigBuckBunny", _img("1604017011826-d3b4c23f8914"), "Wedding highlight — Tamil ceremony", "Marriage"),
            _vid("ForBiggerEscapes", _img("1530103862676-de8c9debad1d"), "Mehendi reel", "Mehandi"),
        ],
    },
    {
        "id": "demo_photog_mughal_frames",
        "name": "Mughal Frames",
        "studio_name": "Mughal Frames",
        "account_type": "photographer",
        "is_demo": True,
        "directory_listed": True,
        "available_now": True,
        "starting_price": 120000,
        "bio": "Luxury palace & destination weddings. Royal Mughal-inspired portraiture, drone films and grand reception coverage for the discerning couple.",
        "service_cities": ["hyderabad", "jaipur", "udaipur"],
        "services": ["Wedding Photography", "Drone Coverage", "Destination Weddings"],
        "styles": ["Fine Art", "Editorial", "Drone"],
        "portfolio_images": [
            _img("1519671482749-fd09be7ccebf"), _img("1522413452208-996ff3f3e740"),
            _img("1511795409834-ef04bbd61622"), _img("1469371670807-013ccf25f16a"),
            _img("1494955870715-979ca4f13bf0"), _img("1502635385003-ee1e6a1a742d"),
        ],
        "portfolio_videos": [
            _vid("ElephantsDream", _img("1519671482749-fd09be7ccebf"), "Palace wedding film", "Marriage"),
            _vid("ForBiggerFun", _img("1511795409834-ef04bbd61622"), "Reception highlights", "Reception"),
        ],
    },
]

# Seeded reviews — varied ratings so the computed average is realistic, not a
# hyped 5.0. (avg: Lens&Lotus 4.6, Saptapadi 4.25, Mughal 4.8)
def _rev(rid, pid, author, rating, event, text):
    return {"id": rid, "photographer_id": pid, "author": author, "rating": rating,
            "event_type": event, "status": "published", "text": text}

DEMO_REVIEWS = [
    _rev("demo_rv_ll_1", "demo_photog_lens_lotus", "Sahithi & Karthik", 5, "Marriage",
         "They captured every emotion of our temple wedding beautifully. The film still makes us cry."),
    _rev("demo_rv_ll_2", "demo_photog_lens_lotus", "Divya R.", 5, "Haldi",
         "Our haldi candids are pure joy. So patient with both families."),
    _rev("demo_rv_ll_3", "demo_photog_lens_lotus", "Anil Kumar", 4, "Engagement",
         "Lovely engagement shoot, slight delay in delivery but worth the wait."),
    _rev("demo_rv_ll_4", "demo_photog_lens_lotus", "Meghana", 5, "Marriage",
         "Professional team, great with elders. Album quality is premium."),
    _rev("demo_rv_ll_5", "demo_photog_lens_lotus", "Praveen T.", 4, "Reception",
         "Good reception coverage, well-lit photos. Recommend."),

    _rev("demo_rv_sp_1", "demo_photog_saptapadi", "Lakshmi & Arjun", 5, "Marriage",
         "Cinematic and classy. The kovil ceremony film felt like a movie."),
    _rev("demo_rv_sp_2", "demo_photog_saptapadi", "Karthik V.", 4, "Mehandi",
         "Fun mehendi reel, very candid. Communication could be quicker."),
    _rev("demo_rv_sp_3", "demo_photog_saptapadi", "Nithya", 3, "Reception",
         "Photos were good but a few group shots were missed. Decent overall."),
    _rev("demo_rv_sp_4", "demo_photog_saptapadi", "Ramesh & Priya", 5, "Marriage",
         "Beautiful work, gentle team. Loved the colours in our portraits."),

    _rev("demo_rv_mf_1", "demo_photog_mughal_frames", "Aishwarya & Rohan", 5, "Marriage",
         "Absolutely royal. The drone shots of the palace were breathtaking."),
    _rev("demo_rv_mf_2", "demo_photog_mughal_frames", "Vikram S.", 5, "Reception",
         "Worth every rupee. The reception highlight reel wowed all our guests."),
    _rev("demo_rv_mf_3", "demo_photog_mughal_frames", "Sneha", 4, "Engagement",
         "Stunning portraits. Premium experience, books out fast though."),
    _rev("demo_rv_mf_4", "demo_photog_mughal_frames", "Aditya & Kavya", 5, "Marriage",
         "Flawless destination wedding coverage. Highly professional crew."),
]


async def seed_demo_photographers(db) -> None:
    """Idempotently insert demo photographers + their reviews. Ratings are
    derived from these reviews (never hardcoded)."""
    try:
        now_iso = _now().isoformat()
        for p in DEMO_PHOTOGRAPHERS:
            existing = await db.admins.find_one({"id": p["id"]}, {"_id": 0, "id": 1})
            if existing:
                # patch fields that may post-date the first seed (price, videos)
                await db.admins.update_one(
                    {"id": p["id"]},
                    {"$set": {
                        "starting_price": p.get("starting_price"),
                        "portfolio_videos": p.get("portfolio_videos", []),
                    }},
                )
                continue
            doc = dict(p)
            doc["available_at"] = now_iso if doc.get("available_now") else None
            doc["created_at"] = now_iso
            # Raw-dict insert bypasses the Admin model's defaults — set the
            # legacy credit fields explicitly so /auth/me & AdminResponse
            # consumers never meet a row without them (the /auth/me 500 bug).
            doc.setdefault("total_credits", 0)
            doc.setdefault("used_credits", 0)
            await db.admins.insert_one(doc)
        for i, r in enumerate(DEMO_REVIEWS):
            existing = await db.photographer_reviews.find_one({"id": r["id"]}, {"_id": 0, "id": 1})
            if existing:
                continue
            rec = dict(r)
            # space out timestamps so "newest first" ordering looks natural
            rec["created_at"] = (_now() - timedelta(days=i)).isoformat()
            await db.photographer_reviews.insert_one(rec)
        logger.info("[photographers] demo seed ensured (%d studios, %d reviews)",
                    len(DEMO_PHOTOGRAPHERS), len(DEMO_REVIEWS))
    except Exception:
        logger.warning("[photographers] demo seed failed", exc_info=True)
