"""
portfolio_seo.py — what Google should see for a premium studio's portfolio.

The owner's goal: when someone searches "Mani Studio Guntur", the studio's MAJA
portfolio should turn up and read like a real business website. Fields alone don't
rank a page — that also needs the page to be crawlable and actually indexed — but
the two things code CAN provide are here:

  * a resolved SEO title / description / keywords (auto-derived from the studio
    name + city + services when the studio hasn't written its own), and
  * a schema.org `LocalBusiness` JSON-LD block — the structured data Google reads
    to show a business name, address, rating and map for a local search.

Gated on PREMIUM: this is the paid reason to buy premium ("to get the website in
Google … they must take the premium subscription"). A non-premium studio gets no
SEO block, so the search-visibility payload is a premium-only perk.

Pure functions over the already-loaded profile — no DB, no network — so the public
portfolio endpoint can call it inline.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

SITE = "https://majainvites.com"
MAX_DESC = 320


def _clean(s: Any) -> str:
    return " ".join(str(s or "").split()).strip()


def _addr(profile: Dict[str, Any]) -> Dict[str, Any]:
    a = profile.get("address") or {}
    loc = profile.get("location") or {}
    return {
        "street": _clean(a.get("full_address")),
        "landmark": _clean(a.get("landmark")),
        "city": _clean(a.get("city") or loc.get("city")),
        "district": _clean(a.get("district")),
        "state": _clean(a.get("state") or loc.get("state")),
        "pincode": _clean(a.get("pincode")),
        "maps_url": _clean(a.get("maps_url") or loc.get("maps_url")),
        "lat": a.get("lat") if a.get("lat") is not None else loc.get("lat"),
        "lng": a.get("lng") if a.get("lng") is not None else loc.get("lng"),
    }


def directions_url(profile: Dict[str, Any]) -> Optional[str]:
    """A Google Maps link that opens turn-by-turn directions to the studio.

    Prefers an explicit maps_url the studio pasted; else builds a directions query
    from lat/lng; else from the text address. None when there is nothing to point at.
    """
    a = _addr(profile)
    if a["maps_url"]:
        return a["maps_url"]
    if a["lat"] is not None and a["lng"] is not None:
        return f"https://www.google.com/maps/dir/?api=1&destination={a['lat']},{a['lng']}"
    parts = [a["street"], a["landmark"], a["city"], a["district"], a["state"], a["pincode"]]
    q = ", ".join(p for p in parts if p)
    name = _clean(profile.get("studio_name"))
    if name and a["city"]:
        q = f"{name}, {q}" if q else f"{name}, {a['city']}"
    if not q:
        return None
    from urllib.parse import quote_plus
    return f"https://www.google.com/maps/dir/?api=1&destination={quote_plus(q)}"


def _abs_url(u: Any) -> str:
    """Absolute URL for schema/image fields — Google prefers absolute; relative
    /uploads paths are served under the site origin."""
    u = _clean(u)
    if not u:
        return ""
    if u.startswith(("http://", "https://", "data:")):
        return u
    return f"{SITE}{u}" if u.startswith("/") else f"{SITE}/{u}"


def _first_gallery_image(gallery_images: Optional[List[str]]) -> str:
    """First usable image from the studio's works, absolute. A `data:` URI is
    skipped: crawlers fetch og:image by URL and an inline blob is not one."""
    for candidate in (gallery_images or []):
        url = _abs_url(candidate)
        if url and not url.startswith("data:"):
            return url
    return ""


_DAY_NAMES = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
    "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
}


def _opening_hours_spec(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """schema.org openingHoursSpecification from the STRUCTURED `opening_hours`
    field only. Each entry: {day, opens, closes} (day = Mon/Monday/…, times "HH:MM").
    The free-text `business_hours` is left for display — never guessed into schema."""
    out: List[Dict[str, Any]] = []
    for h in (profile.get("opening_hours") or []):
        if not isinstance(h, dict):
            continue
        day = _DAY_NAMES.get(_clean(h.get("day")).lower()[:3])
        opens = _clean(h.get("opens") or h.get("open"))
        closes = _clean(h.get("closes") or h.get("close"))
        if day and opens and closes:
            out.append({"@type": "OpeningHoursSpecification",
                        "dayOfWeek": day, "opens": opens, "closes": closes})
    return out


def _price_range(profile: Dict[str, Any]) -> str:
    """A schema.org priceRange derived from REAL pricing data; falls back to the
    generic "₹₹" when the studio hasn't published a price."""
    def _int(v):
        try:
            return int(float(v))
        except Exception:
            return 0
    sp = _int(profile.get("starting_price"))
    if sp > 0:
        return f"₹{sp:,}+"
    prices = [p for p in (_int((pk or {}).get("price") or (pk or {}).get("amount"))
                          for pk in (profile.get("pricing_packages") or [])) if p > 0]
    if prices:
        lo, hi = min(prices), max(prices)
        return f"₹{lo:,}" if lo == hi else f"₹{lo:,}–₹{hi:,}"
    return "₹₹"


