#!/usr/bin/env python3
"""Every path Caddy hands to the backend for a crawler must have a backend route.

`deploy/Caddyfile`'s `@crawler` matcher reverse-proxies a list of paths to the
API whenever the User-Agent looks like a search engine or a link scraper. That
list is only half a contract: if the backend has no route for a path in it, a
crawler gets a **404 JSON body** on a URL that renders perfectly for a human,
and nothing anywhere fails.

That is not hypothetical. Two of them were broken:

  * `/photographer/{slug}` — the canonical the pages emit AND the URL the
    sitemap lists. Only `/photographer/{slug}/portfolio` had a route, so every
    portfolio in the sitemap 404'd for Googlebot.
  * `/themes/{id}/gallery` — a real SPA route inside the `/themes/*` match.

It also checks the other half, which a status code alone will not tell you:
that a crawler gets real metadata, and that a human gets sent to the app
instead of being left on the stub.

    python scripts/check_seo_routes.py                 # against localhost:8001
    API=https://majainvites.com python scripts/check_seo_routes.py

Exit code 1 if any check fails. `og:image` is reported but never fails the run:
a studio that has genuinely uploaded nothing should not have one, and the
renderer correctly downgrades the Twitter card to `summary` in that case.
"""
from __future__ import annotations

import os
import re
import sys
import urllib.error
import urllib.request

API = os.environ.get("API", "http://localhost:8001").rstrip("/")

BOT = {"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; "
                     "+http://www.google.com/bot.html)"}
HUMAN = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

# One concrete URL per shape in the Caddyfile's `path` list. The slugs are
# whatever exists in the target environment; a 404 from a MISSING ENTITY reads
# the same as a 404 from a missing route, so each entry says which it expects.
PATHS = [
    ("invitation",              "/invite/{invite}"),
    ("portfolio (canonical)",   "/photographer/{studio}"),
    ("portfolio (legacy URL)",  "/photographer/{studio}/portfolio"),
    ("directory index",         "/photographers"),
    ("directory by city",       "/photographers/hyderabad"),
    ("directory city+service",  "/photographers/hyderabad/wedding"),
    ("browse",                  "/browse"),
    ("collection",              "/themes/{theme}"),
    ("collection ceremony",     "/themes/{theme}/events/engagement"),
    ("collection gallery",      "/themes/{theme}/gallery"),
    ("design preview",          "/preview/design/{design}"),
    # The /api/og/* mirrors. Not called by the SPA by design — they exist so the
    # same rendering can be checked without spoofing a UA through the edge.
    ("og mirror: invitation",   "/api/og/invite/{invite}"),
    ("og mirror: portfolio",    "/api/og/photographer/{studio}"),
    ("og mirror: directory",    "/api/og/photographers"),
    ("og mirror: dir city",     "/api/og/photographers/hyderabad"),
    ("og mirror: dir city+svc", "/api/og/photographers/hyderabad/wedding"),
    ("og mirror: browse",       "/api/og/browse"),
    ("og mirror: design",       "/api/og/design/{design}"),
    ("og mirror: collection",   "/api/og/collection/{theme}"),
    ("og mirror: coll ceremony", "/api/og/collection/{theme}/engagement"),
]

# A human must be sent into the app rather than left on the crawler stub.
HUMAN_PATHS = ["/invite/{invite}", "/browse", "/photographers", "/photographer/{studio}"]

META = r'<meta[^>]+(?:property|name)=["\']{0}["\'][^>]*content=["\']([^"\']*)'
CANONICAL = re.compile(r'rel=["\']canonical["\'][^>]*href=["\']([^"\']*)', re.I)
REFRESH = re.compile(r'http-equiv=["\']refresh["\']', re.I)


def fetch(path: str, headers: dict) -> tuple[int, str, str]:
    req = urllib.request.Request(API + path, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get("content-type", ""), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", ""), e.read().decode("utf-8", "replace")
    except Exception as e:                                   # network / DNS
        return 0, "", str(e)[:160]


def meta(html: str, prop: str) -> str | None:
    m = re.search(META.format(re.escape(prop)), html, re.I)
    return m.group(1) if m else None


def discover() -> dict:
    """Real slugs from the live sitemap, so this works against any environment."""
    _, _, xml = fetch("/sitemap.xml", HUMAN)
    locs = re.findall(r"<loc>([^<]+)</loc>", xml)
    paths = [re.sub(r"^https?://[^/]+", "", u) for u in locs]

    def first(prefix: str, default: str) -> str:
        for p in paths:
            if p.startswith(prefix):
                return p[len(prefix):].split("/")[0]
        return default

    return {
        "invite": first("/invite/", "unknown-invitation"),
        "studio": first("/photographer/", "unknown-studio"),
        "design": first("/preview/design/", "TMPL-ENG-01"),
        "theme": first("/themes/", "south_indian_temple"),
    }


def main() -> int:
    ids = discover()
    print(f"target {API}")
    print(f"fixtures from sitemap: {ids}\n")

    failures: list[str] = []
    warnings: list[str] = []

    print("=== a crawler gets real metadata, and no self-redirect ===")
    for label, tmpl in PATHS:
        path = tmpl.format(**ids)
        status, ctype, body = fetch(path, BOT)
        problems = []
        if status != 200:
            problems.append(f"HTTP {status}")
        if "html" not in ctype.lower():
            problems.append(f"content-type {ctype.split(';')[0] or '?'}")
        else:
            if not meta(body, "og:title"):
                problems.append("no og:title")
            if not meta(body, "og:description"):
                problems.append("no og:description")
            if not CANONICAL.search(body):
                problems.append("no canonical")
            if REFRESH.search(body):
                # A crawler served a refresh to the URL it just asked for is a
                # self-redirect; Google drops the page.
                problems.append("redirects a CRAWLER")
            if not meta(body, "og:image"):
                warnings.append(f"{label}: no og:image (fine if the entity has no images)")
        mark = "ok  " if not problems else "FAIL"
        if problems:
            failures.append(f"{label} ({path}): {', '.join(problems)}")
        print(f"  {mark} {label:<26} {path}"
              + (f"   [{', '.join(problems)}]" if problems else ""))

    print("\n=== a human is sent into the app ===")
    for tmpl in HUMAN_PATHS:
        path = tmpl.format(**ids)
        status, ctype, body = fetch(path, HUMAN)
        redirected = bool(REFRESH.search(body)) or "location.replace" in body
        if status != 200 or not redirected:
            failures.append(f"human on {path}: HTTP {status}, redirect={redirected}")
        print(f"  {'ok  ' if redirected and status == 200 else 'FAIL'} human on {path}")

    if warnings:
        print("\nwarnings (not failures):")
        for w in warnings:
            print(f"  - {w}")

    print()
    if failures:
        print(f"SEO route check: {len(failures)} failure(s)", file=sys.stderr)
        for f in failures:
            print(f"  {f}", file=sys.stderr)
        return 1
    print(f"SEO route check: clean ({len(PATHS)} paths + {len(HUMAN_PATHS)} human checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
