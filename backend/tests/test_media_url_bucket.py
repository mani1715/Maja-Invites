"""
storage_serve.media_url / _verify_media — bucket-aware signing (unit, no server).

Invitation media lives in a NON-default S3 bucket, so /api/media grew a signed
`b` (bucket) parameter. This proves:
  - default-bucket URLs are byte-for-byte backward compatible (old rows keep working),
  - a named-bucket URL round-trips and returns the bucket,
  - tampering with the signature, or swapping the bucket without re-signing, is rejected,
  - expiry is enforced.

Pure unit test — imports storage_serve directly, no live server, no AWS.
    PYTHONIOENCODING=utf-8 python -m pytest backend/tests/test_media_url_bucket.py -q
"""
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import time
from urllib.parse import urlparse, parse_qs

import pytest
from fastapi import HTTPException

import storage_serve as ss
from storage_serve import _b64


def _parts(url):
    q = parse_qs(urlparse(url).query)
    return (q.get("k", [""])[0], q.get("e", [""])[0],
            q.get("s", [""])[0], q.get("b", [""])[0])


def test_default_bucket_roundtrip():
    url = ss.media_url("weddings/p/photos/x.jpg")
    assert "&b=" not in url  # no bucket param for the default bucket
    k, e, s, b = _parts(url)
    key, bucket = ss._verify_media(k, e, s, b)
    assert key == "weddings/p/photos/x.jpg" and bucket == ""


def test_named_bucket_roundtrip():
    url = ss.media_url("photographer/a/event/e/invitation/i/images/x.webp",
                       bucket="maja-invitations-media-2026")
    k, e, s, b = _parts(url)
    assert b, "named-bucket URL must carry the b param"
    key, bucket = ss._verify_media(k, e, s, b)
    assert key.endswith("images/x.webp")
    assert bucket == "maja-invitations-media-2026"


def test_backward_compat_pre_bucket_url_still_verifies():
    # A token minted before buckets existed: k,e,s only, signed over key:exp.
    key = "weddings/p/photos/x.jpg"
    exp = int(time.time()) + 3600
    s = ss._sig(key, exp)  # no bucket -> historical signature
    rk, rb = ss._verify_media(_b64(key.encode()), str(exp), s)  # no b
    assert rk == key and rb == ""


def test_tampered_signature_rejected():
    k, e, s, b = _parts(ss.media_url("k/x.jpg"))
    with pytest.raises(HTTPException):
        ss._verify_media(k, e, "0" * 32, b)


def test_bucket_swap_without_resign_rejected():
    # Take a bucketed URL and point b at a different bucket without re-signing.
    k, e, s, b = _parts(ss.media_url("k/x.jpg", bucket="buckA"))
    with pytest.raises(HTTPException):
        ss._verify_media(k, e, s, _b64(b"buckB"))


def test_expired_rejected():
    k, e, s, b = _parts(ss.media_url("k/x.jpg", expiry_seconds=-10))
    with pytest.raises(HTTPException):
        ss._verify_media(k, e, s, b)


if __name__ == "__main__":
    for fn in (test_default_bucket_roundtrip, test_named_bucket_roundtrip,
               test_backward_compat_pre_bucket_url_still_verifies):
        fn()
    print("media_url bucket round-trip OK")
