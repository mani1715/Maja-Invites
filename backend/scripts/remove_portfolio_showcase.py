"""Delete the seeded per-design showcase portfolios.

WHY THEY ARE GOING
They were published at `/p/sample-<design-id>` so a photographer could see what
each of the ten token designs produced. Two problems:

  1. **The links never worked.** `/p/:username` is the PIXORA community profile
     route; the public portfolio lives at `/photographer/:id/portfolio`. Every
     "See it live" opened the wrong component, which is why the samples looked
     broken from the day they shipped.
  2. **They have been superseded.** /portfolio-samples now shows the four tier
     demos, which are static pages needing no database rows at all.

So the rows are dead weight: they occupy the directory's demo exemption, they
show up in any query that forgets to filter `is_demo`, and nothing links to them.

WHAT THIS TOUCHES — and what it deliberately does not
Only `portfolio_profiles` / `portfolio_works` rows whose id starts `demo_` AND
which carry `is_demo: True`. Both conditions, because `is_demo` is ALSO used by
`photographer_directory.py` for its own seeded directory listings — those are a
different feature and must survive. The `demo_` id prefix is what the portfolio
showcase seeder used and the directory seeder did not.

Dry-run by default.

    $DC run --rm core python scripts/remove_portfolio_showcase.py
    $DC run --rm core python scripts/remove_portfolio_showcase.py --execute
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pg_adapter import Database  # noqa: E402

# The ten design ids the showcase seeder published, as `demo_<design_id>`.
DESIGN_IDS = [
    "free_studio_neutral",
    "basic_golden_hour", "basic_darkroom", "basic_nordic",
    "premium_gallery_wall", "premium_film_strip", "premium_liquid_glass",
    "premium_contact_sheet", "premium_aurora", "premium_editorial",
]


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--execute", action="store_true",
                    help="actually delete (default is a dry run)")
    args = ap.parse_args()

    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("ERROR: SUPABASE_DB_URL is not set.")
        return 1
    db = await Database.connect(dsn)

    found, works_total = [], 0
    for design_id in DESIGN_IDS:
        sid = f"demo_{design_id}"
        prof = await db.portfolio_profiles.find_one({"id": sid}, {"_id": 0})
        if not prof:
            continue
        # Belt and braces: never delete a row that is not flagged demo, even if
        # the id matches. A real studio that somehow took this id stays.
        if not prof.get("is_demo"):
            print(f"  [skip] {sid} exists but is NOT is_demo — leaving it alone")
            continue
        n = 0
        async for _w in db.portfolio_works.find({"studio_id": sid}):
            n += 1
        found.append((sid, prof.get("studio_name") or "", n))
        works_total += n

    if not found:
        print("Nothing to remove — no seeded showcase portfolios found.")
        await db.close()
        return 0

    print(f"{'WOULD DELETE' if not args.execute else 'DELETING'} "
          f"{len(found)} portfolios and {works_total} works:\n")
    for sid, name, n in found:
        print(f"  {sid:<32} {name:<34} {n} works")

    if not args.execute:
        print("\nDry run. Re-run with --execute to delete.")
        await db.close()
        return 0

    for sid, _name, _n in found:
        await db.portfolio_works.delete_many({"studio_id": sid})
        await db.portfolio_profiles.delete_one({"id": sid})
    print(f"\nDeleted {len(found)} showcase portfolios and {works_total} works.")
    print("Live examples now live at /portfolio-samples (static tier demos).")
    await db.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
