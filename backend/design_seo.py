"""design_seo.py — what a search engine sees for the design catalogue.

WHY THIS EXISTS. The catalogue is 188 designs across ten collections, and the
sitemap now advertises every one of them plus /browse and the 70 collection ×
ceremony pages. All of those are client-rendered React routes, so without this
a crawler following the sitemap gets the SPA shell: one generic <title>, no
description, no image, no content. Advertising 259 URLs that render as an empty
JS shell is worse than not advertising them, because it teaches the crawler the
site is thin.

Caddy routes crawler user-agents for these paths to the API (see the @crawler
matcher in deploy/Caddyfile); humans fall through to the SPA and never see any
of this.

THE SOURCE OF TRUTH is frontend-v2/public/designs/catalogue.json — the same
file the SPA fetches. Reading anything else would let the two drift, and a
crawler being shown a design the app cannot render is the exact failure this is
meant to prevent. If the file is unreachable the renderer degrades to a
truthful generic page rather than inventing detail.
"""
from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("design_seo")

SITE = "https://majainvites.com"

# Mirrors frontend-v2/src/lib/designCode.js. These abbreviations are the wire
# format of codes already handed to customers — regenerating them differently
# would break every code in circulation.
THEME_ABBR = {
    "south_indian_temple": "TMPL", "royal_mughal": "MUGH",
    "bengali_traditional": "BENG", "punjabi_sangeet": "PUNJ",
    "kerala_backwaters": "KERL", "christian_elegant": "CHRS",
    "muslim_nikah": "MSLM", "beach_destination": "BEAC",
    "nature_eco_wedding": "NATR", "modern_minimal": "MNML",
}
EVENT_ABBR = {"Engagement": "ENG", "Haldi": "HAL", "Mehandi": "MEH",
              "Marriage": "MRG", "Reception": "REC", "Sangeeth": "SNG"}

THEME_LABEL = {
    "south_indian_temple": "South Indian Temple", "royal_mughal": "Royal Mughal",
    "bengali_traditional": "Bengali Traditional", "punjabi_sangeet": "Punjabi Sangeet",
    "kerala_backwaters": "Kerala Backwaters", "christian_elegant": "Christian Elegant",
    "muslim_nikah": "Muslim Nikah", "beach_destination": "Beach Destination",
    "nature_eco_wedding": "Nature / Eco", "modern_minimal": "Modern Minimal",
}
CEREMONY_LABEL = {"Engagement": "Engagement", "Haldi": "Haldi", "Mehandi": "Mehandi",
                  "Marriage": "Marriage", "Reception": "Reception", "Sangeeth": "Sangeet"}
# Ceremony folder -> the route slug frontend-v2 links to (BrowseDesigns).
CEREMONY_SLUG = {"Engagement": "engagement", "Haldi": "haldi", "Mehandi": "mehendi",
                 "Marriage": "wedding", "Reception": "reception", "Sangeeth": "sangeet"}
SLUG_CEREMONY = {v: k for k, v in CEREMONY_SLUG.items()}
# Aliases the SPA also accepts, so a shared link in either spelling resolves.
SLUG_CEREMONY.update({"marriage": "Marriage", "mehandi": "Mehandi", "sangeeth": "Sangeeth"})

_CACHE: Optional[List[Dict[str, Any]]] = None
_LOCK = threading.Lock()


def _catalogue_path() -> Optional[Path]:
    here = Path(__file__).resolve().parent
    for c in (here.parent / "frontend-v2" / "public" / "designs" / "catalogue.json",
              Path("/app/frontend-v2/public/designs/catalogue.json"),
              Path("/srv/designs/catalogue.json")):
        if c.is_file():
            return c
    return None


