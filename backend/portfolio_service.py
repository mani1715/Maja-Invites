"""
portfolio_service.py — Photographer Portfolio module (Parts 8/12/13/14).

A studio-owned portfolio: profile (about/services/equipment/styles/social),
albums, works (projects with full shoot metadata), and testimonials. Plus PUBLIC
read endpoints powering the clickable photographer card (/photographer/:id/portfolio),
the public profile page, and the single-work viewer.

Collections (JSONB, auto-created by the adapter):
  portfolio_profiles     — one per studio (id = studio_id)
  portfolio_albums       — many per studio
  portfolio_works        — many per studio (belong to an album + event category)
  portfolio_testimonials — many per studio

Media (images/videos) are uploaded via the existing upload pipeline; works store
the resulting URLs. No schema migration required.

Wired in server.py:
    from portfolio_service import build_portfolio_router
    app.include_router(build_portfolio_router(db, require_admin))
"""
# NOTE: `from __future__ import annotations` was REMOVED here on purpose.
# It turns every annotation into a string, and FastAPI resolves endpoint
# annotations against MODULE globals - so the request models this file
# defines INSIDE its router factory became unresolvable ForwardRefs,
# breaking /openapi.json AND request-body parsing for those endpoints.
# Without the future-import, function-scoped Pydantic models are fine.

import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from pydantic import BaseModel, Field

# ---- portfolio media uploads ------------------------------------------------
# Photographers upload real photos AND videos. The old shared image endpoint
# capped files at 5 MB (far too small for a photographer's exports) and had no
# video support at all — both are fixed here.
PORTFOLIO_MEDIA_DIR = Path("/app/uploads/portfolio")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".avi"}
UPLOAD_IMAGE_MAX_BYTES = 25 * 1024 * 1024    # 25 MB per photo
UPLOAD_VIDEO_MAX_BYTES = 200 * 1024 * 1024   # 200 MB per video

logger = logging.getLogger("portfolio")

EVENT_CATEGORIES = [
    "Wedding", "Pre Wedding", "Haldi", "Mehendi", "Reception", "Engagement",
    "Birthday", "Corporate", "Baby Shoot", "Outdoor", "Destination Wedding",
]
# Canonical "Photography Type" list — the SAME options the public directory's
# "All skills" filter uses (frontend/src/data/photographyOptions.js). Kept in
# sync so a studio's saved styles are exactly what couples can filter by.
PHOTOGRAPHY_STYLES = [
    "Wedding Photography", "Candid Photography", "Traditional Photography",
    "Pre-Wedding Photography", "Engagement Photography", "Maternity Photography",
    "Birthday & Events", "Portrait Photography", "Fashion Photography",
    "Product Photography", "Travel Photography", "Wildlife Photography",
    "Drone Photography", "Videography", "Cinematography",
]

# ---------------------------------------------------------------------------
# Two-tier model.
#   BASIC   — auto-generated for every community member (free). Quick to fill,
#             a handful of essentials, instant public page.
#   PREMIUM — unlocked by an active `portfolio` subscription. Full 15-section
#             page.
# DEFAULTS below are placeholder content so a portfolio page is NEVER empty:
# a brand-new studio still renders a complete, professional-looking page that
# they then edit. Every section here mirrors the owner's content spec.
# ---------------------------------------------------------------------------
# Free-tier upload limits (premium = unlimited + studio-built). Per owner spec:
# free portfolios allow a couple of photos + a short video, with per-file caps.
FREE_MAX_PHOTOS = 2
FREE_MAX_VIDEOS = 1
# (per-file caps now live in UPLOAD_IMAGE_MAX_BYTES / UPLOAD_VIDEO_MAX_BYTES above)
# Portfolio storage caps (total bytes across all works). The FREE (normal) tier
# gets a fixed allowance; paid tiers get whatever the admin set on the plan
# (`storage_gb` / `storage_mb`), falling back to these defaults if the plan has
# none. Every studio — free included — therefore has a place to upload photos.
#   normal  — free entry tier, 500 MB
#   basic   — paid mid tier,   default 5 GB (admin-overridable per plan)
#   premium — paid top tier,   default 20 GB (admin-overridable per plan)
# Phase 3 storage rule: these caps cover ALL of a studio's media (portfolio +
# community photos/videos/reels/stories/challenge/marketplace) — one pool, summed
# by storage_accounting.used_bytes. Seeded Premium plans set storage_gb=20 already.
NORMAL_MAX_TOTAL_BYTES  = 500 * 1024 * 1024              # Free = 500 MB
BASIC_MAX_TOTAL_BYTES   = 5  * 1024 * 1024 * 1024        # Basic default = 5 GB
PREMIUM_MAX_TOTAL_BYTES = 20 * 1024 * 1024 * 1024        # Premium default = 20 GB
PORTFOLIO_TIER_CAPS = {
    "normal":  NORMAL_MAX_TOTAL_BYTES,
    "basic":   BASIC_MAX_TOTAL_BYTES,
    "premium": PREMIUM_MAX_TOTAL_BYTES,
}
STORAGE_FULL_MSG = "Your storage limit is full. Upgrade your Portfolio plan to upload more photos."

# Design-tier gate for POST /api/portfolio/design. Mirrors
# frontend/src/data/portfolioDesigns.js TIER_UNLOCKS — keep both lists in sync
# when a design is added/removed there. Backend tier names are
# 'normal'|'basic'|'premium' (see _portfolio_tier); the frontend's 'free' tier
# is this module's 'normal'.
PORTFOLIO_DESIGN_TIERS: Dict[str, str] = {
    "free_studio_neutral": "normal",
    "basic_golden_hour": "basic",
    "basic_darkroom": "basic",
    "basic_nordic": "basic",
    "premium_gallery_wall": "premium",
    "premium_film_strip": "premium",
    "premium_liquid_glass": "premium",
    "premium_contact_sheet": "premium",
    "premium_aurora": "premium",
    "premium_editorial": "premium",
}
_DESIGN_TIER_RANK = {"normal": 0, "basic": 1, "premium": 2}

BASIC_SECTIONS = ["hero", "about", "services", "featured_work", "availability", "contact"]
PREMIUM_SECTIONS = BASIC_SECTIONS + [
    "journey", "statistics", "why_choose_us", "testimonials", "equipment",
    "awards", "event_highlights", "booking_process", "special_feature",
]

# Canonical 15-section catalog (key → display label), in render order. This is
# the master list the admin picks from per plan: while setting a portfolio
# plan's price, the admin selects which of these sections that plan unlocks
# (stored on the plan as `portfolio_sections`). The portfolio then renders only
# the sections the studio's active plan allows.
PORTFOLIO_SECTION_CATALOG = [
    ("hero", "Hero"), ("about", "About Us"), ("journey", "Our Journey"),
    ("statistics", "Statistics"), ("services", "Services"), ("featured_work", "Featured Work"),
    ("why_choose_us", "Why Choose Us"), ("testimonials", "Testimonials"),
    ("equipment", "Equipment & Technology"), ("awards", "Awards & Recognition"),
    ("event_highlights", "Event Highlights"), ("booking_process", "Booking Process"),
    ("availability", "Availability"), ("contact", "Contact"), ("special_feature", "Special Feature"),
]
PORTFOLIO_SECTION_KEYS = [k for k, _ in PORTFOLIO_SECTION_CATALOG]

