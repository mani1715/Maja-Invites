"""
event_templates.py — MAJA Dynamic Event Engine: the template catalog (design assets).
=====================================================================================

Purpose
    The single, reusable source of truth for an event type's selectable invitation
    TEMPLATES — the approved artwork. Mirrors how the wedding side ships designs:
    committed optimized WebP pairs under /assets/designs/<folder>/ + a config catalog.
    NOT Ganesh-specific — a future event type (Gruhapravesam, Birthday, …) adds a list
    here and reuses the same picker/preview/publish flow (per the design-assets brief:
    "build a reusable template management system; do not hardcode Ganesh logic").

Each template references the FINAL approved artwork as-is (never rebuilt in HTML/CSS):
    thumbnail_url  → grid card (400w webp)
    preview_url    → full premium preview (900w webp); the picker uses a blurred copy
                     of this same art as the surrounding background (hero stays centered)
Originals (941×1672 PNG) are archived outside the repo; optimized copies are served.

Dependencies  none (leaf). Read by event_registry (template options + default) and the
            public template endpoint.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

_ASSET_BASE = "/assets/designs"
GANESH_ASPECT = "941:1672"

# The Ganesh template family shares ONE parchment/text zone (all 10 artworks were
# composed with the same empty centre). The renderer reads THIS config — it is not
# hardcoded in the renderer, so a future template only edits config. Percentages are
# of the card (the artwork), so text scales proportionally at every device.
GANESH_LAYOUT: Dict[str, Any] = {
    "text_zone": {
        "top": "33%", "left": "50%", "width": "76%", "height": "46%",
        "align": "center", "valign": "top", "padding": "1.5%",
    },
    "font_scale": 1.0,          # global multiplier the renderer applies to every line
    "line_spacing": 1.16,
    "max_lines": {"title": 2, "message": 4},
    "overflow": "shrink",       # shrink-to-fit; never clip or distort
    # the parchment centre is light cream on every design → dark ink reads on all 10
    "palette": {"text": "#3A2A18", "accent": "#9A7B3F", "muted": "#6B5844"},
}


def _tpl(event_type: str, folder: str, tid: str, name: str, palette: str,
         layout: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "template_id": tid, "event_type": event_type, "name": name, "palette": palette,
        "thumbnail_url": f"{_ASSET_BASE}/{folder}/{tid}_thumb.webp",
        "preview_url": f"{_ASSET_BASE}/{folder}/{tid}_preview.webp",
        "aspect_ratio": GANESH_ASPECT, "orientation": "portrait",
        "layout": layout,       # the configurable text-rendering layout (per template)
    }


# GANESH CHATURTHI — the 10 final approved artworks (see design-assets brief).
# All share GANESH_LAYOUT (same composition); a future template can pass its own.
def _g(tid, name, palette):
    return _tpl("ganesh_chaturthi", "ganesh", tid, name, palette, GANESH_LAYOUT)


GANESH_TEMPLATES: List[Dict[str, Any]] = [
    _g("royal_autumn", "Royal Autumn", "Warm red & gold · vineyard sunset"),
    _g("azure_lagoon", "Azure Lagoon", "Aqua & pearl · seaside"),
    _g("blush_blossom", "Blush Blossom", "Soft pink · dream palace"),
    _g("emerald_darbar", "Emerald Darbar", "Emerald & gold · Mughal courtyard"),
    _g("celestial_night", "Celestial Night", "Starry indigo · celestial"),
    _g("enchanted_grove", "Enchanted Grove", "Forest green · waterfall"),
    _g("peacock_darbar", "Peacock Darbar", "Teal & gold · peacocks"),
    _g("lavender_bloom", "Lavender Bloom", "Mauve · wisteria"),
    _g("golden_serenity", "Golden Serenity", "Ivory & soft gold"),
    _g("rose_temple", "Rose Temple", "Rose pink · twilight temple"),
]

# event_type -> its ordered template list. Add a new type's designs here.
EVENT_TEMPLATES: Dict[str, List[Dict[str, Any]]] = {
    "ganesh_chaturthi": GANESH_TEMPLATES,
}


def templates_for(event_type: str) -> List[Dict[str, Any]]:
    return list(EVENT_TEMPLATES.get(event_type, []))


def get_template(event_type: str, template_id: str) -> Optional[Dict[str, Any]]:
    for t in EVENT_TEMPLATES.get(event_type, []):
        if t["template_id"] == template_id:
            return t
    return None


def default_template(event_type: str) -> Optional[str]:
    tpls = EVENT_TEMPLATES.get(event_type, [])
    return tpls[0]["template_id"] if tpls else None


def template_options(event_type: str) -> List[Dict[str, str]]:
    """{value,label} pairs for the Builder's theme `template` select."""
    return [{"value": t["template_id"], "label": t["name"]} for t in EVENT_TEMPLATES.get(event_type, [])]


def template_ids(event_type: str) -> List[str]:
    return [t["template_id"] for t in EVENT_TEMPLATES.get(event_type, [])]
