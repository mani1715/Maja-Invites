"""Regenerate API_SURFACE.md — the complete, machine-extracted route inventory.

The point of generating this rather than writing it by hand: a hand-written API
list is wrong within a week, and during a frontend rewrite a wrong API list is
worse than none — it sends someone building against an endpoint that moved.

Re-run it any time routes change:

    cd backend && python scripts/dump_api_surface.py

It parses the decorators statically (no imports, no DB, no running server), so
it works on a checkout with nothing installed.

Caveats, stated because a reader will otherwise trust this too far:
* Auth is detected by scanning the ~25 lines after each decorator for a known
  dependency name. A route guarded some other way reads as PUBLIC here.
* `PUBLIC` therefore means "no recognised auth dependency found", NOT "verified
  safe to expose". Treat the public list as a review queue, not a guarantee.
* Router prefixes are read from the first `APIRouter(prefix=...)` in a file; a
  module with several prefixed routers may show a path missing its prefix.
"""
from __future__ import annotations

import collections
import glob
import os
import re
import sys
from datetime import date

AUTH_DEPS = (
    "require_super_admin",
    "get_current_admin_with_role",
    "require_admin",
    "current_admin_dep",
    "get_current_admin",
    "get_current_buyer",
    "get_current_public_user",
)

AUTH_MEANING = {
    "require_super_admin": "Super-admin only (the owner).",
    "get_current_admin_with_role": "Photographer/admin, role inspected.",
    "require_admin": "Photographer (studio) session.",
    "current_admin_dep": "Photographer (studio) session — injected dep.",
    "get_current_admin": "Photographer (studio) session. **Returns a STRING id, not a dict.**",
    "get_current_buyer": "Either buyer identity (studio bearer OR user cookie).",
    "get_current_public_user": "Normal user (couple) cookie session.",
    "PUBLIC": "No recognised auth dependency — verify before trusting.",
}

DECORATOR = re.compile(
    r'\s*@(\w+)\.(get|post|put|delete|patch|websocket)\(\s*["\']([^"\']+)["\']')


def scan(root: str):
    rows = []
    files = sorted(glob.glob(os.path.join(root, "*.py")))
    files += sorted(glob.glob(os.path.join(root, "storage", "*.py")))
    for path in files:
        src = open(path, encoding="utf-8", errors="replace").read()
        lines = src.split("\n")
        m = re.search(r'APIRouter\(prefix=["\']([^"\']+)["\']', src)
        prefix = m.group(1) if m else ""
        for i, line in enumerate(lines):
            dm = DECORATOR.match(line)
            if not dm:
                continue
            _var, method, route = dm.groups()
            blob = "\n".join(lines[i:i + 25])
            auth = next((d for d in AUTH_DEPS if d in blob), "PUBLIC")
            full = route if route.startswith(("/api", "/uploads")) \
                else (prefix + route if prefix else route)
            rows.append({
                "file": os.path.relpath(path, root).replace("\\", "/"),
                "method": method.upper(),
                "path": full,
                "auth": auth,
            })
    return rows


def namespace(p: str) -> str:
    parts = [x for x in p.split("/") if x]
    if not parts:
        return "/"
    if parts[0] != "api":
        return "/" + parts[0]
    if len(parts) < 2:
        return "/api"
    if parts[1] in ("admin", "super-admin") and len(parts) > 2:
        return f"/api/{parts[1]}/{parts[2]}"
    return f"/api/{parts[1]}"


def main() -> int:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rows = scan(here)
    repo = os.path.dirname(here)
    out = os.path.join(repo, "API_SURFACE.md")

    by_ns = collections.defaultdict(list)
    for r in rows:
        by_ns[namespace(r["path"])].append(r)
    by_auth = collections.Counter(r["auth"] for r in rows)

    L = []
    L.append("# API_SURFACE.md — every backend route\n")
    L.append("> **GENERATED — do not hand-edit.** "
             "`cd backend && python scripts/dump_api_surface.py`\n")
    L.append(f"> Extracted {date.today().isoformat()} · "
             f"**{len(rows)} routes** across {len(by_ns)} namespaces.\n")
    L.append("> This is the contract a rewritten frontend has to satisfy. "
             "Auth is inferred from the dependency used; see the caveats in the "
             "generator's docstring before treating `PUBLIC` as safe.\n")

    L.append("\n## Auth guards\n")
    L.append("| Guard | Routes | Meaning |")
    L.append("|---|---:|---|")
    for a, n in by_auth.most_common():
        L.append(f"| `{a}` | {n} | {AUTH_MEANING.get(a, '')} |")

    L.append("\n## Namespaces by size\n")
    L.append("| Namespace | Routes |")
    L.append("|---|---:|")
    for ns, rs in sorted(by_ns.items(), key=lambda kv: -len(kv[1])):
        L.append(f"| [`{ns}`](#{ns.replace('/', '').replace('-', '')}) | {len(rs)} |")

    L.append("\n---\n\n## Routes\n")
    for ns, rs in sorted(by_ns.items(), key=lambda kv: -len(kv[1])):
        anchor = ns.replace("/", "").replace("-", "")
        L.append(f'\n### <a id="{anchor}"></a>`{ns}` — {len(rs)} routes\n')
        L.append("| Method | Path | Auth | Module |")
        L.append("|---|---|---|---|")
        for r in sorted(rs, key=lambda x: (x["path"], x["method"])):
            L.append(f"| {r['method']} | `{r['path']}` | "
                     f"{'—' if r['auth'] == 'PUBLIC' else '`' + r['auth'] + '`'} | "
                     f"`{r['file']}` |")

    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(L) + "\n")

    print(f"wrote {out}")
    print(f"  {len(rows)} routes, {len(by_ns)} namespaces")
    for a, n in by_auth.most_common():
        print(f"  {a:32} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
