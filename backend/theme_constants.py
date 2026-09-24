"""
PHASE 34: PREMIUM DESIGN SYSTEM & THEME ENGINE
High-end themes for ₹10k-15k wedding invitations

This file defines 8 MASTER THEMES with locked layouts, typography, and controlled customization.
All themes are designed for premium look and sellability.

Version: 2.0.0 (PHASE 34)
Last Updated: 2025
"""

from typing import Dict, List, Optional
from enum import Enum


class AnimationLevel(str, Enum):
    """Animation intensity levels"""
    NONE = "none"
    SUBTLE = "subtle"
    FESTIVE = "festive"


class PlanType(str, Enum):
    """Subscription plan types for theme gating"""
    FREE = "FREE"
    SILVER = "SILVER"
    GOLD = "GOLD"
    PLATINUM = "PLATINUM"


# ==========================================
# MASTER THEMES CONFIGURATION
# ==========================================

MASTER_THEMES = {
    "royal_heritage": {
        "id": "royal_heritage",
        "name": "Royal Heritage",
        "description": "Crimson and gold majesty with regal elegance",
        "category": "traditional",
        "layout_type": "classic",  # Locked layout structure
        "typography": {
            "heading": "Playfair Display",  # Locked
            "body": "Lora",  # Locked
            "accent": "Cinzel"  # Locked
        },
        "colors": {
            "primary": "#8B0000",      # Deep Crimson
            "accent": "#FFD700",       # Royal Gold
            "background": "#FFF8E7",   # Ivory
            "backgroundVariant": "#F5E6D3",  # Light beige
            "text": "#2C1810",         # Dark brown
            "textLight": "#6B4423"     # Medium brown
        },
        "defaultAnimationLevel": "subtle",
        "glassmorphismSupport": True,
        "planRequired": "FREE",  # Available for all plans
        "previewImage": "/themes/royal_heritage.jpg",
        "order": 1
    },
    
    "temple_gold": {
        "id": "temple_gold",
        "name": "Temple Gold",
        "description": "Sacred gold with temple-inspired grandeur",
        "category": "traditional",
        "layout_type": "classic",
        "typography": {
            "heading": "Cinzel",
            "body": "Crimson Text",
            "accent": "Cormorant Garamond"
        },
        "colors": {
            "primary": "#DAA520",      # Goldenrod
            "accent": "#8B4513",       # Saddle Brown
            "background": "#FFFAF0",   # Floral White
            "backgroundVariant": "#FFF8DC",  # Cornsilk
            "text": "#3E2723",         # Dark brown
            "textLight": "#5D4037"     # Brown
        },
        "defaultAnimationLevel": "festive",
        "glassmorphismSupport": True,
        "planRequired": "FREE",
        "previewImage": "/themes/temple_gold.jpg",
        "order": 2
    },
    
    "peacock_dream": {
        "id": "peacock_dream",
        "name": "Peacock Dream",
        "description": "Vibrant teal and emerald with peacock elegance",
        "category": "vibrant",
        "layout_type": "modern",
        "typography": {
            "heading": "Libre Baskerville",
            "body": "Source Serif Pro",
            "accent": "Playfair Display"
        },
        "colors": {
            "primary": "#008B8B",      # Dark Cyan (Peacock)
            "accent": "#50C878",       # Emerald
            "background": "#F0FFF0",   # Honeydew
            "backgroundVariant": "#E0F2F1",  # Light teal
            "text": "#004D40",         # Dark teal
            "textLight": "#00796B"     # Teal
        },
        "defaultAnimationLevel": "festive",
        "glassmorphismSupport": True,
        "planRequired": "SILVER",  # Requires SILVER or above
        "previewImage": "/themes/peacock_dream.jpg",
        "order": 3
    },
    
    "modern_lotus": {
        "id": "modern_lotus",
        "name": "Modern Lotus",
        "description": "Contemporary rose with lotus-inspired softness",
        "category": "romantic",
        "layout_type": "modern",
        "typography": {
            "heading": "Poppins",
            "body": "Inter",
            "accent": "Montserrat"
        },
        "colors": {
            "primary": "#FF1493",      # Deep Pink
            "accent": "#FFB6C1",       # Light Pink
            "background": "#FFF0F5",   # Lavender Blush
            "backgroundVariant": "#FFE4E1",  # Misty Rose
            "text": "#4A154B",         # Dark purple
            "textLight": "#7B1FA2"     # Purple
        },
        "defaultAnimationLevel": "subtle",
        "glassmorphismSupport": True,
        "planRequired": "SILVER",
        "previewImage": "/themes/modern_lotus.jpg",
        "order": 4
    },
    
    "modern_pastel": {
        "id": "modern_pastel",
        "name": "Modern Pastel",
        "description": "Soft rose, sage, and sand minimalism",
        "category": "modern",
        "layout_type": "minimalist",
        "typography": {
            "heading": "Jost",
            "body": "Karla",
            "accent": "DM Sans"
        },
        "colors": {
            "primary": "#D4A5A5",      # Rose
            "accent": "#9CAF88",       # Sage
            "background": "#FAF9F6",   # Off-white
            "backgroundVariant": "#F5F5DC",  # Beige
            "text": "#3E3E3E",         # Dark gray
            "textLight": "#717171"     # Medium gray
        },
        "defaultAnimationLevel": "subtle",
        "glassmorphismSupport": True,
        "planRequired": "GOLD",  # Requires GOLD or above
        "previewImage": "/themes/modern_pastel.jpg",
        "order": 5
    },
    
    "midnight_sangeet": {
        "id": "midnight_sangeet",
        "name": "Midnight Sangeet",
        "description": "Deep indigo, silver, and black sophistication",
        "category": "luxury",
        "layout_type": "modern",
        "typography": {
            "heading": "Bodoni Moda",
            "body": "Roboto",
            "accent": "Oswald"
        },
        "colors": {
            "primary": "#191970",      # Midnight Blue
            "accent": "#C0C0C0",       # Silver
            "background": "#0A0A0A",   # Near Black
            "backgroundVariant": "#1C1C1C",  # Dark gray
            "text": "#FFFFFF",         # White
            "textLight": "#B0B0B0"     # Light gray
        },
        "defaultAnimationLevel": "festive",
        "glassmorphismSupport": True,
        "planRequired": "GOLD",
        "previewImage": "/themes/midnight_sangeet.jpg",
        "order": 6
    },
    
    "ivory_elegance": {
        "id": "ivory_elegance",
        "name": "Ivory Elegance",
        "description": "Timeless ivory with champagne accents",
        "category": "elegant",
        "layout_type": "classic",
        "typography": {
            "heading": "Cormorant",
            "body": "Lato",
            "accent": "EB Garamond"
        },
        "colors": {
            "primary": "#FFFFF0",      # Ivory
            "accent": "#F7E7CE",       # Champagne
            "background": "#FAFAFA",   # White smoke
            "backgroundVariant": "#F5F5F5",  # Light gray
            "text": "#2F2F2F",         # Charcoal
            "textLight": "#5A5A5A"     # Gray
        },
        "defaultAnimationLevel": "none",
        "glassmorphismSupport": True,
        "planRequired": "PLATINUM",  # Requires PLATINUM
        "previewImage": "/themes/ivory_elegance.jpg",
        "order": 7
    },
    
    "dark_royal": {
        "id": "dark_royal",
        "name": "Dark Royal",
        "description": "Luxurious dark purple with gold highlights",
        "category": "luxury",
        "layout_type": "modern",
        "typography": {
            "heading": "Yeseva One",
            "body": "Nunito Sans",
            "accent": "Raleway"
        },
        "colors": {
            "primary": "#4B0082",      # Indigo (Royal Purple)
            "accent": "#FFD700",       # Gold
            "background": "#1A0033",   # Very dark purple
            "backgroundVariant": "#2D004D",  # Dark purple
            "text": "#F5F5F5",         # Off-white
            "textLight": "#CCCCCC"     # Light gray
        },
        "defaultAnimationLevel": "festive",
        "glassmorphismSupport": True,
        "planRequired": "PLATINUM",
        "previewImage": "/themes/dark_royal.jpg",
        "order": 8
    }
}


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_all_theme_ids() -> List[str]:
    """Get list of all theme IDs"""
    return list(MASTER_THEMES.keys())