def _founding_date(profile: Dict[str, Any]) -> str:
    """foundingDate (year) from founded_year / working_since, if a sane year."""
    for key in ("founded_year", "working_since"):
        try:
            y = int(profile.get(key))
            if 1900 <= y <= 2100:
                return str(y)
        except Exception:
            continue
    return ""


def _business_node(profile: Dict[str, Any], canonical: str, name: str, desc: str,
                   a: Dict[str, Any], rating: Optional[float], review_count: int):
    """The primary entity: a Person for an individual photographer, else a
    ProfessionalService (a schema.org LocalBusiness + Organization) for a studio.
    Returns (node, node_id). node_id lets Reviews point back with itemReviewed."""
    is_individual = _clean(profile.get("portfolio_type")).lower() == "individual"
    node_id = f"{canonical}#{'person' if is_individual else 'business'}"
    image = _abs_url(profile.get("avatar") or profile.get("hero_image"))

    if is_individual:
        node: Dict[str, Any] = {
            "@type": "Person", "@id": node_id,
            "name": _clean(profile.get("owner_name")) or name,
            "url": canonical,
            "jobTitle": _clean(profile.get("professional_title")) or "Photographer",
            "description": desc,
        }
        studio = _clean(profile.get("studio_name"))
        if studio and studio != node["name"]:
            node["worksFor"] = {"@type": "Organization", "name": studio}
        skills = [s for s in (profile.get("skills") or []) if _clean(s)]
        if skills:
            node["knowsAbout"] = skills[:10]
    else:
        node = {
            "@type": "ProfessionalService", "@id": node_id,
            "name": name, "url": canonical, "description": desc,
        }
        # Organization/LocalBusiness-only properties, from existing fields.
        node["priceRange"] = _price_range(profile)
        founded = _founding_date(profile)
        if founded:
            node["foundingDate"] = founded
        try:
            team = int(profile.get("team_size"))
            if team > 0:
                node["numberOfEmployees"] = team
        except Exception:
            pass
        hours = _opening_hours_spec(profile)
        if hours:
            node["openingHoursSpecification"] = hours
        slogan = _clean(profile.get("tagline"))
        if slogan:
            node["slogan"] = slogan

    if image:
        node["image"] = image
    # ---- shared enrichment from existing fields (valid on Person + Organization)
    contact0 = profile.get("contact") or {}
    email = _clean(contact0.get("email"))
    if email:
        node["email"] = email
    langs = [_clean(l) for l in (profile.get("languages") or []) if _clean(l)]
    if langs:
        node["knowsLanguage"] = langs[:12]
    awards = [_clean(x) for x in (profile.get("awards") or []) if _clean(x)]
    if awards:
        node["award"] = awards[:10]
    postal: Dict[str, Any] = {"@type": "PostalAddress"}
    if a["street"]:
        postal["streetAddress"] = a["street"]
    if a["city"]:
        postal["addressLocality"] = a["city"]
    if a["state"]:
        postal["addressRegion"] = a["state"]
    if a["pincode"]:
        postal["postalCode"] = a["pincode"]
    postal["addressCountry"] = "IN"
    if len(postal) > 2:
        node["address"] = postal
    if a["lat"] is not None and a["lng"] is not None:
        node["geo"] = {"@type": "GeoCoordinates", "latitude": a["lat"], "longitude": a["lng"]}
    contact = profile.get("contact") or {}
    if _clean(contact.get("phone")):
        node["telephone"] = _clean(contact.get("phone"))
    sameas = [v for v in (profile.get("social") or {}).values() if _clean(v)]
    if sameas:
        node["sameAs"] = sameas
    areas = [_clean(c) for c in (profile.get("coverage_areas") or []) if _clean(c)]
    if areas:
        node["areaServed"] = areas
    # Only ever advertise a REAL rating — never fabricate one (owner rule).
    if rating and review_count > 0:
        node["aggregateRating"] = {
            "@type": "AggregateRating", "ratingValue": round(float(rating), 1),
            "reviewCount": int(review_count), "bestRating": 5, "worstRating": 1,
        }
    return node, node_id


