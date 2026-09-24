"""
community_gating.py — Phase 2: Pixora community plan gating (grandfather-safe).

ONE plan drives everything. A studio's community capabilities are derived from
its PORTFOLIO subscription tier (the same tier that sets storage + directory
ranking), so we never invent a second plan system:

    no active portfolio plan  -> FREE
    active "basic" plan        -> BASIC
    active "premium" plan      -> PREMIUM

Capability matrix (owner spec, Phase 2):
    FREE     view / like / comment / follow / view Learning Hub / view public profiles
    BASIC    + photo posts, multi-image posts, showcase posts, critique posts,
               verification, analytics, marketplace selling
    PREMIUM  + reels, stories, drafts, scheduled posts, CRM, AI Review,
               AI Assistant, priority discovery, featured placement, advanced analytics

GRANDFATHERING (the safety guarantee):
  Existing users must NOT lose access. We stamp every pre-existing studio with
  `community_grandfathered: True` exactly ONCE (run_gating_backfill), guarded by a
  marker flag so it never re-runs. Grandfathered studios bypass all gating and keep
  whatever they can do today. New signups (no flag) follow the plan matrix.

KILL-SWITCH:
  Feature flag `community_plan_gating` (default enabled). If an admin disables it,
  gating is bypassed for everyone — an instant rollback with no redeploy.

TEST ACCOUNTS:
  The two free test accounts always get full access so the flows stay testable.

Nothing here mutates existing rows except the one-time grandfather backfill, and
that only ADDS access. Enforcement can only ever affect brand-new accounts.
"""
import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException

logger = logging.getLogger("community_gating")

# free == normal (no paid plan). Rank lets ">=" comparisons express "at least".
TIER_RANK = {"free": 0, "normal": 0, "basic": 1, "premium": 2, "pro": 3}

FREE, BASIC, PREMIUM, PRO = "free", "basic", "premium", "pro"

# The editable matrix's own capability keys (Pricing Hub → Community Settings).
# has_capability() may be called with one of these directly (e.g. "leads").
_MATRIX_KEYS = {
    "view_feed", "like", "comment", "follow", "post", "marketplace", "reels",
    "stories", "analytics", "ai_review", "ai_assistant", "featured_placement", "leads",
}

# Maps the internal capability keys to the admin-editable community_settings
# matrix keys (Pricing Hub → Community Settings). When a mapping exists AND the
# admin has configured the matrix, that matrix is authoritative; otherwise we
# fall back to the hardcoded CAP_MIN_TIER below (so nothing is ever locked out).
_MATRIX_CAP = {
    "view": "view_feed", "like": "like", "comment": "comment", "follow": "follow",
    "photo_post": "post", "multi_image_post": "post", "showcase_post": "post",
    "critique_post": "post", "marketplace_sell": "marketplace", "analytics": "analytics",
    "reels": "reels", "stories": "stories", "ai_review": "ai_review",
    "ai_assistant": "ai_assistant", "priority_discovery": "featured_placement",
    "featured_placement": "featured_placement", "advanced_analytics": "analytics",
}

# capability -> minimum tier that unlocks it
CAP_MIN_TIER: Dict[str, str] = {
    # ---- FREE (everyone) --------------------------------------------------
    "view": FREE, "like": FREE, "comment": FREE, "follow": FREE,
    "view_learning": FREE, "view_public_profile": FREE,
    # ---- BASIC ------------------------------------------------------------
    "photo_post": BASIC, "multi_image_post": BASIC, "showcase_post": BASIC,
    "critique_post": BASIC, "verification": BASIC, "analytics": BASIC,
    "marketplace_sell": BASIC,
    # ---- PREMIUM ----------------------------------------------------------
    "reels": PREMIUM, "stories": PREMIUM, "drafts": PREMIUM, "scheduled_posts": PREMIUM,
    "crm": PREMIUM, "ai_review": PREMIUM, "ai_assistant": PREMIUM,
    "priority_discovery": PREMIUM, "featured_placement": PREMIUM, "advanced_analytics": PREMIUM,
}

# Friendly labels for the 403 upgrade message.
CAP_LABEL = {
    "photo_post": "Photo posts", "multi_image_post": "Multi-image posts",
    "showcase_post": "Showcase posts", "critique_post": "Critique posts",
    "verification": "Verification", "analytics": "Analytics",
    "marketplace_sell": "Marketplace selling",
    "reels": "Reels", "stories": "Stories", "drafts": "Drafts",
    "scheduled_posts": "Scheduled posts", "crm": "CRM", "ai_review": "AI Review",
    "ai_assistant": "AI Assistant", "priority_discovery": "Priority discovery",
    "featured_placement": "Featured placement", "advanced_analytics": "Advanced analytics",
}

