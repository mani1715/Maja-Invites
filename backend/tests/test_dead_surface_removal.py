"""
test_dead_surface_removal.py — proves the L4 dead-surface removals stuck.

    cd backend && python -m tests.test_dead_surface_removal

`import server` hard-requires SUPABASE_DB_URL (raises RuntimeError at import
time otherwise, see server.py ~line 170), so this is a source-grep test
against server.py's text rather than a live route-table walk. That's enough
to prove: no /api/v2 (invitation_v2) mount, no /invite/{slug}/event/{event_slug}
route, and the per-event Rekognition face-collection *creation* call is gone
while the (still-needed) *deletion* call in _purge_invitation_assets survives.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BACKEND_DIR = Path(__file__).resolve().parent.parent
SERVER_SRC = (BACKEND_DIR / "server.py").read_text(encoding="utf-8")

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


def main():
    # 1. invitation_v2 module: deleted + unmounted
    ok("invitation_v2.py deleted", not (BACKEND_DIR / "invitation_v2.py").exists())
    ok("no invitation_v2 import in server.py", "invitation_v2" not in SERVER_SRC)
    ok("no /api/v2 router mount in server.py", "build_invitation_v2_router" not in SERVER_SRC)

    # 2. get_event_by_slug: unauthenticated-by-slug endpoint removed
    ok("no /invite/{slug}/event/{event_slug} route",
       '"/invite/{slug}/event/{event_slug}"' not in SERVER_SRC)
    ok("no get_event_by_slug handler", "get_event_by_slug" not in SERVER_SRC)

    # 3. per-event_invitation Rekognition *creation* removed, *deletion* kept
    ok("no create_face_collection call", "create_face_collection(" not in SERVER_SRC)
    ok("delete_face_collection call still present (legacy rows)",
       "delete_face_collection(" in SERVER_SRC)
    ok("rekognition_collection_id field still referenced (harmless legacy read)",
       "rekognition_collection_id" in SERVER_SRC)

    # 4. no leftover test coverage importing the removed surfaces
    tests_dir = BACKEND_DIR / "tests"
    offenders = []
    for f in tests_dir.glob("*.py"):
        if f.name == "test_dead_surface_removal.py":
            continue
        text = f.read_text(encoding="utf-8", errors="ignore")
        if "invitation_v2" in text or "get_event_by_slug" in text or "viewer_v2" in text:
            offenders.append(f.name)
    ok("no other test references removed surfaces", not offenders)
    if offenders:
        print(f"    offenders: {offenders}")

    print(f"\nDead Surface Removal: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    main()
    sys.exit(1 if FAIL else 0)
