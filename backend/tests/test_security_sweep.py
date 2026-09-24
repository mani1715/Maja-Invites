"""
Repo-wide security invariants, as a test rather than a one-off grep.

Every check here corresponds to a class of bug that a code review catches once
and then stops catching. Written to fail on the *introduction* of the pattern,
not on its presence today — all of these pass now.

Scope note: this is a static sweep. It cannot prove the absence of an injection
bug, only the absence of the shapes that produce one. Per-route authorization is
covered by `test_face_quota_api.py`, `test_idor_ownership_batch.py`,
`test_gallery_privacy_ownership.py` and `test_face_quota_e2e_live.py`.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"__pycache__", "tests", "node_modules"}


def _py_files():
    for p in BACKEND.rglob("*.py"):
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        yield p


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


# --------------------------------------------------------------------------- #
# SQL
# --------------------------------------------------------------------------- #
# The adapter is the ONLY module allowed to interpolate SQL, because it is the
# only one that validates identifiers first (_check_ident / _check_field).
_SQL_INTERP_ALLOWED = {"pg_adapter.py", "system_health.py"}
_SQL_CALL = re.compile(r"\b(?:execute|executemany|fetch|fetchrow|fetchval)\s*\(\s*(f[\"']|[\"'][^\"']*[\"']\s*[%+])")


def test_no_module_outside_the_adapter_interpolates_sql():
    """Parameterized queries are the defence; an f-string SQL literal in a
    feature module is how that defence gets bypassed one route at a time."""
    offenders = []
    for p in _py_files():
        if p.name in _SQL_INTERP_ALLOWED:
            continue
        for i, line in enumerate(_read(p).splitlines(), 1):
            if _SQL_CALL.search(line):
                offenders.append(f"{p.relative_to(BACKEND)}:{i}: {line.strip()[:100]}")
    assert not offenders, "interpolated SQL outside the adapter:\n" + "\n".join(offenders)


def test_the_adapter_validates_every_identifier_it_interpolates():
    src = _read(BACKEND / "pg_adapter.py")
    assert "_IDENT_RE = re.compile(r\"^[A-Za-z_][A-Za-z0-9_]*$\")" in src, \
        "the table/column identifier pattern changed — re-check it rejects quotes and semicolons"
    # the two interpolation helpers must each validate before building SQL
    field_sql = src[src.index("def _field_sql"):src.index("def _bind")]
    assert "_check_field(field)" in field_sql
    path_fn = src[src.index("def _path("):]
    assert "_check_field(dotted)" in path_fn[:400]


def test_system_health_interpolates_only_a_module_constant():
    """The one sanctioned exception outside the adapter. If it ever
    interpolates something request-derived, that is an injection."""
    src = _read(BACKEND / "system_health.py")
    assert "LONG_QUERY_SECONDS = 30" in src
    assert "{LONG_QUERY_SECONDS}" in src
    # nothing else may be interpolated into that statement
    stmt = src[src.index("SELECT\n"):src.index("pg_size_pretty")]
    assert set(re.findall(r"\{(\w+)\}", stmt)) == {"LONG_QUERY_SECONDS"}


# --------------------------------------------------------------------------- #
# Command execution / deserialization
# --------------------------------------------------------------------------- #
def test_no_shell_execution_in_the_request_path():
    bad = re.compile(r"\bos\.system\s*\(|shell\s*=\s*True|\bsubprocess\.(?:run|Popen|call|check_output)\b")
    offenders = [f"{p.relative_to(BACKEND)}" for p in _py_files() if bad.search(_read(p))]
    assert not offenders, f"shell execution reachable from the app: {offenders}"


def test_no_unsafe_deserialization():
    bad = re.compile(r"\bpickle\.loads?\s*\(|\byaml\.load\s*\((?!.*SafeLoader)|\bmarshal\.loads\s*\(")
    offenders = [f"{p.relative_to(BACKEND)}" for p in _py_files() if bad.search(_read(p))]
    assert not offenders, f"unsafe deserialization: {offenders}"


def test_no_eval_or_exec_on_dynamic_input():
    bad = re.compile(r"(?<![\w.])(?:eval|exec)\s*\(")
    offenders = []
    for p in _py_files():
        for i, line in enumerate(_read(p).splitlines(), 1):
            if bad.search(line) and "# noqa: eval-ok" not in line:
                offenders.append(f"{p.relative_to(BACKEND)}:{i}")
    assert not offenders, f"eval/exec present: {offenders}"


# --------------------------------------------------------------------------- #
# S3 keys — the client must never choose one
# --------------------------------------------------------------------------- #
def test_object_keys_are_server_derived_and_filenames_are_sanitised():
    ms = _read(BACKEND / "media_storage.py")
    assert "def build_key(" in ms, "the canonical key builder disappeared"
    assert "def sanitize_filename(" in ms
    # a client filename must never become key material verbatim
    fn = ms[ms.index("def sanitize_filename("):]
    fn = fn[:fn.index("\ndef ", 1)] if "\ndef " in fn[1:] else fn
    assert "/" in fn or "sub(" in fn, "sanitize_filename no longer strips path separators"


def test_gallery_commit_still_pins_the_key_to_the_owning_profile():
    """The traversal guard on commit-upload: a client-supplied s3_key is only
    accepted inside the prefix this server would have handed out."""
    src = _read(BACKEND / "gallery_features.py")
    assert 'if not body.s3_key.startswith(_staging_prefix(profile["id"])):' in src, \
        "the commit-upload key guard changed — a client could commit another profile's object"


def test_face_bucket_never_falls_back_to_a_shared_one():
    """Private biometric media must not land in event media if its bucket is
    unset. `bucket_for('face')` returns '' rather than a fallback."""
    ms = _read(BACKEND / "media_storage.py")
    body = ms[ms.index("def bucket_for("):]
    body = body[:body.index("\ndef ", 1)] if "\ndef " in body[1:] else body
    assert 'category == "face"' in body and 'return ""' in body


# --------------------------------------------------------------------------- #
# Rekognition — the browser never names a collection
# --------------------------------------------------------------------------- #
def test_collection_ids_are_derived_from_the_profile_not_supplied():
    src = _read(BACKEND / "gallery_features.py")
    assert "def _profile_collection_id(" in src
    # index and search both resolve the collection from stored config
    assert 'collection_id = gc.get("aws_collection_id")' in src, \
        "index_photo_job no longer derives the collection from the wedding's own config"


def test_rekognition_list_collections_stays_out_of_the_backend():
    """Enumerating every Rekognition collection in the AWS account is an
    infrastructure-audit action the app must never need; re-adding it would
    require widening the runtime IAM policy. `describe_face_collection` is the
    least-privilege replacement.

    Matched as a CALL, not as prose, and that took two tries. A bare
    `list_collections` grep hits `pixora_service.list_collections` — a route
    listing a photographer's saved post collections, nothing to do with AWS.
    Widening it to "rekognition near list_collections" then hit the two comments
    in aws_service.py that explain why the call is absent, i.e. the check
    flagged its own documentation. `.list_collections(` is the thing that
    actually consumes the IAM permission; prose cannot. A security check that
    cries wolf gets muted, which is worse than not having one.
    """
    pat = re.compile(r"\.\s*list_collections\s*\(")
    offenders = []
    for p in _py_files():
        for i, line in enumerate(_read(p).splitlines(), 1):
            if pat.search(line):
                offenders.append(f"{p.relative_to(BACKEND)}:{i}")
    assert not offenders, f"rekognition:ListCollections reintroduced at {offenders}"


# --------------------------------------------------------------------------- #
# Credentials
# --------------------------------------------------------------------------- #
def test_no_aws_secret_is_read_into_a_response_or_log():
    """`credential_source()` exists precisely so nothing has to touch the
    secret to report configuration state."""
    aws = _read(BACKEND / "aws_service.py")
    assert "def credential_source(" in aws
    for p in _py_files():
        src = _read(p)
        for i, line in enumerate(src.splitlines(), 1):
            if "AWS_SECRET_ACCESS_KEY" not in line:
                continue
            lowered = line.lower()
            assert not any(k in lowered for k in ("logger.", "print(", "return ")), \
                f"{p.relative_to(BACKEND)}:{i} moves the AWS secret into output"


def test_frontend_bundle_carries_no_aws_or_payment_secret():
    dist = BACKEND.parent / "frontend-v2" / "dist"
    if not dist.exists():
        pytest.skip("frontend not built")
    patterns = [re.compile(r"AKIA[0-9A-Z]{16}"),
                re.compile(r"aws_secret_access_key", re.I),
                re.compile(r"rzp_live_[A-Za-z0-9]{10,}")]
    for f in dist.rglob("*.js"):
        text = f.read_text(encoding="utf-8", errors="replace")
        for pat in patterns:
            assert not pat.search(text), f"{f.name} contains {pat.pattern}"
