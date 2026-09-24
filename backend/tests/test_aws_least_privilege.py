"""The runtime identity must stay least-privilege, and the smoke test must not
push it the other way.

The forcing function for this file: a live smoke-test run against the real
account came back with five red checks — GetBucketLocation,
GetEncryptionConfiguration, GetBucketPublicAccessBlock, GetBucketCORS and
rekognition:ListCollections. The tempting fix is to add those to
MAJA-Backend-S3-Rekognition so the script prints green. That would hand the
application's credentials the ability to read the configuration of every
bucket and enumerate every Rekognition collection in account 655671523450 —
permissions the application never exercises at runtime.

So the architecture, pinned here:

  * bucket-CONFIGURATION reads are AUDIT checks. They run under a separate
    profile (AWS_SMOKE_AUDIT_PROFILE) or report SKIP-AUDIT. They may never
    turn into a runtime FAIL.
  * Rekognition liveness uses DescribeCollection on one id, never
    ListCollections over the account.
  * the audit credentials may never be used for a runtime operation.

No network, no credentials, no DB.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

SMOKE_PATH = REPO / "scripts" / "aws_smoke_test.py"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# The real aws_service, loaded privately: other suites install a permissive
# stub whose every attribute is a no-op, and leaving the real boto3-backed
# module in sys.modules would turn their calls into genuine AWS requests.
_saved = sys.modules.get("aws_service")
aws_service = _load(BACKEND / "aws_service.py", "_real_aws_service_lp")
sys.modules["aws_service"] = aws_service
try:
    smoke = _load(SMOKE_PATH, "_smoke_under_test")
finally:
    if _saved is not None:
        sys.modules["aws_service"] = _saved
    else:
        sys.modules.pop("aws_service", None)

SMOKE_SRC = SMOKE_PATH.read_text(encoding="utf-8")
AWS_SERVICE_SRC = (BACKEND / "aws_service.py").read_text(encoding="utf-8")


# --------------------------------------------------------------------------- #
# Rekognition without ListCollections
# --------------------------------------------------------------------------- #
class TestNoListCollections:
    def test_backend_never_enumerates_collections(self):
        """rekognition:ListCollections reads every collection name in the
        account. The backend has no use for that; DescribeCollection answers
        the only question it actually asks."""
        # Only REKOGNITION enumeration counts here. pixora_service.py has an
        # unrelated `list_collections` for user-saved-post collections held in
        # this application's own database — nothing to do with AWS.
        rek_enum = re.compile(r"rekognition\(\)\.list_collections"
                              r"|rekognition\.list_collections"
                              r"|CollectionIds")
        offenders = []
        candidates = list(BACKEND.glob("*.py")) + list((BACKEND / "face_providers").glob("*.py"))
        for py in candidates:
            src = py.read_text(encoding="utf-8", errors="ignore")
            if rek_enum.search(src):
                offenders.append(py.name)
        assert not offenders, f"rekognition:ListCollections still called in: {offenders}"

    def test_smoke_test_does_not_call_list_collections(self):
        assert "list_collections" not in SMOKE_SRC

    def test_healthcheck_probes_with_describe_collection(self):
        assert "describe_face_collection(HEALTH_PROBE_COLLECTION)" in AWS_SERVICE_SRC
        assert aws_service.HEALTH_PROBE_COLLECTION.startswith("maja_healthprobe")

    def test_describe_collection_separates_missing_from_denied(self, monkeypatch):
        """'not created yet' and 'not allowed to look' must never be conflated —
        one is normal, the other is a policy bug."""
        from botocore.exceptions import ClientError

        class _NotFound(Exception):
            pass

        class _Rek:
            exceptions = type("E", (), {"ResourceNotFoundException": _NotFound})

            def __init__(self, behaviour):
                self.behaviour = behaviour

            def describe_collection(self, CollectionId):
                if self.behaviour == "missing":
                    raise _NotFound()
                if self.behaviour == "denied":
                    raise ClientError(
                        {"Error": {"Code": "AccessDeniedException", "Message": "no"}},
                        "DescribeCollection")
                return {"FaceCount": 7, "CreationTimestamp": "2026-01-01"}

        for behaviour, expect_exists, expect_error in (
            ("ok", True, None), ("missing", False, None), ("denied", False, "AccessDeniedException"),
        ):
            monkeypatch.setattr(aws_service, "rekognition", lambda b=behaviour: _Rek(b))
            out = aws_service.describe_face_collection("maja_wedding_x")
            assert out["exists"] is expect_exists, behaviour
            assert out["error"] == expect_error, behaviour

    def test_collection_id_matches_the_application_derivation(self):
        """The smoke test must check the id the app actually uses."""
        pid = "abc-123_XY.z"
        expected = "maja_wedding_" + re.sub(r"[^a-zA-Z0-9_.\-]", "_", pid)
        assert smoke.app_collection_id(pid) == expected

    def test_runtime_rekognition_actions_are_the_documented_six(self):
        """CreateCollection / DescribeCollection / IndexFaces /
        SearchFacesByImage / DeleteFaces / DeleteCollection — and nothing
        broader."""
        for action in ("CreateCollection", "DescribeCollection", "IndexFaces",
                       "SearchFacesByImage", "DeleteFaces", "DeleteCollection"):
            assert action in SMOKE_SRC, f"{action} not exercised by the smoke test"


# --------------------------------------------------------------------------- #
# Audit vs runtime separation
# --------------------------------------------------------------------------- #
class TestAuditSeparation:
    @pytest.fixture(autouse=True)
    def _reset(self):
        smoke._audit_s3[0] = None
        smoke.results.clear()
        smoke._failed[0] = False
        yield
        smoke._audit_s3[0] = None
        smoke.results.clear()
        smoke._failed[0] = False

    def test_no_audit_profile_yields_no_client(self, monkeypatch):
        monkeypatch.delenv(smoke.AUDIT_PROFILE_VAR, raising=False)
        assert smoke.audit_s3() is None

    def test_missing_audit_profile_skips_never_fails(self, monkeypatch):
        """A missing OPTIONAL audit credential must not fail the run."""
        monkeypatch.delenv(smoke.AUDIT_PROFILE_VAR, raising=False)
        smoke.a1_bucket_config({"portfolio": "maja-portfolio-media-2026",
                                "event": "maja-event-media-2026",
                                "invitation": "maja-invitations-media-2026",
                                "face": "maja-face-private-2026"})
        statuses = {r[3] for r in smoke.results}
        assert statuses == {smoke.SKIP_AUDIT}, statuses
        assert smoke._failed[0] is False, "a skipped audit must never set the failure flag"
        assert all(r[0] == "AUDIT" for r in smoke.results)

    def test_audit_profile_is_used_when_configured(self, monkeypatch):
        built = {}

        class _Session:
            def __init__(self, profile_name=None):
                built["profile"] = profile_name

            def client(self, name, region_name=None):
                built["client"] = (name, region_name)
                return "AUDIT_CLIENT"

        monkeypatch.setenv(smoke.AUDIT_PROFILE_VAR, "maja-audit")
        monkeypatch.setattr(smoke.boto3, "Session", _Session)
        assert smoke.audit_s3() == "AUDIT_CLIENT"
        assert built["profile"] == "maja-audit"
        assert built["client"][0] == "s3"

    def test_unusable_audit_profile_degrades_to_skip(self, monkeypatch):
        from botocore.exceptions import ProfileNotFound

        def _boom(profile_name=None):
            raise ProfileNotFound(profile=profile_name)

        monkeypatch.setenv(smoke.AUDIT_PROFILE_VAR, "does-not-exist")
        monkeypatch.setattr(smoke.boto3, "Session", _boom)
        assert smoke.audit_s3() is None
        smoke.a1_bucket_config({"event": "maja-event-media-2026"})
        assert smoke._failed[0] is False
        assert {r[3] for r in smoke.results} == {smoke.SKIP_AUDIT}

    def test_runtime_checks_never_touch_the_audit_client(self):
        """Structural: the runtime lanes must not reference audit_s3(), or a
        green runtime result could be proving admin credentials work rather
        than the application's own."""
        for fn in ("def r3_bucket_access", "def r5_write", "def r6_rekognition"):
            start = SMOKE_SRC.index(fn)
            nxt = SMOKE_SRC.find("\ndef ", start + 1)
            body = SMOKE_SRC[start:nxt if nxt != -1 else len(SMOKE_SRC)]
            assert "audit_s3" not in body, f"{fn} references the audit client"

    def test_audit_lane_is_the_only_caller_of_config_reads(self):
        """The four configuration-read APIs must appear only in the audit lane."""
        start = SMOKE_SRC.index("def a1_bucket_config")
        audit_body = SMOKE_SRC[start:]
        head = SMOKE_SRC[:start]
        for api in ("get_bucket_location", "get_bucket_encryption",
                    "get_public_access_block", "get_bucket_cors"):
            assert api in audit_body, f"{api} missing from the audit lane"
            # not used anywhere before the audit lane (i.e. in a runtime step)
            assert api not in head, f"{api} used outside the audit lane"

    def test_backend_runtime_code_never_reads_bucket_configuration(self):
        """These are the exact four permissions we refuse to grant the runtime
        role — the application must therefore never call them."""
        banned = ("get_bucket_location", "get_bucket_encryption",
                  "get_public_access_block", "get_bucket_cors")
        offenders = []
        for py in BACKEND.glob("*.py"):
            src = py.read_text(encoding="utf-8", errors="ignore")
            for api in banned:
                if api in src:
                    offenders.append(f"{py.name}:{api}")
        assert not offenders, f"runtime code reads bucket configuration: {offenders}"


