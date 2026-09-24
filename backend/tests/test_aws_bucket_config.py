"""Four-bucket configuration + credential resolution.

These are the failure modes that make a live AWS deploy look "broken with no
error", so they are pinned here rather than discovered on the VM:

  * region silently defaulting to another region -> every S3 call fails with
    PermanentRedirect against buckets that live in us-east-2;
  * `AWS_ACCESS_KEY_ID=` (empty, a normal thing to leave in a .env) being
    handed to botocore as a real credential, which turns instance-role auth
    into SignatureDoesNotMatch;
  * is_configured() demanding env keys, so a VM using an instance role or a
    mounted profile reports AWS as "off" and quietly disables five feature
    paths;
  * the private face bucket falling back to a shared media bucket;
  * a category resolving to "" and producing requests against a bucket named
    "".

Pure config assertions — no network, no credentials, no DB.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"_real_{name}", BACKEND / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Load the REAL modules privately. Importing them normally would either pick up
# the permissive stub other suites install (making every assertion here
# meaningless) or, worse, leave the real boto3-backed module in sys.modules for
# suites that rely on the stub's no-ops — which would turn their calls into
# genuine AWS requests. So: swap the stub out only for the duration of the
# load, bind media_storage to the real aws_service, then put things back.
_saved = sys.modules.get("aws_service")
aws_service = _load("aws_service")
sys.modules["aws_service"] = aws_service
try:
    media_storage = _load("media_storage")
finally:
    if _saved is not None:
        sys.modules["aws_service"] = _saved
    else:
        sys.modules.pop("aws_service", None)

_ALL_BUCKET_ENV = [n for pair in media_storage.BUCKET_ENV.values() for n in pair] + [
    "AWS_S3_BUCKET", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
]


@pytest.fixture()
def clean_env(monkeypatch):
    for name in _ALL_BUCKET_ENV:
        monkeypatch.delenv(name, raising=False)
    media_storage._legacy_alias_warned.clear()
    aws_service._creds_available = None
    yield monkeypatch
    aws_service._creds_available = None


class TestRegion:
    def test_defaults_to_the_bucket_region(self, clean_env):
        assert aws_service.region() == "us-east-2"

    def test_env_overrides(self, clean_env):
        clean_env.setenv("AWS_REGION", "eu-west-1")
        assert aws_service.region() == "eu-west-1"

    def test_client_kwargs_carry_the_region(self, clean_env):
        assert aws_service._aws_kwargs()["region_name"] == "us-east-2"


class TestCredentialHandling:
    def test_empty_string_keys_are_not_passed_to_boto3(self, clean_env):
        """The bug this guards: `AWS_ACCESS_KEY_ID=` in a .env is not "unset"
        to os.environ — passing it on breaks the provider chain."""
        clean_env.setenv("AWS_ACCESS_KEY_ID", "")
        clean_env.setenv("AWS_SECRET_ACCESS_KEY", "")
        kwargs = aws_service._aws_kwargs()
        assert "aws_access_key_id" not in kwargs
        assert "aws_secret_access_key" not in kwargs

    def test_real_keys_are_passed(self, clean_env):
        clean_env.setenv("AWS_ACCESS_KEY_ID", "EXAMPLE-NOT-A-REAL-KEY")
        clean_env.setenv("AWS_SECRET_ACCESS_KEY", "not-a-real-secret-value")
        kwargs = aws_service._aws_kwargs()
        assert kwargs["aws_access_key_id"] == "EXAMPLE-NOT-A-REAL-KEY"

    def test_credential_source_reports_env_without_leaking(self, clean_env):
        clean_env.setenv("AWS_ACCESS_KEY_ID", "EXAMPLE-NOT-A-REAL-KEY")
        clean_env.setenv("AWS_SECRET_ACCESS_KEY", "not-a-real-secret-value")
        src = aws_service.credential_source()
        assert src == "env"
        assert "not-a-real-secret-value" not in src

    def test_is_configured_does_not_require_env_keys(self, clean_env, monkeypatch):
        """An instance role / mounted profile must count as configured."""
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "maja-event-media-2026")
        monkeypatch.setattr(aws_service, "credential_source", lambda: "iam-role")
        aws_service._creds_available = None
        assert aws_service.credentials_available() is True
        assert aws_service.is_configured() is True

    def test_is_configured_false_without_any_credentials(self, clean_env, monkeypatch):
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "maja-event-media-2026")
        monkeypatch.setattr(aws_service, "credential_source", lambda: "none")
        aws_service._creds_available = None
        assert aws_service.is_configured() is False


class TestBucketRouting:
    def test_canonical_name_wins_over_legacy_alias(self, clean_env):
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "canonical")
        clean_env.setenv("S3_BUCKET_EVENT", "legacy")
        assert media_storage.bucket_for("event") == "canonical"

    def test_legacy_alias_still_resolves(self, clean_env):
        clean_env.setenv("S3_BUCKET_PORTFOLIO", "legacy-portfolio")
        assert media_storage.bucket_for("portfolio") == "legacy-portfolio"

    @pytest.mark.parametrize("category", ["portfolio", "event", "invitation"])
    def test_shared_categories_fall_back_to_legacy_single_bucket(self, clean_env, category):
        clean_env.setenv("AWS_S3_BUCKET", "one-bucket-dev")
        assert media_storage.bucket_for(category) == "one-bucket-dev"

    def test_face_never_falls_back_to_a_shared_bucket(self, clean_env):
        """Private biometric data must not silently land in event media."""
        clean_env.setenv("AWS_S3_BUCKET", "one-bucket-dev")
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "maja-event-media-2026")
        assert media_storage.bucket_for("face") == ""

    def test_face_uses_its_own_bucket_when_set(self, clean_env):
        clean_env.setenv("AWS_S3_FACE_BUCKET", "maja-face-private-2026")
        assert media_storage.bucket_for("face") == "maja-face-private-2026"

    def test_legacy_bucket_resolves_to_event_not_empty_string(self, clean_env):
        """~14 pre-four-bucket modules call aws_service.bucket(); on a
        four-bucket deploy that used to be "", i.e. requests against a bucket
        literally named empty."""
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "maja-event-media-2026")
        assert aws_service.bucket() == "maja-event-media-2026"

    def test_explicit_legacy_bucket_still_wins_for_legacy_callers(self, clean_env):
        clean_env.setenv("AWS_S3_BUCKET", "explicit-legacy")
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "maja-event-media-2026")
        assert aws_service.bucket() == "explicit-legacy"

    def test_unknown_category_raises(self, clean_env):
        with pytest.raises(ValueError):
            media_storage.bucket_for("nope")

    def test_bucket_config_reports_every_category(self, clean_env):
        clean_env.setenv("AWS_S3_EVENT_BUCKET", "e")
        cfg = aws_service.bucket_config()
        assert set(cfg) == {"portfolio", "event", "invitation", "face"}
        assert cfg["event"] == "e" and cfg["portfolio"] == ""


class TestKeyRoutingStillCanonical:
    """The four-bucket key shapes the live smoke test asserts against."""

    def test_event_photo_key(self):
        k = media_storage.build_key("event", "image", "image/jpeg",
                                    photographer_id="P1", event_id="E1")
        assert k.startswith("photographer/P1/event/E1/photos/") and k.endswith(".jpg")

    def test_invitation_background_music_key(self):
        k = media_storage.build_key("invitation", "music", "audio/mpeg",
                                    photographer_id="P1", event_id="E1",
                                    invitation_id="I1")
        assert "/invitation/I1/background-music/" in k

    def test_face_selfie_key_is_session_scoped(self):
        assert media_storage.face_selfie_key("E1", "S1") == "event/E1/sessions/S1/selfie"

    def test_client_filenames_never_become_key_material(self):
        assert "/" not in media_storage.sanitize_filename("../../etc/passwd")
        k = media_storage.build_key("event", "image", "image/jpeg",
                                    photographer_id="P1", event_id="E1")
        assert ".." not in k
