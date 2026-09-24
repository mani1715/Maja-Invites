"""
discovery.py — SEO discovery pages for the photographer directory.

Turns pretty, crawlable URLs into a resolved {city / service / combined} filter
plus the page's SEO (title, description, canonical, Open Graph + Twitter) and the
CollectionPage + ItemList JSON-LD. PURE functions over already-loaded data — no DB,
no network — so the resolver is unit-testable and the directory endpoint calls it
inline.

URL structure (owner-approved, pretty resolver — never the /city//service/ prefixes):
    /photographers/wedding            → category (service)
    /photographers/guntur             → location (city)
    /photographers/guntur/wedding     → combined (city + service)

Single-segment resolution order (owner-approved):
    1. canonical SERVICE taxonomy (+ aliases)
    2. known CITIES (from live directory facets, + CITY_ALIASES)
    3. neither → None (the endpoint 404s)

Collisions between a city and a service are handled by canonical ALIASES, never by
changing the public URL shape.

Thin-page guard (owner-approved): a discovery page is INDEXABLE only when it lists
>= MIN_PHOTOGRAPHERS real photographers. Below that it still renders but carries
noindex and is left out of the sitemap — no doorway pages, no crawl waste.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

try:
    from portfolio_seo import SITE
except Exception:  # pragma: no cover - portfolio_seo always importable in-app
    SITE = "https://majainvites.com"

MIN_PHOTOGRAPHERS = 3   # owner-approved threshold for index + sitemap

# --------------------------------------------------------------------------- #
# Canonical service taxonomy.
#   slug    — the URL segment (/photographers/<slug>)
#   label   — human label used in titles ("Wedding Photographers")
#   match   — substring passed to the directory filter
#   field   — which directory filter it drives: "category" (services) or
#             "skill" (shooting styles, e.g. candid/cinematic)
#   aliases — alternate slugs that resolve to the same canonical page
# --------------------------------------------------------------------------- #
SERVICE_TAXONOMY: List[Dict[str, Any]] = [
    {"slug": "wedding", "label": "Wedding Photographers", "match": "wedding",
     "field": "category", "aliases": ["weddings", "wedding-photography"]},
    {"slug": "candid", "label": "Candid Photographers", "match": "candid",
     "field": "skill", "aliases": ["candid-photography"]},
    {"slug": "pre-wedding", "label": "Pre-Wedding Photographers", "match": "pre-wedding",
     "field": "category", "aliases": ["prewedding", "pre_wedding", "pre-wedding-shoot", "pre-wedding-shoots"]},
    {"slug": "engagement", "label": "Engagement Photographers", "match": "engagement",
     "field": "category", "aliases": []},
    {"slug": "videographer", "label": "Wedding Videographers", "match": "video",
     "field": "category", "aliases": ["videography", "cinematography", "cinematographer", "video"]},
    {"slug": "drone", "label": "Drone Photographers", "match": "drone",
     "field": "category", "aliases": ["aerial", "drone-coverage"]},
    {"slug": "destination", "label": "Destination Wedding Photographers", "match": "destination",
     "field": "category", "aliases": ["destination-wedding"]},
    {"slug": "maternity", "label": "Maternity Photographers", "match": "maternity",
     "field": "category", "aliases": []},
    {"slug": "baby", "label": "Baby & Newborn Photographers", "match": "baby",
     "field": "category", "aliases": ["newborn", "baby-shoot"]},
    {"slug": "cinematic", "label": "Cinematic Photographers", "match": "cinematic",
     "field": "skill", "aliases": []},
]

# city alias → canonical city (both lowercased). Extend as collisions/variants appear.
CITY_ALIASES: Dict[str, str] = {
    "bangalore": "bengaluru",
    "vizag": "visakhapatnam",
    "gunturu": "guntur",
}

_SERVICE_BY_KEY: Dict[str, Dict[str, Any]] = {}
for _s in SERVICE_TAXONOMY:
    _SERVICE_BY_KEY[_s["slug"]] = _s
    for _a in _s["aliases"]:
        _SERVICE_BY_KEY[_a] = _s


def _norm(seg: Any) -> str:
    """Lowercase, trim, collapse spaces/underscores to hyphens — the slug form."""
    s = re.sub(r"[\s_]+", "-", str(seg or "").strip().lower())
    return re.sub(r"-{2,}", "-", s).strip("-")


def match_service(segment: str) -> Optional[Dict[str, Any]]:
    """Canonical service entry for a URL segment (slug or alias), or None."""
    return _SERVICE_BY_KEY.get(_norm(segment))


def match_city(segment: str, known_cities: Set[str]) -> Optional[str]:
    """Canonical city for a URL segment if it is a real, currently-served city.
    `known_cities` is the live set of cities photographers actually serve
    (lowercased). Aliases are resolved first, then membership is required so we
    never mint a location page for a city no listed photographer covers."""
    seg = _norm(segment)
    canon = CITY_ALIASES.get(seg, seg)
    cities = {_norm(c) for c in (known_cities or set())}
    if canon in cities:
        return canon
    if seg in cities:
        return seg
    return None


def resolve_single(segment: str, known_cities: Set[str]) -> Optional[Dict[str, Any]]:
    """Resolve /photographers/<segment>. Service taxonomy first, then city."""
    svc = match_service(segment)
    if svc:
        return {"kind": "service", "service": svc}
    city = match_city(segment, known_cities)
    if city:
        return {"kind": "city", "city": city}
    return None


def resolve_combined(city_seg: str, service_seg: str,
                     known_cities: Set[str]) -> Optional[Dict[str, Any]]:
    """Resolve /photographers/<city>/<service>. First segment is the city,
    second is the service — both must resolve or it's a 404."""
    city = match_city(city_seg, known_cities)
    svc = match_service(service_seg)
    if city and svc:
        return {"kind": "combined", "city": city, "service": svc}
    return None