# --------------------------------------------------------------------------- #
# Write-path safety
# --------------------------------------------------------------------------- #
class TestWriteSafety:
    def test_guard_allows_keys_inside_the_run_prefix(self):
        prefix = "_smoketest/deadbeef/"
        assert smoke.guard_prefix(prefix + "a.txt", prefix) == prefix + "a.txt"

    @pytest.mark.parametrize("key", [
        "photographer/P1/event/E1/photos/real-customer-photo.jpg",
        "_smoketest/OTHERRUN/a.txt",
        "",
        "../_smoketest/deadbeef/a.txt",
    ])
    def test_guard_refuses_anything_outside_the_run_prefix(self, key):
        """Production media must be unreachable from this script even if a
        later edit introduces a bug in the key bookkeeping."""
        with pytest.raises(AssertionError):
            smoke.guard_prefix(key, "_smoketest/deadbeef/")

    @pytest.mark.parametrize("prefix", ["", "prod/", "/", "smoketest/"])
    def test_guard_refuses_a_non_smoketest_prefix(self, prefix):
        with pytest.raises(AssertionError):
            smoke.guard_prefix(prefix + "a.txt", prefix)

    def test_write_path_routes_every_destructive_call_through_the_guard(self):
        start = SMOKE_SRC.index("def r5_write")
        nxt = SMOKE_SRC.find("\ndef ", start + 1)
        body = SMOKE_SRC[start:nxt]
        for call in ("delete_object(", "abort_multipart_upload("):
            for line in body.splitlines():
                if call in line and "aws_service." in line:
                    assert "guarded(" in line, f"unguarded destructive call: {line.strip()}"

    def test_bucket_safety_rail_is_present(self):
        assert 'endswith("-2026")' in SMOKE_SRC

    def test_cleanup_aborts_uploads_before_deleting_objects(self):
        """An incomplete multipart upload is invisible to an object listing and
        keeps costing money, so it must be aborted even when the run failed
        partway."""
        start = SMOKE_SRC.index("    def cleanup():")
        # cleanup() ends where the write steps begin — the `try:` at column 4.
        body = SMOKE_SRC[start:SMOKE_SRC.index("\n    try:\n", start)]
        assert "abort_multipart_upload" in body
        assert body.index("abort_multipart_upload") < body.index("delete_object")
        assert "open_uploads" in body

    def test_cleanup_runs_even_when_the_write_steps_raise(self):
        start = SMOKE_SRC.index("def r5_write")
        body = SMOKE_SRC[start:SMOKE_SRC.find("\ndef ", start + 1)]
        assert "finally:" in body and "cleanup()" in body.split("finally:")[1]