TEST_FREE_EMAILS = {"test.user@majacreations.com", "test.studio@maja.test"}

_GATING_FLAG_KEY = "community_plan_gating"       # feature_flags doc; enabled => enforce
_BACKFILL_MARKER = "community_gating_backfilled"  # platform_flags marker; run-once guard


def _tier_of_name(name: Optional[str]) -> str:
    t = str(name or "").strip().lower()
    return t if t in ("basic", "premium", "pro") else FREE


async def _matrix_allows(db, tier: str, capability: str) -> Optional[bool]:
    """Admin-editable community_settings matrix lookup. Returns True/False when
    the matrix is configured and covers this capability, else None (→ fall back
    to the hardcoded CAP_MIN_TIER so a partial/empty matrix never locks anyone
    out)."""
    # Accept either an internal capability (mapped via _MATRIX_CAP) or one of the
    # matrix's own keys directly (e.g. "leads", "post").
    matrix_cap = _MATRIX_CAP.get(capability)
    if not matrix_cap and capability in _MATRIX_KEYS:
        matrix_cap = capability
    if not matrix_cap:
        return None
    try:
        doc = await db.community_settings.find_one({"id": "community_settings"})
    except Exception:
        return None
    tiers = (doc or {}).get("tiers") or {}
    row = tiers.get(tier)
    if not isinstance(row, dict) or matrix_cap not in row:
        return None
    return bool(row.get(matrix_cap))


async def studio_tier(db, sid: str) -> str:
    """FREE / BASIC / PREMIUM for a studio, derived from its portfolio plan.

    Reuses portfolio_service._portfolio_tier ('normal'|'basic'|'premium') so the
    two systems can never disagree. 'normal' maps to FREE."""
    try:
        from portfolio_service import _portfolio_tier
        t = await _portfolio_tier(db, sid)
        return FREE if t == "normal" else _tier_of_name(t)
    except Exception:
        logger.warning("community_gating: tier lookup failed for %s", sid, exc_info=True)
        return FREE


async def _admin_doc(db, sid: str) -> Dict[str, Any]:
    return (await db.admins.find_one({"id": sid}, {"_id": 0})
            or await db.admins.find_one({"admin_id": sid}, {"_id": 0})
            or {})


def _is_test_account(admin: Dict[str, Any]) -> bool:
    email = str(admin.get("email") or "").strip().lower()
    return bool(admin.get("is_test")) or email in TEST_FREE_EMAILS


async def is_grandfathered(db, sid: str, admin: Optional[Dict[str, Any]] = None) -> bool:
    """True for pre-rollout studios (stamped once) and the test accounts. Brand-new
    signups have no flag => False => the plan matrix applies to them."""
    a = admin if admin is not None else await _admin_doc(db, sid)
    if _is_test_account(a):
        return True
    return a.get("community_grandfathered") is True


async def gating_enabled(db) -> bool:
    """Master switch. Default ON; disabling the `community_plan_gating` flag rolls
    gating back instantly (everyone treated as fully allowed)."""
    try:
        f = await db.feature_flags.find_one({"id": _GATING_FLAG_KEY}, {"_id": 0})
        if f is None:
            return True   # not seeded yet -> default enforce (existing users are grandfathered anyway)
        return bool(f.get("enabled"))
    except Exception:
        return False       # on any error, fail OPEN (never lock users out)


async def has_capability(db, sid: str, capability: str,
                         admin: Optional[Dict[str, Any]] = None) -> bool:
    """Does this studio have `capability`? Order of precedence:
      1. gating disabled (kill-switch)        -> allow
      2. grandfathered / test account         -> allow
      3. tier rank >= capability's min tier    -> allow, else deny
    Unknown capabilities default to allow (never block on a typo)."""
    need = CAP_MIN_TIER.get(capability)
    if need is None:
        return True
    if need == FREE:
        return True
    if not await gating_enabled(db):
        return True
    a = admin if admin is not None else await _admin_doc(db, sid)
    if await is_grandfathered(db, sid, a):
        return True
    tier = await studio_tier(db, sid)
    # Admin-editable matrix is authoritative when it covers this capability;
    # otherwise fall back to the hardcoded minimum-tier rule.
    matrix = await _matrix_allows(db, tier, capability)
    if matrix is not None:
        return matrix
    return TIER_RANK.get(tier, 0) >= TIER_RANK.get(need, 99)


async def ensure_capability(db, sid: str, capability: str,
                            admin: Optional[Dict[str, Any]] = None) -> None:
    """Raise 403 with an upgrade prompt if the studio lacks `capability`."""
    if await has_capability(db, sid, capability, admin):
        return
    need = CAP_MIN_TIER.get(capability, PREMIUM)
    label = CAP_LABEL.get(capability, capability.replace("_", " ").title())
    plan = "Premium" if need == PREMIUM else "Basic"
    raise HTTPException(
        status_code=403,
        detail=f"{label} is a {plan} feature. Upgrade your plan to unlock it.",
    )