def _breadcrumb_node(canonical: str, name: str) -> Dict[str, Any]:
    """Home → Photographers → this studio — the trail Google shows under a result."""
    return {
        "@type": "BreadcrumbList",
        "@id": f"{canonical}#breadcrumb",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
            {"@type": "ListItem", "position": 2, "name": "Photographers", "item": f"{SITE}/photographers"},
            {"@type": "ListItem", "position": 3, "name": name, "item": canonical},
        ],
    }


def _faq_node(profile: Dict[str, Any], canonical: str) -> Optional[Dict[str, Any]]:
    """FAQPage from the studio's own Q&A — eligible for the FAQ rich result."""
    qs = []
    for f in (profile.get("faqs") or []):
        q, ans = _clean(f.get("q")), _clean(f.get("a"))
        if q and ans:
            qs.append({"@type": "Question", "name": q,
                       "acceptedAnswer": {"@type": "Answer", "text": ans}})
    if not qs:
        return None
    return {"@type": "FAQPage", "@id": f"{canonical}#faq", "mainEntity": qs[:20]}


def _gallery_node(profile: Dict[str, Any], canonical: str, name: str,
                  gallery_images: Optional[List[str]]) -> Optional[Dict[str, Any]]:
    """ImageGallery of the studio's real work — eligible for image results.
    Draws from passed work images + the profile's own studio_photos/past_works."""
    urls: List[str] = []
    for u in (gallery_images or []):
        au = _abs_url(u)
        if au:
            urls.append(au)
    for coll_key in ("studio_photos", "past_works"):
        for item in (profile.get(coll_key) or []):
            au = _abs_url((item or {}).get("image"))
            if au:
                urls.append(au)
    urls = list(dict.fromkeys(urls))[:30]   # dedupe, cap
    if not urls:
        return None
    return {
        "@type": "ImageGallery", "@id": f"{canonical}#gallery",
        "name": f"{name} — Portfolio", "url": canonical,
        "image": urls,
    }


def _review_nodes(reviews: Optional[List[Dict[str, Any]]], business_id: str) -> List[Dict[str, Any]]:
    """schema.org Review objects from REAL testimonials (never placeholders).
    Each points back at the business via itemReviewed for a linked graph."""
    out: List[Dict[str, Any]] = []
    for r in (reviews or []):
        if r.get("is_placeholder"):
            continue
        body = _clean(r.get("text") or r.get("message"))
        author = _clean(r.get("author") or r.get("name"))
        if not (body and author):
            continue
        node: Dict[str, Any] = {
            "@type": "Review",
            "author": {"@type": "Person", "name": author},
            "reviewBody": body[:600],
            "itemReviewed": {"@id": business_id},
        }
        try:
            rv = int(r.get("rating") or 0)
        except Exception:
            rv = 0
        if rv:
            node["reviewRating"] = {"@type": "Rating", "ratingValue": rv,
                                    "bestRating": 5, "worstRating": 1}
        created = _clean(r.get("created_at"))
        if created:
            node["datePublished"] = created[:10]
        out.append(node)
        if len(out) >= 12:
            break
    return out


