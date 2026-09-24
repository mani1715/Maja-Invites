"""
test_travel_links.py — the "Getting to the venue" buttons.

    cd backend && python -m tests.test_travel_links

The owner reported that only Ola opened correctly. Verified causes:
  * Rapido pointed at https://rapido.bike/Booknow, which returns 404;
  * Uber's link carried RAW `[` and `]` in the query string, which is invalid;
  * the same block was duplicated in two files and could drift.

Also covers the bulk-upload fan-out helper, which is the fix for "uploading a
bunch of photos takes longer and longer" — results must stay in the caller's
order and one bad file must not lose the rest of the batch.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from travel_links import build_travel_links, travel_payload_for_profile   # noqa: E402

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


VENUE = "Sri Venkateswara Kalyana Mandapam"
LAT, LNG = 16.3999857, 80.1448313


def main():
    print("=== with a real drop pin ===")
    t = build_travel_links(VENUE, LAT, LNG, address="Sattenapalle, Guntur")
    links = t["links"]

    ok("the dead Rapido path is gone", "Booknow" not in links["rapido"])
    ok("Rapido points at a page that exists", links["rapido"] == "https://www.rapido.bike/")
    ok("Rapido is declared as NOT carrying the destination",
       t["carries_destination"]["rapido"] is False)
    ok("...so the UI has an address to offer instead",
       VENUE in t["drop_address"] and "Sattenapalle" in t["drop_address"])

    ok("Uber's bracket keys are percent-encoded, never raw",
       "dropoff%5Blatitude%5D" in links["uber"]
       and "[" not in links["uber"] and "]" not in links["uber"])
    ok("Uber carries the coordinates", str(LAT) in links["uber"] and str(LNG) in links["uber"])
    ok("Uber still asks for the rider's own pickup", "pickup=my_location" in links["uber"])

    ok("Ola is unchanged — it was the one that worked",
       links["ola"].startswith("https://book.olacabs.com/?lat=") and f"lng={LNG}" in links["ola"])
    ok("Google Maps uses the pin, not the name",
       links["google_maps"].endswith(f"query={LAT},{LNG}"))
    ok("hotels search is built from the place", "hotels+near+" in t["hotels_nearby_query"])
    ok("the destination is reported back", t["destination"] == {"lat": LAT, "lng": LNG})
    ok("every link is https",
       all(v.startswith("https://") for v in links.values()))
    ok("no link contains a raw space", all(" " not in v for v in links.values()))

    print("\n=== with no coordinates (name only) ===")
    t2 = build_travel_links(VENUE)
    ok("no destination claimed", t2["destination"] is None)
    ok("Google Maps falls back to searching the name",
       "query=Sri%20Venkateswara" in t2["links"]["google_maps"]
       or "query=Sri+Venkateswara" in t2["links"]["google_maps"])
    ok("Ola still gets a drop label", "drop_name=" in t2["links"]["ola"])
    ok("Uber still encoded", "[" not in t2["links"]["uber"])
    ok("Rapido is the same safe link", t2["links"]["rapido"] == "https://www.rapido.bike/")

    print("\n=== junk in, sane out ===")
    t3 = build_travel_links("", None, None)
    ok("no venue name → a neutral label", t3["venue"] == "Wedding Venue")
    t4 = build_travel_links(VENUE, "not-a-number", "nope")
    ok("unparseable coordinates are ignored, not injected", t4["destination"] is None)
    t5 = build_travel_links(VENUE, 999, 999)
    ok("out-of-range coordinates still produce usable links",
       t5["links"]["google_maps"].startswith("https://"))
    t6 = build_travel_links(VENUE, LAT, LNG, address=VENUE)
    ok("a duplicated address isn't printed twice",
       t6["drop_address"] == VENUE)

    print("\n=== straight off a profile ===")
    prof = {"venue": VENUE, "city": "Sattenapalle",
            "map_settings": {"latitude": LAT, "longitude": LNG}}
    tp = travel_payload_for_profile(prof)
    ok("profile coordinates are used", tp["destination"] == {"lat": LAT, "lng": LNG})
    ok("an explicit override wins",
       travel_payload_for_profile(prof, lat=1.5, lng=2.5)["destination"] == {"lat": 1.5, "lng": 2.5})
    ok("a profile with no map settings still works",
       travel_payload_for_profile({"venue": VENUE})["destination"] is None)

    print("\n=== bulk upload fan-out (the slow-upload fix) ===")
    # gallery_features imports the whole AWS surface at module level. Stub it —
    # this check is about the fan-out contract, not about S3.
    # The stub must satisfy gallery_features' module-level `from aws_service
    # import (...)`. That import list is the contract — a name missing here is
    # an ImportError that fails the whole suite, not just this check. It broke
    # once already: `generate_presigned_put` landed with presign-primary
    # uploads (e80aec9) and was never added below, so instead of hand-keeping
    # two lists in sync we mirror the real module's public surface.
    import importlib
    _real_aws = importlib.import_module("aws_service")
    _aws = types.ModuleType("aws_service")
    for _name in dir(_real_aws):
        if not _name.startswith("_"):
            setattr(_aws, _name, lambda *a, **k: None)
    sys.modules["aws_service"] = _aws

    from gallery_features import _ingest_many, _BULK_CONCURRENCY as conc

    ok("concurrency is bounded, not unlimited", 1 <= conc <= 16)
    files = [types.SimpleNamespace(filename=f"{i}.jpg") for i in range(9)]
    live = {"n": 0, "peak": 0}

    async def ingest_one(f):
        live["n"] += 1
        live["peak"] = max(live["peak"], live["n"])
        # Slower for the EARLY files, so an implementation that returned results
        # in completion order would visibly scramble them.
        await asyncio.sleep(0.05 if f.filename.startswith(("0", "1")) else 0.001)
        live["n"] -= 1
        if f.filename == "4.jpg":
            raise ValueError("bad file")
        return {"ok": True, "filename": f.filename}

    out = asyncio.run(_ingest_many(files, ingest_one))
    ok("every file is reported", len(out) == 9)
    ok("results keep the caller's order",
       [r["filename"] for r in out] == [f"{i}.jpg" for i in range(9)])
    ok("one bad file does not lose the other eight",
       sum(1 for r in out if r.get("ok")) == 8)
    ok("the failure is reported against the right file",
       out[4]["ok"] is False and "bad file" in out[4]["error"])
    ok("photos really do run in parallel (was strictly one-by-one)", live["peak"] > 1)
    ok("...but never more than the limit at once", live["peak"] <= conc)
    ok("an empty batch is not an error", asyncio.run(_ingest_many([], ingest_one)) == [])

    print("\n=== the QR wall reads BOTH photo collections ===")
    # The wall used to read db.live_photos only, while the photographer's upload
    # writes db.live_gallery_photos — so a paid QR gallery was always empty.
    import live_wall_feed as lwf
    from tests.test_storage_orchestrator import FakeDB

    async def _wall_checks():
        db = FakeDB()
        # A studio upload (live_gallery_photos, keyed wedding_id, no `approved`).
        await db.live_gallery_photos.insert_one({
            "id": "g1", "wedding_id": "prof1", "profile_id": "prof1",
            "url": "/u/a.jpg", "thumb_url": "/u/a-t.jpg", "guest_name": "Test Studio",
            "caption": "The mandap", "created_at": "2026-07-24T10:00:00+00:00"})
        # A guest upload through the other path (live_photos, approved).
        await db.live_photos.insert_one({
            "id": "p1", "profile_id": "prof1", "approved": True,
            "url": "/u/b.jpg", "thumb_url": "/u/b-t.jpg", "uploader_name": "Aanya",
            "favorite_count": 3, "favorited_by": ["dev1"],
            "created_at": "2026-07-24T11:00:00+00:00"})
        # Something explicitly held back for moderation.
        await db.live_photos.insert_one({
            "id": "p2", "profile_id": "prof1", "approved": False,
            "url": "/u/c.jpg", "created_at": "2026-07-24T12:00:00+00:00"})
        # Another wedding's photo must never leak in.
        await db.live_gallery_photos.insert_one({
            "id": "other", "wedding_id": "prof2", "url": "/u/x.jpg",
            "created_at": "2026-07-24T13:00:00+00:00"})
        return db, await lwf.fetch_wall(db, "prof1")

    db, wall = asyncio.run(_wall_checks())
    ids = [p["id"] for p in wall["photos"]]
    ok("the photographer's upload now shows on the wall", "g1" in ids)
    ok("guest uploads from the other collection still show", "p1" in ids)
    ok("an unapproved photo stays hidden", "p2" not in ids)
    ok("another wedding's photos never leak in", "other" not in ids)
    ok("the count matches what is shown", wall["total"] == 2)
    ok("newest first", ids[0] == "p1")

    byid = {p["id"]: p for p in wall["photos"]}
    ok("guest_name is normalised to uploader_name",
       byid["g1"]["uploader_name"] == "Test Studio")
    ok("a missing thumb falls back to the full image",
       lwf.normalise({"url": "/u/z.jpg"}, "x")["thumb_url"] == "/u/z.jpg")
    ok("favourite counts survive", byid["p1"]["favorite_count"] == 3)
    ok("each photo records which store it came from",
       byid["g1"]["_store"] == "live_gallery_photos" and byid["p1"]["_store"] == "live_photos")

    async def _lookup():
        return (await lwf.find_photo(db, "g1"), await lwf.find_photo(db, "p1"),
                await lwf.find_photo(db, "nope"))

    (d1, c1), (d2, c2), (d3, c3) = asyncio.run(_lookup())
    ok("a favourite can find a photographer photo", d1 is not None and c1 is not None)
    ok("...and a guest photo", d2 is not None and c2 is not None)
    ok("an unknown id finds nothing (404, not the wrong row)", d3 is None and c3 is None)

    # The wall polls every 8s with `since` and assigns the returned `total` to its
    # photo counter. If a poll returned the DELTA, the chip would fall to 0.
    poll = asyncio.run(lwf.fetch_wall(db, "prof1", since="2026-07-24T23:00:00+00:00"))
    ok("a poll returns no new photos", poll["photos"] == [])
    ok("...but still the REAL total, so the counter doesn't reset", poll["total"] == 2)

    print("\n" + "=" * 60)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
