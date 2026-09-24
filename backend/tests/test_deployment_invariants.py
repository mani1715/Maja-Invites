"""
Deployment invariants that a compose or script edit could silently break.

Postgres and Redis being unreachable from the internet is a property of one
line in a YAML file. Nothing else in this tree checks it, so a well-meaning
`ports:` added while debugging would ship.

Static checks — they do not prove a deploy works, only that its configuration
still says what it is supposed to say.
"""
from __future__ import annotations

import re
import stat
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
COMPOSE = ROOT / "deploy" / "docker-compose.yml"
# The single canonical deploy script — all logic lives here now.
SCRIPT = ROOT / "deploy" / "deploy.sh"
# Thin exec wrappers around SCRIPT; kept for compatibility with existing
# bookmarks and runbooks. Must contain no stage logic of their own.
SHIMS = (ROOT / "deploy.sh", ROOT / "deployed.out")

pytestmark = pytest.mark.skipif(not COMPOSE.exists(), reason="deploy/ not in this checkout")


def _compose() -> str:
    return COMPOSE.read_text(encoding="utf-8")


# --------------------------------------------------------------------------- #
# Network surface
# --------------------------------------------------------------------------- #
def test_only_the_reverse_proxy_publishes_ports():
    """`expose:` is container-network only; `ports:` publishes to the host and
    therefore to the internet. Exactly one service may use `ports:`."""
    text = _compose()
    # crude but sufficient: walk top-level service blocks
    services = {}
    current = None
    for line in text.splitlines():
        m = re.match(r"^  ([a-z0-9_-]+):\s*$", line)
        if m:
            current = m.group(1)
            services[current] = []
        elif current and line.startswith("    "):
            services[current].append(line)

    publishing = [name for name, body in services.items()
                  if any(re.match(r"^    ports:", ln) for ln in body)]
    assert publishing == ["caddy"], \
        f"only caddy may publish ports to the host, found: {publishing}"


def test_postgres_and_redis_are_not_published():
    text = _compose()
    for port in ("5432", "6379"):
        assert not re.search(rf'^\s+-\s+"?\d*:?{port}:{port}"?', text, re.M), \
            f"port {port} is published to the host"
    assert 'expose: ["5432"]' in text
    assert 'expose: ["6379"]' in text


def test_the_app_container_is_not_published_either():
    """Caddy proxies to core over the compose network; core must not be
    reachable directly, or every header Caddy sets can be bypassed."""
    assert 'expose: ["8200"]' in _compose()


def test_persistent_volumes_are_declared_and_not_bind_mounted_over():
    text = _compose()
    for vol in ("pgdata", "redisdata", "backupdata"):
        assert re.search(rf"^  {vol}:\s*$", text, re.M), f"{vol} volume missing"


# --------------------------------------------------------------------------- #
# The deploy script
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not SCRIPT.exists(), reason="deploy/deploy.sh missing")
def test_deploy_script_is_lf_and_starts_with_a_shebang():
    raw = SCRIPT.read_bytes()
    assert raw.startswith(b"#!"), "no shebang"
    assert b"\r\n" not in raw.split(b"\n", 1)[0], \
        "CRLF shebang — Linux reports 'bad interpreter: /usr/bin/env bash^M'"


@pytest.mark.skipif(not SCRIPT.exists(), reason="deploy/deploy.sh missing")
def test_deploy_script_fails_fast_and_never_sources_the_env_file():
    src = SCRIPT.read_text(encoding="utf-8")
    assert "set -Eeuo pipefail" in src, "the script does not fail fast"
    assert not re.search(r"^\s*(source|\.)\s+.*\.env", src, re.M), \
        "sourcing deploy/.env executes it and splatters secrets into the shell"
    assert "envval()" in src, "env values must be read, not sourced"