# --------------------------------------------------------------------------- #
# Status vocabulary + secret hygiene
# --------------------------------------------------------------------------- #
class TestReportingContract:
    @pytest.fixture(autouse=True)
    def _reset(self):
        smoke.results.clear()
        smoke._failed[0] = False
        yield
        smoke.results.clear()
        smoke._failed[0] = False

    def test_the_four_required_statuses_exist(self):
        assert (smoke.PASS, smoke.FAIL, smoke.SKIP_AUDIT, smoke.SKIP_NEW) == \
            ("PASS", "FAIL", "SKIP-AUDIT", "SKIP-NOT-CREATED")

    @pytest.mark.parametrize("status", ["PASS", "WARN", "SKIP", "SKIP-AUDIT", "SKIP-NOT-CREATED"])
    def test_only_fail_sets_the_failure_flag(self, status):
        smoke.report("RUNTIME", "x", "y", status)
        assert smoke._failed[0] is False

    def test_fail_sets_the_failure_flag(self):
        smoke.report("RUNTIME", "x", "y", "FAIL")
        assert smoke._failed[0] is True

    def test_no_secret_env_var_is_ever_printed(self):
        """Bucket names and account ids are public infrastructure identifiers;
        key material is not. The script may read credentials but must never
        emit them."""
        for line in SMOKE_SRC.splitlines():
            if "print(" not in line and "detail" not in line:
                continue
            for secret in ("AWS_SECRET_ACCESS_KEY", "aws_secret_access_key",
                           "SecretAccessKey", "SessionToken"):
                assert secret not in line, f"possible secret in output: {line.strip()}"

    def test_credential_source_never_returns_key_material(self, monkeypatch):
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "EXAMPLE-NOT-A-REAL-KEY")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "super-secret-value-not-real")
        aws_service._creds_available = None
        src = aws_service.credential_source()
        assert src == "env"
        assert "super-secret-value-not-real" not in src
        aws_service._creds_available = None


