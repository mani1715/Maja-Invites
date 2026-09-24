"""S3 Transfer Acceleration presign wiring — offline, no live server needed.

Presigned-URL generation is a local signing operation (no network, no real
bucket), so this asserts the host the browser will PUT to under each switch
state without touching AWS. Guards the safe-rollout contract:
  * accelerate opt-in but master switch OFF  -> regional endpoint (safe to ship
    before the bucket toggle exists)
  * accelerate opt-in AND master switch ON    -> s3-accelerate endpoint
  * no opt-in, master switch ON               -> regional (other buckets stay put)
"""
import importlib
import os


def _fresh_aws_service(monkeypatch, accelerate: str):
    # Dummy creds so botocore will sign a presign offline; region + event bucket
    # so the URL host is well-formed. reload() resets the client singletons.
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAAAAAAAAAAAAAAAAA")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "a" * 40)
    monkeypatch.delenv("AWS_SESSION_TOKEN", raising=False)
    monkeypatch.setenv("AWS_REGION", "us-east-2")
    monkeypatch.setenv("AWS_S3_BUCKET", "")
    monkeypatch.setenv("AWS_S3_EVENT_BUCKET", "maja-event-media-2026")
    monkeypatch.setenv("AWS_S3_ACCELERATE", accelerate)
    import aws_service
    return importlib.reload(aws_service)


def test_accelerate_off_stays_regional(monkeypatch):
    aws = _fresh_aws_service(monkeypatch, accelerate="false")
    url = aws.generate_presigned_put("k/x.jpg", "image/jpeg", accelerate=True)
    assert "s3-accelerate" not in url, url
    assert "maja-event-media-2026" in url, url


def test_accelerate_on_uses_edge(monkeypatch):
    aws = _fresh_aws_service(monkeypatch, accelerate="true")
    url = aws.generate_presigned_put("k/x.jpg", "image/jpeg", accelerate=True)
    assert "s3-accelerate.amazonaws.com" in url, url


def test_non_optin_never_accelerates(monkeypatch):
    # A caller that did not opt in (media sessions, other buckets) stays regional
    # even with the master switch on — the accelerate endpoint would error there.
    aws = _fresh_aws_service(monkeypatch, accelerate="true")
    url = aws.generate_presigned_put("k/x.jpg", "image/jpeg", accelerate=False)
    assert "s3-accelerate" not in url, url


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    class _MP:
        def __init__(self): self._saved = {}
        def setenv(self, k, v): self._saved.setdefault(k, os.environ.get(k)); os.environ[k] = v
        def delenv(self, k, raising=True): self._saved.setdefault(k, os.environ.get(k)); os.environ.pop(k, None)
    mp = _MP()
    test_accelerate_off_stays_regional(mp)
    test_accelerate_on_uses_edge(mp)
    test_non_optin_never_accelerates(mp)
    print("ok: accelerate off->regional, on->edge, non-optin->regional")
