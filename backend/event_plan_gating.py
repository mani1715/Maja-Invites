"""
event_plan_gating.py — MAJA Dynamic Event Engine: plan → feature gating (Ganesh v2 §4).
========================================================================================

Reuses the already-built feature-pack + pricing system for EVENTS. When a buyer's plan
(feature pack) is applied to an event, its granted Ganesh feature keys are written onto
the event; the public renderer shows a feature only if the plan grants it.

Backward-compatible & reversible:
  * An event is gated ONLY once it HAS `granted_features` (i.e. a plan was bought
    through event_pricing). No `granted_features` (legacy / not yet plan-assigned)
    → everything is visible, exactly as before.
  * Only PACKABLE keys are ever hidden (the GANESH_FEATURE_KEYS set); base sections
    (hero, welcome, venue, RSVP, schedule…) are never gated.
  * Rollback = clear `granted_features` on the event (or turn the module flag off).

Note on the wedding flag: event plans are sold through `event_pricing` and are NOT
tied to `new_pricing_enabled` — that flag governs the wedding pricing cutover only.
`apply_event_plan()` (feature-pack based, flag-gated) is kept for the packs path.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import event_registry as registry
from pricing_activation import flag_on, _audit, _now


def packable_keys() -> set:
    cfg = registry.get_config("ganesh_chaturthi") or {}
    return set(cfg.get("feature_keys") or [])


async def pack_event_features(db, pack_key: str) -> Optional[List[str]]:
    """The Ganesh feature keys a purchased feature pack grants = the pack's features
    intersected with the event feature-key vocabulary (so wedding-only keys are ignored)."""
    pack = await db.feature_packs.find_one({"key": pack_key})
    if not pack:
        return None
    keys = packable_keys()
    return [f for f in (pack.get("features") or []) if f in keys]


async def apply_event_plan(db, event_id: str, pack_key: str, *, actor: str = "system") -> Dict[str, Any]:
    """Write the plan's granted features onto the event. No-op unless new_pricing_enabled
    is ON. Reversible + audited."""
    if not await flag_on(db):
        return {"applied": False, "reason": "flag_off"}
    feats = await pack_event_features(db, pack_key)
    if feats is None:
        return {"applied": False, "reason": "unknown_pack"}
    await db.events.update_one(
        {"event_id": event_id},
        {"$set": {"plan_key": pack_key, "granted_features": feats, "updated_at": _now()}})
    try:
        await _audit(db, actor, "event_plan_applied", event_id, None,
                     {"pack": pack_key, "features": feats})
    except Exception:
        pass
    return {"applied": True, "plan_key": pack_key, "granted_features": feats}


async def apply_event_entitlements(db, event_id: str, plan_key: str,
                                   features: List[str], *, actor: str = "system",
                                   active_days: Optional[int] = None) -> Dict[str, Any]:
    """Write a purchased event plan's features onto the event (event_pricing path).

    Unlike `apply_event_plan` this is NOT tied to `new_pricing_enabled`: event plans
    are a new product with no legacy buyers to grandfather. Still reversible — clear
    `granted_features` and the event renders everything again."""
    keys = packable_keys()
    feats = [f for f in (features or []) if f in keys]
    patch: Dict[str, Any] = {"plan_key": plan_key, "granted_features": feats, "updated_at": _now()}
    if active_days:
        patch["link_active_days"] = int(active_days)
    await db.events.update_one({"event_id": event_id}, {"$set": patch})
    try:
        await _audit(db, actor, "event_entitlements_applied", event_id, None,
                     {"plan": plan_key, "features": feats, "active_days": active_days})
    except Exception:
        pass
    return {"applied": True, "plan_key": plan_key, "granted_features": feats}


async def event_has_feature(db, event: Dict[str, Any], feature_key: str) -> bool:
    """Runtime gate. Permissive when the key is not packable or the event has no
    granted_features (legacy / ungated / rolled back)."""
    if feature_key not in packable_keys():
        return True
    granted = (event or {}).get("granted_features")
    if granted is None:
        return True
    return feature_key in granted


def public_event_features(event: Dict[str, Any]) -> Optional[List[str]]:
    """For the public payload so the renderer can hide un-purchased features
    (None = ungated / show everything)."""
    g = (event or {}).get("granted_features")
    return list(g) if isinstance(g, list) else None
