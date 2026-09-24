"""Gallery multipart lane — route wiring, offline (no live server, no AWS).

build_gallery_router() only registers routes; it does not touch the db or S3,
so this catches path typos / missing decorators without the integration stack.
The behaviour (quota gate, key-ownership guard, ingest reuse) is exercised by
the live suite; this is the cheap structural guard that runs anywhere.
"""
import os

os.environ.setdefault("ALLOW_INSECURE_JWT", "1")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-real")

import gallery_features as gf  # noqa: E402


def test_multipart_routes_registered():
    def _admin():
        return "admin-id"

    router = gf.build_gallery_router(db=None, get_current_admin=_admin)
    have = {r.path for r in router.routes}
    want = [
        "/api/admin/profiles/{profile_id}/gallery/multipart/create",
        "/api/admin/profiles/{profile_id}/gallery/multipart/presign",
        "/api/admin/profiles/{profile_id}/gallery/multipart/complete",
        "/api/admin/profiles/{profile_id}/gallery/multipart/abort",
    ]
    for w in want:
        assert w in have, f"missing route {w}; have {sorted(p for p in have if 'multipart' in p)}"


def test_part_size_floors_at_s3_minimum():
    # S3 rejects parts < 5 MB (except the last), so the configured part size
    # must never drop below that floor however the env is set.
    assert gf.GALLERY_MULTIPART_PART_SIZE >= 5 * 1024 * 1024


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    test_multipart_routes_registered()
    test_part_size_floors_at_s3_minimum()
    print("ok: 4 multipart routes registered; part size >= 5MB floor")