def _city_label(city: str) -> str:
    return " ".join(w.capitalize() for w in str(city or "").split())


def discovery_path(resolved: Dict[str, Any]) -> str:
    """The canonical URL path for a resolved discovery page."""
    kind = resolved.get("kind")
    if kind == "service":
        return f"/photographers/{resolved['service']['slug']}"
    if kind == "city":
        return f"/photographers/{_norm(resolved['city'])}"
    if kind == "combined":
        return f"/photographers/{_norm(resolved['city'])}/{resolved['service']['slug']}"
    return "/photographers"


def discovery_filters(resolved: Dict[str, Any]) -> Dict[str, str]:
    """The directory filter kwargs (city / category / skill) for a resolved page."""
    out: Dict[str, str] = {}
    kind = resolved.get("kind")
    if kind in ("city", "combined"):
        out["city"] = resolved["city"]
    if kind in ("service", "combined"):
        svc = resolved["service"]
        out[svc.get("field", "category")] = svc["match"]
    return out


def discovery_seo(resolved: Dict[str, Any], count: int) -> Dict[str, Any]:
    """Title / description / canonical + the index decision for a discovery page.
    Real data only — the caller passes the true photographer count."""
    kind = resolved.get("kind")
    svc_label = resolved.get("service", {}).get("label", "Photographers")
    city_label = _city_label(resolved.get("city", ""))

    if kind == "service":
        title = f"{svc_label} in India | MAJA Invites"
        heading = svc_label
        desc = (f"Browse {count} verified {svc_label.lower()} on MAJA — view portfolios, "
                f"styles, packages and real client reviews, and enquire directly.")
    elif kind == "city":
        title = f"Photographers in {city_label} | MAJA Invites"
        heading = f"Photographers in {city_label}"
        desc = (f"Find {count} wedding & event photographers in {city_label} on MAJA — "
                f"compare portfolios, availability, packages and client reviews.")
    elif kind == "combined":
        title = f"{svc_label} in {city_label} | MAJA Invites"
        heading = f"{svc_label} in {city_label}"
        desc = (f"{count} {svc_label.lower()} in {city_label} on MAJA — compare portfolios, "
                f"styles, packages and real reviews, and book the right studio for your day.")
    else:
        title = "Photographers | MAJA Invites"
        heading = "Photographers"
        desc = "Browse wedding & event photographers on MAJA."

    path = discovery_path(resolved)
    canonical = f"{SITE}{path}"
    return {
        "title": title,
        "heading": heading,
        "description": desc,
        "canonical": canonical,
        "path": path,
        # Owner-approved thin-page guard: index + sitemap only at >= threshold.
        "indexable": int(count) >= MIN_PHOTOGRAPHERS,
        "og_type": "website",
    }


def collection_jsonld(resolved: Dict[str, Any], photographers: List[Dict[str, Any]],
                      seo: Dict[str, Any]) -> Dict[str, Any]:
    """CollectionPage + ItemList schema for the listing — each item links to a
    real portfolio by slug. Only real photographers (never demo/sample rows)."""
    canonical = seo["canonical"]
    items = []
    pos = 0
    for p in photographers:
        if p.get("is_demo"):
            continue
        slug = p.get("slug") or p.get("id")
        if not slug:
            continue
        pos += 1
        items.append({
            "@type": "ListItem",
            "position": pos,
            "url": f"{SITE}/photographer/{slug}/portfolio",
            "name": p.get("name") or p.get("studio_name") or "Photographer",
        })
        if pos >= 50:
            break
    graph: List[Dict[str, Any]] = [{
        "@type": "CollectionPage",
        "@id": f"{canonical}#collection",
        "url": canonical,
        "name": seo["title"],
        "description": seo["description"],
    }]
    if items:
        graph.append({
            "@type": "ItemList",
            "@id": f"{canonical}#itemlist",
            "numberOfItems": len(items),
            "itemListElement": items,
        })
    return {"@context": "https://schema.org", "@graph": graph}
