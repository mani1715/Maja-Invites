"""
Design Catalog — canonical registry of every per-event invitation design.

The frontend ships ~180 specific designs (e.g. `mughal_engagement_1`,
`kerala_marriage_3`).  This module mirrors that catalog on the backend so the
Super-Admin Pricing Hub can store a per-design credit price and the user-facing
profile-creation endpoint can charge users based on the exact design they pick.

The frontend source-of-truth lives in:
    /app/frontend/src/themes/configs/<prefix>.designs.js
    /app/frontend/src/themes/kerala_backwaters/kerala.designs.js

Theme prefix → canonical theme_id mapping (matches super_admin_pricing.THEMES):
    mughal     → royal_mughal
    temple     → south_indian_temple
    minimal    → modern_minimal
    beach      → beach_destination
    punjabi    → punjabi_sangeet
    bengali    → bengali_traditional
    christian  → christian_elegant
    muslim     → muslim_nikah
    nature     → nature_eco_wedding
    kerala     → kerala_backwaters
"""
from __future__ import annotations

from typing import Dict, List


# Theme prefix → canonical theme_id used in super_admin_pricing.THEMES
THEME_PREFIX_TO_ID: Dict[str, str] = {
    "mughal":    "royal_mughal",
    "temple":    "south_indian_temple",
    "minimal":   "modern_minimal",
    "beach":     "beach_destination",
    "punjabi":   "punjabi_sangeet",
    "bengali":   "bengali_traditional",
    "christian": "christian_elegant",
    "muslim":    "muslim_nikah",
    "nature":    "nature_eco_wedding",
    "kerala":    "kerala_backwaters",
}

# Reverse: canonical theme_id → frontend prefix
THEME_ID_TO_PREFIX: Dict[str, str] = {v: k for k, v in THEME_PREFIX_TO_ID.items()}

# Each theme has 6 events × 3 designs = 18 designs per theme.
EVENTS: List[str] = ["engagement", "haldi", "mehandi", "marriage", "reception", "sangeeth"]
EVENT_LABEL: Dict[str, str] = {
    "engagement": "Engagement",
    "haldi":      "Haldi",
    "mehandi":    "Mehandi",
    "marriage":   "Marriage",
    "reception":  "Reception",
    "sangeeth":   "Sangeet",
}
VARIANTS_PER_EVENT: int = 3


def _human_label(prefix: str, event: str, n: int) -> str:
    return f"{prefix.title()} · {EVENT_LABEL[event]} #{n}"


def _theme_label(theme_id: str) -> str:
    """Pretty label for a canonical theme_id."""
    return {
        "royal_mughal":        "Royal Mughal",
        "south_indian_temple": "South Indian Temple",
        "modern_minimal":      "Modern Minimal",
        "beach_destination":   "Beach Destination",
        "punjabi_sangeet":     "Punjabi Sangeet",
        "bengali_traditional": "Bengali Traditional",
        "christian_elegant":   "Christian Elegant",
        "muslim_nikah":        "Muslim Nikah",
        "nature_eco_wedding":  "Nature / Eco Wedding",
        "kerala_backwaters":   "Kerala Backwaters",
    }.get(theme_id, theme_id)


def _build_catalog() -> Dict[str, List[Dict[str, str]]]:
    """Return {theme_id: [{design_id, event, title}, ...]} for every theme."""
    out: Dict[str, List[Dict[str, str]]] = {}
    for prefix, theme_id in THEME_PREFIX_TO_ID.items():
        items: List[Dict[str, str]] = []
        for event in EVENTS:
            for n in range(1, VARIANTS_PER_EVENT + 1):
                items.append({
                    "design_id": f"{prefix}_{event}_{n}",
                    "event": event,
                    "label": _human_label(prefix, event, n),
                    "event_label": EVENT_LABEL[event],
                    "variant": n,
                })
        out[theme_id] = items
    return out


# Master catalog. Read-only at import.
DESIGN_CATALOG: Dict[str, List[Dict[str, str]]] = _build_catalog()


# Flat lookup: design_id → theme_id
DESIGN_ID_TO_THEME: Dict[str, str] = {
    d["design_id"]: theme_id
    for theme_id, items in DESIGN_CATALOG.items()
    for d in items
}


def get_design_ids_for_theme(theme_id: str) -> List[str]:
    """All design_ids belonging to the given canonical theme_id."""
    return [d["design_id"] for d in DESIGN_CATALOG.get(theme_id, [])]


def all_design_ids() -> List[str]:
    return list(DESIGN_ID_TO_THEME.keys())


def get_theme_for_design(design_id: str) -> str | None:
    return DESIGN_ID_TO_THEME.get(design_id)


def theme_label(theme_id: str) -> str:
    return _theme_label(theme_id)