@pytest.mark.skipif(not SCRIPT.exists(), reason="deploy/deploy.sh missing")
def test_deploy_script_performs_no_destructive_operation():
    src = SCRIPT.read_text(encoding="utf-8")
    banned = [r"down\s+-v", r"--volumes", r"volume\s+rm", r"\brm\s+-rf\b",
              r"\bprune\b", r"reset\s+--hard", r"push\s+--force", r"\bDROP\s+(TABLE|DATABASE)"]
    for pat in banned:
        assert not re.search(pat, src), f"destructive operation in deploy/deploy.sh: {pat}"


@pytest.mark.skipif(not SCRIPT.exists(), reason="deploy/deploy.sh missing")
def test_deploy_script_never_prints_a_secret_value():
    """`envval` output may only be tested for emptiness or used for DOMAIN,
    which is a hostname. Any other use risks a credential in the deploy log."""
    src = SCRIPT.read_text(encoding="utf-8")
    for i, line in enumerate(src.splitlines(), 1):
        if "envval" not in line or "envval()" in line:
            continue
        ok = ("-n " in line or "-z " in line or "DOMAIN" in line
              or "MISSING+=" in line or line.strip().startswith("#"))
        assert ok, f"deploy/deploy.sh:{i} may print an env value: {line.strip()}"


@pytest.mark.skipif(not SCRIPT.exists(), reason="deploy/deploy.sh missing")
def test_review_mode_cannot_be_enabled_by_a_plain_compose_up():
    """Plain-HTTP-on-IP must stay opt-in. It lives in an overlay file that
    `docker compose up` alone never loads."""
    assert "docker-compose.review.yml" in SCRIPT.read_text(encoding="utf-8")
    assert (ROOT / "deploy" / "docker-compose.review.yml").exists()
    assert "docker-compose.review.yml" not in _compose(), \
        "the review overlay must not be referenced from the production compose file"


def test_cloudfront_is_not_a_deployment_dependency():
    """The AWS account cannot create a distribution. Nothing in the deploy path
    may require one."""
    for f in (COMPOSE, ROOT / "deploy" / "Caddyfile", SCRIPT):
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8")
        for line in text.splitlines():
            if "cloudfront" in line.lower():
                assert line.strip().startswith("#"), \
                    f"{f.name} references CloudFront outside a comment: {line.strip()[:80]}"


# --------------------------------------------------------------------------- #
# The two shims (root deploy.sh, deployed.out) — one canonical script only
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not all(s.exists() for s in SHIMS), reason="a shim file is missing")
def test_shims_exist_are_lf_shebang_and_exec_the_canonical_script():
    for shim in SHIMS:
        raw = shim.read_bytes()
        assert raw.startswith(b"#!"), f"{shim.name}: no shebang"
        assert b"\r\n" not in raw.split(b"\n", 1)[0], \
            f"{shim.name}: CRLF shebang — Linux reports 'bad interpreter: /usr/bin/env bash^M'"
        text = raw.decode("utf-8")
        assert "deploy/deploy.sh" in text, \
            f"{shim.name} does not forward to deploy/deploy.sh"
        assert re.search(r"\bexec\b", text), f"{shim.name} does not exec the canonical script"


@pytest.mark.skipif(not all(s.exists() for s in SHIMS), reason="a shim file is missing")
def test_shims_contain_no_stage_logic():
    """The shims are two-line forwarders, not a second place deploy logic can
    drift into. ~15 lines is generous headroom over the shebang/comment/
    set/exec shape they actually need."""
    for shim in SHIMS:
        lines = shim.read_text(encoding="utf-8").splitlines()
        assert len(lines) <= 15, \
            f"{shim.name} has {len(lines)} lines — looks like it grew stage logic of its own"


# --------------------------------------------------------------------------- #
# Subcommand interface
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not SCRIPT.exists(), reason="deploy/deploy.sh missing")
def test_deploy_script_handles_every_subcommand():
    src = SCRIPT.read_text(encoding="utf-8")
    for flag in ("--status", "--logs", "--rollback", "--deploy", "--check", "--review", "--help"):
        assert flag in src, f"deploy/deploy.sh does not handle {flag}"
