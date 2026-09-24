"""
test_discovery.py — SEO discovery pages (category / location / combined).

    cd backend && python -m tests.test_discovery

Covers D1 (backend discovery resolver + endpoints):
  * the pure resolver: service-first order, city membership, combined, aliases,
    unknown → None (the endpoint 404s);
  * the >= 3 photographer threshold that decides index + sitemap inclusion;
  * canonical URL + unique title/description generation;
  * CollectionPage + ItemList JSON-LD (real photographers only, linked by slug);
  * the discovery endpoints end to end on the in-memory FakeDB, AND a regression
    check that the refactored query_directory still enforces the plan gate.

No network. Reuses the FakeDB from the storage orchestrator self-test.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from fastapi import HTTPException                        # noqa: E402
import discovery as dsc                                  # noqa: E402
import photographer_directory as pd                      # noqa: E402
from tests.test_storage_orchestrator import FakeDB       # noqa: E402

PASS = 0
FAIL = []


def ok(label, cond):
    global PASS
    if cond:
        PASS += 1
        print(f"  ok  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}")


CITIES = {"guntur", "hyderabad", "vijayawada", "tenali"}


def test_resolver():
    print("=== the pure resolver ===")
    # service first, even though the word could look like anything else
    r = dsc.resolve_single("wedding", CITIES)
    ok("a service slug resolves to a service page", r and r["kind"] == "service" and r["service"]["slug"] == "wedding")
    ok("service aliases resolve to the same canonical",
       dsc.match_service("videography")["slug"] == "videographer"
       and dsc.match_service("cinematography")["slug"] == "videographer")

    r2 = dsc.resolve_single("guntur", CITIES)
    ok("a known city resolves to a location page", r2 and r2["kind"] == "city" and r2["city"] == "guntur")
    ok("a city alias maps to its canonical city",
       dsc.match_city("bangalore", {"bengaluru"}) == "bengaluru")
    ok("a city NOT served by anyone does not resolve",
       dsc.resolve_single("mumbai", CITIES) is None)
    ok("pure gibberish resolves to nothing (endpoint will 404)",
       dsc.resolve_single("asdf-nonsense", CITIES) is None)

    c = dsc.resolve_combined("guntur", "wedding", CITIES)
    ok("combined resolves city + service", c and c["kind"] == "combined"
       and c["city"] == "guntur" and c["service"]["slug"] == "wedding")
    ok("combined with an unknown city fails", dsc.resolve_combined("mumbai", "wedding", CITIES) is None)
    ok("combined with an unknown service fails", dsc.resolve_combined("guntur", "flim", CITIES) is None)

    # candid is a STYLE, so it must filter on `skill`, not `category`
    ok("a style-type service filters on skill, not category",
       dsc.discovery_filters({"kind": "service", "service": dsc.match_service("candid")}) == {"skill": "candid"})
    ok("a normal service filters on category",
       dsc.discovery_filters({"kind": "service", "service": dsc.match_service("wedding")}) == {"category": "wedding"})


def test_seo_and_threshold():
    print("\n=== SEO + the >=3 thin-page threshold ===")
    svc = dsc.resolve_single("wedding", CITIES)
    city = dsc.resolve_single("guntur", CITIES)
    comb = dsc.resolve_combined("guntur", "wedding", CITIES)

    s = dsc.discovery_seo(svc, 7)
    ok("service page has a unique title", "Wedding Photographers" in s["title"])
    ok("service canonical is the pretty URL", s["canonical"].endswith("/photographers/wedding"))

    cc = dsc.discovery_seo(city, 5)
    ok("city page names the city", "Guntur" in cc["title"] and "Guntur" in cc["description"])
    ok("city canonical is the pretty URL", cc["canonical"].endswith("/photographers/guntur"))

    cm = dsc.discovery_seo(comb, 4)
    ok("combined title = service in city", cm["title"].startswith("Wedding Photographers in Guntur"))
    ok("combined canonical is city/service", cm["canonical"].endswith("/photographers/guntur/wedding"))

    ok("exactly 3 photographers is INDEXABLE", dsc.discovery_seo(svc, 3)["indexable"] is True)
    ok("2 photographers is NOT indexable (thin page)", dsc.discovery_seo(svc, 2)["indexable"] is False)
    ok("0 photographers is NOT indexable", dsc.discovery_seo(city, 0)["indexable"] is False)


def test_collection_jsonld():
    print("\n=== CollectionPage + ItemList schema ===")
    svc = dsc.resolve_single("wedding", CITIES)
    seo = dsc.discovery_seo(svc, 3)
    photographers = [
        {"name": "Mani Studio", "slug": "mani-studio", "is_demo": False},
        {"name": "Lens Tales", "slug": "lens-tales", "is_demo": False},
        {"name": "Demo Showcase", "slug": "demo", "is_demo": True},   # excluded
    ]
    j = dsc.collection_jsonld(svc, photographers, seo)
    types_ = [n["@type"] for n in j["@graph"]]
    ok("graph has a CollectionPage", "CollectionPage" in types_)
    il = next(n for n in j["@graph"] if n["@type"] == "ItemList")
    ok("ItemList excludes demo/sample rows", il["numberOfItems"] == 2)
    ok("each item links to a portfolio by slug",
       il["itemListElement"][0]["url"].endswith("/photographer/mani-studio/portfolio"))
    ok("positions are 1-based and sequential",
       [i["position"] for i in il["itemListElement"]] == [1, 2])


async def _seed(db):
    """3 wedding photographers in Guntur (premium), 2 in Tenali (basic),
    and 1 FREE photographer who must never be listed."""
    async def add(pid, city, tier, services=("Wedding Photography",), listed=True, free=False):
        await db.admins.insert_one({"id": pid, "name": pid.title(), "directory_listed": listed})
        await db.portfolio_profiles.insert_one({
            "id": pid, "slug": f"{pid}-slug", "services": list(services),
            "styles": ["Candid"], "location": {"city": city, "state": "Andhra Pradesh"},
            "coverage_areas": [city]})
        if free:
            return
        await db.subscriptions.insert_one({
            "id": f"sub_{pid}", "studio_id": pid, "product": "portfolio",
            "status": "active", "plan_id": f"plan_{tier}", "tier": tier})
        await db.subscription_plans.insert_one({
            "id": f"plan_{tier}", "product": "portfolio", "portfolio_tier": tier})

    for i in range(3):
        await add(f"gphoto{i}", "guntur", "premium")
    for i in range(2):
        await add(f"tphoto{i}", "tenali", "basic")
    await add("freeguy", "guntur", "basic", free=True)   # no subscription → never listed


async def test_endpoints():
    print("\n=== discovery endpoints end-to-end (FakeDB) ===")
    db = FakeDB()
    await _seed(db)
    router = pd.build_photographer_directory_router(db, get_current_admin=lambda: {"admin_id": "x"})
    ep = {}
    for r in router.routes:
        for m in (getattr(r, "methods", None) or []):
            ep[(r.path, m)] = r.endpoint
    single = ep[("/api/public/discovery/{segment}", "GET")]
    combined = ep[("/api/public/discovery/{city_seg}/{service_seg}", "GET")]
    listing = ep[("/api/public/photographers", "GET")]

    # regression: the refactored directory still enforces the plan gate
    base = await listing()
    ok("refactor intact — listing returns the plan-gated photographers",
       base["count"] == 5)
    ok("the FREE photographer is never listed (plan gate preserved)",
       all(p["id"] != "freeguy" for p in base["photographers"]))
    ok("each listed row now carries a portfolio slug",
       all(p.get("slug") for p in base["photographers"]))

    svc = await single("wedding")
    ok("the wedding service page lists all 5 wedding photographers", svc["count"] == 5)
    ok("the service page is indexable (>=3)", svc["indexable"] is True)
    ok("the service page carries CollectionPage/ItemList JSON-LD",
       any(n["@type"] == "ItemList" for n in svc["json_ld"]["@graph"]))

    city = await single("guntur")
    ok("the Guntur page lists only Guntur's 3 photographers", city["count"] == 3)
    ok("Guntur is indexable (exactly 3)", city["indexable"] is True)

    tenali = await single("tenali")
    ok("Tenali resolves (a served city) but has only 2", tenali["count"] == 2)
    ok("Tenali is NOT indexable (thin page < 3)", tenali["indexable"] is False)

    comb = await combined("guntur", "wedding")
    ok("combined Guntur+wedding lists the 3 Guntur photographers", comb["count"] == 3)
    ok("combined canonical is /photographers/guntur/wedding",
       comb["seo"]["canonical"].endswith("/photographers/guntur/wedding"))

    threw = False
    try:
        await single("nonsense-town")
    except HTTPException as e:
        threw = (e.status_code == 404)
    ok("an unknown segment 404s (no thin/junk page minted)", threw)


async def test_resolve_discovery_page():
    print("\n=== resolve_discovery_page (shared by API + crawler renderer) ===")
    db = FakeDB()
    await _seed(db)

    svc = await pd.resolve_discovery_page(db, "wedding")
    ok("service page resolves with a full payload",
       svc and svc["seo"]["canonical"].endswith("/photographers/wedding"))
    ok("payload carries the ItemList the crawler renderer emits",
       any(n["@type"] == "ItemList" for n in svc["json_ld"]["@graph"]))
    ok("payload carries the index decision", svc["indexable"] is True)

    comb = await pd.resolve_discovery_page(db, "guntur", "wedding")
    ok("combined resolves", comb and comb["resolved"]["kind"] == "combined")

    thin = await pd.resolve_discovery_page(db, "tenali")
    ok("a thin city page resolves but is non-indexable",
       thin and thin["indexable"] is False)

    ok("an unknown segment returns None (renderer → directory, 404 for API)",
       await pd.resolve_discovery_page(db, "nowhere-city") is None)


async def test_sitemap_enumeration():
    print("\n=== sitemap enumeration (>=3 threshold) ===")
    db = FakeDB()
    await _seed(db)   # guntur: 3 wedding+candid, tenali: 2, freeguy: unlisted
    paths = set(await pd.enumerate_discovery_pages(db))

    ok("the wedding category page qualifies (5 >= 3)", "/photographers/wedding" in paths)
    ok("the candid style page qualifies (5 >= 3)", "/photographers/candid" in paths)
    ok("the Guntur location page qualifies (3 >= 3)", "/photographers/guntur" in paths)
    ok("the Guntur+wedding combined page qualifies", "/photographers/guntur/wedding" in paths)
    ok("Tenali (2) is NOT in the sitemap (thin)", "/photographers/tenali" not in paths)
    ok("no thin combined page for Tenali", not any(p.startswith("/photographers/tenali/") for p in paths))
    ok("no page for a service nobody offers", "/photographers/maternity" not in paths)
    ok("every enumerated combined path has BOTH a city and a service segment",
       all(len(p.strip('/').split('/')) == 3 for p in paths if p.count('/') == 3))


def test_index_collection_schema():
    print("\n=== directory index CollectionPage/ItemList (resolved-agnostic) ===")
    # The directory-root bot renderer builds schema with an EMPTY resolved.
    page_seo = {"title": "Photographers", "description": "All",
                "canonical": "https://majainvites.com/photographers"}
    photographers = [{"name": "A Studio", "slug": "a-slug", "is_demo": False},
                     {"name": "Demo", "slug": "demo", "is_demo": True}]
    j = dsc.collection_jsonld({}, photographers, page_seo)
    ok("index schema builds a CollectionPage with empty resolved",
       any(n["@type"] == "CollectionPage" for n in j["@graph"]))
    il = next((n for n in j["@graph"] if n["@type"] == "ItemList"), None)
    ok("index ItemList excludes demos and links portfolios by slug",
       il and il["numberOfItems"] == 1
       and il["itemListElement"][0]["url"].endswith("/photographer/a-slug/portfolio"))


def main():
    test_resolver()
    test_seo_and_threshold()
    test_collection_jsonld()
    test_index_collection_schema()
    asyncio.run(test_endpoints())
    asyncio.run(test_resolve_discovery_page())
    asyncio.run(test_sitemap_enumeration())
    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
