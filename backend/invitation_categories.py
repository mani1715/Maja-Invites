"""
Invitation Categories Module
============================
Adds support for multiple top-level invitation types (Wedding, Baby Birthday,
Half Saree Ceremony, Puberty Ceremony, Dhoti Ceremony) without disturbing the
existing wedding-specific logic.

The wedding flow remains the default and is unchanged. New categories reuse the
same Profile collection, RSVP, blessings, live photos, payments, credits, and
public viewer infrastructure — but expose category-specific fields, designs and
feature lists via this module.
"""
from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class InvitationCategory(str, Enum):
    WEDDING = "wedding"
    BABY_BIRTHDAY = "baby_birthday"
    HALF_SAREE = "half_saree"
    PUBERTY = "puberty"
    DHOTI = "dhoti"


# ---------------------------------------------------------------------------
# Category metadata (label, tagline, icon, traditional name, hero gradient)
# ---------------------------------------------------------------------------
CATEGORY_META: Dict[str, Dict[str, Any]] = {
    "wedding": {
        "id": "wedding",
        "label": "Wedding",
        "label_traditional": "Vivah / திருமணம் / పెళ్లి",
        "tagline": "Crafted wedding invitations — engagement, haldi, mehendi, marriage, reception.",
        "icon": "💍",
        "hero_gradient": "linear-gradient(135deg,#8B0000 0%,#D4AF37 100%)",
        "primary_color": "#D4AF37",
        "accent_color": "#8B0000",
        # /designs/all/ was the legacy tree and is not deployed; this is the
        # optimised catalogue path frontend-v2 actually serves.
        "cover_preview": "/designs/opt/Mughal/Engagement/engagement-template-7406cb4b-480.webp",
        "fields": ["groom_name", "bride_name", "event_date", "venue", "couple_photo"],
        "supports_sub_events": True,
        "order": 1,
    },
    "baby_birthday": {
        "id": "baby_birthday",
        "label": "Baby Birthday",
        "label_traditional": "Birthday Celebration · பிறந்தநாள் விழா",
        "tagline": "Sweet, joyful invitations for first to fifth birthdays.",
        "icon": "🎂",
        "hero_gradient": "linear-gradient(135deg,#FFB6C1 0%,#87CEEB 100%)",
        "primary_color": "#FF69B4",
        "accent_color": "#FFD700",
        "cover_preview": "/designs/categories/baby_birthday/opt/baby_birthday_1-480.webp",
        "fields": [
            "baby_name", "nickname", "age_turning", "date_of_birth",
            "father_name", "mother_name", "event_date", "venue", "baby_story", "multiple_photos"
        ],
        "supports_sub_events": False,
        "order": 2,
    },
    "half_saree": {
        "id": "half_saree",
        "label": "Half Saree Ceremony",
        "label_traditional": "Half Saree · பாவாடை தாவணி · లంగా వోణీ",
        "tagline": "A girl's traditional half-saree ceremony — silk, gold and grace.",
        "icon": "👗",
        "hero_gradient": "linear-gradient(135deg,#FF1493 0%,#FFD700 100%)",
        "primary_color": "#C71585",
        "accent_color": "#FFD700",
        "cover_preview": "/designs/categories/half_saree/opt/half_saree_1-480.webp",
        "fields": [
            "celebrant_name", "nickname", "father_name", "mother_name",
            "event_date", "venue", "celebrant_story", "multiple_photos"
        ],
        "supports_sub_events": False,
        "order": 3,
    },
    "puberty": {
        "id": "puberty",
        "label": "Puberty Ceremony",
        "label_traditional": "Manjal Neerattu · மஞ்சள் நீராட்டு விழா",
        "tagline": "A blessed coming-of-age — turmeric, blessings and family.",
        "icon": "🌸",
        "hero_gradient": "linear-gradient(135deg,#FFD700 0%,#FF8C00 100%)",
        "primary_color": "#FF8C00",
        "accent_color": "#FFD700",
        "cover_preview": "/designs/categories/puberty/opt/puberty_1-480.webp",
        "fields": [
            "celebrant_name", "nickname", "father_name", "mother_name",
            "event_date", "venue", "celebrant_story", "multiple_photos"
        ],
        "supports_sub_events": False,
        "order": 4,
    },
    "dhoti": {
        "id": "dhoti",
        "label": "Dhoti Ceremony",
        "label_traditional": "Dhoti / Lungi · வேட்டி கட்டும் விழா",
        "tagline": "A boy's coming-of-age — dhoti, family pride and tradition.",
        "icon": "👔",
        "hero_gradient": "linear-gradient(135deg,#4B0082 0%,#FFD700 100%)",
        "primary_color": "#4B0082",
        "accent_color": "#FFD700",
        "cover_preview": "/designs/categories/dhoti/opt/dhoti_1-480.webp",
        "fields": [
            "celebrant_name", "nickname", "father_name", "mother_name",
            "event_date", "venue", "celebrant_story", "multiple_photos"
        ],
        "supports_sub_events": False,
        "order": 5,
    },
}