def load_designs() -> List[Dict[str, Any]]:
    """The catalogue, parsed once. [] when the file is not deployed here."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    with _LOCK:
        if _CACHE is not None:
            return _CACHE
        rows: List[Dict[str, Any]] = []
        p = _catalogue_path()
        if p:
            try:
                rows = json.loads(p.read_text(encoding="utf-8")).get("designs", []) or []
            except Exception:
                logger.warning("design_seo: could not read %s", p, exc_info=True)
        else:
            logger.warning("design_seo: catalogue.json not found; design pages "
                           "will render generic metadata")
        _CACHE = rows
        return _CACHE


def design_code(d: Dict[str, Any]) -> Optional[str]:
    t, e = THEME_ABBR.get(d.get("theme")), EVENT_ABBR.get(d.get("ceremony"))
    if not t or not e or not isinstance(d.get("index"), int):
        return None
    return f"{t}-{e}-{d['index'] + 1:02d}"


def design_name(d: Dict[str, Any]) -> str:
    """Same rule as lib/designCatalogue.designName — the crawler and the page
    must show the same name, or the snippet will not match what a visitor sees."""
    if d.get("slug"):
        return d["slug"]
    return (f"{THEME_LABEL.get(d.get('theme'), d.get('theme'))} "
            f"{CEREMONY_LABEL.get(d.get('ceremony'), d.get('ceremony'))} "
            f"{d.get('index', 0) + 1:02d}")


def find_by_code(code: str) -> Optional[Dict[str, Any]]:
    want = str(code or "").strip().upper()
    for d in load_designs():
        if design_code(d) == want:
            return d
    return None


def _abs(path: str) -> str:
    if not path:
        return ""
    return path if path.startswith("http") else f"{SITE}{path}"


def design_meta(code: str) -> Dict[str, Any]:
    """Crawler-facing metadata for one design page."""
    d = find_by_code(code)
    canonical = f"{SITE}/preview/design/{str(code or '').strip().upper()}"
    if not d:
        # Do NOT invent a design. A code that resolves to nothing is a page with
        # no content, and telling Google to index it would be a lie.
        return {"found": False, "noindex": True, "canonical": canonical,
                "title": "Design not found · MAJA Invites",
                "description": "That design code does not match any design in the catalogue.",
                "og_image": "", "json_ld": None}

    name = design_name(d)
    theme = THEME_LABEL.get(d.get("theme"), d.get("theme"))
    ceremony = CEREMONY_LABEL.get(d.get("ceremony"), d.get("ceremony"))
    img = _abs(d.get("src960") or d.get("src480") or "")
    desc = (f"{name} — a {theme.lower()} {ceremony.lower()} invitation design. "
            f"Quote code {design_code(d)} and the MAJA team builds the finished "
            f"invitation for you as a link you can share.")

    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CreativeWork",
                "@id": f"{canonical}#design",
                "name": name,
                "url": canonical,
                "description": desc,
                "identifier": design_code(d),
                "genre": f"{theme} wedding invitation",
                "about": f"{ceremony} invitation",
                **({"image": img} if img else {}),
                **({"width": d["w"], "height": d["h"]} if d.get("w") and d.get("h") else {}),
                "isPartOf": {"@type": "Collection", "name": f"{theme} collection",
                             "url": f"{SITE}/themes/{d.get('theme')}"},
                "provider": {"@type": "Organization", "name": "MAJA Invites", "url": SITE},
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
                    {"@type": "ListItem", "position": 2, "name": "Designs", "item": f"{SITE}/browse"},
                    {"@type": "ListItem", "position": 3, "name": theme,
                     "item": f"{SITE}/themes/{d.get('theme')}"},
                    {"@type": "ListItem", "position": 4, "name": name, "item": canonical},
                ],
            },
        ],
    }
    return {
        "found": True, "noindex": False, "canonical": canonical,
        "title": f"{name} — {theme} {ceremony.lower()} invitation | MAJA Invites",
        "description": desc, "og_image": img, "json_ld": json_ld,
        "spa_path": f"/preview/design/{design_code(d)}",
    }


def collection_meta(theme_id: str, ceremony_slug: Optional[str] = None) -> Dict[str, Any]:
    """Crawler-facing metadata for /themes/:id and /themes/:id/events/:ceremony."""
    designs = [d for d in load_designs() if d.get("theme") == theme_id]
    theme = THEME_LABEL.get(theme_id, theme_id)
    ceremony_dir = SLUG_CEREMONY.get(str(ceremony_slug or "").lower()) if ceremony_slug else None
    if ceremony_dir:
        designs = [d for d in designs if d.get("ceremony") == ceremony_dir]
        canonical = f"{SITE}/themes/{theme_id}/events/{CEREMONY_SLUG.get(ceremony_dir, ceremony_slug)}"
        ceremony = CEREMONY_LABEL.get(ceremony_dir, ceremony_dir)
        title = f"{theme} {ceremony.lower()} invitation designs | MAJA Invites"
        desc = (f"{len(designs)} {theme.lower()} designs for the {ceremony.lower()} "
                f"card. See every one before you order — the MAJA team builds the "
                f"finished invitation for you.")
    else:
        canonical = f"{SITE}/themes/{theme_id}"
        ceremonies = sorted({d.get("ceremony") for d in designs})
        title = f"{theme} wedding invitation designs | MAJA Invites"
        desc = (f"{len(designs)} {theme.lower()} invitation designs across "
                f"{len(ceremonies)} ceremonies. Browse every design before you order.")

    if not designs:
        # An empty collection page is a thin page. Say noindex rather than ask
        # Google to rank nothing.
        return {"found": False, "noindex": True, "canonical": canonical,
                "title": title, "description": desc, "og_image": "", "json_ld": None,
                "spa_path": canonical[len(SITE):]}

    items = []
    for i, d in enumerate(designs[:50], start=1):
        code = design_code(d)
        items.append({
            "@type": "ListItem", "position": i, "name": design_name(d),
            "url": f"{SITE}/preview/design/{code}",
            **({"image": _abs(d.get("src480") or "")} if d.get("src480") else {}),
        })

    json_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "CollectionPage", "@id": f"{canonical}#collection",
             "url": canonical, "name": title, "description": desc,
             "isPartOf": {"@type": "WebSite", "name": "MAJA Invites", "url": SITE},
             "mainEntity": {"@type": "ItemList", "@id": f"{canonical}#itemlist",
                            "numberOfItems": len(designs), "itemListElement": items}},
            {"@type": "BreadcrumbList", "@id": f"{canonical}#breadcrumb",
             "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
                 {"@type": "ListItem", "position": 2, "name": "Designs", "item": f"{SITE}/browse"},
                 {"@type": "ListItem", "position": 3, "name": theme,
                  "item": f"{SITE}/themes/{theme_id}"},
             ]},
        ],
    }
    return {"found": True, "noindex": False, "canonical": canonical,
            "title": title, "description": desc,
            "og_image": _abs(designs[0].get("src960") or designs[0].get("src480") or ""),
            "json_ld": json_ld, "spa_path": canonical[len(SITE):]}


def browse_meta() -> Dict[str, Any]:
    """Crawler-facing metadata for /browse, the catalogue index."""
    designs = load_designs()
    themes = sorted({d.get("theme") for d in designs})
    canonical = f"{SITE}/browse"
    title = "Browse wedding invitation designs | MAJA Invites"
    desc = (f"{len(designs)} invitation designs across {len(themes)} collections "
            f"and six ceremonies — South Indian temple, Royal Mughal, Beach, "
            f"Kerala, Punjabi and more. See every design before you order.")
    if not designs:
        return {"found": False, "noindex": True, "canonical": canonical,
                "title": title, "description": desc, "og_image": "", "json_ld": None,
                "spa_path": "/browse"}
    items = [{"@type": "ListItem", "position": i, "name": THEME_LABEL.get(t, t),
              "url": f"{SITE}/themes/{t}"} for i, t in enumerate(themes, start=1)]
    return {
        "found": True, "noindex": False, "canonical": canonical,
        "title": title, "description": desc,
        "og_image": _abs(designs[0].get("src960") or designs[0].get("src480") or ""),
        "spa_path": "/browse",
        "json_ld": {"@context": "https://schema.org", "@type": "CollectionPage",
                    "@id": f"{canonical}#collection", "url": canonical,
                    "name": title, "description": desc,
                    "mainEntity": {"@type": "ItemList", "numberOfItems": len(themes),
                                   "itemListElement": items}},
    }