def resolve_seo(profile: Dict[str, Any], slug: str, rating: Optional[float] = None,
                review_count: int = 0, reviews: Optional[List[Dict[str, Any]]] = None,
                gallery_images: Optional[List[str]] = None) -> Dict[str, Any]:
    """Build the SEO title/description/keywords + a linked JSON-LD @graph.

    Uses what the studio wrote; falls back to sensible auto-derived values so a
    studio that never touched the SEO fields still gets a decent Google snippet.
    Caller decides whether to include the JSON-LD (premium only).

    The JSON-LD is a schema.org @graph so several entity types link together:
      • Person (individual) or ProfessionalService/LocalBusiness (studio) — primary
      • BreadcrumbList — the Home → Photographers → studio trail
      • FAQPage       — when the studio wrote FAQs (FAQ rich result)
      • ImageGallery  — the studio's real work photos (image results)
      • Review[]      — real testimonials, linked back via itemReviewed
    `reviews` + `gallery_images` are optional; when omitted those nodes are built
    from the profile alone, so old callers keep working unchanged.
    """
    name = _clean(profile.get("studio_name")) or "Photography Studio"
    a = _addr(profile)
    city = a["city"]
    services = [s for s in (profile.get("services") or []) if _clean(s)][:6]
    top_service = services[0] if services else "Wedding Photography"

    title = _clean(profile.get("seo_title"))
    if not title:
        title = f"{name} | {top_service}" + (f" in {city}" if city else "")

    desc = _clean(profile.get("seo_description"))
    if not desc:
        svc_phrase = ", ".join(s.lower() for s in services[:4]) or "wedding photography"
        desc = (f"{name} — professional {svc_phrase}"
                + (f" in {city}" if city else "") + ". "
                + _clean(profile.get("tagline")))
    desc = desc[:MAX_DESC].strip()

    keywords: List[str] = [k for k in (profile.get("seo_keywords") or []) if _clean(k)]
    if not keywords:
        # Auto-derive "<service> <city>" phrases — how couples actually search.
        base = city or a["state"] or ""
        for s in services[:5]:
            keywords.append(f"{_clean(s)} {base}".strip())
        if name:
            keywords.append(name)
    keywords = list(dict.fromkeys(keywords))[:15]   # dedupe, cap

    # `/photographer/{slug}` — NOT `/photographer/{slug}/portfolio`.
    #
    # The SPA dropped the /portfolio suffix; frontend-v2's route table serves
    # `/photographer/:slug` and REDIRECTS `/photographer/:slug/portfolio` to it
    # (App.jsx LegacyPortfolioRedirect). Emitting the redirecting URL as the
    # canonical is self-defeating: Google discards a canonical that does not
    # resolve to itself, so a studio could render perfect metadata and still
    # never be indexed. The legacy URL keeps working for links already shared —
    # it just is not what the page claims to be.
    canonical = f"{SITE}/photographer/{slug}"

    business, business_id = _business_node(profile, canonical, name, desc, a, rating, review_count)
    graph: List[Dict[str, Any]] = [business, _breadcrumb_node(canonical, business.get("name") or name)]
    faq = _faq_node(profile, canonical)
    if faq:
        graph.append(faq)
    gallery = _gallery_node(profile, canonical, name, gallery_images)
    if gallery:
        graph.append(gallery)
    graph.extend(_review_nodes(reviews, business_id))

    jsonld = {"@context": "https://schema.org", "@graph": graph}

    return {
        "title": title,
        "description": desc,
        "keywords": keywords,
        "canonical": canonical,
        # Fall back to the studio's own work.
        #
        # This was `business.get("image", "")` alone, which reads only `avatar`
        # or `hero_image`. A photographer uploads WORK, not an avatar — so the
        # common case was a studio with a full gallery whose share card, on
        # WhatsApp and in Google's rich results, had no image at all. The
        # gallery is already passed in for the ImageGallery JSON-LD node; using
        # its first entry costs nothing. design_seo.py has always done this.
        #
        # Still "" when a studio has genuinely uploaded nothing: the renderer
        # then omits og:image and downgrades the Twitter card to `summary`,
        # which is honest. There is no house placeholder to point at, and
        # inventing a path to an asset that does not exist would give every
        # imageless studio a broken image instead of no image.
        "og_image": business.get("image", "") or _first_gallery_image(gallery_images),
        "directions_url": directions_url(profile),
        "json_ld": jsonld,
    }