# ---------------------------------------------------------------------------
# Per-category design gallery (from the uploaded design assets)
# ---------------------------------------------------------------------------
def _thumb(category: str, stem: str) -> str:
    """480px WebP built by scripts/optimize_category_designs.py.

    The originals are what the designer handed over and what the full-size
    preview needs; they are also up to 6 MB each (dhoti_2.png), which is not a
    grid thumbnail. Every gallery reads `thumbnail`, every full view reads
    `preview_image`, and the two are no longer the same file.
    """
    return f"/designs/categories/{category}/opt/{stem}-480.webp"


def _design_list(category: str, count: int, ext: str = "jpg") -> List[Dict[str, Any]]:
    items = []
    for i in range(1, count + 1):
        items.append({
            "design_id": f"{category}_design_{i}",
            "name": f"{CATEGORY_META[category]['label']} Design {i}",
            "preview_image": f"/designs/categories/{category}/{category}_{i}.{ext}",
            "thumbnail": _thumb(category, f"{category}_{i}"),
            "category": category,
            "credit_cost": 1,  # super-admin will override
            "is_default": (i == 1),
            "order": i,
        })
    return items


# Build static design lists from disk-uploaded assets
CATEGORY_DESIGNS: Dict[str, List[Dict[str, Any]]] = {
    "wedding": [],  # Wedding uses existing masterThemes — leave empty here
    "baby_birthday": _design_list("baby_birthday", 10, "jpg"),
    "half_saree": _design_list("half_saree", 7, "jpg"),
    "puberty": _design_list("puberty", 6, "jpg"),
    "dhoti": (
        # mix of png + jpg files
        [
            {
                "design_id": f"dhoti_design_{i}",
                "name": f"Dhoti Ceremony Design {i}",
                "preview_image": f"/designs/categories/dhoti/dhoti_{i}.png" if i <= 4 else f"/designs/categories/dhoti/dhoti_{i}.jpg",
                "thumbnail": _thumb("dhoti", f"dhoti_{i}"),
                "category": "dhoti",
                "credit_cost": 1,
                "is_default": (i == 1),
                "order": i,
            } for i in range(1, 8)
        ]
    ),
}


# ---------------------------------------------------------------------------
# Default per-category feature list (these are toggleable in the editor)
# Wedding inherits its existing huge feature list from elsewhere; we only define
# the new categories here.
# ---------------------------------------------------------------------------
SHARED_NON_WEDDING_FEATURES: List[Dict[str, Any]] = [
    {"key": "countdown",        "label": "Countdown Timer",         "default": True,  "credits": 0, "icon": "⏱️"},
    {"key": "multiple_photos",  "label": "Multiple Photo Gallery",  "default": True,  "credits": 1, "icon": "🖼️"},
    {"key": "story",            "label": "Personal Story",          "default": True,  "credits": 0, "icon": "📜"},
    {"key": "google_maps",      "label": "Google Maps Location",    "default": True,  "credits": 0, "icon": "📍"},
    {"key": "rsvp",             "label": "RSVP Collection",         "default": True,  "credits": 1, "icon": "✉️"},
    {"key": "blessings",        "label": "Send / Leave Blessings",  "default": True,  "credits": 1, "icon": "🙏"},
    {"key": "live_qr",          "label": "Live Photo QR Code",      "default": False, "credits": 2, "icon": "📱"},
    {"key": "ai_face_match",    "label": "AI Face Match Gallery",   "default": False, "credits": 3, "icon": "🤖"},
    {"key": "video_link",       "label": "Video Link (Story)",      "default": False, "credits": 1, "icon": "🎬"},
    {"key": "live_stream",      "label": "Live Event Stream Link",  "default": False, "credits": 2, "icon": "📡"},
    {"key": "languages",        "label": "Multi-language Support",  "default": True,  "credits": 0, "icon": "🌐"},
    {"key": "closing_animation","label": "Closing Animation",       "default": True,  "credits": 0, "icon": "✨"},
]