def get_theme_by_id(theme_id: str) -> Optional[Dict]:
    """Get theme configuration by ID"""
    return MASTER_THEMES.get(theme_id)


def is_valid_theme(theme_id: str) -> bool:
    """Check if theme ID is valid"""
    return theme_id in MASTER_THEMES


def get_default_theme() -> str:
    """Get default theme ID"""
    return "royal_heritage"


def get_themes_by_plan(plan_type: str) -> List[str]:
    """
    Get available theme IDs for a given plan
    
    Plan hierarchy:
    - FREE: Only FREE themes
    - SILVER: FREE + SILVER themes
    - GOLD: FREE + SILVER + GOLD themes
    - PLATINUM: All themes
    """
    plan_hierarchy = {
        "FREE": ["FREE"],
        "SILVER": ["FREE", "SILVER"],
        "GOLD": ["FREE", "SILVER", "GOLD"],
        "PLATINUM": ["FREE", "SILVER", "GOLD", "PLATINUM"]
    }
    
    allowed_plans = plan_hierarchy.get(plan_type, ["FREE"])
    
    return [
        theme_id for theme_id, theme in MASTER_THEMES.items()
        if theme["planRequired"] in allowed_plans
    ]


def get_themes_by_category(category: str) -> List[str]:
    """Get theme IDs by category"""
    return [
        theme_id for theme_id, theme in MASTER_THEMES.items()
        if theme["category"] == category
    ]