PORTFOLIO_DEFAULTS: Dict[str, Any] = {
    "portfolio_type": "studio",
    "studio_name": "Your Studio Name",
    "tagline": "Capturing Emotions, Creating Timeless Memories",
    "about": ("Founded in 2020, we have been dedicated to delivering high-quality "
              "photography and videography services. Our team focuses on capturing "
              "genuine emotions, candid moments, and unforgettable celebrations. We "
              "believe every photograph tells a story that deserves to be remembered "
              "for generations."),
    "cover_description": ("We specialize in capturing life's most beautiful moments through "
                          "creative photography and cinematic storytelling. Every event is "
                          "unique, and our mission is to preserve those memories forever."),
    "journey": ("Our journey began with a passion for photography and a vision to create "
                "lasting memories. Over the years, we have covered numerous weddings, "
                "engagements, birthdays, and family celebrations, building trust and strong "
                "relationships with our clients."),
    "experience_years": 5,
    "location": {"city": "Your City", "state": "Your State"},
    "statistics": {"events_covered": 500, "happy_clients": 350,
                   "photos_delivered": 100000, "years_experience": 5},
    "services": [
        "Wedding Photography", "Wedding Videography", "Engagement Photography",
        "Haldi Ceremony", "Mehendi Ceremony", "Sangeet Coverage", "Reception Coverage",
        "Maternity Shoot", "Birthday Events", "Half Saree Ceremony", "Dhoti Ceremony",
        "Drone Coverage", "Live Streaming", "Album Designing", "Pre-Wedding Shoots",
        "Post-Wedding Shoots",
    ],
    "featured_categories": [
        "Wedding Highlights", "Engagement Moments", "Haldi Celebrations", "Mehendi Memories",
        "Reception Stories", "Birthday Events", "Maternity Shoots", "Traditional Ceremonies",
    ],
    "why_choose_us": [
        "Experienced Team", "High-Quality Equipment", "Creative Storytelling",
        "Timely Delivery", "Professional Editing", "Friendly Support",
        "Customized Packages", "Client Satisfaction",
    ],
    "equipment": ["Professional DSLR / Mirrorless Cameras", "4K Drones",
                  "Studio Lighting", "Gimbals & Stabilizers", "Pro Editing Suite"],
    "awards": ["Best Wedding Photographer (Regional)", "Certified Cinematographer",
               "500+ Events Delivered"],
    "booking_process": ["Contact Us", "Discuss Requirements", "Choose Package",
                        "Confirm Booking", "Capture Memories"],
    "availability_status": "Available",
    "special_feature": {
        "heading": "Exclusive Experience",
        "content": ("Our events include a modern digital experience where guests can enjoy "
                    "event galleries, access memories online, and relive special moments "
                    "through a beautifully organized event platform."),
        "cta": "Let's Create Beautiful Memories Together.",
    },
    "social": {"instagram": "", "facebook": "", "youtube": "", "website": "", "whatsapp": ""},
    "contact": {"phone": "", "email": "", "address": ""},
    "styles": ["Candid", "Cinematic", "Traditional"],
    "is_published": True,
    # ---- individual-photographer placeholders (only rendered for that layout) -
    "professional_title": "Candid Wedding Photographer",
    "skills": ["Candid Moments", "Low-Light", "Colour Grading", "Storytelling"],
    "certifications": ["Certified Professional Photographer"],
    "camera_gear": ["Sony A7 IV", "Canon EOS R6"],
    "lens_gear": ["35mm f/1.4", "85mm f/1.8", "24-70mm f/2.8"],
    "drone_gear": ["DJI Mavic 3"],
    "editing_software": ["Adobe Lightroom", "Photoshop", "DaVinci Resolve"],
    "travel_availability": "Statewide",
}

