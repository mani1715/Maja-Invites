"""test_face_providers.py -- FaceMatchProvider abstraction (Lane A1).
    cd backend && python -m tests.test_face_providers

Covers: factory default/unknown-env, ABC cannot be instantiated, SelfHosted
stub raises, RekognitionProvider delegates to aws_service with passthrough
args/returns (aws_service itself is monkeypatched -- no real AWS calls).
"""
from __future__ import annotations
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from botocore.exceptions import ClientError                 # noqa: E402
import aws_service                                           # noqa: E402
import face_providers as fp                                  # noqa: E402
from face_providers.base import FaceMatchProvider            # noqa: E402
from face_providers.rekognition import RekognitionProvider   # noqa: E402
from face_providers.self_hosted import SelfHostedProvider    # noqa: E402

PASS = 0; FAIL = []
def ok(l, c):
    global PASS
    if c: PASS += 1; print(f"  ok  {l}")
    else: FAIL.append(l); print(f"  FAIL  {l}")


# --- fake Rekognition client (only delete_faces isn't a plain aws_service delegate) ---
class _FakeExceptions:
    class ResourceNotFoundException(Exception):
        pass


class _FakeRekogClient:
    def __init__(self):
        self.exceptions = _FakeExceptions
        self.calls = []

    def delete_faces(self, CollectionId, FaceIds):
        self.calls.append((CollectionId, FaceIds))
        if CollectionId == "missing-collection":
            raise self.exceptions.ResourceNotFoundException("no such collection")
        if CollectionId == "boom":
            raise ClientError({"Error": {"Code": "Throttling", "Message": "slow down"}}, "DeleteFaces")
        return {"DeletedFaces": list(FaceIds)}


def main():
    # --- ABC cannot be instantiated ---
    try:
        FaceMatchProvider()
        ok("base class cannot be instantiated", False)
    except TypeError:
        ok("base class cannot be instantiated", True)

    # --- factory: default ---
    os.environ.pop("FACE_MATCH_PROVIDER", None)
    fp._instances.clear()
    prov = fp.get_face_provider()
    ok("factory defaults to RekognitionProvider", isinstance(prov, RekognitionProvider))
    ok("factory is a singleton per kind", fp.get_face_provider() is prov)

    # --- factory: unknown env ---
    os.environ["FACE_MATCH_PROVIDER"] = "carrier_pigeon"
    try:
        fp.get_face_provider()
        ok("unknown FACE_MATCH_PROVIDER raises", False)
    except ValueError as e:
        ok("unknown FACE_MATCH_PROVIDER raises", "carrier_pigeon" in str(e) and "rekognition" in str(e))
    os.environ.pop("FACE_MATCH_PROVIDER", None)

    # --- self-hosted stub ---
    sh = SelfHostedProvider()
    stub_calls = [
        lambda: sh.create_collection("c1"),
        lambda: sh.delete_collection("c1"),
        lambda: sh.index_photo_faces("c1", "k.jpg", "photo1"),
        lambda: sh.search_by_selfie("c1", b"bytes"),
        lambda: sh.delete_faces("c1", ["f1"]),
        lambda: sh.health_check(),
    ]
    all_raise = True
    for call in stub_calls:
        try:
            call()
            all_raise = False
        except NotImplementedError:
            pass
    ok("SelfHostedProvider raises NotImplementedError on every method", all_raise)

    # --- RekognitionProvider delegates: passthrough args + returns ---
    rp = RekognitionProvider()

    seen = {}
    def _fake_create(cid):
        seen["create"] = cid
        return {"created": True}
    aws_service.create_face_collection = _fake_create
    ok("create_collection delegates + returns passthrough",
       rp.create_collection("wedding-42") == {"created": True} and seen["create"] == "wedding-42")

    def _fake_delete_coll(cid):
        seen["delete"] = cid
        return True
    aws_service.delete_face_collection = _fake_delete_coll
    ok("delete_collection delegates + returns passthrough",
       rp.delete_collection("wedding-42") is True and seen["delete"] == "wedding-42")

    def _fake_index(collection_id, s3_key, external_image_id, max_faces=15):
        seen["index"] = (collection_id, s3_key, external_image_id, max_faces)
        return {"ok": True, "face_count": 1, "face_ids": ["f1"]}
    aws_service.index_photo_faces = _fake_index
    res = rp.index_photo_faces("wedding-42", "photos/a.jpg", "photo-1", max_faces=5)
    ok("index_photo_faces delegates all args incl. max_faces",
       res == {"ok": True, "face_count": 1, "face_ids": ["f1"]}
       and seen["index"] == ("wedding-42", "photos/a.jpg", "photo-1", 5))

    def _fake_search(collection_id, selfie_bytes, threshold=None, max_faces=100):
        seen["search"] = (collection_id, selfie_bytes, threshold, max_faces)
        return {"ok": True, "match_count": 1, "matches": [{"photo_id": "photo-1", "similarity": 99.0}]}
    aws_service.search_faces_by_selfie = _fake_search
    res = rp.search_by_selfie("wedding-42", b"selfie-bytes", threshold=85.0, max_faces=50)
    ok("search_by_selfie delegates all args incl. threshold/max_faces",
       res["matches"][0]["photo_id"] == "photo-1"
       and seen["search"] == ("wedding-42", b"selfie-bytes", 85.0, 50))

    aws_service.healthcheck = lambda: {"configured": True}
    ok("health_check delegates + returns passthrough", rp.health_check() == {"configured": True})

    # --- delete_faces: implemented directly (no aws_service wrapper exists) ---
    fake_client = _FakeRekogClient()
    aws_service.rekognition = lambda: fake_client

    ok("delete_faces empty list short-circuits (no client call)",
       rp.delete_faces("wedding-42", []) == {"ok": True, "deleted_count": 0} and fake_client.calls == [])

    ok("delete_faces success passes through CollectionId/FaceIds",
       rp.delete_faces("wedding-42", ["f1", "f2"]) == {"ok": True, "deleted_count": 2}
       and fake_client.calls[-1] == ("wedding-42", ["f1", "f2"]))

    res = rp.delete_faces("missing-collection", ["f1"])
    ok("delete_faces: ResourceNotFound -> ok False", res == {"ok": False, "error": "collection_not_found"})

    res = rp.delete_faces("boom", ["f1"])
    ok("delete_faces: ClientError -> ok False, error captured",
       res["ok"] is False and "error" in res)

    print(f"\nFace Providers: {PASS} checks, {len(FAIL)} failed")


if __name__ == "__main__":
    main()
    sys.exit(1 if FAIL else 0)
