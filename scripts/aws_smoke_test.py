"""
aws_smoke_test.py — live verification of the four-bucket AWS setup.

TWO CLASSES OF CHECK, deliberately kept apart
---------------------------------------------
RUNTIME checks use the application's own identity (`maja-backend`) and prove
the application can actually do its job: resolve buckets, read/write objects,
presign, run the multipart lifecycle, and use Rekognition. A runtime failure
is a real failure and exits non-zero.

AUDIT checks inspect bucket *configuration* — region, default encryption,
public-access block, CORS. These are infrastructure-review questions, not
things the application does at runtime, and answering them needs
`s3:GetBucketLocation`, `s3:GetEncryptionConfiguration`,
`s3:GetBucketPublicAccessBlock` and `s3:GetBucketCORS`. Granting those to the
runtime role just to make this script print green would widen the blast radius
of the application's credentials for no application benefit, so they are NOT
in MAJA-Backend-S3-Rekognition and this script does not ask the runtime
identity for them.

Instead, audit checks run under a SEPARATE profile:

    export AWS_SMOKE_AUDIT_PROFILE=maja-audit    # any profile with read-only
                                                 # bucket-configuration access
    python scripts/aws_smoke_test.py

With that profile set, audit checks execute and PASS/FAIL. Without it they
report SKIP-AUDIT and never affect the exit code. The audit session is used
ONLY for configuration reads — every runtime operation goes through
`aws_service`, i.e. the backend identity, always.

STATUSES
    PASS              check succeeded
    FAIL              real failure; exits 1
    WARN              audit finding worth fixing, not a failure
    SKIP              not requested (e.g. write steps without --write)
    SKIP-AUDIT        audit check, no AWS_SMOKE_AUDIT_PROFILE configured
    SKIP-NOT-CREATED  resource does not exist yet — not an error

USAGE
    python scripts/aws_smoke_test.py                  # read-only
    python scripts/aws_smoke_test.py --write          # + isolated write path
    python scripts/aws_smoke_test.py --profile-id ID  # check a real event's
                                                      # face collection

Exit codes: 0 = no failures, 1 = a real failure, 2 = no credentials on host.
"""
import argparse
import io
import os
import re
import sys
import uuid
from pathlib import Path

try:  # keep the em dashes readable on a default-codepage Windows console
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")  # same loading convention as backend/init_admin.py

import boto3  # noqa: E402
import requests  # noqa: E402
from botocore.exceptions import (  # noqa: E402
    ClientError, EndpointConnectionError, NoCredentialsError, ProfileNotFound,
)

import aws_service  # noqa: E402
import media_storage  # noqa: E402

EXPECTED_REGION = "us-east-2"
EXPECTED_ACCOUNT = "655671523450"
CATEGORIES = tuple(media_storage.BUCKET_ENV.keys())  # portfolio, event, invitation, face
AUDIT_PROFILE_VAR = "AWS_SMOKE_AUDIT_PROFILE"

# Permission-denied codes, which mean "this identity may not do that" rather
# than "the thing is broken". Distinguishing these is the whole point of
# splitting runtime from audit.
DENIED_CODES = {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation",
                "InvalidAccessKeyId", "SignatureDoesNotMatch", "AllAccessDisabled"}

PASS, FAIL, WARN = "PASS", "FAIL", "WARN"
SKIP, SKIP_AUDIT, SKIP_NEW = "SKIP", "SKIP-AUDIT", "SKIP-NOT-CREATED"

results = []          # (lane, step, name, status, detail)
_failed = [False]


def report(lane, step, name, status, detail=""):
    results.append((lane, step, name, status, detail))
    if status == FAIL:
        _failed[0] = True
    line = f"[{status:16}] {step} — {name}"
    if detail:
        line += f": {detail}"
    print(line)


def runtime(step, name, status, detail=""):
    report("RUNTIME", step, name, status, detail)


def audit(step, name, status, detail=""):
    report("AUDIT", step, name, status, detail)