# Placeholder gallery/testimonials shown when a studio has none yet, so the
# page looks complete for both tiers.
DEFAULT_WORKS: List[Dict[str, Any]] = [
    {"id": f"demo_{i}", "title": t, "event_category": c, "featured": i < 3,
     "image_url": f"/designs/all/{img}", "is_placeholder": True}
    for i, (t, c, img) in enumerate([
        ("Mandap Vows", "Wedding", "South_Indian_Temple/Marriage/1.jpg"),
        ("Golden Haldi", "Haldi", "Mughal/Haldi/1.jpg"),
        ("Henna Evening", "Mehendi", "Mughal/Mehandi/1.jpg"),
        ("Ring Ceremony", "Engagement", "Mughal/Engagement/1.jpg"),
        ("Grand Reception", "Reception", "Royal_Mughal/Reception/1.jpg"),
        ("First Birthday", "Birthday", "Modern_Minimal/Marriage/1.jpg"),
    ])
]
DEFAULT_TESTIMONIALS: List[Dict[str, Any]] = [
    {"id": "demo_t1", "author": "Ananya & Karthik", "rating": 5, "event_type": "Wedding",
     "text": "Our wedding memories became even more beautiful because of their amazing "
             "photography. Every special moment was captured perfectly.", "is_placeholder": True},
    {"id": "demo_t2", "author": "Sneha R.", "rating": 5, "event_type": "Maternity",
     "text": "Professional, creative and so easy to work with. The album is a treasure.",
     "is_placeholder": True},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------
class ProfileIn(BaseModel):
    # "studio" (the original studio/team portfolio) or "individual" (a freelance
    # / solo photographer portfolio). Same plans + storage; the type only changes
    # which sections the form and the public page show.
    portfolio_type: Optional[str] = None          # "studio" | "individual"
    studio_name: Optional[str] = None
    tagline: Optional[str] = None
    about: Optional[str] = None
    cover_description: Optional[str] = None        # hero cover blurb (FREE feature)
    availability_status: Optional[str] = None      # Available / Busy / Booked (FREE feature)
    experience_years: Optional[int] = None
    starting_price: Optional[int] = None           # ₹ package starting price — drives the directory budget filter
    services: List[str] = Field(default_factory=list)
    styles: List[str] = Field(default_factory=list)
    equipment: List[str] = Field(default_factory=list)
    awards: List[str] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    coverage_areas: List[str] = Field(default_factory=list)
    pricing_packages: List[Dict[str, Any]] = Field(default_factory=list)
    social: Dict[str, str] = Field(default_factory=dict)   # instagram/facebook/youtube/website/whatsapp
    contact: Dict[str, str] = Field(default_factory=dict)  # phone/email/address
    location: Dict[str, Any] = Field(default_factory=dict) # city/lat/lng/maps_url
    hero_image: Optional[str] = None
    avatar: Optional[str] = None
    is_published: bool = False
    # ---- booking facts couples ask for before they enquire (2026-07) ---------
    # Every one of these was a question a couple had to phone to get answered.
    # They are optional, so no existing portfolio breaks.
    team_size: Optional[int] = None                # people on a typical shoot
    delivery_days: Optional[int] = None            # photos delivered in N days
    advance_percent: Optional[int] = None          # booking advance %
    travel_policy: Optional[str] = None            # included / extra / not available
    cancellation_policy: Optional[str] = None      # free text, shown on the profile
    payment_modes: List[str] = Field(default_factory=list)   # UPI / Card / Bank / Cash
    shoot_types: List[str] = Field(default_factory=list)     # Indoor / Outdoor / Destination
    religions_covered: List[str] = Field(default_factory=list)  # Hindu / Muslim / Christian / Sikh …
    add_ons: List[str] = Field(default_factory=list)         # Album, Same-day edit, Live stream…
    working_since: Optional[int] = None            # year the studio started
    gst_registered: Optional[bool] = None          # invoice-able (corporates ask)
    # ---- individual-photographer fields (ignored by the studio layout) -------
    professional_title: Optional[str] = None       # "Candid Wedding Photographer", …
    journey: Optional[str] = None                  # "My Photography Journey"
    skills: List[str] = Field(default_factory=list)          # Skills & Expertise
    certifications: List[str] = Field(default_factory=list)  # courses / certifications
    camera_gear: List[str] = Field(default_factory=list)     # camera bodies
    lens_gear: List[str] = Field(default_factory=list)       # lenses
    drone_gear: List[str] = Field(default_factory=list)      # drones
    editing_software: List[str] = Field(default_factory=list)
    travel_availability: Optional[str] = None      # Local / Statewide / Nationwide
    # each: {"before": url, "after": url, "label": str}
    before_after: List[Dict[str, Any]] = Field(default_factory=list)
    # "Past Works" — the studio's best few finished works, shown on the portfolio.
    # each: {"image": url, "title": str, "caption": str}. Capped to 5 on save so a
    # curated highlight reel stays a highlight reel.
    past_works: List[Dict[str, Any]] = Field(default_factory=list)

    # ---- "professional website" fields (2026-07): built so a premium studio's
    # portfolio can stand in for a real business website + be understood by
    # Google. All optional/additive — no existing portfolio breaks. ------------
    owner_name: Optional[str] = None               # "Owner / Lead — Mani Kumar"
    business_type: Optional[str] = None            # studio | freelancer | agency
    founded_year: Optional[int] = None             # (working_since is the alias kept)
    # Structured address for local SEO + a real "Get Directions" link.
    # {full_address, landmark, city, district, state, pincode, maps_url, lat, lng}
    address: Dict[str, Any] = Field(default_factory=dict)
    business_hours: Optional[str] = None           # "Mon–Sun · 9 AM – 9 PM" (display)
    # Structured hours for schema.org openingHoursSpecification (optional; the
    # free-text business_hours above is kept for display + backward-compat).
    # each: {"day": "Mon"|"Monday", "opens": "09:00", "closes": "21:00"}
    opening_hours: List[Dict[str, Any]] = Field(default_factory=list)
    weekly_holidays: List[str] = Field(default_factory=list)  # ["Tuesday"]
    gst_number: Optional[str] = None               # shown only if provided
    # Studio photos — the space / behind-the-scenes, distinct from work galleries.
    # each: {"image": url, "caption": str}
    studio_photos: List[Dict[str, Any]] = Field(default_factory=list)
    # FAQ couples search for. each: {"q": str, "a": str}
    faqs: List[Dict[str, Any]] = Field(default_factory=list)
    # SEO — what a premium studio wants Google to show. Empty => we auto-derive
    # sensible defaults from the studio name + city + services (see portfolio_seo).
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: List[str] = Field(default_factory=list)


class AlbumIn(BaseModel):
    title: str
    event_category: Optional[str] = None
    cover_image: Optional[str] = None
    description: Optional[str] = None


class WorkIn(BaseModel):
    title: str
    album_id: Optional[str] = None
    event_category: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    venue: Optional[str] = None
    location: Optional[str] = None
    camera: Optional[str] = None
    lens: Optional[str] = None
    settings: Optional[str] = None
    story: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    featured: bool = False
    gallery: List[str] = Field(default_factory=list)  # extra image urls
    size_bytes: int = 0                                # for free-tier limit checks


class BuildRequestIn(BaseModel):
    """Premium studio submits its full brief; the platform team builds the
    portfolio manually. Free-form so the details form can evolve without a
    schema change."""
    details: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""


class TestimonialIn(BaseModel):
    author: str
    text: str
    rating: int = 5
    event_type: Optional[str] = None
    date: Optional[str] = None


# Defaults that must NEVER be served to the public as if the studio had said
# them. Every one of these reads to a visitor as a fact about THIS business:
#
#   about ............ "Founded in 2020, we have been dedicated to…"
#   statistics ....... 500 events covered · 350 happy clients · 100,000 photos
#   awards ........... "Best Wedding Photographer (Regional)"
#   certifications ... "Certified Professional Photographer"
#   camera_gear ...... "Sony A7 IV", "Canon EOS R6"
#   experience_years . 5
#   location ......... "Your City", "Your State"
#   availability_status "Available"
#
# A studio that signed up ten minutes ago and has filled in nothing had all of
# that on a public page — and, once a portfolio purchase started pushing the
# page into the sitemap automatically, on its way to Google. Awards and
# certifications nobody earned are not a placeholder problem; they are a claim
# the platform makes on a real business's behalf. CLAUDE.md's rule is "real
# reviews only, no fake hyping", and this is the same rule.
#
# They remain in PORTFOLIO_DEFAULTS because the studio's OWN editor uses them as
# example content to write over. `public=True` is what withholds them.
_PUBLIC_UNSAFE_DEFAULTS = frozenset({
    "studio_name", "tagline", "about", "cover_description", "journey",
    "experience_years", "location", "statistics", "services",
    "featured_categories", "why_choose_us", "equipment", "awards",
    "availability_status", "special_feature", "styles",
    "professional_title", "skills", "certifications", "camera_gear",
    "lens_gear", "drone_gear", "editing_software", "travel_availability",
})


def _merge_defaults(profile: Optional[Dict[str, Any]],
                    public: bool = False) -> Dict[str, Any]:
    """Overlay a studio's saved profile on the placeholder DEFAULTS so the page
    is always complete. Nested dicts (social/contact/statistics/…) deep-merge;
    empty strings fall back to the default.

    `public=True` withholds the defaults listed in `_PUBLIC_UNSAFE_DEFAULTS`, so
    a public reader sees only what the studio actually wrote. Whatever they DID
    save always wins either way — this only decides what happens when a field is
    empty: an example to overwrite (editor), or nothing at all (public).
    """
    merged = {}
    for k, dv in PORTFOLIO_DEFAULTS.items():
        pv = (profile or {}).get(k)
        withhold = public and k in _PUBLIC_UNSAFE_DEFAULTS
        if isinstance(dv, dict):
            saved = {kk: vv for kk, vv in (pv or {}).items() if vv not in (None, "")}
            merged[k] = saved if withhold else {**dv, **saved}
        elif pv in (None, "", []):
            merged[k] = (type(dv)() if withhold else dv)
        else:
            merged[k] = pv
    # carry any extra saved keys not in defaults (avatar, hero_image, pricing, …)
    for k, v in (profile or {}).items():
        if k not in merged:
            merged[k] = v
    return merged


def portfolio_has_content(profile: Optional[Dict[str, Any]],
                          works: Optional[List[Any]] = None) -> bool:
    """Has this studio written anything of its own yet?

    Used to decide whether the page is worth advertising. A portfolio carrying
    only a name is thin content: pointing Google at it earns a soft-404 or a
    thin-content demotion, and it does the studio no good either. It becomes
    indexable the moment they fill in anything real.
    """
    p = profile or {}
    if works:
        return True
    if any(str(p.get(k) or "").strip() for k in ("about", "tagline", "journey", "cover_description")):
        return True
    if any(p.get(k) for k in ("services", "styles", "awards", "featured_categories", "skills")):
        return True
    loc = p.get("location") or {}
    if str(loc.get("city") or "").strip():
        return True
    contact = p.get("contact") or {}
    return bool(str(contact.get("phone") or "").strip()
                or str(contact.get("email") or "").strip())


async def _sync_directory_fields(db, sid: str, doc: Dict[str, Any]) -> None:
    """Mirror the directory-facing fields from the portfolio form onto the
    studio's `admins` document so the public "Find Photographers" directory is
    driven by this ONE form.

    The directory reads state / country / services / styles / experience straight
    from `portfolio_profiles`, but reads CITY and BUDGET from the `admins` doc.
    Rather than make the photographer fill a second form, we push those two here:

      service_cities  ← location.city + coverage_areas   (lowercased, deduped)
      starting_price  ← starting_price                    (₹, for the budget filter)
      services/styles ← mirrored too, so q-search + facets stay consistent

    We only overwrite service_cities when we actually have cities, so saving a
    half-filled profile never wipes a value the studio set elsewhere.
    """
    try:
        loc = doc.get("location") or {}
        cities: List[str] = []
        for c in [loc.get("city")] + list(doc.get("coverage_areas") or []):
            c = str(c or "").strip().lower()
            if c and c not in cities:
                cities.append(c)
        upd: Dict[str, Any] = {
            "services": doc.get("services") or [],
            "styles": doc.get("styles") or [],
        }
        if cities:
            upd["service_cities"] = cities
        if doc.get("starting_price") is not None:
            upd["starting_price"] = doc.get("starting_price")
        await db.admins.update_one({"id": sid}, {"$set": upd})
    except Exception:
        logger.warning("portfolio: directory field sync failed for %s", sid, exc_info=True)


# Plan/tier names that should unlock the PREMIUM portfolio when a plan row is
# missing its explicit `portfolio_tier` (e.g. seeded before that field existed).
_PREMIUM_TIER_NAMES = {"professional", "studio", "premium", "elite", "pro", "enterprise"}

# Grace window after current_period_end during which a lapsed sub still reads
# as entitled (covers clock skew / a renewal payment landing a little late).
_SUB_GRACE_DAYS = 3


def _sub_is_current(sub: dict) -> bool:
    """True when a subscription doc still entitles the studio right now.

    status must be "active", AND — when the sub carries a current_period_end —
    that end (+ grace) must not have passed yet. Subs with no
    current_period_end (legacy/grandfathered rows, or ones the gateway never
    stamped) are treated as permanently current, matching the pre-fix
    behaviour for those rows only. Dates are parsed defensively: a bad/foreign
    string doesn't strip a studio of a plan it paid for."""
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
    return (end_dt + timedelta(days=_SUB_GRACE_DAYS)) >= datetime.now(timezone.utc)


def _plan_tier_of(sub: dict, plan: dict) -> str:
    """'premium' | 'basic' for one subscription+plan pair, inferring from the
    tier name when the plan row lacks an explicit portfolio_tier."""
    t = str((plan or {}).get("portfolio_tier") or "").strip().lower()
    if t in ("premium", "basic"):
        return t
    name = str((plan or {}).get("tier") or (sub or {}).get("tier") or "").strip().lower()
    return "premium" if name in _PREMIUM_TIER_NAMES else "basic"


async def _active_portfolio_plan(db, studio_id: str):
    """The studio's active portfolio subscription + its plan (or None, None).

    A studio may hold SEVERAL active portfolio subscriptions (e.g. testing bought
    more than one) — in that case PREMIUM must win, otherwise a paid premium plan
    gets masked by an older basic one and premium features/designs stay locked
    (which showed up as the BASIC badge + the premium→plans redirect loop).
    """
    subs = await db.subscriptions.find(
        {"studio_id": studio_id, "product": "portfolio", "status": "active"}, {"_id": 0}).to_list(50)
    # status=="active" alone is not "currently entitled" — a sub past its
    # current_period_end (+ grace) no longer counts. Filtered here, in Python,
    # so _portfolio_tier / _portfolio_sections / _base_storage_cap_bytes /
    # _build_help_unlocked all inherit the fix through this one function.
    subs = [s for s in subs if _sub_is_current(s)]
    if not subs:
        return None, None
    best_sub, best_plan, best_rank = None, None, -1
    for sub in subs:
        plan = await db.subscription_plans.find_one({"id": sub.get("plan_id")}, {"_id": 0}) or {}
        rank = 2 if _plan_tier_of(sub, plan) == "premium" else 1
        if rank > best_rank:
            best_sub, best_plan, best_rank = sub, plan, rank
    return best_sub, best_plan


async def _portfolio_tier(db, studio_id: str) -> str:
    """No active `portfolio` subscription → 'normal' (free, 500 MB, basic feature
    set). With a subscription → 'basic' or 'premium' (premium wins if several are
    active). Inferred from the tier name when a plan row lacks portfolio_tier."""
    sub, plan = await _active_portfolio_plan(db, studio_id)
    if not sub:
        return "normal"
    return _plan_tier_of(sub, plan)


async def _base_storage_cap_bytes(db, studio_id: str) -> int:
    """Plan allowance for a studio, in bytes (before any purchased add-ons).

    - No active portfolio plan → FREE 500 MB (every studio can still upload).
    - Active plan → the storage the admin configured on that plan
      (`storage_gb` or `storage_mb`); if the plan sets neither, fall back to the
      tier default (Basic 5 GB / Premium 20 GB).
    """
    sub, plan = await _active_portfolio_plan(db, studio_id)
    if not sub:
        return NORMAL_MAX_TOTAL_BYTES
    plan = plan or {}
    gb = plan.get("storage_gb")
    if gb not in (None, "", 0, "0"):
        try:
            return int(float(gb) * 1024 * 1024 * 1024)
        except (TypeError, ValueError):
            pass
    mb = plan.get("storage_mb")
    if mb not in (None, "", 0, "0"):
        try:
            return int(float(mb) * 1024 * 1024)
        except (TypeError, ValueError):
            pass
    t = str(plan.get("portfolio_tier") or "").strip().lower()
    return PREMIUM_MAX_TOTAL_BYTES if t == "premium" else BASIC_MAX_TOTAL_BYTES


async def _storage_cap_bytes(db, studio_id: str) -> int:
    """Total allowance = plan cap + purchased storage add-ons (Phase 9 revenue).
    The add-on bonus is additive and read from monetization_service; a failure there
    can never reduce the base cap."""
    base = await _base_storage_cap_bytes(db, studio_id)
    try:
        import monetization_service
        return base + await monetization_service.storage_bonus_bytes(db, studio_id)
    except Exception:
        return base


async def _used_bytes(db, studio_id: str) -> int:
    """Total storage a studio has used across the WHOLE media pool (portfolio +
    community), via the unified accounting. Falls back to the local portfolio-only
    sum if that module is unavailable, so the upload path can never break."""
    try:
        import storage_accounting
        return await storage_accounting.used_bytes(db, studio_id)
    except Exception:
        rows = await db.portfolio_works.find({"studio_id": studio_id}, {"_id": 0}).to_list(5000)
        return sum(int(w.get("size_bytes") or 0) for w in rows)


def _slugify(name: str) -> str:
    """A URL-friendly slug from a studio name: 'Mani Studio' → 'mani-studio'."""
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return s or "studio"


async def _ensure_slug(db, sid: str, raw: Optional[Dict[str, Any]]) -> Optional[str]:
    """Return the studio's public URL slug, generating + persisting a unique one
    on first use so existing studios get a pretty URL without re-saving."""
    if raw and raw.get("slug"):
        return raw.get("slug")
    admin = await db.admins.find_one({"id": sid}, {"_id": 0}) or {}
    base = _slugify((raw or {}).get("studio_name") or admin.get("studio_name") or admin.get("name") or "studio")
    slug = base
    n = 1
    # ensure uniqueness across studios (skip our own row)
    while True:
        clash = await db.portfolio_profiles.find_one({"slug": slug}, {"_id": 0, "id": 1})
        if not clash or clash.get("id") == sid:
            break
        n += 1
        slug = f"{base}-{n}"
    await db.portfolio_profiles.update_one({"id": sid}, {"$set": {"slug": slug}}, upsert=True)
    return slug


async def ensure_portfolio_slug(db, studio_id: str) -> Optional[str]:
    """Mint the studio's public slug NOW, rather than the first time somebody
    happens to open its portfolio page.

    `_ensure_slug` was only ever reached from read paths, so a photographer who
    signed up and bought the portfolio plan got:
      • a directory card whose link was the raw UUID (no slug row existed, and
        the directory falls back to the id), and
      • **no sitemap entry at all**, because the sitemap lists
        `portfolio_profiles` rows that have a slug.
    They became findable only once a human visited the page — which is backwards
    for a product whose entire promise is "buy the portfolio and be found on
    Google". Called on portfolio-plan activation, and backfilled at startup for
    studios that bought before this existed.

    Idempotent: returns the existing slug untouched if there is one.
    """
    raw = await db.portfolio_profiles.find_one({"id": studio_id}, {"_id": 0})
    return await _ensure_slug(db, studio_id, raw)


async def backfill_portfolio_slugs(db) -> Dict[str, Any]:
    """Give every studio holding an ACTIVE portfolio plan a slug.

    Scoped to paying studios on purpose: a slug is a public URL, and minting one
    for every admin row would advertise accounts that never bought the product.
    """
    minted, checked = 0, 0
    try:
        subs = await db.subscriptions.find(
            {"product": "portfolio", "status": "active"}, {"_id": 0, "studio_id": 1}).to_list(5000)
    except Exception:
        logger.warning("portfolio: slug backfill could not read subscriptions", exc_info=True)
        return {"checked": 0, "minted": 0, "error": "subscriptions unreadable"}

    for sid in {s.get("studio_id") for s in subs if s.get("studio_id")}:
        checked += 1
        try:
            existing = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0, "slug": 1})
            if existing and existing.get("slug"):
                continue
            if await _ensure_slug(db, sid, existing):
                minted += 1
        except Exception:
            logger.warning("portfolio: slug backfill failed for %s", sid, exc_info=True)
    return {"checked": checked, "minted": minted}


