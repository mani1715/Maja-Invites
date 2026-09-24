"""
test_request_id_logging.py -- request-id propagation into logs
(request_metrics.RequestMetricsMiddleware).

    cd backend && pytest tests/test_request_id_logging.py

Covers: the response always carries X-Request-Id; a valid client-supplied
id is echoed back rather than replaced; an oversized/garbage one is
replaced with a generated id; and get_request_id() (the ContextVar reader)
returns that same id from inside a handler.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from fastapi import FastAPI                 # noqa: E402
from fastapi.testclient import TestClient   # noqa: E402

import request_metrics as rm                 # noqa: E402


def _make_client():
    app = FastAPI()
    app.add_middleware(rm.RequestMetricsMiddleware)

    @app.get("/ping")
    def ping():
        return {"seen_by_handler": rm.get_request_id()}

    return TestClient(app)


def test_response_carries_request_id():
    client = _make_client()
    r = client.get("/ping")
    assert r.status_code == 200
    assert "X-Request-Id" in r.headers
    assert r.headers["X-Request-Id"]


def test_valid_supplied_request_id_is_echoed_back():
    client = _make_client()
    supplied = "client-supplied-id-123"
    r = client.get("/ping", headers={"X-Request-Id": supplied})
    assert r.headers["X-Request-Id"] == supplied


def test_oversized_or_garbage_request_id_is_replaced():
    client = _make_client()

    oversized = "a" * 65  # sanitizer caps at 64 chars
    r1 = client.get("/ping", headers={"X-Request-Id": oversized})
    assert r1.headers["X-Request-Id"] != oversized

    garbage = "not valid! has spaces/slashes"
    r2 = client.get("/ping", headers={"X-Request-Id": garbage})
    assert r2.headers["X-Request-Id"] != garbage


def test_contextvar_matches_response_header_inside_handler():
    client = _make_client()
    r = client.get("/ping")
    assert r.json()["seen_by_handler"] == r.headers["X-Request-Id"]

    # Outside any request, the getter falls back to "-".
    assert rm.get_request_id() == "-"


def test_sanitizer_accepts_uuid_hex_and_rejects_bad_input():
    assert rm._sanitize_request_id("abc123-DEF") == "abc123-DEF"
    assert rm._sanitize_request_id("a" * 64) == "a" * 64
    assert rm._sanitize_request_id("a" * 65) is None
    assert rm._sanitize_request_id("") is None
    assert rm._sanitize_request_id(None) is None
    assert rm._sanitize_request_id("has spaces") is None
    assert rm._sanitize_request_id("has/slash") is None
