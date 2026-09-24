"""
PHASE 33: Feature Gating & Monetization System
Mock payment system with plan-based feature access control
"""

from enum import Enum
from typing import Optional, Dict, Any


class PlanType(str, Enum):
    """Available subscription plans"""
    FREE = "FREE"
    SILVER = "SILVER"
    GOLD = "GOLD"
    PLATINUM = "PLATINUM"


class Feature(str, Enum):
    """All gated features in the application"""
    # Media Features
    BACKGROUND_MUSIC = "background_music"
    HERO_VIDEO = "hero_video"
    GALLERY_UNLIMITED = "gallery_unlimited"
    GALLERY_LIMITED = "gallery_limited"
    
    # Analytics Features
    ANALYTICS_BASIC = "analytics_basic"
    ANALYTICS_ADVANCED = "analytics_advanced"
    
    # Security Features
    PASSCODE_PROTECTION = "passcode_protection"
    
    # AI Features
    AI_TRANSLATION = "ai_translation"
    AI_DESCRIPTION = "ai_description"
    
    # Design Features
    PREMIUM_DESIGNS = "premium_designs"
    CUSTOM_COLORS = "custom_colors"
    
    # Other Features
    NO_WATERMARK = "no_watermark"
    EVENT_WISE_GALLERY = "event_wise_gallery"
    RSVP_MANAGEMENT = "rsvp_management"
    GUEST_WISHES = "guest_wishes"


# Feature access matrix: Plan -> Enabled Features
FEATURE_ACCESS: Dict[PlanType, set] = {
    PlanType.FREE: {
        Feature.GUEST_WISHES,
        Feature.RSVP_MANAGEMENT,
        # NO watermark removal
        # NO music, video, analytics, AI
    },
    
    PlanType.SILVER: {
        Feature.GUEST_WISHES,
        Feature.RSVP_MANAGEMENT,
        Feature.BACKGROUND_MUSIC,
        Feature.GALLERY_LIMITED,
        Feature.ANALYTICS_BASIC,
        Feature.NO_WATERMARK,
        Feature.CUSTOM_COLORS,
    },
    
    PlanType.GOLD: {
        Feature.GUEST_WISHES,
        Feature.RSVP_MANAGEMENT,
        Feature.BACKGROUND_MUSIC,
        Feature.HERO_VIDEO,
        Feature.GALLERY_LIMITED,
        Feature.EVENT_WISE_GALLERY,
        Feature.ANALYTICS_BASIC,
        Feature.ANALYTICS_ADVANCED,
        Feature.PASSCODE_PROTECTION,
        Feature.NO_WATERMARK,
        Feature.CUSTOM_COLORS,
        Feature.PREMIUM_DESIGNS,
    },
    
    PlanType.PLATINUM: {
        # ALL FEATURES
        Feature.GUEST_WISHES,
        Feature.RSVP_MANAGEMENT,
        Feature.BACKGROUND_MUSIC,
        Feature.HERO_VIDEO,
        Feature.GALLERY_UNLIMITED,
        Feature.EVENT_WISE_GALLERY,
        Feature.ANALYTICS_BASIC,
        Feature.ANALYTICS_ADVANCED,
        Feature.PASSCODE_PROTECTION,
        Feature.AI_TRANSLATION,
        Feature.AI_DESCRIPTION,
        Feature.NO_WATERMARK,
        Feature.CUSTOM_COLORS,
        Feature.PREMIUM_DESIGNS,
    }
}


# Gallery limits per plan
GALLERY_LIMITS: Dict[PlanType, Optional[int]] = {
    PlanType.FREE: 0,  # No gallery
    PlanType.SILVER: 10,  # Max 10 images
    PlanType.GOLD: 50,  # Max 50 images
    PlanType.PLATINUM: None,  # Unlimited
}


def has_feature(profile_data: Dict[str, Any], feature: Feature) -> bool:
    """
    Credit-based access control (Feb 2026 refactor):
    The legacy FREE / SILVER / GOLD / PLATINUM plan tier system has been
    removed in favour of the unified credit system. Every feature is now
    available to every account; access is metered by the credit purchase
    records (`design_purchases` collection) and enforced at the purchase
    boundary in `user_purchase_service.confirm_purchase`. This function
    returns True for every feature so the rest of the codebase keeps
    compiling without behavioural surprises.
    """
    _ = profile_data, feature   # signature preserved for legacy callers
    return True


def get_gallery_limit(profile_data: Dict[str, Any]) -> Optional[int]:
    """Credit-based gallery: no plan-tier limit. Return None (unlimited)."""
    _ = profile_data
    return None


def get_feature_flags(profile_data: Dict[str, Any]) -> Dict[str, bool]:
    """Every feature flag is True under credit-based access control."""
    _ = profile_data
    return {feature.value: True for feature in Feature}


def requires_watermark(profile_data: Dict[str, Any]) -> bool:
    """Watermark visibility.

    Resolution order:
      1. Per-invitation admin override (`admin_watermark_override`):
            "on"   → always watermark
            "off"  → never watermark
            "user" → fall through to user's own setting
            (None/missing → fall through)
      2. User's per-invitation toggle (`show_watermark` / legacy plan FREE).
    """
    p = profile_data or {}
    override = (p.get("admin_watermark_override") or "user").lower()
    if override == "on":
        return True
    if override == "off":
        return False

    # User-controlled fallback. We honour an explicit `show_watermark` field
    # if set; otherwise legacy FREE plans get a watermark by default.
    if "show_watermark" in p:
        return bool(p.get("show_watermark"))
    return (p.get("plan_type") or "FREE") == "FREE"


def get_plan_info(plan_type: str) -> Dict[str, Any]:
    """
    Credit-based refactor: plan tiers no longer exist. Return a uniform
    "credit-based" shape so any legacy UI that still calls this keeps
    rendering without GOLD/PLATINUM badges.
    """
    _ = plan_type
    return {
        "name": "Credits",
        "color": "amber",
        "features": [
            "Pay-per-design with credits",
            "All features available",
            "Buy credit packs anytime",
        ],
        "limitations": [],
    }

