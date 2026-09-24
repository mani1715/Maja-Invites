"""
portfolio_seo + professional-website fields self-test.

    cd backend && python -m tests.test_portfolio_seo

The owner's goal: a PREMIUM studio's portfolio should read like a real business
website and be understandable by Google. Fields alone don't rank a page, but the
two code-provided pieces are covered here:
  * resolve_seo — a title/description/keywords + schema.org JSON-LD, auto-derived
    from the studio name + city + services when the studio wrote nothing;
  * directions_url — a real "Get Directions" Google Maps link.
Plus: the SEO block is PREMIUM-ONLY (the paid reason to upgrade), and the new
professional-website fields (address, studio_photos, faqs, …) save without wiping
on a partial save.

No network.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ.setdefault("STORAGE_CRED_KEY", Fernet.generate_key().decode())

from tests.test_storage_orchestrator import FakeDB
import portfolio_seo as seo


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


def _node(json_ld, typ):
    """First node of the given @type in a JSON-LD @graph (or None)."""
    for n in (json_ld or {}).get("@graph", []) or []:
        t = n.get("@type")
        if t == typ or (isinstance(t, list) and typ in t):
            return n
    return None


PROFILE = {
    "studio_name": "Mani Studio",
    "tagline": "Timeless wedding memories",
    "services": ["Wedding Photography", "Candid Photography", "Pre-Wedding Shoots", "Cinematography"],
    "coverage_areas": ["Guntur", "Vijayawada", "Hyderabad"],
    "contact": {"phone": "+919876543210"},
    "social": {"instagram": "https://instagram.com/manistudio", "website": ""},
    "avatar": "https://cdn/mani-logo.jpg",
    "address": {"full_address": "5-12 Brodipet", "city": "Guntur", "district": "Guntur",
                "state": "Andhra Pradesh", "pincode": "522002", "lat": 16.30, "lng": 80.43},
}


def test_seo_autoderives():
    print("\n[1] SEO auto-derives a useful Google snippet when nothing is written")
    r = seo.resolve_seo(PROFILE, "mani-studio", rating=4.8, review_count=42)
    _check("Mani Studio" in r["title"] and "Guntur" in r["title"],
           "the title names the studio and the city (Mani Studio | … in Guntur)")
    _check("Mani Studio" in r["description"], "the description names the studio")
    _check(any("Guntur" in k for k in r["keywords"]),
           "keywords are '<service> <city>' phrases couples actually search")
    # The canonical must be a URL the SPA SERVES, not one it redirects.
    # frontend-v2 routes /photographer/:slug and sends /photographer/:slug/
    # portfolio to it (App.jsx LegacyPortfolioRedirect), so emitting the
    # /portfolio form here made every portfolio's canonical a redirect —
    # which Google discards, taking the page out of the index with it.
    _check(r["canonical"].endswith("/photographer/mani-studio"),
           "the canonical URL is the path the SPA serves, not the legacy redirect")
    _check(not r["canonical"].endswith("/portfolio"),
           "the canonical does not use the retired /portfolio suffix")


def test_seo_respects_written_values():
    print("\n[2] a studio's own SEO wording wins over the auto-derived default")
    p = {**PROFILE, "seo_title": "Best Wedding Photographer Guntur — Mani Studio",
         "seo_description": "Award-winning candid & cinematic wedding coverage.",
         "seo_keywords": ["wedding photographer guntur"]}
    r = seo.resolve_seo(p, "mani-studio")
    _check(r["title"] == "Best Wedding Photographer Guntur — Mani Studio", "the written title is used verbatim")
    _check(r["description"].startswith("Award-winning"), "the written description is used")
    _check(r["keywords"] == ["wedding photographer guntur"], "the written keywords are used")


def test_json_ld_is_valid_localbusiness():
    print("\n[3] the JSON-LD @graph carries a LocalBusiness Google can read")
    r = seo.resolve_seo(PROFILE, "mani-studio", rating=4.8, review_count=42)
    j = r["json_ld"]
    _check(j["@context"] == "https://schema.org", "schema.org context is set")
    _check(isinstance(j.get("@graph"), list) and j["@graph"], "JSON-LD is a linked @graph")
    biz = _node(j, "ProfessionalService")
    _check(biz is not None, "graph carries the ProfessionalService (LocalBusiness) node")
    _check(biz["name"] == "Mani Studio", "carries the business name")
    _check(biz["address"]["addressLocality"] == "Guntur" and biz["address"]["postalCode"] == "522002",
           "carries a structured postal address for local SEO")
    _check(biz["geo"]["latitude"] == 16.30, "carries geo coordinates for the map pin")
    _check(biz["telephone"] == "+919876543210", "carries the phone")
    _check(biz["aggregateRating"]["ratingValue"] == 4.8 and biz["aggregateRating"]["reviewCount"] == 42,
           "carries a REAL rating (never fabricated)")
    _check(_node(j, "BreadcrumbList") is not None, "graph always carries a BreadcrumbList trail")

    # No rating when there are no reviews — never invent one.
    r2 = seo.resolve_seo(PROFILE, "mani-studio", rating=None, review_count=0)
    _check("aggregateRating" not in _node(r2["json_ld"], "ProfessionalService"),
           "no rating is shown when there are no reviews")


def test_directions_url():
    print("\n[4] Get Directions produces a real Google Maps link")
    # Explicit maps_url wins.
    p1 = {"address": {"maps_url": "https://maps.app.goo.gl/abc"}}
    _check(seo.directions_url(p1) == "https://maps.app.goo.gl/abc", "a pasted maps link is used as-is")

    # lat/lng → a directions query.
    d2 = seo.directions_url(PROFILE)
    _check("google.com/maps/dir" in d2 and "16.3,80.43" in d2,
           "coordinates produce a turn-by-turn directions link")

    # text address → an encoded destination.
    p3 = {"studio_name": "Mani Studio", "address": {"city": "Guntur", "state": "AP"}}
    d3 = seo.directions_url(p3)
    _check("google.com/maps/dir" in d3 and "Guntur" in d3, "a text address produces a directions link")

    _check(seo.directions_url({}) is None, "no location → no directions link (not a broken one)")


async def test_public_payload_gates_seo_on_premium():
    print("\n[5] the SEO block is PREMIUM-ONLY (the paid reason to upgrade)")
    import portfolio_service as ps
    db = FakeDB()

    async def _make(admin_id, premium):
        await db.admins.insert_one({"id": admin_id, "name": "Mani", "role": "admin"})
        await db.portfolio_profiles.insert_one({
            "id": admin_id, "studio_id": admin_id, "studio_name": "Mani Studio",
            "slug": f"{admin_id}-slug", "is_published": True, **PROFILE})
        if premium:
            await db.subscriptions.insert_one({
                "id": f"sub_{admin_id}", "studio_id": admin_id, "product": "portfolio",
                "status": "active", "plan_id": "plan_portfolio_premium", "tier": "Premium"})
            await db.subscription_plans.insert_one({
                "id": "plan_portfolio_premium", "product": "portfolio",
                "portfolio_tier": "premium", "is_active": True})

    await _make("prem", True)
    await _make("free", False)

    router = ps.build_portfolio_router(db, require_admin=lambda: {"admin_id": "x"})
    pub = next(r.endpoint for r in router.routes
               if getattr(r, "path", None) == "/api/public/photographer/{studio_id}/portfolio")

    prem = await pub("prem")
    _check(prem["seo"] is not None and prem["seo"]["title"], "a premium studio gets an SEO block")
    _check(_node(prem["seo"]["json_ld"], "ProfessionalService") is not None,
           "the premium payload carries the business JSON-LD for Google")

    free = await pub("free")
    _check(free["seo"] is None, "a free/basic studio gets NO SEO block — premium-only")


async def test_new_fields_save_without_wiping():
    print("\n[6] the new website fields save and survive a partial save")
    import portfolio_service as ps
    db = FakeDB()
    router = ps.build_portfolio_router(db, require_admin=lambda: {"admin_id": "adm_w"})
    put = next(r.endpoint for r in router.routes
              if getattr(r, "path", None) == "/api/portfolio/profile"
              and "PUT" in getattr(r, "methods", set()))

    out = await put(ps.ProfileIn(
        owner_name="Mani Kumar", business_type="studio",
        business_hours="Mon–Sun · 9 AM – 9 PM", weekly_holidays=["Tuesday"],
        address={"city": "Guntur", "pincode": "522002"},
        studio_photos=[{"image": "https://x/studio1.jpg"}, {"caption": "no image — dropped"}],
        faqs=[{"q": "Do you travel outside the city?", "a": "Yes"}, {"a": "no question — dropped"}],
        seo_keywords=["wedding photographer guntur"],
    ), admin={"admin_id": "adm_w"})
    prof = out["profile"]
    _check(prof["owner_name"] == "Mani Kumar" and prof["business_type"] == "studio",
           "studio identity fields save")
    _check(len(prof["studio_photos"]) == 1, "a studio photo with no image is dropped")
    _check(len(prof["faqs"]) == 1, "a FAQ with no question is dropped")

    # A partial save of one field must not wipe the others.
    await put(ps.ProfileIn(tagline="We shoot weddings"), admin={"admin_id": "adm_w"})
    saved = await db.portfolio_profiles.find_one({"id": "adm_w"}, {"_id": 0})
    _check(saved.get("owner_name") == "Mani Kumar" and saved.get("business_hours"),
           "a partial save keeps the website fields intact (exclude_unset)")


async def test_bot_seo_resolver():
    print("\n[7] the bot/OG resolver: rich for premium, basic-card for everyone")
    import portfolio_service as ps
    db = FakeDB()

    async def _make(admin_id, premium):
        await db.admins.insert_one({"id": admin_id, "name": "Mani", "role": "admin"})
        await db.portfolio_profiles.insert_one({
            "id": admin_id, "studio_id": admin_id, "studio_name": "Mani Studio",
            "slug": f"{admin_id}-slug", "is_published": True, **PROFILE})
        if premium:
            await db.subscriptions.insert_one({
                "id": f"sub_{admin_id}", "studio_id": admin_id, "product": "portfolio",
                "status": "active", "plan_id": "plan_pf_prem", "tier": "Premium"})
            await db.subscription_plans.insert_one({
                "id": "plan_pf_prem", "product": "portfolio",
                "portfolio_tier": "premium", "is_active": True})

    await _make("prem", True)
    await _make("free", False)

    prem = await ps.resolve_public_portfolio_seo(db, "prem-slug")
    _check(prem["found"] and prem["premium"], "a premium studio resolves as premium")
    _check("Mani Studio" in prem["title"], "premium card has a real title")
    _check(prem["json_ld"] and _node(prem["json_ld"], "ProfessionalService") is not None,
           "premium card carries the JSON-LD Google reads")
    _check(prem["keywords"], "premium card carries search keywords")
    _check(prem["canonical"].endswith("/photographer/prem-slug"),
           "premium card canonical points at the URL the SPA serves")

    free = await ps.resolve_public_portfolio_seo(db, "free-slug")
    _check(free["found"] and not free["premium"], "a free studio resolves as non-premium")
    _check("Mani Studio" in free["title"] and free["description"],
           "a free studio STILL gets a usable share card (never blank)")
    _check(free["json_ld"] is None and free["keywords"] == [],
           "but the JSON-LD + keywords stay a PREMIUM-only perk")

    missing = await ps.resolve_public_portfolio_seo(db, "no-such-studio")
    _check(missing["found"] is False and missing["title"] and missing["json_ld"] is None,
           "an unknown slug returns a safe generic card, not an error")


def test_rich_schema_graph():
    print("\n[8] the @graph adds FAQ, ImageGallery, Reviews, Breadcrumb + Person")
    p = {**PROFILE,
         "faqs": [{"q": "Do you travel outside the city?", "a": "Yes, across India."},
                  {"a": "no question — dropped"}],
         "studio_photos": [{"image": "/uploads/studio1.jpg", "caption": "our space"}],
         "past_works": [{"image": "https://cdn/work1.jpg"}]}
    reviews = [
        {"author": "Ananya", "text": "Beautiful candid work!", "rating": 5,
         "created_at": "2026-06-01T00:00:00", "is_placeholder": False},
        {"author": "Demo Couple", "text": "placeholder", "rating": 5, "is_placeholder": True},
        {"author": "", "text": "no author so no schema", "rating": 4},
    ]
    r = seo.resolve_seo(p, "mani-studio", rating=4.9, review_count=1,
                        reviews=reviews, gallery_images=["/uploads/g1.jpg", "https://cdn/g2.jpg"])
    j = r["json_ld"]

    faq = _node(j, "FAQPage")
    _check(faq and len(faq["mainEntity"]) == 1, "FAQPage keeps only complete Q&A pairs")
    _check(faq["mainEntity"][0]["name"] == "Do you travel outside the city?"
           and faq["mainEntity"][0]["acceptedAnswer"]["text"] == "Yes, across India.",
           "the FAQ question + accepted answer are carried")

    gal = _node(j, "ImageGallery")
    _check(gal and any("g1.jpg" in u for u in gal["image"]) and any("studio1.jpg" in u for u in gal["image"]),
           "ImageGallery merges work images + studio photos")
    _check(all(u.startswith("http") for u in gal["image"]),
           "gallery image URLs are absolutised for Google")

    review_nodes = [n for n in j["@graph"] if n.get("@type") == "Review"]
    _check(len(review_nodes) == 1, "only the REAL review becomes a Review (placeholder + no-author dropped)")
    _check(review_nodes[0]["author"]["name"] == "Ananya"
           and review_nodes[0]["reviewRating"]["ratingValue"] == 5,
           "the Review carries its author and star rating")
    _check(review_nodes[0]["itemReviewed"]["@id"] == _node(j, "ProfessionalService")["@id"],
           "each Review links back to the business node (linked graph)")

    # Individual photographer → Person, not ProfessionalService.
    ind = {**PROFILE, "portfolio_type": "individual", "owner_name": "Mani Kumar",
           "professional_title": "Candid Wedding Photographer"}
    ji = seo.resolve_seo(ind, "mani-kumar")["json_ld"]
    person = _node(ji, "Person")
    _check(person and person["name"] == "Mani Kumar"
           and person["jobTitle"] == "Candid Wedding Photographer",
           "an individual portfolio is typed as a Person with a jobTitle")
    _check(_node(ji, "ProfessionalService") is None,
           "an individual is a Person, NOT a studio ProfessionalService")


def test_schema_enrichment():
    print("\n[9] schema enrichment from EXISTING fields (no new user fields)")
    p = {**PROFILE,
         "contact": {"phone": "+919876543210", "email": "hello@manistudio.in"},
         "languages": ["Telugu", "Hindi", "English"],
         "awards": ["Best Wedding Studio 2025"],
         "founded_year": 2015, "team_size": 8, "starting_price": 45000,
         "opening_hours": [
             {"day": "Mon", "opens": "09:00", "closes": "21:00"},
             {"day": "Sunday", "opens": "10:00", "closes": "18:00"},
             {"day": "bad-entry"},   # incomplete → dropped
         ]}
    biz = _node(seo.resolve_seo(p, "mani-studio")["json_ld"], "ProfessionalService")
    _check(biz["email"] == "hello@manistudio.in", "email → schema email")
    _check(biz["knowsLanguage"] == ["Telugu", "Hindi", "English"], "languages → knowsLanguage")
    _check(biz["award"] == ["Best Wedding Studio 2025"], "awards → award")
    _check(biz["foundingDate"] == "2015", "founded_year → foundingDate")
    _check(biz["numberOfEmployees"] == 8, "team_size → numberOfEmployees")
    _check(biz["priceRange"] == "₹45,000+", "starting_price → a real priceRange")
    hrs = biz["openingHoursSpecification"]
    _check(len(hrs) == 2 and hrs[0]["dayOfWeek"] == "Monday"
           and hrs[0]["opens"] == "09:00" and hrs[0]["closes"] == "21:00",
           "structured opening_hours → openingHoursSpecification (bad rows dropped)")
    _check(biz["slogan"] == PROFILE["tagline"], "tagline → slogan")

    p2 = {**PROFILE, "pricing_packages": [{"price": 30000}, {"price": 80000}]}
    biz2 = _node(seo.resolve_seo(p2, "x")["json_ld"], "ProfessionalService")
    _check(biz2["priceRange"] == "₹30,000–₹80,000", "priceRange range from pricing_packages")

    # Backward compatibility: a bare profile emits NONE of the new props.
    base = _node(seo.resolve_seo({"studio_name": "Solo"}, "solo")["json_ld"], "ProfessionalService")
    _check(all(k not in base for k in
               ("openingHoursSpecification", "foundingDate", "knowsLanguage", "email",
                "award", "numberOfEmployees")),
           "no data → none of the new props (never empty/invalid schema)")
    _check(base["priceRange"] == "₹₹", "priceRange falls back to generic with no price")

    # Individual → Person carries the shared props, NOT the Organization-only ones.
    ind = {**PROFILE, "portfolio_type": "individual", "owner_name": "Mani",
           "contact": {"email": "mani@x.in"}, "languages": ["Telugu"],
           "founded_year": 2015, "starting_price": 45000,
           "opening_hours": [{"day": "Mon", "opens": "09:00", "closes": "21:00"}]}
    person = _node(seo.resolve_seo(ind, "mani")["json_ld"], "Person")
    _check(person["email"] == "mani@x.in" and person["knowsLanguage"] == ["Telugu"],
           "a Person carries email + knowsLanguage")
    _check(all(k not in person for k in
               ("foundingDate", "priceRange", "openingHoursSpecification", "numberOfEmployees", "slogan")),
           "Organization-only props are NOT placed on a Person (valid schema)")


async def main():
    print("MAJA — portfolio SEO (Google-facing) + professional-website fields")
    test_seo_autoderives()
    test_seo_respects_written_values()
    test_json_ld_is_valid_localbusiness()
    test_directions_url()
    await test_public_payload_gates_seo_on_premium()
    await test_new_fields_save_without_wiping()
    await test_bot_seo_resolver()
    test_rich_schema_graph()
    test_schema_enrichment()
    print("\nALL PORTFOLIO-SEO CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
