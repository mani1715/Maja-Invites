"""
pricing_activation.py — Unified Pricing Engine: entitlement enforcement.
========================================================================

Turns a PAID order into real entitlements on the invitation link:
  * Link duration  → writes profile.link_expiry_date (the existing lifecycle at
                     server.py already enforces this field). Lifetime → no expiry.
  * Feature pack   → writes profile.feature_pack_key + granted_features, which the
                     runtime gate `has_feature()` reads. No hardcoded unlocks.

SAFETY (production rules — every one honoured):
  * Entirely behind `new_pricing_enabled` (OFF → every function is a no-op / permissive).
  * Grandfathered profiles (`pricing_grandfathered`) NEVER get an expiry written — existing
    links stay permanent.
  * Only NEW purchases priced by the v2 engine (`quote.pricing_model == "v2"`) are enforced;
    legacy ceremony-package orders are ignored (their `package` is not a feature pack).
  * Backward compatible: a profile with no `granted_features` (legacy) keeps ALL features.
  * Idempotent + audited to `pricing_audit_log`. Reversible (flag OFF restores old behaviour).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

FLAG_KEY = "new_pricing_enabled"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(p: str) -> str:
    return f"{p}_{uuid.uuid4().hex[:14]}"


def _parse(iso: Any) -> Optional[datetime]:
    if not iso:
        return None
    try:
        s = str(iso).replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def flag_on(db) -> bool:
    try:
        doc = await db.app_settings.find_one({"key": FLAG_KEY})
        return bool(doc and doc.get("value") is True)
    except Exception:
        return False


async def _audit(db, actor: str, action: str, target: str, order_id: Optional[str],
                 detail: Dict[str, Any]) -> None:
    try:
        await db.pricing_audit_log.insert_one({
            "id": _uid("audit"), "actor": actor or "system", "action": action,
            "target": target, "order_id": order_id, "detail": detail, "created_at": _now()})
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# duration → expiry
# --------------------------------------------------------------------------- #
async def compute_expiry(db, duration_id: str, base_iso: Optional[str] = None) -> Optional[str]:
    """Return the ISO expiry for a purchased duration tier, or None for lifetime /
    unknown-non-expiring. Base = activation time (now) unless given."""
    tier = (await db.link_duration_tiers.find_one({"id": duration_id})
            or await db.link_duration_tiers.find_one({"key": duration_id}))
    if not tier or tier.get("lifetime"):
        return None
    days = int(tier.get("duration_days") or 0)
    if days <= 0:
        return None
    base = _parse(base_iso) or datetime.now(timezone.utc)
    return (base + timedelta(days=days)).isoformat()


# --------------------------------------------------------------------------- #
# feature pack → granted features
# --------------------------------------------------------------------------- #
async def pack_features(db, pack_key: str) -> Optional[List[str]]:
    pack = await db.feature_packs.find_one({"key": pack_key})
    if not pack:
        return None
    feats = pack.get("features")
    return list(feats) if isinstance(feats, list) else []


# --------------------------------------------------------------------------- #
# apply on order delivery/activation
# --------------------------------------------------------------------------- #
def _order_pricing(order: Dict[str, Any]) -> Dict[str, Any]:
    q = order.get("quote") or {}
    is_v2 = q.get("pricing_model") == "v2" or bool(order.get("feature_pack_key"))
    return {
        "is_v2": is_v2,
        "duration_id": order.get("duration_id") or q.get("duration_id"),
        "pack_key": order.get("feature_pack_key") or (q.get("package") if is_v2 else None),
    }


async def apply_order_entitlements(db, order: Dict[str, Any], profile_id: str,
                                   *, actor: str = "system") -> Dict[str, Any]:
    """Write duration expiry + pack features onto the profile. No-op unless the flag
    is ON and the order was priced by the v2 engine. Grandfathered links never expire."""
    if not await flag_on(db):
        return {"applied": False, "reason": "flag_off"}
    info = _order_pricing(order)
    if not info["is_v2"]:
        return {"applied": False, "reason": "legacy_order"}
    profile = await db.profiles.find_one({"id": profile_id})
    if not profile:
        return {"applied": False, "reason": "no_profile"}

    updates: Dict[str, Any] = {}
    audit: Dict[str, Any] = {}

    # duration → expiry (never for grandfathered links)
    if info["duration_id"] and not profile.get("pricing_grandfathered"):
        expiry = await compute_expiry(db, info["duration_id"], order.get("paid_at"))
        updates["link_duration_id"] = info["duration_id"]
        updates["link_duration_policy"] = "purchased"
        updates["link_lifetime"] = expiry is None
        updates["link_expiry_date"] = expiry            # None = lifetime (no expiry)
        audit["duration"] = {"id": info["duration_id"], "expiry": expiry, "lifetime": expiry is None}

    # pack → granted features (source of truth for feature access)
    if info["pack_key"]:
        feats = await pack_features(db, info["pack_key"])
        if feats is not None:
            updates["feature_pack_key"] = info["pack_key"]
            updates["granted_features"] = feats
            audit["pack"] = {"key": info["pack_key"], "features": feats}

    if updates:
        updates["updated_at"] = _now()
        await db.profiles.update_one({"id": profile_id}, {"$set": updates})
        await _audit(db, actor, "order_entitlements_applied", profile_id, order.get("id"), audit)
    return {"applied": bool(updates), "fields": list(updates.keys()), **audit}


# --------------------------------------------------------------------------- #
# runtime feature gate (source of truth = the pack's features)
# --------------------------------------------------------------------------- #
async def has_feature(db, profile: Dict[str, Any], feature_key: str) -> bool:
    """Is a feature available on this invitation? Backward-compatible:
      * flag OFF                → True (legacy behaviour, nothing gated)
      * no granted_features set → True (grandfathered / legacy link)
      * otherwise              → True iff the feature is in the purchased pack.
    """
    if not await flag_on(db):
        return True
    granted = (profile or {}).get("granted_features")
    if granted is None:
        return True
    return feature_key in granted


def granted_features(profile: Dict[str, Any]) -> Optional[List[str]]:
    """The features a profile's pack grants (None = ungated/legacy). For the public
    payload so the renderer can hide un-purchased features."""
    g = (profile or {}).get("granted_features")
    return list(g) if isinstance(g, list) else None
