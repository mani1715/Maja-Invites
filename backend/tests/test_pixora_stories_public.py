"""
test_pixora_stories_public.py — the public Stories rail grouping.

    cd backend && python -m tests.test_pixora_stories_public

Covers the pure core of GET /api/public/pixora/stories: expired stories are dropped,
active ones are grouped per photographer with the most-recently-active studio first,
and each studio's stories come back oldest-first (the order you watch them).

No Postgres / network: `group_active_stories` is a pure function.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from pixora_service import group_active_stories   # noqa: E402

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


def run():
    NOW = "2026-08-02T12:00:00+00:00"
    # rows arrive NEWEST-first (as the endpoint's .sort("created_at", -1) delivers them)
    rows = [
        {"id": "s5", "studio_id": "B", "created_at": "2026-08-02T11:00:00+00:00", "expires_at": "2026-08-03T11:00:00+00:00"},
        {"id": "s4", "studio_id": "A", "created_at": "2026-08-02T10:00:00+00:00", "expires_at": "2026-08-03T10:00:00+00:00"},
        {"id": "s3", "studio_id": "A", "created_at": "2026-08-02T09:00:00+00:00", "expires_at": "2026-08-03T09:00:00+00:00"},
        {"id": "s2", "studio_id": "C", "created_at": "2026-08-01T09:00:00+00:00", "expires_at": "2026-08-02T09:00:00+00:00"},  # EXPIRED (before NOW)
        {"id": "s1", "studio_id": "A", "created_at": "2026-08-01T08:00:00+00:00", "expires_at": "2026-08-02T08:00:00+00:00"},  # EXPIRED
    ]
    grouped = group_active_stories(rows, NOW)
    ids = [sid for sid, _ in grouped]

    print("=== grouping + expiry ===")
    ok("expired stories are dropped (C's only story lapsed)", "C" not in ids)
    ok("A's expired story s1 is excluded but active ones remain",
       [s["id"] for sid, sl in grouped if sid == "A" for s in sl] == ["s3", "s4"])
    ok("the most-recently-active studio leads the rail (B posted at 11:00)", ids[0] == "B")
    ok("two active studios remain (A and B)", ids == ["B", "A"])

    print("\n=== within a studio, oldest-first (natural watch order) ===")
    a_stories = [s["id"] for sid, sl in grouped if sid == "A" for s in sl]
    ok("A's stories are oldest-first", a_stories == ["s3", "s4"])
    ok("B has its single active story", [s["id"] for sid, sl in grouped if sid == "B" for s in sl] == ["s5"])

    print("\n=== edge cases ===")
    ok("empty input yields no groups", group_active_stories([], NOW) == [])
    ok("a story with no studio_id is skipped",
       group_active_stories([{"id": "x", "expires_at": "2026-08-03T00:00:00+00:00"}], NOW) == [])

    print("\n" + "=" * 58)
    print(f"{PASS} checks passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    run()