async def _resolve_studio(db, key: str):
    """Resolve a public path segment (studio id OR slug) to (sid, raw_profile)."""
    raw = await db.portfolio_profiles.find_one({"id": key}, {"_id": 0})
    if not raw:
        raw = await db.portfolio_profiles.find_one({"slug": key}, {"_id": 0})
    sid = (raw or {}).get("id") or key
    return sid, raw


async def resolve_public_portfolio_seo(db, key: str) -> Dict[str, Any]:
    """One place that turns a portfolio id/slug into crawler-facing SEO.

    Called by the server-side bot/OG renderer (server._render_og_for_portfolio) so
    a shared portfolio link previews correctly on WhatsApp/Facebook/etc. and Google
    reads real metadata. Reuses the same `resolve_seo` core the JSON API uses, so
    the two never drift.

    ALWAYS returns a usable title/description/canonical/og_image (a shared link must
    never preview blank). The rich `json_ld` structured data + `keywords` — the
    owner's paid "appear on Google" perk — are included ONLY for PREMIUM studios.
    """
    from portfolio_seo import resolve_seo, SITE

    sid, raw = await _resolve_studio(db, key)
    admin = await db.admins.find_one({"id": sid}, {"_id": 0}) if sid else None
    if not raw and not admin:
        return {"found": False, "slug": key, "premium": False,
                "title": "Photographer Portfolio · MAJA",
                "description": "Discover wedding photographers and studios on MAJA.",
                "keywords": [], "canonical": f"{SITE}/photographer/{key}",
                "og_image": "", "json_ld": None}

    # public=True: never publish an award, a certification or a client count
    # the studio did not enter (see _PUBLIC_UNSAFE_DEFAULTS).
    profile = _merge_defaults(raw, public=True)
    if not (raw or {}).get("studio_name"):
        profile["studio_name"] = (admin or {}).get("name") or profile.get("studio_name") or ""

    slug = await _ensure_slug(db, sid, raw)
    tier = await _portfolio_tier(db, sid)
    testimonials = await db.portfolio_testimonials.find(
        {"studio_id": sid}, {"_id": 0}).to_list(500)
    ratings = [t.get("rating", 0) for t in testimonials if t.get("rating")]
    avg = round(sum(ratings) / len(ratings), 2) if ratings else None
    review_count = len([t for t in testimonials if not t.get("is_placeholder")])

    works = await db.portfolio_works.find({"studio_id": sid}, {"_id": 0}).to_list(500)
    gallery_images: List[str] = []
    for w in works:
        if w.get("image_url"):
            gallery_images.append(w["image_url"])
        gallery_images.extend([g for g in (w.get("gallery") or []) if g])

    seo = resolve_seo(profile, slug, rating=avg, review_count=review_count,
                      reviews=testimonials, gallery_images=gallery_images)
    premium = (tier == "premium")
    # A page carrying nothing but the studio's name is thin content. Asking
    # Google to index it earns a soft-404 or a thin-content demotion, and gives
    # the studio nothing — there is no reason for anyone to land on it yet. It
    # becomes indexable the moment they write anything of their own. The page
    # itself stays live and shareable throughout; this only governs indexing.
    has_content = portfolio_has_content(profile, works)
    return {
        "found": True,
        "slug": slug,
        "premium": premium,
        "title": seo["title"],
        "description": seo["description"],
        "keywords": seo["keywords"] if premium else [],
        "canonical": seo["canonical"],
        "og_image": seo.get("og_image") or "",
        "json_ld": seo.get("json_ld") if premium else None,
        "indexable": has_content,
        "has_content": has_content,
    }