CATEGORY_FEATURES: Dict[str, List[Dict[str, Any]]] = {
    "baby_birthday":  SHARED_NON_WEDDING_FEATURES + [
        {"key": "nickname_visible", "label": "Show Baby Nickname", "default": False, "credits": 0, "icon": "🧸"},
    ],
    "half_saree":     SHARED_NON_WEDDING_FEATURES + [
        {"key": "nickname_visible", "label": "Show Nickname",      "default": False, "credits": 0, "icon": "🌷"},
    ],
    "puberty":        SHARED_NON_WEDDING_FEATURES + [
        {"key": "nickname_visible", "label": "Show Nickname",      "default": False, "credits": 0, "icon": "🌼"},
    ],
    "dhoti":          SHARED_NON_WEDDING_FEATURES + [
        {"key": "nickname_visible", "label": "Show Nickname",      "default": False, "credits": 0, "icon": "🪔"},
    ],
}


# ---------------------------------------------------------------------------
# Pydantic models for celebrant info (stored on Profile.celebrant_info)
# ---------------------------------------------------------------------------
class CelebrantInfo(BaseModel):
    """Celebrant-specific information for non-wedding invitations."""
    celebrant_name: Optional[str] = None
    nickname: Optional[str] = None
    nickname_visible: bool = False
    age_turning: Optional[int] = None       # baby birthday only
    date_of_birth: Optional[str] = None     # ISO date string
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    story: Optional[str] = None             # rich text
    video_link: Optional[str] = None        # YouTube/Vimeo URL
    live_link: Optional[str] = None         # event live stream link
    closing_message: Optional[str] = None
    extra_photos: List[str] = Field(default_factory=list)  # additional photo URLs


# ---------------------------------------------------------------------------
# Per-category, per-user-type credit overrides (in-memory; can be persisted)
# Structure: pricing[category][user_type] = { "design_credits": int, "feature_credits": {feature_key: int} }
# ---------------------------------------------------------------------------
DEFAULT_CATEGORY_PRICING: Dict[str, Dict[str, Any]] = {}
for cat in ["baby_birthday", "half_saree", "puberty", "dhoti"]:
    DEFAULT_CATEGORY_PRICING[cat] = {
        "photographer": {
            "design_credits": 1,
            "feature_credits": {f["key"]: f["credits"] for f in CATEGORY_FEATURES[cat]},
        },
        "normal_user": {
            "design_credits": 2,  # normal users pay more by default
            "feature_credits": {f["key"]: max(f["credits"], 1) for f in CATEGORY_FEATURES[cat]},
        },
    }


def get_all_categories() -> List[Dict[str, Any]]:
    return sorted(CATEGORY_META.values(), key=lambda c: c["order"])


def get_category(category_id: str) -> Optional[Dict[str, Any]]:
    return CATEGORY_META.get(category_id)


def get_category_designs(category_id: str) -> List[Dict[str, Any]]:
    return CATEGORY_DESIGNS.get(category_id, [])


def get_category_features(category_id: str) -> List[Dict[str, Any]]:
    if category_id == "wedding":
        return []
    return CATEGORY_FEATURES.get(category_id, [])


def get_category_pricing(category_id: str, user_type: str = "photographer") -> Dict[str, Any]:
    cat = DEFAULT_CATEGORY_PRICING.get(category_id, {})
    return cat.get(user_type, {"design_credits": 1, "feature_credits": {}})
