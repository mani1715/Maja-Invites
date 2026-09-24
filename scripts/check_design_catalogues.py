#!/usr/bin/env python3
"""Every design the platform advertises must have artwork that actually serves.

There are five separate design catalogues in this codebase, each with its own
storage and its own idea of what a "design" is. Nothing checked that the
artwork behind them exists, and the failure is invisible in the usual ways:

  * A Vite SPA answers **200 with index.html** for a missing file. Status code
    alone proves nothing — this asserts content-type and byte count.
  * Field names differ per catalogue (`preview_url` vs `preview_image` vs
    `src480`). Guessing them produced a confident 0/10 on a catalogue that was
    completely fine. Every field name here came from a printed response.

    python scripts/check_design_catalogues.py
    API=http://localhost:8001 WEB=http://localhost:8128 python scripts/check_design_catalogues.py

Exit 1 if any advertised artwork fails to serve. Needs the API and the frontend
both running (the artwork is served by the frontend, the catalogue by the API).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("API", "http://localhost:8001").rstrip("/")
WEB = os.environ.get("WEB", "http://localhost:8128").rstrip("/")
H = {"User-Agent": "Mozilla/5.0"}

failures: list[str] = []


def get_json(path: str, base: str = None):
    url = (base or API) + path
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
        return json.loads(r.read())


def serves_image(path: str) -> tuple[bool, str]:
    if not path:
        return False, "empty path"
    url = path if path.startswith("http") else WEB + path
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30) as r:
            ctype = r.headers.get("content-type", "")
            size = len(r.read())
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:                                    # noqa: BLE001
        return False, str(e)[:60]
    if "image" not in ctype.lower():
        # The SPA fallback: a 200 that is really the app shell.
        return False, f"{ctype.split(';')[0] or '?'} {size}b — SPA shell, file missing"
    return True, f"{size}b"


def report(label: str, ok: int, total: int, misses: list[str]) -> None:
    mark = "ok  " if not misses else "FAIL"
    print(f"  {mark} {label:<34} {ok}/{total}")
    for m in misses[:6]:
        print(f"         {m}")
    if misses:
        failures.append(f"{label}: {len(misses)} missing")


# 1. Wedding invitation designs — the 188-design catalogue, served statically.
def check_wedding():
    cat = get_json("/designs/catalogue.json", base=WEB)
    designs = cat.get("designs", cat) if isinstance(cat, dict) else cat
    misses, checked, no_large = [], 0, 0
    for d in designs:
        # src480 is required — it is what every grid tile paints.
        checked += 1
        ok, why = serves_image(d.get("src480", ""))
        if not ok:
            misses.append(f"{d.get('stem') or d.get('slug') or '?'} src480: {why}")
        # src960 is OPTIONAL. 44 of the 188 have none, and every consumer
        # already reads `src960 || src480` (DesignPreview, design_seo). An
        # absent optional field is not a missing file — only a path that is
        # DECLARED and then fails to serve is a fault. Failing on the empty
        # string was the checker being wrong, not the catalogue.
        if d.get("src960"):
            checked += 1
            ok, why = serves_image(d["src960"])
            if not ok:
                misses.append(f"{d.get('stem') or d.get('slug') or '?'} src960: {why}")
        else:
            no_large += 1
    report("wedding designs (catalogue.json)", checked - len(misses), checked, misses)
    if no_large:
        print(f"         note: {no_large} design(s) have no 960px variant and render "
              f"their preview hero at 480 — handled, not broken")


# 2. Non-wedding invitation categories — baby_birthday / half_saree / puberty / dhoti.
def check_categories():
    cats = get_json("/api/event-categories")
    cats = cats if isinstance(cats, list) else cats.get("categories", [])
    total = ok = 0
    misses = []
    for c in cats:
        cid = c.get("id")
        if cid == "wedding":
            continue
        ds = get_json(f"/api/event-categories/{cid}/designs")
        ds = ds if isinstance(ds, list) else ds.get("designs", [])
        for d in ds:
            total += 1
            good, why = serves_image(d.get("preview_image") or "")
            ok += good
            if not good:
                misses.append(f"{cid}/{d.get('id', '?')}: {why}")
    report("category designs", ok, total, misses)


# 3. Event engine templates — artwork pairs per template.
def check_event_templates():
    total = ok = 0
    misses = []
    for etype in ("ganesh_chaturthi",):
        d = get_json(f"/api/events/templates/{etype}")
        ts = d if isinstance(d, list) else d.get("templates", [])
        for t in ts:
            for field in ("thumbnail_url", "preview_url"):
                total += 1
                good, why = serves_image(t.get(field) or "")
                ok += good
                if not good:
                    misses.append(f"{t.get('template_id', '?')} {field}: {why}")
    report("event templates (artwork pairs)", ok, total, misses)


# 4. Portfolio designs — no image files; each is a token set the public page
#    paints with. The failure mode is a design that is SOLD but has no tokens,
#    which silently renders as another design. Cross-checked across the three
#    places that must agree.
def check_portfolio_designs():
    import re
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def read(p):
        with open(os.path.join(root, p), encoding="utf-8") as fh:
            return fh.read()

    be = read("backend/portfolio_service.py")
    block = be[be.index("PORTFOLIO_DESIGN_TIERS"):be.index("_DESIGN_TIER_RANK")]
    sold = set(re.findall(r'"(\w+)":\s*"(?:normal|basic|premium)"', block))
    picker = set(re.findall(r"id:\s*'([\w_]+)'", read("frontend-v2/src/lib/portfolioDesigns.js")))
    painted = set(re.findall(r"^\s{2}(\w+):\s*\{\s*tier:", read("frontend-v2/src/pages/PhotographerPublic.jsx"), re.M))

    misses = []
    for d in sorted(sold - painted):
        misses.append(f"{d}: sold and offered, but the public page has no tokens "
                      f"— renders as another design")
    for d in sorted(sold - picker):
        misses.append(f"{d}: sold but not in the picker")
    for d in sorted(picker - sold):
        misses.append(f"{d}: in the picker but the backend rejects it (403)")
    report("portfolio designs (backend/picker/render)", len(sold) - len(misses), len(sold), misses)


# 5. Deity artwork — registry entries whose files do not exist. Reported as a
#    WARNING, not a failure: nothing renders them yet, and the fix is real
#    licensed artwork from the owner, not a generated stand-in.
def check_deities():
    try:
        lords = get_json("/api/lords")
    except Exception as e:                                    # noqa: BLE001
        print(f"  warn deity registry unreachable: {str(e)[:60]}")
        return
    lords = lords if isinstance(lords, list) else lords.get("lords", lords.get("items", []))
    missing = []
    for lord in lords:
        for field in ("thumbnail", "image_webp"):
            path = lord.get(field)
            if path and not serves_image(path)[0]:
                missing.append(path)
    if missing:
        print(f"  warn deity artwork                  0/{len(missing)} — the registry "
              f"advertises files that do not exist")
        print("         needs real licensed images; nothing renders them today "
              "(see backend/lord_library.py)")
    else:
        print(f"  ok   deity artwork                  {len(lords) * 2}/{len(lords) * 2}")


def main() -> int:
    print(f"API {API}   WEB {WEB}\n")
    for fn in (check_wedding, check_categories, check_event_templates,
               check_portfolio_designs, check_deities):
        try:
            fn()
        except Exception as e:                                # noqa: BLE001
            print(f"  FAIL {fn.__name__}: {str(e)[:100]}")
            failures.append(fn.__name__)
    print()
    if failures:
        print(f"design catalogue check: {len(failures)} failing catalogue(s)", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    print("design catalogue check: clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