async def _portfolio_sections(db, studio_id: str) -> list:
    """Which of the 15 sections this studio's portfolio shows, driven by its
    active plan. Resolution order:
      1. active portfolio plan with an explicit `portfolio_sections` list
         (admin-chosen when pricing the plan) → those (∩ valid, canonical order),
      2. active portfolio plan with none set → all 15 (premium default),
      3. no active plan → the free BASIC set.
    Hero/contact are always forced in so no page is broken."""
    sub, plan = await _active_portfolio_plan(db, studio_id)
    if not sub:
        return list(BASIC_SECTIONS)
    chosen = (plan or {}).get("portfolio_sections")
    if isinstance(chosen, list) and chosen:
        allowed = {s for s in chosen if s in PORTFOLIO_SECTION_KEYS} | {"hero", "contact"}
        return [k for k in PORTFOLIO_SECTION_KEYS if k in allowed]
    return list(PREMIUM_SECTIONS)


async def _settle_build_help(db, order_id: str, payment_id: str,
                             *, via: str) -> Optional[Dict[str, Any]]:
    """Flip a build-help unlock to paid exactly once. Shared by the browser
    /build-help/verify callback and /build-help/webhook so a studio whose
    browser dies right after paying still gets the ₹100 unlock — Razorpay
    already took the money either way. Idempotent: the CAS below means
    whichever of {verify, webhook} arrives first wins; the other is a no-op
    (`already: True`). Also settles the underlying event_orders ledger row
    (created via event_payments.create_order at /build-help/order) so the
    payment is reconcilable there too.

    Returns None when `order_id` doesn't match any build-help unlock (webhook
    event for a different payment kind sharing the same gateway)."""
    row = await db.portfolio_build_unlocks.find_one({"order_id": order_id}, {"_id": 0})
    if not row:
        return None
    import event_payments as pay
    await pay.mark_paid(db, order_id, payment_id, via=via)
    res = await db.portfolio_build_unlocks.update_one(
        {"order_id": order_id, "status": {"$ne": "paid"}},
        {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": _now(), "paid_via": via}})
    already = getattr(res, "matched_count", 1) == 0
    return {"unlocked": True, "studio_id": row["studio_id"], "already": already}


def build_portfolio_router(db, require_admin, require_super_admin=None) -> APIRouter:
    router = APIRouter(tags=["portfolio"])

    # ---- catalog constants -------------------------------------------------
    @router.get("/api/portfolio/meta")
    async def meta():
        return {"event_categories": EVENT_CATEGORIES, "styles": PHOTOGRAPHY_STYLES}

    # ---- profile -----------------------------------------------------------
    @router.get("/api/portfolio/profile")
    async def get_profile(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        p = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0})
        slug = await _ensure_slug(db, sid, p)
        p = p or {"id": sid, "is_published": False}
        p["slug"] = slug
        return {"profile": p, "public_path": f"/photographer/{slug}"}

    @router.put("/api/portfolio/profile")
    async def put_profile(payload: ProfileIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        existing = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0})
        # exclude_unset: write ONLY the fields the caller actually sent.
        # `model_dump()` emits every field of ProfileIn — including ones the client
        # never mentioned, filled with None/[] — and `$set` would then overwrite a
        # complete profile with blanks on any partial save. Explicitly-sent empty
        # values are still "set", so clearing a field from the editor keeps working.
        fields = payload.model_dump(exclude_unset=True)
        # Past Works is a curated highlight reel — cap it at 5 and keep only rows
        # that actually carry an image, so an empty slot never renders a gap.
        if "past_works" in fields:
            pw = [w for w in (fields["past_works"] or []) if isinstance(w, dict) and w.get("image")]
            fields["past_works"] = pw[:5]
        # Studio photos: keep only rows with an image (an empty slot renders a gap).
        if "studio_photos" in fields:
            fields["studio_photos"] = [w for w in (fields["studio_photos"] or [])
                                       if isinstance(w, dict) and w.get("image")][:12]
        # FAQs: keep only rows with a real question, cap to a readable count.
        if "faqs" in fields:
            fields["faqs"] = [f for f in (fields["faqs"] or [])
                              if isinstance(f, dict) and str(f.get("q") or "").strip()][:15]
        doc = {"id": sid, "studio_id": sid, **fields, "updated_at": _now()}
        # keep any already-issued slug stable so public links never break
        if existing and existing.get("slug"):
            doc["slug"] = existing["slug"]
        if existing:
            await db.portfolio_profiles.update_one({"id": sid}, {"$set": doc})
        else:
            doc["created_at"] = _now()
            await db.portfolio_profiles.insert_one(doc)
        doc["slug"] = await _ensure_slug(db, sid, doc)
        await _sync_directory_fields(db, sid, doc)
        return {"saved": True, "profile": doc, "public_path": f"/photographer/{doc['slug']}"}

    # ---- albums ------------------------------------------------------------
    @router.post("/api/portfolio/albums")
    async def create_album(payload: AlbumIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        doc = {"id": f"alb_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               **payload.model_dump(), "work_count": 0, "created_at": _now()}
        await db.portfolio_albums.insert_one(doc)
        return {"album": doc}

    @router.get("/api/portfolio/albums")
    async def list_albums(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.portfolio_albums.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"albums": rows}

    @router.delete("/api/portfolio/albums/{album_id}")
    async def delete_album(album_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.portfolio_albums.delete_one({"id": album_id, "studio_id": sid})
        await db.portfolio_works.delete_many({"album_id": album_id, "studio_id": sid})
        return {"deleted": True}

    # No route existed to rename an album — create/list/delete only. Partial
    # (exclude_unset) so a rename-only PUT can't blank out cover_image/description.
    class AlbumUpdateIn(BaseModel):
        title: Optional[str] = None
        event_category: Optional[str] = None
        cover_image: Optional[str] = None
        description: Optional[str] = None

    @router.put("/api/portfolio/albums/{album_id}")
    async def update_album(album_id: str, payload: AlbumUpdateIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        fields = payload.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(400, "Nothing to update")
        alb = await db.portfolio_albums.find_one({"id": album_id, "studio_id": sid}, {"_id": 0})
        if not alb:
            raise HTTPException(404, "Album not found")
        await db.portfolio_albums.update_one({"id": album_id, "studio_id": sid}, {"$set": fields})
        alb.update(fields)
        return {"album": alb}

    # ---- works -------------------------------------------------------------
    # ---- media upload (photos + videos) ----------------------------------
    @router.post("/api/portfolio/upload")
    async def upload_portfolio_media(file: UploadFile = File(...),
                                     admin: dict = Depends(require_admin)):
        """Upload one photo or video for the studio's portfolio.

        Returns a URL under /api/uploads/... (the reverse proxy only forwards
        /api/*, so a bare /uploads/... URL would 404). The storage-quota check
        stays in create_work, which receives the returned size_bytes.
        """
        sid = admin["admin_id"]
        import storage_accounting
        if not storage_accounting.allow_upload(sid, 30):
            raise HTTPException(429, "Too many uploads — please wait a minute and try again.")
        name = (file.filename or "").strip()
        ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
        if ext in IMAGE_EXTS:
            kind, cap = "image", UPLOAD_IMAGE_MAX_BYTES
        elif ext in VIDEO_EXTS:
            kind, cap = "video", UPLOAD_VIDEO_MAX_BYTES
        else:
            raise HTTPException(400, f"Unsupported file type '{ext or name}'. "
                                     f"Images: {', '.join(sorted(IMAGE_EXTS))}. "
                                     f"Videos: {', '.join(sorted(VIDEO_EXTS))}.")

        data = await file.read()
        size = len(data)
        if size == 0:
            raise HTTPException(400, "That file is empty.")
        if size > cap:
            raise HTTPException(413, f"{kind.title()} is too large "
                                     f"({size // (1024*1024)} MB). Max {cap // (1024*1024)} MB.")
        # MIME + magic-byte validation: reject a renamed exe/script/archive posing as media.
        ct = (file.content_type or "").lower().strip()
        want = "image/" if kind == "image" else "video/"
        if ct and ct not in ("application/octet-stream", "binary/octet-stream") and not ct.startswith(want):
            raise HTTPException(400, f"File content-type '{ct}' doesn't match a {kind}.")
        if any(data[:16].startswith(sig) for sig in (b"MZ", b"\x7fELF", b"PK\x03\x04", b"%PDF", b"<!DO", b"<htm")):
            raise HTTPException(400, "That file doesn't look like a real image or video.")

        # quota check up-front so a big upload isn't written then rejected.
        # used = the WHOLE media pool (portfolio + community), per the storage rule.
        used = await _used_bytes(db, sid)
        quota = await _storage_cap_bytes(db, sid)
        if used + size > quota:
            cap_label = f"{quota // (1024*1024)} MB" if quota < 1024**3 else f"{quota / 1024**3:.0f} GB"
            raise HTTPException(403, f"Storage limit ({cap_label}) reached. Upgrade your plan for more space.")

        out_dir = PORTFOLIO_MEDIA_DIR / sid
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
            fname = f"{uuid.uuid4().hex[:16]}{ext}"
            (out_dir / fname).write_bytes(data)
        except Exception as e:
            logger.exception("portfolio upload write failed")
            raise HTTPException(500, f"Could not save the file: {e}")

        # Storage pool (V1 multi-drive): archive into .../Portfolio/.
        # Fire-and-forget + flag-gated — can never fail the upload.
        try:
            from storage_pool_hooks import mirror_upload
            mirror_upload(db, photographer_id=sid, area="portfolio",
                          filename=name or fname, data=data,
                          content_type=file.content_type or "application/octet-stream",
                          source_ref={"kind": "disk", "path": str(out_dir / fname)})
        except Exception:
            pass

        url = f"/api/uploads/portfolio/{sid}/{fname}"
        # record the REAL size so create_work/update_work read it server-side (never the client)
        try:
            await storage_accounting.register_upload(db, sid, url, size, kind=kind,
                                                     filename=name, disk_path=str(out_dir / fname), area="portfolio")
        except Exception:
            logger.warning("portfolio upload: registry write failed", exc_info=True)

        return {"url": url, "kind": kind, "size_bytes": size, "filename": name}

    @router.post("/api/portfolio/works")
    async def create_work(payload: WorkIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        import storage_accounting
        # Server-authoritative size: attach the uploaded files from the registry and sum
        # their REAL measured sizes — the client's size_bytes is ignored (was a bypass).
        # Quota was already enforced at upload time (pending bytes count toward the cap).
        media_urls = [u for u in ([payload.image_url, payload.video_url] + list(payload.gallery or [])) if u]
        server_size = 0
        for u in media_urls:
            await storage_accounting.consume_upload(db, sid, u)
            server_size += await storage_accounting.registered_size(db, sid, u)
        data = payload.model_dump()
        data["size_bytes"] = server_size
        doc = {"id": f"wrk_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               **data, "created_at": _now()}
        await db.portfolio_works.insert_one(doc)
        if payload.album_id:
            alb = await db.portfolio_albums.find_one({"id": payload.album_id}, {"_id": 0})
            if alb:
                await db.portfolio_albums.update_one(
                    {"id": payload.album_id},
                    {"$set": {"work_count": (alb.get("work_count", 0) + 1)}},
                )
        return {"work": doc}

    @router.get("/api/portfolio/works")
    async def list_works(admin: dict = Depends(require_admin),
                         album_id: Optional[str] = None, event_category: Optional[str] = None):
        sid = admin["admin_id"]
        q: Dict[str, Any] = {"studio_id": sid}
        if album_id:
            q["album_id"] = album_id
        if event_category:
            q["event_category"] = event_category
        rows = await db.portfolio_works.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        return {"works": rows}

    @router.put("/api/portfolio/works/{work_id}")
    async def update_work(work_id: str, payload: WorkIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        import storage_accounting
        w = await db.portfolio_works.find_one({"id": work_id, "studio_id": sid}, {"_id": 0})
        if not w:
            raise HTTPException(404, "Work not found")
        # Reconcile media on edit by DELTA (never trust the client's size_bytes):
        # attach newly-added files, reclaim removed ones, and adjust the stored size by
        # only the difference. Editing a work with UNCHANGED media (e.g. toggling
        # "featured") preserves its existing size_bytes — critical for legacy works that
        # predate the upload registry (registered_size would be 0 for them).
        # PATCH semantics: only fields the caller actually sent are written.
        # This used to be a full `model_dump()` replace, so a caller sending the
        # required `title` plus one flag (the natural shape of "toggle
        # featured") silently blanked image_url, gallery, tags and album_id —
        # data loss with a 200. An omitted field keeps its stored value, which
        # also keeps the media-delta arithmetic below honest: omitting
        # `image_url` must NOT read as "all media removed".
        patch = payload.model_dump(exclude_unset=True)

        def _eff(field):
            return patch[field] if field in patch else w.get(field)

        old_urls = {u for u in ([w.get("image_url"), w.get("video_url")] + list(w.get("gallery") or [])) if u}
        new_urls = {u for u in ([_eff("image_url"), _eff("video_url")]
                                + list(_eff("gallery") or [])) if u}
        added, removed = new_urls - old_urls, old_urls - new_urls
        size = int(w.get("size_bytes") or 0)
        for u in added:
            await storage_accounting.consume_upload(db, sid, u)
            size += await storage_accounting.registered_size(db, sid, u)
        for u in removed:
            size -= await storage_accounting.registered_size(db, sid, u)
        await storage_accounting.release_urls(db, sid, removed)
        # If ALL media was removed, everything is released → size is 0 (handles legacy
        # works whose per-url size the registry never recorded).
        if not new_urls:
            size = 0
        data = patch
        data["size_bytes"] = max(0, size)
        await db.portfolio_works.update_one({"id": work_id},
                                            {"$set": {**data, "updated_at": _now()}})
        return {"updated": True}

    @router.delete("/api/portfolio/works/{work_id}")
    async def delete_work(work_id: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        import storage_accounting
        w = await db.portfolio_works.find_one({"id": work_id, "studio_id": sid}, {"_id": 0})
        await db.portfolio_works.delete_one({"id": work_id, "studio_id": sid})
        if w:
            urls = [u for u in ([w.get("image_url"), w.get("video_url")] + list(w.get("gallery") or [])) if u]
            await storage_accounting.release_urls(db, sid, urls)   # reclaim physical files
        return {"deleted": True}

    # ---- testimonials ------------------------------------------------------
    @router.post("/api/portfolio/testimonials")
    async def add_testimonial(payload: TestimonialIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        doc = {"id": f"tst_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               **payload.model_dump(), "created_at": _now()}
        await db.portfolio_testimonials.insert_one(doc)
        return {"testimonial": doc}

    @router.get("/api/portfolio/testimonials")
    async def list_testimonials(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.portfolio_testimonials.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"testimonials": rows}

    @router.delete("/api/portfolio/testimonials/{tid}")
    async def delete_testimonial(tid: str, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        await db.portfolio_testimonials.delete_one({"id": tid, "studio_id": sid})
        return {"deleted": True}

    # ---- studio: my tier + which sections are unlocked --------------------
    @router.get("/api/portfolio/tier")
    async def my_tier(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        tier = await _portfolio_tier(db, sid)
        unlocked = await _portfolio_sections(db, sid)
        used = await _used_bytes(db, sid)   # whole media pool (portfolio + community)
        cap = await _storage_cap_bytes(db, sid)
        return {"tier": tier, "premium_unlocked": tier == "premium",
                "tier_caps_gb": {k: v // (1024 * 1024 * 1024) for k, v in PORTFOLIO_TIER_CAPS.items()},
                "basic_sections": BASIC_SECTIONS, "premium_sections": PREMIUM_SECTIONS,
                # plan-driven: exactly what THIS studio's plan unlocks
                "unlocked_sections": unlocked,
                "locked_sections": [s for s in PORTFOLIO_SECTION_KEYS if s not in unlocked],
                "section_catalog": [{"key": k, "label": lbl} for k, lbl in PORTFOLIO_SECTION_CATALOG],
                "design_id": (await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}).get("design_id"),
                "storage": {"used_bytes": used, "cap_bytes": cap,
                            "used_mb": round(used / (1024 * 1024), 1),
                            "cap_mb": cap // (1024 * 1024),
                            "cap_gb": round(cap / (1024 * 1024 * 1024), 1),
                            "full": used >= cap}}

    # ---- studio: pick a portfolio design template. Server-enforced against the
    #      studio's actual tier (was client-side only — any free studio could
    #      POST a premium design_id straight past the picker UI).
    @router.post("/api/portfolio/design")
    async def set_portfolio_design(request: Request, admin: dict = Depends(require_admin)):
        # Parse the body DEFENSIVELY (raw request, not a Pydantic model) so a
        # content-type quirk or a stray null can't turn a real design pick into a
        # spurious 422 — which was silently blocking every design from applying.
        sid = admin["admin_id"]
        design_id = None
        try:
            body = await request.json()
            if isinstance(body, dict):
                design_id = body.get("design_id")
        except Exception:
            design_id = None
        if not design_id or not isinstance(design_id, str):
            raise HTTPException(status_code=400, detail="A design_id is required to apply a design.")
        design_id = design_id.strip()
        studio_tier = await _portfolio_tier(db, sid)
        required_tier = PORTFOLIO_DESIGN_TIERS.get(design_id)
        # Unknown id OR a real id above the studio's tier — same 403. An id this
        # module doesn't recognise is never allowed, even if some future design
        # would in principle suit the studio's tier (default-deny, not guess).
        if required_tier is None or _DESIGN_TIER_RANK[required_tier] > _DESIGN_TIER_RANK[studio_tier]:
            raise HTTPException(403, f"Design '{design_id}' is not available on your {studio_tier} plan.")
        await db.portfolio_profiles.update_one(
            {"id": sid},
            {"$set": {"design_id": design_id, "updated_at": _now()}},
            upsert=True,
        )
        return {"design_id": design_id}

    # ---- premium: team members --------------------------------------------
    # Premium-only. Each member: name, role (what they do), portfolio_link.
    # Stored on the profile so the public page can list the studio's team.
    class _TeamIn(BaseModel):
        team_members: List[Dict[str, Any]] = Field(default_factory=list)

    @router.put("/api/portfolio/team")
    async def set_team(payload: _TeamIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        if await _portfolio_tier(db, sid) != "premium":
            raise HTTPException(403, "Team members are a premium portfolio feature. Upgrade to Premium.")
        members = []
        for m in (payload.team_members or [])[:30]:
            if not isinstance(m, dict):
                continue
            name = str(m.get("name") or "").strip()
            if not name:
                continue
            members.append({
                "name": name[:80],
                "role": str(m.get("role") or "").strip()[:140],
                "portfolio_link": str(m.get("portfolio_link") or "").strip()[:300],
            })
        await db.portfolio_profiles.update_one(
            {"id": sid}, {"$set": {"team_members": members, "updated_at": _now()}}, upsert=True)
        return {"saved": True, "team_members": members}

    @router.get("/api/portfolio/team")
    async def get_team(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        p = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0}) or {}
        return {"team_members": p.get("team_members") or [], "is_premium": await _portfolio_tier(db, sid) == "premium"}

    # ---- plan purchase details --------------------------------------------
    # Collected from the studio at the moment they buy ANY plan (portfolio or
    # cloud backup). Stored for the admin/fulfillment team. Free-form so the
    # details form can grow without a schema change.
    class _PurchaseDetailsIn(BaseModel):
        product: str
        tier: Optional[str] = None
        cycle: Optional[str] = None
        subscription_id: Optional[str] = None
        details: Dict[str, Any] = Field(default_factory=dict)

    @router.post("/api/plan-purchase-details")
    async def save_purchase_details(payload: _PurchaseDetailsIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        a = await db.admins.find_one({"id": sid}, {"_id": 0}) or {}
        doc = {"id": f"ppd_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               "studio_name": a.get("studio_name") or a.get("name") or "Studio",
               "product": payload.product, "tier": payload.tier, "cycle": payload.cycle,
               "subscription_id": payload.subscription_id,
               "details": payload.details, "status": "new", "created_at": _now()}
        await db.plan_purchase_details.insert_one(doc)
        return {"saved": True, "id": doc["id"]}

    if require_super_admin is not None:
        @router.get("/api/admin/plan-purchase-details")
        async def list_purchase_details(_super=Depends(require_super_admin)):
            rows = await db.plan_purchase_details.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
            return {"details": rows}

    # ---- "build my portfolio for me" — plan perk OR a one-off ₹100 unlock ---
    # Two doors to the same form:
    #   1. a premium portfolio plan includes it, as before; or
    #   2. any studio (Free included) pays BUILD_HELP_FEE_INR once.
    # A studio that can't fill the portfolio in themselves shouldn't need a whole
    # subscription just to ask for help.
    BUILD_HELP_FEE_INR = 100

    async def _build_help_unlocked(sid: str) -> bool:
        """True when this studio may open the build-request form."""
        if await _portfolio_tier(db, sid) == "premium":
            return True
        paid = await db.portfolio_build_unlocks.find_one(
            {"studio_id": sid, "status": "paid"}, {"_id": 0})
        return bool(paid)

    @router.get("/api/portfolio/build-help")
    async def build_help_status(admin: dict = Depends(require_admin)):
        """What the studio panel needs to render the gate: price, and whether
        this studio already has access (and how it got it)."""
        sid = admin["admin_id"]
        premium = await _portfolio_tier(db, sid) == "premium"
        paid = await db.portfolio_build_unlocks.find_one(
            {"studio_id": sid, "status": "paid"}, {"_id": 0})
        return {"fee_inr": BUILD_HELP_FEE_INR,
                "unlocked": bool(premium or paid),
                "via": "plan" if premium else ("payment" if paid else None)}

    @router.post("/api/portfolio/build-help/order")
    async def build_help_order(admin: dict = Depends(require_admin)):
        """Create the ₹100 Razorpay order. Returns 409 if already unlocked so we
        never charge twice for the same thing."""
        sid = admin["admin_id"]
        if await _build_help_unlocked(sid):
            raise HTTPException(409, "Portfolio build help is already unlocked for this studio.")
        import event_payments as pay
        try:
            order = await pay.create_order(
                db, amount_inr=BUILD_HELP_FEE_INR,
                receipt=f"pbh_{sid[:18]}", notes={"studio_id": sid, "kind": "portfolio_build_help"},
                kind="portfolio_build_help")
        except pay.PaymentUnavailable as e:
            # 503, not 500: the feature is fine, the gateway just isn't configured.
            raise HTTPException(503, str(e))
        await db.portfolio_build_unlocks.insert_one({
            "id": f"pbu_{uuid.uuid4().hex[:14]}", "studio_id": sid,
            "order_id": order["order_id"], "amount_inr": BUILD_HELP_FEE_INR,
            "status": "created", "created_at": _now()})
        return order

    class _BuildHelpVerifyIn(BaseModel):
        razorpay_order_id: str
        razorpay_payment_id: str
        razorpay_signature: str

    @router.post("/api/portfolio/build-help/verify")
    async def build_help_verify(payload: _BuildHelpVerifyIn, admin: dict = Depends(require_admin)):
        """Unlock only against a signature Razorpay really produced. The order is
        matched to THIS studio, so one studio's payment can't unlock another."""
        sid = admin["admin_id"]
        import event_payments as pay
        row = await db.portfolio_build_unlocks.find_one(
            {"order_id": payload.razorpay_order_id, "studio_id": sid}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Unknown order for this studio.")
        try:
            ok = pay.verify_signature(payload.razorpay_order_id,
                                      payload.razorpay_payment_id,
                                      payload.razorpay_signature)
        except pay.PaymentUnavailable as e:
            raise HTTPException(503, str(e))
        if not ok:
            raise HTTPException(400, "Payment could not be verified.")
        await _settle_build_help(db, payload.razorpay_order_id, payload.razorpay_payment_id, via="checkout")
        return {"unlocked": True}

    # ---- webhook fallback (studio closes the tab after paying) ------------
    # /verify above only fires from the browser. If the tab dies mid-flow the
    # ₹100 is captured but portfolio_build_unlocks never flips to "paid" —
    # money taken, build-help form still locked. Razorpay retries this
    # endpoint until it gets a 2xx, so the unlock settles regardless of what
    # the browser did.
    @router.post("/api/portfolio/build-help/webhook")
    async def build_help_webhook(request: Request):
        import event_payments as pay
        raw = await request.body()
        sig = request.headers.get("x-razorpay-signature", "")
        try:
            ok = pay.verify_webhook(raw, sig)
        except pay.PaymentUnavailable as e:
            raise HTTPException(409, str(e))
        if not ok:
            raise HTTPException(400, "Invalid webhook signature.")
        import json
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            raise HTTPException(400, "Malformed webhook body.")
        info = pay.webhook_payment(body)
        if info["event"] not in ("payment.captured", "order.paid") or not info["order_id"]:
            return {"received": True}
        settled = await _settle_build_help(db, info["order_id"], info["payment_id"], via="webhook")
        return {"received": True, "settled": settled is not None}

    # Flow: studio unlocks (plan or ₹100) → fills the full details form →
    # submits here → the platform team builds the premium page manually. The
    # request lands in the admin panel (super-admin GET below).
    @router.post("/api/portfolio/build-request")
    async def submit_build_request(payload: BuildRequestIn, admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        if not await _build_help_unlocked(sid):
            raise HTTPException(402, f"Unlock studio-built portfolio help for Rs {BUILD_HELP_FEE_INR}, "
                                     f"or upgrade to a premium portfolio plan.")
        doc = {"id": f"pbr_{uuid.uuid4().hex[:16]}", "studio_id": sid,
               "details": payload.details, "notes": payload.notes,
               "status": "pending", "created_at": _now()}
        # one open request per studio — overwrite any existing pending one
        await db.portfolio_build_requests.delete_many({"studio_id": sid, "status": "pending"})
        await db.portfolio_build_requests.insert_one(doc)
        return {"submitted": True, "request": {k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/api/portfolio/build-request")
    async def my_build_request(admin: dict = Depends(require_admin)):
        sid = admin["admin_id"]
        rows = await db.portfolio_build_requests.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(1)
        return {"request": rows[0] if rows else None}

    # ---- admin panel: list all build requests -----------------------------
    if require_super_admin is not None:
        @router.get("/api/admin/portfolio-build-requests")
        async def admin_build_requests(_super=Depends(require_super_admin)):
            rows = await db.portfolio_build_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
            for r in rows:
                a = await db.admins.find_one({"admin_id": r["studio_id"]}, {"_id": 0}) or await db.admins.find_one({"id": r["studio_id"]}, {"_id": 0})
                r["studio_name"] = (a or {}).get("studio_name") or (a or {}).get("name") or "Studio"
            return {"requests": rows}

        @router.post("/api/admin/portfolio-build-requests/{req_id}/status")
        async def set_build_status(req_id: str, status: str, _super=Depends(require_super_admin)):
            await db.portfolio_build_requests.update_one({"id": req_id}, {"$set": {"status": status, "updated_at": _now()}})
            return {"updated": True}

    # ---- PUBLIC: full portfolio (Part 13 profile + Part 12 card link) ------
    @router.get("/api/public/photographer/{studio_id}/portfolio")
    async def public_portfolio(studio_id: str):
        # {studio_id} may be a real id OR a pretty slug (mani-studio) — resolve both.
        sid, raw = await _resolve_studio(db, studio_id)
        admin = await db.admins.find_one({"id": sid}, {"_id": 0})
        if not raw and not admin:
            raise HTTPException(404, "Photographer not found")

        # Saved data only — placeholder defaults that read as factual claims
        # about this business are withheld from the public view.
        profile = _merge_defaults(raw, public=True)
        if not (raw or {}).get("studio_name"):
            profile["studio_name"] = (admin or {}).get("name") or profile.get("studio_name") or ""

        slug = await _ensure_slug(db, sid, raw)
        tier = await _portfolio_tier(db, sid)
        sections = await _portfolio_sections(db, sid)  # plan-driven section set

        albums = await db.portfolio_albums.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        works = await db.portfolio_works.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(500)
        testimonials = await db.portfolio_testimonials.find({"studio_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(200)

        # Show ONLY the studio's real uploads / real reviews — never inject demo
        # "SAMPLE" photos or fabricated testimonials (owner rule: no fake hyping).
        # A studio with nothing uploaded simply renders an empty gallery.
        featured = [w for w in works if w.get("featured")] or works[:6]
        ratings = [t.get("rating", 0) for t in testimonials if t.get("rating")]
        avg = round(sum(ratings) / len(ratings), 2) if ratings else None
        # Phase 10 — apply enterprise white-label branding if set
        try:
            from white_label_service import get_white_label
            white_label = await get_white_label(db, sid)
        except Exception:
            white_label = None
        # SEO block — the Google-facing metadata + JSON-LD. PREMIUM ONLY: it is
        # the paid reason to upgrade ("to appear on Google, take premium"). A
        # non-premium studio gets None, so the search-visibility payload is gated.
        seo = None
        if tier == "premium":
            try:
                from portfolio_seo import resolve_seo
                _gallery_imgs = []
                for w in works:
                    if w.get("image_url"):
                        _gallery_imgs.append(w["image_url"])
                    _gallery_imgs.extend([g for g in (w.get("gallery") or []) if g])
                seo = resolve_seo(profile, slug, rating=avg, review_count=len(
                    [t for t in testimonials if not t.get("is_placeholder")]),
                    reviews=testimonials, gallery_images=_gallery_imgs)
            except Exception:
                logger.warning("[portfolio] SEO resolve failed for %s", sid, exc_info=True)

        return {
            "studio": {
                "id": sid,
                "slug": slug,
                "name": (white_label or {}).get("brand_name") or profile.get("studio_name"),
                "verified": (admin or {}).get("is_verified", False),
                "verified_level": int((admin or {}).get("pixora_verified_level") or 0),
            },
            "seo": seo,
            "slug": slug,
            "white_label": white_label,
            "tier": tier,
            "sections": sections,
            "design_id": (raw or {}).get("design_id"),
            "profile": profile,
            "albums": albums,
            "works": works,
            "featured": featured,
            "testimonials": testimonials,
            "rating": avg,
            "review_count": len([t for t in testimonials if not t.get("is_placeholder")]),
            "by_category": {c: [w for w in works if w.get("event_category") == c] for c in EVENT_CATEGORIES},
        }

    # ---- PUBLIC: single work (Part 14 viewer) ------------------------------
    @router.get("/api/public/photographer/{studio_id}/works/{work_id}")
    async def public_work(studio_id: str, work_id: str):
        sid, _raw = await _resolve_studio(db, studio_id)
        w = await db.portfolio_works.find_one({"id": work_id, "studio_id": sid}, {"_id": 0})
        if not w:
            raise HTTPException(404, "Work not found")
        # related = same event category, excluding this one
        related = await db.portfolio_works.find(
            {"studio_id": sid, "event_category": w.get("event_category")}, {"_id": 0}
        ).to_list(12)
        related = [r for r in related if r["id"] != work_id][:6]
        return {"work": w, "related": related}

    return router