# --------------------------------------------------------------------------- #
# The runtime permission matrix the policy is written against
# --------------------------------------------------------------------------- #
class TestRuntimePermissionMatrix:
    """Every S3 API the application actually calls, and the IAM action it
    needs. If a new call appears in the backend that is not in this table,
    this test fails and the policy must be revisited deliberately."""

    OBJECT_LEVEL = {
        "put_object": "s3:PutObject",
        "get_object": "s3:GetObject",
        "head_object": "s3:GetObject",
        "copy_object": "s3:GetObject+s3:PutObject",
        "delete_object": "s3:DeleteObject",
        "delete_objects": "s3:DeleteObject",
        "create_multipart_upload": "s3:PutObject",
        "complete_multipart_upload": "s3:PutObject",
        "abort_multipart_upload": "s3:AbortMultipartUpload",
        "list_parts": "s3:ListMultipartUploadParts",
        "generate_presigned_url": "s3:GetObject|s3:PutObject",
        "generate_presigned_post": "s3:PutObject",
    }
    BUCKET_LEVEL = {
        "head_bucket": "s3:ListBucket",
        "list_objects_v2": "s3:ListBucket",
        "list_multipart_uploads": "s3:ListBucketMultipartUploads",
    }

    RUNTIME_MODULES = ("aws_service.py", "storage_upload.py", "gallery_features.py",
                       "media_reconcile.py", "upload_sessions_service.py", "media_storage.py")

    def _calls(self):
        found = set()
        pattern = re.compile(r"s3\(\)\.([a-z_]+)|\.(generate_presigned_(?:url|post))\(")
        for name in self.RUNTIME_MODULES:
            src = (BACKEND / name).read_text(encoding="utf-8", errors="ignore")
            for m in pattern.finditer(src):
                found.add(m.group(1) or m.group(2))
            if "get_paginator" in src:
                for pg in re.findall(r'get_paginator\(\s*["\']([a-z_]+)["\']', src):
                    found.add(pg)
        return found

    def test_every_s3_call_has_a_documented_iam_action(self):
        known = set(self.OBJECT_LEVEL) | set(self.BUCKET_LEVEL) | {"get_paginator", "exceptions"}
        undocumented = self._calls() - known
        assert not undocumented, (
            f"S3 calls with no entry in the runtime permission matrix: "
            f"{sorted(undocumented)} — add them to docs/AWS_CONNECTION.md and to this "
            f"table, or remove the call")

    def test_matrix_has_no_configuration_read_actions(self):
        all_actions = " ".join(self.OBJECT_LEVEL.values()) + " " + " ".join(self.BUCKET_LEVEL.values())
        for banned in ("GetBucketLocation", "GetEncryptionConfiguration",
                       "GetBucketPublicAccessBlock", "GetBucketCORS"):
            assert banned not in all_actions

    def test_multipart_actions_are_exactly_what_the_code_uses(self):
        calls = self._calls()
        for required in ("create_multipart_upload", "complete_multipart_upload",
                         "abort_multipart_upload", "list_parts"):
            assert required in calls, f"{required} not found in runtime modules"