def err_code(e):
    return (e.response or {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else ""


def guard_prefix(key, prefix):
    """Nothing outside the generated smoke-test prefix may EVER be touched.

    This is the last line of defence between a bug in this script and live
    customer media: every delete/abort routes through here, so a key that does
    not belong to THIS run raises instead of being removed.
    """
    if not prefix or not prefix.startswith("_smoketest/"):
        raise AssertionError(f"refusing to operate: prefix {prefix!r} is not a smoke-test prefix")
    if not key.startswith(prefix):
        raise AssertionError(f"refusing to touch {key!r}: outside {prefix}")
    return key


def die_no_credentials():
    print()
    print("=" * 72)
    print("no AWS credentials resolved — this machine cannot run the live test.")
    print("Run this script where the backend identity is available (the VM),")
    print(f"for account {EXPECTED_ACCOUNT} / region {EXPECTED_REGION}.")
    print("=" * 72)
    sys.exit(2)


# --------------------------------------------------------------------------- #
# Audit session — SEPARATE credentials, configuration reads ONLY.
# --------------------------------------------------------------------------- #
_audit_s3 = [None]      # cached client or the string "unavailable"


def audit_s3():
    """S3 client for CONFIGURATION reads only.

    Never used for object operations: runtime work must be proven under the
    application's own identity, or the test proves nothing about production.
    Returns None when no audit profile is configured.
    """
    if _audit_s3[0] is not None:
        return None if _audit_s3[0] == "unavailable" else _audit_s3[0]

    profile = (os.environ.get(AUDIT_PROFILE_VAR) or "").strip()
    if not profile:
        _audit_s3[0] = "unavailable"
        return None
    try:
        session = boto3.Session(profile_name=profile)
        client = session.client("s3", region_name=aws_service.region())
        _audit_s3[0] = client
        return client
    except (ProfileNotFound, NoCredentialsError) as e:
        print(f"[{WARN:16}] 0.audit — {AUDIT_PROFILE_VAR}={profile!r} unusable: "
              f"{type(e).__name__}; audit checks will SKIP-AUDIT")
        _audit_s3[0] = "unavailable"
        return None


def audit_skip_reason():
    return (f"no {AUDIT_PROFILE_VAR} configured — bucket-configuration reads are "
            f"an infrastructure-audit permission the runtime role deliberately "
            f"does not hold")


# --------------------------------------------------------------------------- #
# RUNTIME 1 — configuration resolution (offline)
# --------------------------------------------------------------------------- #
def source_var(category):
    """Which env var supplied the bucket name (display only)."""
    canonical, legacy = media_storage.BUCKET_ENV[category]
    if os.environ.get(canonical):
        return canonical
    if os.environ.get(legacy):
        return legacy
    if category != "face" and os.environ.get("AWS_S3_BUCKET"):
        return "AWS_S3_BUCKET"
    return None


def r1_config():
    step = "R1.config"
    region = aws_service.region()
    runtime(step, "region", PASS if region == EXPECTED_REGION else FAIL,
            region if region == EXPECTED_REGION else f"expected {EXPECTED_REGION}, got {region!r}")

    buckets = {}
    for cat in CATEGORIES:
        name = aws_service.bucket_for_category(cat)
        buckets[cat] = name
        if name:
            runtime(step, f"bucket[{cat}]", PASS, f"{name} (from {source_var(cat)})")
        else:
            runtime(step, f"bucket[{cat}]", FAIL, "no env var resolved a bucket name")

    src = aws_service.credential_source()
    runtime(step, "credential_source", PASS if src != "none" else FAIL, src)
    return buckets


# --------------------------------------------------------------------------- #
# RUNTIME 2 — identity (sts:GetCallerIdentity needs no IAM grant)
# --------------------------------------------------------------------------- #
def r2_identity():
    step = "R2.identity"
    try:
        sts = boto3.client("sts", **aws_service._aws_kwargs())
        ident = sts.get_caller_identity()
    except (NoCredentialsError, EndpointConnectionError) as e:
        runtime(step, "get_caller_identity", FAIL, f"{type(e).__name__}: {e}")
        return
    except ClientError as e:
        runtime(step, "get_caller_identity", FAIL, str(e)[:200])
        return

    account, arn = ident.get("Account"), ident.get("Arn", "")
    name = arn.rsplit("/", 1)[-1] if "/" in arn else arn.rsplit(":", 1)[-1]
    runtime(step, "get_caller_identity", PASS, f"Account={account} identity={name}")
    runtime(step, "account_match", PASS if account == EXPECTED_ACCOUNT else WARN,
            account if account == EXPECTED_ACCOUNT else
            f"running as {account}, expected {EXPECTED_ACCOUNT}")


# --------------------------------------------------------------------------- #
# RUNTIME 3 — the application's own bucket access (s3:ListBucket)
# --------------------------------------------------------------------------- #
def r3_bucket_access(buckets):
    step = "R3.bucket_access"
    s3 = aws_service.s3()
    for cat, name in buckets.items():
        if not name:
            runtime(step, cat, SKIP, "no bucket name resolved (see R1)")
            continue
        try:
            s3.head_bucket(Bucket=name)
            runtime(step, f"{cat}.head_bucket", PASS, name)
        except ClientError as e:
            code = err_code(e)
            runtime(step, f"{cat}.head_bucket", FAIL,
                    f"{code or str(e)[:120]} — the runtime role needs s3:ListBucket on {name}")


# --------------------------------------------------------------------------- #
# RUNTIME 4 — key routing + bucket isolation (offline, pure logic)
# --------------------------------------------------------------------------- #
def r4_key_routing(buckets):
    step = "R4.key_routing"
    pid, eid, iid, sid = "smoketest-pid", "smoketest-eid", "smoketest-iid", "smoketest-sid"
    checks = [
        ("portfolio", lambda: media_storage.build_key("portfolio", "image", "image/jpeg",
                                                      photographer_id=pid),
         f"photographer/{pid}/portfolio/images/"),
        ("event", lambda: media_storage.build_key("event", "image", "image/jpeg",
                                                  photographer_id=pid, event_id=eid),
         f"photographer/{pid}/event/{eid}/photos/"),
        ("invitation", lambda: media_storage.build_key("invitation", "image", "image/jpeg",
                                                       photographer_id=pid, event_id=eid,
                                                       invitation_id=iid),
         f"photographer/{pid}/event/{eid}/invitation/{iid}/images/"),
    ]
    for cat, build, expected_prefix in checks:
        try:
            key = build()
            runtime(step, f"{cat}.key_shape", PASS if key.startswith(expected_prefix) else FAIL,
                    key if key.startswith(expected_prefix) else
                    f"{key} does not start with {expected_prefix}")
            routed = media_storage.bucket_for(cat)
            runtime(step, f"{cat}.bucket_for", PASS if routed == buckets.get(cat) else FAIL,
                    routed if routed == buckets.get(cat) else
                    f"bucket_for={routed!r} != resolved {buckets.get(cat)!r}")
        except ValueError as e:
            runtime(step, f"{cat}.key_shape", FAIL, str(e))

    face_key = media_storage.face_selfie_key(eid, sid)
    expected = f"event/{eid}/sessions/{sid}/selfie"
    runtime(step, "face.key_shape", PASS if face_key == expected else FAIL, face_key)

    face_bucket = buckets.get("face")
    shared = {buckets.get("portfolio"), buckets.get("event"), buckets.get("invitation")}
    runtime(step, "face.bucket_isolated", PASS if face_bucket and face_bucket not in shared else FAIL,
            face_bucket or "face bucket must be set and distinct from the shared media buckets")


# --------------------------------------------------------------------------- #
# RUNTIME 5 — object + multipart lifecycle (--write)
# --------------------------------------------------------------------------- #
def r5_write(buckets):
    step = "R5.write"
    test_id = uuid.uuid4().hex
    prefix = f"_smoketest/{test_id}/"

    for cat, name in buckets.items():
        if name and not name.endswith("-2026"):
            runtime(step, "safety_rail", FAIL,
                    f"refusing to write — bucket {name!r} for {cat!r} does not end in -2026")
            return
    if not prefix.startswith("_smoketest/"):
        runtime(step, "safety_rail", FAIL, "refusing to write — prefix is not _smoketest/")
        return
    runtime(step, "safety_rail", PASS, f"buckets end in -2026, prefix={prefix}")

    event_bucket = buckets.get("event")
    if not event_bucket:
        runtime(step, "write", SKIP, "no event bucket resolved")
        return

    created_keys = []          # completed objects to delete
    open_uploads = []          # (key, upload_id) not yet completed/aborted

    def guarded(key):
        return guard_prefix(key, prefix)

    def cleanup():
        # Abort first: an incomplete multipart upload holds storage and is
        # invisible to a plain object listing.
        aborted = 0
        for key, upload_id in open_uploads:
            try:
                aws_service.abort_multipart_upload(guarded(key), upload_id,
                                                   bucket_name=event_bucket)
                aborted += 1
            except Exception as e:                      # tolerate partial failure
                runtime(step, "cleanup.abort", WARN, f"{key}: {type(e).__name__}")
        remaining = []
        for k in created_keys:
            try:
                aws_service.delete_object(guarded(k), bucket_name=event_bucket)
                if aws_service.head_object(k, bucket_name=event_bucket) is not None:
                    remaining.append(k)
            except Exception as e:
                remaining.append(f"{k} ({type(e).__name__})")
        runtime(step, "cleanup", PASS if not remaining else FAIL,
                f"{len(created_keys) - len(remaining)} object(s) removed, "
                f"{aborted} upload(s) aborted, {len(remaining)} remaining")

    try:
        key_a = prefix + "upload_bytes.txt"
        payload_a = f"maja-smoke-test-{test_id}".encode("utf-8")
        aws_service.upload_bytes(key_a, payload_a, "text/plain", bucket_name=event_bucket)
        created_keys.append(key_a)
        head = aws_service.head_object(key_a, bucket_name=event_bucket)
        runtime(step, "put_object+head_object", PASS if head and head["size"] == len(payload_a) else FAIL,
                f"{head['size']} bytes" if head else f"head={head}")

        signed_url = aws_service.generate_signed_url(key_a, expiry_seconds=300,
                                                     bucket_name=event_bucket)
        cf_domain = aws_service.cloudfront_domain()
        is_cloudfront = bool(cf_domain) and cf_domain in signed_url
        resp = requests.get(signed_url, timeout=15)
        runtime(step, "presigned_get.roundtrip",
                PASS if resp.status_code == 200 and resp.content == payload_a else FAIL,
                f"{resp.status_code}, bytes match" if resp.status_code == 200 else
                f"status={resp.status_code}")
        if is_cloudfront:
            runtime(step, "presigned_get.is_presigned", WARN,
                    "CloudFront-signed URL — X-Amz-Signature check not applicable")
        else:
            runtime(step, "presigned_get.is_presigned",
                    PASS if "X-Amz-Signature" in signed_url else FAIL,
                    "X-Amz-Signature present" if "X-Amz-Signature" in signed_url
                    else "no X-Amz-Signature in URL")

        unsigned = requests.get(signed_url.split("?", 1)[0], timeout=15)
        runtime(step, "unsigned_get.denied", PASS if unsigned.status_code in (401, 403) else FAIL,
                f"status={unsigned.status_code}" if unsigned.status_code in (401, 403)
                else f"expected 403/401, got {unsigned.status_code} — bucket may not be private")

        key_e = prefix + "presigned_put.txt"
        payload_e = f"maja-smoke-test-put-{test_id}".encode("utf-8")
        put_url = aws_service.generate_presigned_put(key_e, "text/plain", bucket_name=event_bucket)
        put_resp = requests.put(put_url, data=payload_e,
                                headers={"Content-Type": "text/plain"}, timeout=15)
        created_keys.append(key_e)
        head_e = aws_service.head_object(key_e, bucket_name=event_bucket)
        runtime(step, "presigned_put",
                PASS if put_resp.status_code in (200, 204) and head_e
                and head_e["size"] == len(payload_e) else FAIL,
                f"status={put_resp.status_code} size={head_e['size'] if head_e else None}")

        # multipart happy path — one 5 MiB part (S3 minimum non-final part)
        key_f = prefix + "multipart.bin"
        part_bytes = os.urandom(5 * 1024 * 1024)
        upload_id = aws_service.create_multipart_upload(key_f, "application/octet-stream",
                                                        bucket_name=event_bucket)
        open_uploads.append((key_f, upload_id))
        part_url = aws_service.presign_upload_part(key_f, upload_id, 1, bucket_name=event_bucket)
        part_resp = requests.put(part_url, data=part_bytes, timeout=120)
        etag = part_resp.headers.get("ETag", "").strip('"')
        parts = aws_service.list_uploaded_parts(key_f, upload_id, bucket_name=event_bucket)
        runtime(step, "multipart.create+upload_part+list_parts",
                PASS if part_resp.status_code == 200 and etag and len(parts) == 1 else FAIL,
                f"1 part, {parts[0]['size']} bytes" if parts else
                f"status={part_resp.status_code} parts={parts}")
        aws_service.complete_multipart_upload(key_f, upload_id,
                                              [{"part_number": 1, "etag": etag}],
                                              bucket_name=event_bucket)
        open_uploads.remove((key_f, upload_id))     # completed: nothing to abort
        created_keys.append(key_f)
        head_f = aws_service.head_object(key_f, bucket_name=event_bucket)
        runtime(step, "multipart.complete",
                PASS if head_f and head_f["size"] == len(part_bytes) else FAIL,
                f"{head_f['size']} bytes" if head_f else f"head={head_f}")

        # abort path + ListMultipartUploads (bucket-scoped, prefix-filtered)
        key_g = prefix + "multipart_abort.bin"
        upload_id_2 = aws_service.create_multipart_upload(key_g, "application/octet-stream",
                                                          bucket_name=event_bucket)
        open_uploads.append((key_g, upload_id_2))
        aws_service.abort_multipart_upload(guarded(key_g), upload_id_2, bucket_name=event_bucket)
        open_uploads.remove((key_g, upload_id_2))
        try:
            s3 = aws_service.s3()
            still = any(
                u["UploadId"] == upload_id_2
                for page in s3.get_paginator("list_multipart_uploads")
                                .paginate(Bucket=event_bucket, Prefix=key_g)
                for u in (page.get("Uploads") or [])
            )
            runtime(step, "multipart.abort+list_uploads", FAIL if still else PASS,
                    "upload still listed after abort" if still
                    else f"upload_id={upload_id_2[:8]}… gone")
        except ClientError as e:
            code = err_code(e)
            runtime(step, "multipart.abort+list_uploads", FAIL,
                    f"{code} — runtime role needs s3:ListBucketMultipartUploads on {event_bucket}")

    except (ClientError, requests.RequestException, AssertionError) as e:
        # Strip the query string before logging. This block wraps presigned S3
        # PUT/GET calls, and a requests exception embeds the failing URL — whose
        # SigV4 query carries X-Amz-Credential (and X-Amz-Security-Token under a
        # role). Splitting on '?' keeps the diagnostic host/path, drops the
        # short-lived credential material from the deploy log.
        msg = str(e).split("?", 1)[0]
        runtime(step, "write_steps", FAIL, f"{type(e).__name__}: {msg[:200]}")
    finally:
        cleanup()


# --------------------------------------------------------------------------- #
# RUNTIME 6 — Rekognition, WITHOUT ListCollections
# --------------------------------------------------------------------------- #
def app_collection_id(profile_id):
    """The exact id the application derives (gallery_features._profile_collection_id).

    Imported from the app when possible so this can never drift; the local
    fallback keeps the script usable if importing the module is not possible
    in a bare environment.
    """
    local = f"maja_wedding_{re.sub(r'[^a-zA-Z0-9_.-]', '_', profile_id)}"
    try:
        from gallery_features import _profile_collection_id
        app = _profile_collection_id(profile_id)
        if app != local:                       # app wins; flag the drift loudly
            report("RUNTIME", "R6.rekognition", "collection_id.derivation", WARN,
                   f"script derived {local!r}, app derives {app!r} — using the app's")
        return app
    except Exception:
        return local


def r6_rekognition(do_write, profile_id):
    step = "R6.rekognition"

    # Liveness + permission WITHOUT enumerating the account: describing an id
    # that cannot exist must answer ResourceNotFound, not AccessDenied.
    probe = aws_service.describe_face_collection(aws_service.HEALTH_PROBE_COLLECTION)
    if probe["error"] is None:
        runtime(step, "describe_collection.reachable", PASS,
                "DescribeCollection permitted (no ListCollections needed)")
    elif probe["error"] in DENIED_CODES:
        runtime(step, "describe_collection.reachable", FAIL,
                f"{probe['error']} — runtime role needs rekognition:DescribeCollection")
        return
    else:
        runtime(step, "describe_collection.reachable", FAIL, probe["error"])
        return

    # The real event's collection, if one was named.
    if profile_id:
        coll = app_collection_id(profile_id)
        info = aws_service.describe_face_collection(coll)
        if info["error"] in DENIED_CODES:
            runtime(step, "event_collection", FAIL, f"{coll}: {info['error']}")
        elif info["error"]:
            runtime(step, "event_collection", FAIL, f"{coll}: {info['error']}")
        elif info["exists"]:
            runtime(step, "event_collection", PASS, f"{coll}: {info['faces']} face(s) indexed")
        else:
            runtime(step, "event_collection", SKIP_NEW,
                    f"{coll} does not exist yet — the gallery has not been enabled for "
                    f"this event (this is not a permission problem)")
    else:
        runtime(step, "event_collection", SKIP,
                "pass --profile-id <wedding profile id> to check a real event's collection")

    if not do_write:
        runtime(step, "collection.lifecycle", SKIP, "pass --write to exercise create/index/search/delete")
        return

    # Full runtime permission cycle on a throwaway collection. A synthetic
    # image contains no face, so IndexFaces legitimately returns zero face
    # records and SearchFacesByImage legitimately raises InvalidParameter —
    # both prove the PERMISSION, which is what is under test here. Only
    # AccessDenied is a failure.
    coll = f"maja_smoketest_{uuid.uuid4().hex}"
    rek = aws_service.rekognition()
    created = False
    try:
        res = aws_service.create_face_collection(coll)
        created = bool(res.get("created"))
        runtime(step, "CreateCollection", PASS if created else FAIL, coll if created else str(res))
        if not created:
            return

        info = aws_service.describe_face_collection(coll)
        runtime(step, "DescribeCollection", PASS if info["exists"] else FAIL,
                f"{coll} exists, {info['faces']} face(s)" if info["exists"] else str(info))

        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), (127, 127, 127)).save(buf, format="JPEG")
        img = buf.getvalue()

        try:
            rek.index_faces(CollectionId=coll, Image={"Bytes": img},
                            ExternalImageId="smoketest", DetectionAttributes=["DEFAULT"],
                            QualityFilter="AUTO", MaxFaces=1)
            runtime(step, "IndexFaces", PASS, "permitted (0 faces in a synthetic image)")
        except ClientError as e:
            code = err_code(e)
            runtime(step, "IndexFaces", FAIL if code in DENIED_CODES else PASS,
                    f"{code} — runtime role needs rekognition:IndexFaces" if code in DENIED_CODES
                    else f"permitted (rejected on image content: {code})")

        try:
            rek.search_faces_by_image(CollectionId=coll, Image={"Bytes": img},
                                      MaxFaces=1, FaceMatchThreshold=90, QualityFilter="AUTO")
            runtime(step, "SearchFacesByImage", PASS, "permitted")
        except ClientError as e:
            code = err_code(e)
            runtime(step, "SearchFacesByImage", FAIL if code in DENIED_CODES else PASS,
                    f"{code} — runtime role needs rekognition:SearchFacesByImage"
                    if code in DENIED_CODES else f"permitted (rejected on image content: {code})")

        try:
            rek.delete_faces(CollectionId=coll,
                             FaceIds=["00000000-0000-0000-0000-000000000000"])
            runtime(step, "DeleteFaces", PASS, "permitted")
        except ClientError as e:
            code = err_code(e)
            runtime(step, "DeleteFaces", FAIL if code in DENIED_CODES else PASS,
                    f"{code} — runtime role needs rekognition:DeleteFaces" if code in DENIED_CODES
                    else f"permitted (rejected on face id: {code})")
    except ClientError as e:
        runtime(step, "collection.lifecycle", FAIL, f"{err_code(e)}: {str(e)[:160]}")
    finally:
        if created:
            ok = aws_service.delete_face_collection(coll)
            runtime(step, "DeleteCollection", PASS if ok else FAIL, coll)


