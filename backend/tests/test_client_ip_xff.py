"""cache_backend.client_ip is spoof-safe (546f775 follow-up audit P1).

X-Forwarded-For is client-supplied. The old helper trusted XFF[0]
unconditionally, letting an attacker rotate a fake XFF to mint a fresh
rate-limit bucket per request — defeating every per-IP brute-force lock
(gallery unlock, RSVP enumeration). Policy is env TRUSTED_PROXY_COUNT.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

import importlib
import cache_backend


class _Req:
    def __init__(self, peer, xff=None):
        self.client = type("C", (), {"host": peer})()
        self.headers = {"x-forwarded-for": xff} if xff else {}


def _reload(proxy_count):
    if proxy_count is None:
        os.environ.pop("TRUSTED_PROXY_COUNT", None)
    else:
        os.environ["TRUSTED_PROXY_COUNT"] = str(proxy_count)
    importlib.reload(cache_backend)


def test_default_ignores_xff_uses_peer():
    _reload(None)  # default 0
    # attacker sends a forged XFF; must be ignored, real TCP peer used
    assert cache_backend.client_ip(_Req("203.0.113.9", xff="1.2.3.4")) == "203.0.113.9"


def test_zero_proxy_count_ignores_xff():
    _reload(0)
    assert cache_backend.client_ip(_Req("10.0.0.1", xff="9.9.9.9, 8.8.8.8")) == "10.0.0.1"


def test_one_trusted_proxy_takes_last_hop():
    _reload(1)
    # behind a single proxy: XFF = "<real client>, <what proxy could not strip>"?
    # the proxy appends the peer it saw as the LAST entry → n-from-right = last
    assert cache_backend.client_ip(_Req("10.0.0.1", xff="forged, realclient")) == "realclient"


def test_one_trusted_proxy_no_xff_falls_back_to_peer():
    _reload(1)
    assert cache_backend.client_ip(_Req("10.0.0.1")) == "10.0.0.1"


def test_no_client_returns_unknown():
    _reload(0)
    r = _Req("x")
    r.client = None
    assert cache_backend.client_ip(r) == "unknown"


def teardown_module(_m):
    _reload(None)