async def capability_state(db, sid: str) -> Dict[str, Any]:
    """A single snapshot the frontend uses to show/hide + label locked features."""
    a = await _admin_doc(db, sid)
    tier = await studio_tier(db, sid)
    grand = await is_grandfathered(db, sid, a)
    enforced = await gating_enabled(db)
    caps = {cap: await has_capability(db, sid, cap, a) for cap in CAP_MIN_TIER}
    return {
        "tier": tier,
        "grandfathered": grand,
        "enforced": enforced,
        "capabilities": caps,
        "matrix": CAP_MIN_TIER,
    }


async def public_capability_matrix(db) -> Dict[str, Any]:
    """What each portfolio tier unlocks in the community — for a buyer who is
    not signed in yet.

    capability_state() answers the same question for a KNOWN studio and needs
    auth, so it could not be used on the pricing page, which is exactly where
    someone decides whether the plan is worth buying. The answer was therefore
    only visible after purchase.

    Carries no studio data — just the tier→capability matrix, with the admin's
    Pricing Hub overrides applied so the page cannot promise something the
    server will then refuse. Safe to serve publicly: it IS the pricing.
    """
    tiers = [FREE, BASIC, PREMIUM]
    rows = []
    for cap, min_tier in CAP_MIN_TIER.items():
        entry = {
            "capability": cap,
            "label": CAP_LABEL.get(cap, cap.replace("_", " ").capitalize()),
            "min_tier": min_tier,
            "tiers": {},
        }
        for t in tiers:
            override = await _matrix_allows(db, t, cap)
            entry["tiers"][t] = (bool(override) if override is not None
                                 else TIER_RANK.get(t, 0) >= TIER_RANK.get(min_tier, 0))
        rows.append(entry)

    # Order the way a buyer reads it: what everyone gets, then what each paid
    # step adds.
    rows.sort(key=lambda r: (TIER_RANK.get(r["min_tier"], 0), r["label"].lower()))
    return {
        "tiers": tiers,
        "enforced": await gating_enabled(db),
        "capabilities": rows,
        # One plan drives both — say so, rather than letting the page imply
        # there is a separate community subscription to buy.
        "source": "portfolio_plan",
    }


async def run_gating_backfill(db) -> Dict[str, Any]:
    """ONE-TIME: stamp every existing studio as grandfathered so nobody loses access
    at rollout. Guarded by a marker so it never runs twice (a second run would wrongly
    grandfather post-rollout signups). Also seeds the kill-switch flag (enabled)."""
    try:
        marker = await db.feature_flags.find_one({"id": _BACKFILL_MARKER}, {"_id": 0})
    except Exception:
        logger.warning("community_gating: backfill marker read failed", exc_info=True)
        return {"ran": False, "reason": "marker_read_failed"}

    # Ensure the kill-switch flag exists (default enabled) regardless of backfill state.
    try:
        if await db.feature_flags.find_one({"id": _GATING_FLAG_KEY}, {"_id": 0}) is None:
            from datetime import datetime, timezone
            await db.feature_flags.update_one(
                {"id": _GATING_FLAG_KEY},
                {"$set": {"id": _GATING_FLAG_KEY, "key": _GATING_FLAG_KEY,
                          "label": "Community plan gating",
                          "description": "Enforce FREE/BASIC/PREMIUM community capabilities for new members.",
                          "enabled": True,
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True)
    except Exception:
        logger.warning("community_gating: could not seed gating flag", exc_info=True)

    if marker is not None:
        return {"ran": False, "reason": "already_backfilled"}

    stamped = 0
    try:
        admins = await db.admins.find({}, {"_id": 0}).to_list(100000)
        for a in admins:
            if a.get("community_grandfathered") is True:
                continue
            key = a.get("id") or a.get("admin_id")
            if not key:
                continue
            field = "id" if a.get("id") else "admin_id"
            await db.admins.update_one({field: key}, {"$set": {"community_grandfathered": True}})
            stamped += 1
        from datetime import datetime, timezone
        await db.feature_flags.update_one(
            {"id": _BACKFILL_MARKER},
            {"$set": {"id": _BACKFILL_MARKER, "key": _BACKFILL_MARKER,
                      "label": "Community gating backfill complete",
                      "enabled": True, "stamped": stamped,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True)
        logger.info("[community_gating] grandfathered %s existing studios", stamped)
        return {"ran": True, "stamped": stamped}
    except Exception:
        logger.warning("community_gating: backfill failed", exc_info=True)
        return {"ran": False, "reason": "backfill_failed", "stamped": stamped}