def theme_requires_plan(theme_id: str) -> str:
    """Get minimum plan required for theme"""
    theme = MASTER_THEMES.get(theme_id)
    return theme["planRequired"] if theme else "PLATINUM"


def can_use_theme(theme_id: str, user_plan: str) -> bool:
    """
    Check if user's plan allows using the theme
    
    Args:
        theme_id: Theme identifier
        user_plan: User's subscription plan (FREE/SILVER/GOLD/PLATINUM)
    
    Returns:
        bool: True if user can use the theme
    """
    available_themes = get_themes_by_plan(user_plan)
    return theme_id in available_themes


def get_theme_preview_data(theme_id: str) -> Optional[Dict]:
    """
    Get theme preview data for admin selection
    
    Returns lightweight theme info for UI display
    """
    theme = MASTER_THEMES.get(theme_id)
    if not theme:
        return None
    
    return {
        "id": theme["id"],
        "name": theme["name"],
        "description": theme["description"],
        "category": theme["category"],
        "previewImage": theme["previewImage"],
        "colors": theme["colors"],
        "planRequired": theme["planRequired"],
        "order": theme["order"]
    }


def get_all_themes_preview() -> List[Dict]:
    """Get preview data for all themes sorted by order"""
    previews = [get_theme_preview_data(theme_id) for theme_id in MASTER_THEMES.keys()]
    return sorted([p for p in previews if p], key=lambda x: x["order"])


# ==========================================
# LEGACY COMPATIBILITY
# ==========================================

# For backward compatibility with existing code
THEME_IDS = get_all_theme_ids()
DEFAULT_THEME = get_default_theme()

# === SPRINT 2: 10 cultural theme IDs (frontend canonical names) ===
# The frontend masterThemes.js defines these. Backend just needs to accept them
# as valid design_id values; the rich theme metadata lives in the frontend.
_LUXURY_THEME_IDS = [
    "royal_mughal", "south_indian_temple", "modern_minimal", "beach_destination",
    "punjabi_sangeet", "bengali_traditional", "christian_elegant", "muslim_nikah",
    "nature_eco_wedding", "bollywood_luxury", "kerala_backwaters",
]
for _t in _LUXURY_THEME_IDS:
    if _t not in THEME_IDS:
        THEME_IDS.append(_t)

# Bespoke one-off invitation designs — a full custom React page renders these
# (frontend GuestInvitation branches on the id). They carry NO picker metadata
# in masterThemes.js, so they are accepted as a valid design_id but never
# offered as a selectable theme in the studio; only an admin-assigned event uses
# one.
_BESPOKE_DESIGN_IDS = [
    "engagement_saivamsi",   # Sai Vamsi & Sai Sahithi engagement (EngagementInvitation.jsx)
]
for _t in _BESPOKE_DESIGN_IDS:
    if _t not in THEME_IDS:
        THEME_IDS.append(_t)

# Backward-compatible aliases (old id -> new id). Stored as data only;
# the frontend ALSO has the same map.
LEGACY_THEME_ALIASES = {
    "royal_heritage": "royal_mughal",
    "temple_gold": "south_indian_temple",
    "modern_pastel": "modern_minimal",
    "peacock_dream": "beach_destination",
    "midnight_sangeet": "punjabi_sangeet",
    "modern_lotus": "bengali_traditional",
    "ivory_elegance": "christian_elegant",
    "dark_royal": "bollywood_luxury",
}

# Legacy theme categories (for old code)
THEME_CATEGORIES = {
    'traditional': get_themes_by_category('traditional'),
    'romantic': get_themes_by_category('romantic'),
    'vibrant': get_themes_by_category('vibrant'),
    'modern': get_themes_by_category('modern'),
    'elegant': get_themes_by_category('elegant'),
    'luxury': get_themes_by_category('luxury')
}