# --------------------------------------------------------------------------- #
# AUDIT — bucket configuration (separate profile, never the runtime identity)
# --------------------------------------------------------------------------- #
def a1_bucket_config(buckets):
    step = "A1.bucket_config"
    s3 = audit_s3()
    if s3 is None:
        for cat, name in buckets.items():
            if name:
                audit(step, cat, SKIP_AUDIT, audit_skip_reason())
        return

    for cat, name in buckets.items():
        if not name:
            audit(step, cat, SKIP, "no bucket name resolved (see R1)")
            continue

        def denied(e, what):
            code = err_code(e)
            if code in DENIED_CODES:
                audit(step, f"{cat}.{what}", SKIP_AUDIT,
                      f"{AUDIT_PROFILE_VAR} lacks {code} for this call")
                return True
            return False

        try:
            loc = s3.get_bucket_location(Bucket=name).get("LocationConstraint")
            audit(step, f"{cat}.region", PASS if loc == EXPECTED_REGION else FAIL,
                  loc if loc == EXPECTED_REGION else f"expected {EXPECTED_REGION}, got {loc!r}")
        except ClientError as e:
            if not denied(e, "region"):
                audit(step, f"{cat}.region", FAIL, str(e)[:160])

        try:
            rules = (s3.get_bucket_encryption(Bucket=name)
                       .get("ServerSideEncryptionConfiguration", {}).get("Rules", []))
            algo = (rules[0].get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm")
                    if rules else None)
            audit(step, f"{cat}.encryption", PASS if algo == "AES256" else WARN,
                  algo or "no default encryption configured")
        except ClientError as e:
            if not denied(e, "encryption"):
                code = err_code(e)
                audit(step, f"{cat}.encryption",
                      WARN if code == "ServerSideEncryptionConfigurationNotFoundError" else FAIL,
                      "no default encryption configured" if code ==
                      "ServerSideEncryptionConfigurationNotFoundError" else str(e)[:160])

        try:
            pab = s3.get_public_access_block(Bucket=name)["PublicAccessBlockConfiguration"]
            flags = ("BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy",
                     "RestrictPublicBuckets")
            audit(step, f"{cat}.public_access_block",
                  PASS if all(pab.get(f) for f in flags) else WARN,
                  "all four flags true" if all(pab.get(f) for f in flags)
                  else str({f: pab.get(f) for f in flags}))
        except ClientError as e:
            if not denied(e, "public_access_block"):
                code = err_code(e)
                audit(step, f"{cat}.public_access_block",
                      WARN if code == "NoSuchPublicAccessBlockConfiguration" else FAIL,
                      "not configured at bucket level (account-level block may still apply)"
                      if code == "NoSuchPublicAccessBlockConfiguration" else str(e)[:160])

        try:
            cors = s3.get_bucket_cors(Bucket=name).get("CORSRules", [])
            has_etag = any("ETag" in (r.get("ExposeHeaders") or []) for r in cors)
            if cors and has_etag:
                audit(step, f"{cat}.cors", PASS, f"{len(cors)} rule(s), ETag exposed")
            elif cors:
                audit(step, f"{cat}.cors", WARN,
                      "CORS present but ETag not in ExposeHeaders — browser multipart "
                      "completion fails without it")
            else:
                audit(step, f"{cat}.cors", WARN, "no CORS rules")
        except ClientError as e:
            if not denied(e, "cors"):
                code = err_code(e)
                audit(step, f"{cat}.cors",
                      WARN if code == "NoSuchCORSConfiguration" else FAIL,
                      "no CORS configuration" if code == "NoSuchCORSConfiguration"
                      else str(e)[:160])


# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser(description="MAJA AWS smoke test")
    parser.add_argument("--write", action="store_true",
                        help="also run write steps (isolated under _smoketest/{uuid}/)")
    parser.add_argument("--profile-id", default=os.environ.get("AWS_SMOKE_PROFILE_ID", ""),
                        help="a real wedding profile id whose face collection to verify")
    args = parser.parse_args()

    mode = "--write" if args.write else "read-only"
    aud = os.environ.get(AUDIT_PROFILE_VAR)
    print(f"AWS smoke test — account {EXPECTED_ACCOUNT}, region {EXPECTED_REGION} [{mode}]")
    print(f"runtime identity: application credentials (aws_service)")
    print(f"audit profile   : {aud or f'(unset — audit checks will {SKIP_AUDIT})'}")
    print()

    buckets = r1_config()
    if not aws_service.credentials_available():
        die_no_credentials()

    r2_identity()
    r3_bucket_access(buckets)
    r4_key_routing(buckets)
    if args.write:
        r5_write(buckets)
    else:
        runtime("R5.write", "write_steps", SKIP, "pass --write to run")
    r6_rekognition(args.write, args.profile_id)
    a1_bucket_config(buckets)

    print()
    print("=" * 72)
    print("SUMMARY")
    print("=" * 72)
    for lane in ("RUNTIME", "AUDIT"):
        rows = [r for r in results if r[0] == lane]
        if not rows:
            continue
        print(f"\n-- {lane} " + "-" * (68 - len(lane)))
        for _lane, step, name, status, detail in rows:
            line = f"[{status:16}] {step:22} {name:38}"
            if detail:
                line += f" {detail}"
            print(line)

    def count(status, lane=None):
        return sum(1 for l, _s, _n, st, _d in results
                   if st == status and (lane is None or l == lane))

    rt_fail, au_fail = count(FAIL, "RUNTIME"), count(FAIL, "AUDIT")
    print()
    print(f"{len(results)} checks — RUNTIME: {count(PASS,'RUNTIME')} PASS / {rt_fail} FAIL"
          f" · AUDIT: {count(PASS,'AUDIT')} PASS / {au_fail} FAIL /"
          f" {count(SKIP_AUDIT)} {SKIP_AUDIT}"
          f" · {count(WARN)} WARN · {count(SKIP_NEW)} {SKIP_NEW}")
    if rt_fail == 0:
        print("runtime: GREEN — the application can perform every operation it needs.")
    if count(SKIP_AUDIT) and not aud:
        print(f"audit  : skipped — set {AUDIT_PROFILE_VAR} to a read-only "
              f"configuration-audit profile to run these.")
    sys.exit(1 if _failed[0] else 0)


if __name__ == "__main__":
    main()
