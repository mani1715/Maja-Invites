"""BodySizeLimitMiddleware enforces the cap with OR without Content-Length.

The old header-only check skipped every chunked (no Content-Length) body — an
unbounded-body bypass on every JSON route. This exercises the pure-ASGI
rewrite directly with crafted ASGI messages (no DB, no live stack).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import security_middleware  # noqa: E402

CAP = 1000
security_middleware.MAX_JSON_BODY_BYTES = CAP  # shrink the cap for the test


async def _run(headers, chunks):
    seen = {}

    async def app(scope, receive, send):
        body = b""
        while True:
            m = await receive()
            body += m.get("body", b"")
            if not m.get("more_body", False):
                break
        seen["body"] = body
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    mw = security_middleware.BodySizeLimitMiddleware(app)
    scope = {"type": "http", "method": "POST", "headers": headers}
    it = iter(chunks)

    async def receive():
        try:
            return next(it)
        except StopIteration:
            return {"type": "http.disconnect"}

    sent = []

    async def send(m):
        sent.append(m)

    await mw(scope, receive, send)
    status = next((m["status"] for m in sent if m["type"] == "http.response.start"), None)
    return status, seen.get("body")


def _chunks(total_bytes, n=3):
    per = total_bytes // n
    out = [{"type": "http.request", "body": b"x" * per, "more_body": True} for _ in range(n - 1)]
    out.append({"type": "http.request", "body": b"x" * (total_bytes - per * (n - 1)), "more_body": False})
    return out


def test_no_content_length_under_cap_passes_and_replays_full_body():
    status, body = asyncio.run(_run([], _chunks(CAP - 100)))
    assert status == 200
    assert len(body) == CAP - 100  # app saw the complete replayed body


def test_no_content_length_over_cap_is_rejected_413():
    status, body = asyncio.run(_run([], _chunks(CAP * 3)))
    assert status == 413
    assert body is None  # app never invoked


def test_content_length_over_cap_rejected_without_buffering():
    hdr = [(b"content-length", str(CAP * 5).encode())]
    status, _ = asyncio.run(_run(hdr, _chunks(CAP * 5)))
    assert status == 413


def test_content_length_under_cap_passes():
    payload = _chunks(CAP - 200)
    hdr = [(b"content-length", str(CAP - 200).encode())]
    status, body = asyncio.run(_run(hdr, payload))
    assert status == 200
    assert len(body) == CAP - 200


def test_multipart_is_exempt_even_when_large():
    hdr = [(b"content-type", b"multipart/form-data; boundary=xyz")]
    # 5x the cap, but multipart is streamed with its own per-endpoint caps
    status, body = asyncio.run(_run(hdr, _chunks(CAP * 5)))
    assert status == 200
    assert len(body) == CAP * 5


def test_get_passes_through():
    status, _ = asyncio.run(_run([], []))
    # method POST default above; verify GET explicitly bypasses
    seen = {}

    async def app(scope, receive, send):
        seen["hit"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    mw = security_middleware.BodySizeLimitMiddleware(app)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    sent = []

    async def send(m):
        sent.append(m)

    asyncio.run(mw({"type": "http", "method": "GET", "headers": []}, receive, send))
    assert seen.get("hit") is True
