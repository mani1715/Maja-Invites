"""
MAJA Invites — AWS Service Layer (Sprint 10)
==============================================
Wraps S3, Rekognition, CloudFront signed URLs, and Pillow thumbs.
Each wedding gets its own Rekognition FaceCollection.
All S3 objects are tagged with `expire-at` for lifecycle cleanup.

Configured via /app/backend/.env:
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
  AWS_S3_BUCKET
  AWS_CLOUDFRONT_DOMAIN, AWS_CLOUDFRONT_KEY_PAIR_ID, AWS_CLOUDFRONT_PRIVATE_KEY_PATH
  FACE_MATCH_CONFIDENCE_THRESHOLD (default 90)
"""
import os
import io
import logging
import datetime as _dt
from typing import Optional, Dict, Any, List
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from botocore.signers import CloudFrontSigner
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from PIL import Image, ImageOps

logger = logging.getLogger("aws_service")


# ============================================================
#  Lazy singletons
# ============================================================
# connect_timeout bounds the TCP handshake; read_timeout bounds waiting on a
# response once sent. read_timeout defaults generously (60s) because large S3
# PUTs (original photos) legitimately take a while — this isn't a per-byte
# transfer timeout, just a ceiling on a stalled call. Both env-tunable per
# deploy's network conditions.
_boto_cfg = Config(retries={"max_attempts": 3, "mode": "adaptive"},
                   max_pool_connections=20,
                   connect_timeout=int(os.environ.get("AWS_CONNECT_TIMEOUT", "5")),
                   read_timeout=int(os.environ.get("AWS_READ_TIMEOUT", "60")))

_s3 = None
_rekognition = None
_cf_signer = None


DEFAULT_REGION = "us-east-2"   # where the four production buckets live

# Describing this id is the Rekognition liveness probe (see healthcheck). It
# must never be a real collection: ResourceNotFound is the healthy answer.
HEALTH_PROBE_COLLECTION = "maja_healthprobe_does_not_exist"


def region() -> str:
    return os.environ.get("AWS_REGION") or DEFAULT_REGION


def _aws_kwargs() -> Dict[str, Any]:
    """boto3 client kwargs.

    Explicit keys are passed ONLY when both are actually set to a non-empty
    value. An empty string is not "no credentials" to botocore — it is a
    credential whose signature never validates, which is how a stray
    `AWS_ACCESS_KEY_ID=` line in a .env file turns instance-role auth into
    SignatureDoesNotMatch. Passing None instead hands control to the normal
    provider chain (env -> shared config/profile -> container/instance role),
    which is the preferred production path.
    """
    key = os.environ.get("AWS_ACCESS_KEY_ID") or None
    secret = os.environ.get("AWS_SECRET_ACCESS_KEY") or None
    kwargs: Dict[str, Any] = {"region_name": region(), "config": _boto_cfg}
    if key and secret:
        kwargs["aws_access_key_id"] = key
        kwargs["aws_secret_access_key"] = secret
        token = os.environ.get("AWS_SESSION_TOKEN") or None
        if token:
            kwargs["aws_session_token"] = token
    return kwargs


def s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", **_aws_kwargs())
    return _s3


_s3_accelerate = None


def accelerate_enabled() -> bool:
    """Master switch for S3 Transfer Acceleration on browser upload presigns.

    OFF by default and OFF until acceleration is actually enabled on the target
    bucket in AWS: the accelerate endpoint returns an error for a bucket that
    does not have acceleration turned on, so flipping this before the bucket
    toggle would break every upload. Safe rollout = enable on the bucket first,
    then set AWS_S3_ACCELERATE=true and restart.
    """
    return (os.environ.get("AWS_S3_ACCELERATE", "") or "").strip().lower() \
        in ("1", "true", "yes", "on")


def s3_accelerate():
    """S3 client whose presigned object URLs use the Transfer Acceleration
    endpoint (<bucket>.s3-accelerate.amazonaws.com), which routes a distant
    browser's PUT through the nearest AWS edge instead of straight to
    us-east-2 — a large win for uploaders far from the bucket (e.g. India).

    Only valid for buckets that HAVE acceleration enabled; used solely for the
    gallery upload presign (event bucket). The object still lands in the same
    bucket, so the server-side commit (head/get/copy) is unchanged.
    """
    global _s3_accelerate
    if _s3_accelerate is None:
        kwargs = _aws_kwargs()
        kwargs["config"] = kwargs["config"].merge(
            Config(s3={"use_accelerate_endpoint": True}))
        _s3_accelerate = boto3.client("s3", **kwargs)
    return _s3_accelerate


def rekognition():
    global _rekognition
    if _rekognition is None:
        _rekognition = boto3.client("rekognition", **_aws_kwargs())
    return _rekognition


def cf_signer() -> Optional[CloudFrontSigner]:
    global _cf_signer
    if _cf_signer is not None:
        return _cf_signer
    key_path = os.environ.get("AWS_CLOUDFRONT_PRIVATE_KEY_PATH")
    key_pair_id = os.environ.get("AWS_CLOUDFRONT_KEY_PAIR_ID")
    if not key_path or not key_pair_id or not os.path.exists(key_path):
        logger.warning("CloudFront signer not configured (key missing). Falling back to S3 presigned URLs.")
        return None
    with open(key_path, "rb") as fh:
        private_key = serialization.load_pem_private_key(fh.read(),
                                                          password=None,
                                                          backend=default_backend())

    def rsa_signer(message: bytes) -> bytes:
        return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

    _cf_signer = CloudFrontSigner(key_pair_id, rsa_signer)
    return _cf_signer


# ---------------------------------------------------------------------------
# Bucket configuration
# ---------------------------------------------------------------------------
# media_storage.BUCKET_ENV / bucket_for() is AUTHORITATIVE for the four-bucket
# routing. It is imported lazily below (this module must stay importable
# without it, and media_storage does not import this module at all), and the
# two event-bucket env names are read directly here so the legacy bucket()
# path has no import dependency whatsoever.
def bucket_for_category(category: str) -> str:
    from media_storage import bucket_for      # lazy: keeps both independently importable
    return bucket_for(category)


def bucket() -> str:
    """The legacy general-purpose media bucket.

    ~14 modules predating the four-bucket split (gallery_features,
    studio_storage, storage_upload, media_reconcile, auto_moderation, …) call
    this. An explicit AWS_S3_BUCKET still wins for single-bucket dev/legacy
    deploys; otherwise they resolve to the EVENT bucket, which is where that
    media (gallery photos, studio backups, event imagery) belongs in the new
    layout — rather than to "", which is what they used to get on a
    four-bucket deploy and which turns every such call into a malformed S3
    request against a bucket named "".
    """
    return (os.environ.get("AWS_S3_BUCKET")
            or os.environ.get("AWS_S3_EVENT_BUCKET")
            or os.environ.get("S3_BUCKET_EVENT")
            or "")


def cloudfront_domain() -> str:
    return os.environ.get("AWS_CLOUDFRONT_DOMAIN", "")


# ============================================================
#  S3 helpers
# ============================================================
def upload_bytes(key: str, data: bytes, content_type: str,
                  tags: Optional[Dict[str, str]] = None,
                  bucket_name: Optional[str] = None) -> Dict[str, Any]:
    """Upload raw bytes to S3 with optional object tags."""
    bkt = bucket_name or bucket()
    tag_str = "&".join(f"{k}={quote(str(v))}" for k, v in (tags or {}).items())
    kwargs = dict(Bucket=bkt, Key=key, Body=data, ContentType=content_type)
    if tag_str:
        kwargs["Tagging"] = tag_str
    s3().put_object(**kwargs)
    return {"bucket": bkt, "key": key, "size": len(data)}


def delete_prefix(prefix: str) -> int:
    """Delete every object under prefix. Returns count deleted."""
    paginator = s3().get_paginator("list_objects_v2")
    deleted = 0
    for page in paginator.paginate(Bucket=bucket(), Prefix=prefix):
        contents = page.get("Contents") or []
        if not contents:
            continue
        batch = [{"Key": o["Key"]} for o in contents]
        # delete_objects supports max 1000 per call
        for i in range(0, len(batch), 1000):
            resp = s3().delete_objects(Bucket=bucket(),
                                       Delete={"Objects": batch[i:i + 1000]})
            deleted += len(resp.get("Deleted") or [])
    return deleted


def generate_signed_url(key: str, expiry_seconds: int = 3600,
                        bucket_name: Optional[str] = None) -> str:
    """Prefer CloudFront signed URL; fall back to S3 presigned GET.

    CloudFront is used only for the default bucket's distribution — a key in a
    non-default bucket always gets an S3 presigned URL (the app must work
    without CloudFront; when a per-bucket distribution exists later, extend the
    domain lookup here without touching any caller).
    """
    bkt = bucket_name or bucket()
    signer = cf_signer()
    if signer and cloudfront_domain() and bkt == bucket():
        url = f"https://{cloudfront_domain()}/{key}"
        expire_at = _dt.datetime.utcnow() + _dt.timedelta(seconds=expiry_seconds)
        return signer.generate_presigned_url(url, date_less_than=expire_at)
    # Fallback — S3 presigned URL (works for testing without CF config)
    return s3().generate_presigned_url("get_object",
                                        Params={"Bucket": bkt, "Key": key},
                                        ExpiresIn=expiry_seconds)


def generate_presigned_put(key: str, content_type: str, expiry_seconds: int = 900,
                           bucket_name: Optional[str] = None,
                           accelerate: bool = False) -> str:
    """Presigned PUT URL for a direct browser -> S3 upload (staging objects).

    `accelerate=True` routes the upload through S3 Transfer Acceleration when
    AWS_S3_ACCELERATE is on AND the bucket has acceleration enabled. The caller
    opts in per bucket (only buckets with acceleration enabled may use it); the
    env switch is the deploy-wide master. When either is off this is a normal
    regional presign, so it is safe to ship before the bucket toggle exists.
    """
    client = s3_accelerate() if (accelerate and accelerate_enabled()) else s3()
    return client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket_name or bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expiry_seconds)


def head_object(key: str, bucket_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """HEAD an object; None if missing. Used to verify completion server-side."""
    try:
        resp = s3().head_object(Bucket=bucket_name or bucket(), Key=key)
        return {"size": int(resp.get("ContentLength") or 0),
                "etag": (resp.get("ETag") or "").strip('"'),
                "content_type": resp.get("ContentType") or ""}
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def delete_object(key: str, bucket_name: Optional[str] = None) -> bool:
    try:
        s3().delete_object(Bucket=bucket_name or bucket(), Key=key)
        return True
    except ClientError as e:
        logger.error("delete_object %s: %s", key, e)
        return False


# ============================================================
#  S3 multipart upload (direct browser -> S3; app is control plane only)
# ============================================================
def create_multipart_upload(key: str, content_type: str,
                            tags: Optional[Dict[str, str]] = None,
                            bucket_name: Optional[str] = None) -> str:
    """Start a multipart upload; returns the UploadId."""
    kwargs: Dict[str, Any] = dict(Bucket=bucket_name or bucket(), Key=key,
                                  ContentType=content_type)
    tag_str = "&".join(f"{k}={quote(str(v))}" for k, v in (tags or {}).items())
    if tag_str:
        kwargs["Tagging"] = tag_str
    return s3().create_multipart_upload(**kwargs)["UploadId"]


def presign_upload_part(key: str, upload_id: str, part_number: int,
                        expiry_seconds: int = 900,
                        bucket_name: Optional[str] = None) -> str:
    """Presigned URL for one part PUT (part bytes go browser -> S3 directly)."""
    return s3().generate_presigned_url(
        "upload_part",
        Params={"Bucket": bucket_name or bucket(), "Key": key,
                "UploadId": upload_id, "PartNumber": int(part_number)},
        ExpiresIn=expiry_seconds)


def list_uploaded_parts(key: str, upload_id: str,
                        bucket_name: Optional[str] = None) -> list:
    """Uploaded parts so far — powers client-side resume after interruption."""
    bkt = bucket_name or bucket()
    parts, marker = [], 0
    while True:
        resp = s3().list_parts(Bucket=bkt, Key=key, UploadId=upload_id,
                               PartNumberMarker=marker, MaxParts=1000)
        for p in resp.get("Parts") or []:
            parts.append({"part_number": p["PartNumber"],
                          "etag": (p.get("ETag") or "").strip('"'),
                          "size": int(p.get("Size") or 0)})
        if not resp.get("IsTruncated"):
            return parts
        marker = resp.get("NextPartNumberMarker") or 0


def complete_multipart_upload(key: str, upload_id: str, parts: list,
                              bucket_name: Optional[str] = None) -> Dict[str, Any]:
    """Finalize. `parts` = [{"part_number": int, "etag": str}] in ascending order."""
    resp = s3().complete_multipart_upload(
        Bucket=bucket_name or bucket(), Key=key, UploadId=upload_id,
        MultipartUpload={"Parts": [
            {"PartNumber": int(p["part_number"]), "ETag": p["etag"]}
            for p in sorted(parts, key=lambda p: int(p["part_number"]))
        ]})
    return {"ok": True, "etag": (resp.get("ETag") or "").strip('"'),
            "key": resp.get("Key") or key}


def abort_multipart_upload(key: str, upload_id: str,
                           bucket_name: Optional[str] = None) -> bool:
    """Abort an in-progress multipart upload, discarding stored parts."""
    try:
        s3().abort_multipart_upload(Bucket=bucket_name or bucket(), Key=key,
                                    UploadId=upload_id)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("NoSuchUpload", "404"):
            return True  # already gone — abort is idempotent
        logger.error("abort_multipart_upload %s: %s", key, e)
        return False


# ============================================================
#  Pillow helpers
# ============================================================
def is_valid_image(data: bytes) -> bool:
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        return True
    except Exception:
        return False


def make_thumbnail(data: bytes, target_w: int = 400, jpeg_quality: int = 85) -> bytes:
    """Generate JPEG thumbnail (RGB) at target_w pixels wide, preserving aspect."""
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", im.size, (255, 255, 255))
            mask = im.split()[-1] if im.mode == "RGBA" else None
            bg.paste(im, mask=mask)
            im = bg
        elif im.mode != "RGB":
            im = im.convert("RGB")
        ratio = target_w / float(im.width)
        new_h = int(im.height * ratio)
        im = im.resize((target_w, new_h), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=jpeg_quality, optimize=True)
        return out.getvalue()


def image_dimensions(data: bytes) -> Dict[str, int]:
    try:
        with Image.open(io.BytesIO(data)) as im:
            return {"width": im.width, "height": im.height}
    except Exception:
        return {"width": 0, "height": 0}


# ============================================================
#  Rekognition helpers
# ============================================================
def create_face_collection(collection_id: str) -> Dict[str, Any]:
    """Create (or no-op on) an event's face collection.

    Returns {"created": False, "error": ...} rather than raising on an AWS
    fault: the only caller is the admin gallery-enable endpoint, which did not
    wrap this, so bad/absent credentials came back as a bare 500 with an AWS
    exception behind it instead of a handled failure.
    """
    try:
        resp = rekognition().create_collection(CollectionId=collection_id)
        return {"created": True, "arn": resp.get("CollectionArn")}
    except rekognition().exceptions.ResourceAlreadyExistsException:
        return {"created": False, "already_exists": True}
    except ClientError as e:
        logger.error("create_face_collection(%s) failed: %s", collection_id, e)
        return {"created": False, "error": e.response.get("Error", {}).get("Code", "ClientError")}
    except Exception as e:                          # NoCredentials, endpoint, DNS
        logger.error("create_face_collection(%s) failed: %s", collection_id, type(e).__name__)
        return {"created": False, "error": type(e).__name__}


def describe_face_collection(collection_id: str) -> Dict[str, Any]:
    """Describe ONE collection by id.

    Least-privilege alternative to enumerating the account: DescribeCollection
    answers "does this event's collection exist, and how many faces are in it"
    without `rekognition:ListCollections`, which would let the backend read
    every collection name in the account — including collections belonging to
    nothing in this application.

    Returns {"exists", "faces", "error"}. A missing collection is
    `exists: False` with `error: None`; a PERMISSION failure sets `error`, so
    callers can tell "not created yet" apart from "not allowed to look".
    """
    try:
        resp = rekognition().describe_collection(CollectionId=collection_id)
        return {"exists": True, "faces": resp.get("FaceCount"),
                "created_at": str(resp.get("CreationTimestamp") or ""), "error": None}
    except rekognition().exceptions.ResourceNotFoundException:
        return {"exists": False, "faces": None, "error": None}
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "ClientError")
        logger.error("describe_face_collection(%s) failed: %s", collection_id, code)
        return {"exists": False, "faces": None, "error": code}
    except Exception as e:
        logger.error("describe_face_collection(%s) failed: %s", collection_id, type(e).__name__)
        return {"exists": False, "faces": None, "error": type(e).__name__}


def delete_face_collection(collection_id: str) -> bool:
    try:
        rekognition().delete_collection(CollectionId=collection_id)
        return True
    except rekognition().exceptions.ResourceNotFoundException:
        return False
    except ClientError as e:
        logger.error("delete_face_collection error: %s", e)
        return False


def index_photo_faces(collection_id: str, s3_key: str,
                       external_image_id: str, max_faces: int = 15,
                       bucket_name: Optional[str] = None) -> Dict[str, Any]:
    """Index all faces in an S3 photo into a collection.

    `bucket_name` must be the bucket the photo ACTUALLY lives in. It used to
    be hardcoded to the legacy default bucket, so once event photos moved to
    the event bucket, Rekognition was pointed at a key in the wrong bucket.
    Callers that still omit it get the legacy default, which now resolves to
    the event bucket (see bucket()).
    """
    try:
        resp = rekognition().index_faces(
            CollectionId=collection_id,
            Image={"S3Object": {"Bucket": bucket_name or bucket(), "Name": s3_key}},
            ExternalImageId=external_image_id,
            DetectionAttributes=["DEFAULT"],
            QualityFilter="AUTO",
            MaxFaces=max_faces,
        )
        face_records = resp.get("FaceRecords") or []
        return {
            "ok": True,
            "face_count": len(face_records),
            "face_ids": [r["Face"]["FaceId"] for r in face_records],
        }
    except rekognition().exceptions.InvalidParameterException:
        # no faces detected
        return {"ok": True, "face_count": 0, "face_ids": []}
    except ClientError as e:
        logger.error("index_photo_faces error: %s", e)
        return {"ok": False, "error": str(e)[:200]}


def list_face_ids_for_image(collection_id: str, external_image_id: str) -> List[str]:
    """FaceIds currently indexed in `collection_id` under `external_image_id`.

    Paginates ListFaces and filters client-side — Rekognition has no server-side
    ExternalImageId filter. Best-effort: any failure (including a role without
    rekognition:ListFaces) returns [], so the caller falls back to deleting only
    the face ids it persisted. Used solely to purge orphaned vectors left by a
    crash between a successful IndexFaces and the DB write, before a retry
    re-indexes the same photo — so it runs only on the retry path, not per index.

    IAM: needs rekognition:ListFaces. Additive to the runtime role; absent it,
    this degrades to today's behaviour (delete only persisted ids).
    """
    out: List[str] = []
    try:
        client = rekognition()
        token: Optional[str] = None
        while True:
            kwargs = {"CollectionId": collection_id, "MaxResults": 1000}
            if token:
                kwargs["NextToken"] = token
            resp = client.list_faces(**kwargs)
            for f in resp.get("Faces") or []:
                if f.get("ExternalImageId") == external_image_id and f.get("FaceId"):
                    out.append(f["FaceId"])
            token = resp.get("NextToken")
            if not token:
                break
    except Exception as e:
        logger.warning("list_face_ids_for_image(%s) unavailable: %s", collection_id, type(e).__name__)
        return []
    return out


def search_faces_by_selfie(collection_id: str, selfie_bytes: bytes,
                            threshold: Optional[float] = None,
                            max_faces: int = 100) -> Dict[str, Any]:
    """Search for faces in a collection matching the selfie image bytes."""
    if threshold is None:
        try:
            threshold = float(os.environ.get("FACE_MATCH_CONFIDENCE_THRESHOLD", "90"))
        except ValueError:
            threshold = 90.0
    try:
        resp = rekognition().search_faces_by_image(
            CollectionId=collection_id,
            Image={"Bytes": selfie_bytes},
            MaxFaces=max_faces,
            FaceMatchThreshold=threshold,
            QualityFilter="AUTO",
        )
        matches = resp.get("FaceMatches") or []
        # Deduplicate by ExternalImageId (= photo_id) — best similarity wins
        best: Dict[str, float] = {}
        for m in matches:
            ext = m["Face"].get("ExternalImageId") or ""
            sim = float(m.get("Similarity") or 0.0)
            if ext and sim > best.get(ext, 0.0):
                best[ext] = sim
        sorted_matches = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
        return {
            "ok": True,
            "match_count": len(sorted_matches),
            "matches": [{"photo_id": pid, "similarity": sim} for pid, sim in sorted_matches],
        }
    except rekognition().exceptions.InvalidParameterException:
        return {"ok": False, "error": "no_face_in_selfie",
                "message": "We couldn't find a clear face in your selfie. Please try again with better lighting."}
    except ClientError as e:
        logger.error("search_faces error: %s", e)
        return {"ok": False, "error": str(e)[:200]}


# ============================================================
#  Misc helpers
# ============================================================
_creds_available: Optional[bool] = None


def credential_source() -> str:
    """Where credentials come from, for diagnostics. Never returns a secret."""
    if os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"):
        return "env"
    try:
        creds = boto3.Session().get_credentials()
    except Exception:
        return "none"
    if creds is None:
        return "none"
    # botocore labels the resolved provider: iam-role, shared-credentials-file,
    # assume-role, container-role, sso, ...
    return getattr(creds, "method", None) or "chain"


def credentials_available() -> bool:
    """True when SOME credential provider resolves — env keys, a shared
    profile, or a container/instance role. Cached: the chain can hit the
    instance-metadata endpoint, which is slow to fail off-EC2."""
    global _creds_available
    if _creds_available is None:
        _creds_available = credential_source() != "none"
    return _creds_available


def is_configured() -> bool:
    """AWS usable for media work.

    Deliberately NOT "are AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY set".
    That older test made two wrong calls: it reported False on a VM using an
    instance role or a shared profile (the preferred production credential
    path), and it required the obsolete single AWS_S3_BUCKET, so a correct
    four-bucket deploy read as unconfigured. Five feature paths gate on this
    (auto_moderation, event_media_service CDN push, face_ops, gallery_features,
    invitation-delete cleanup), so a false negative silently disables them.
    """
    return bool(credentials_available() and bucket())


def bucket_config() -> Dict[str, str]:
    """category -> resolved bucket name ("" when unset). Diagnostics only."""
    from media_storage import BUCKET_ENV, bucket_for   # lazy: see bucket_for_category
    return {cat: bucket_for(cat) for cat in BUCKET_ENV}


def healthcheck() -> Dict[str, Any]:
    """Lightweight self-test — returns status of each AWS piece."""
    buckets = bucket_config()
    status: Dict[str, Any] = {
        "configured": is_configured(),
        "credential_source": credential_source(),
        "bucket": bucket(),
        "buckets": buckets,
        "region": region(),
        "cf_signer": bool(cf_signer()),
        "cf_domain": cloudfront_domain() or None,
    }
    missing = [c for c, b in buckets.items() if not b]
    if missing:
        status["buckets_unconfigured"] = missing
    if not is_configured():
        return status
    # HEAD every distinct configured bucket: one of the four being missing or
    # in the wrong region is exactly the failure this check exists to surface.
    reachable, errors = {}, {}
    for name in sorted({b for b in buckets.values() if b} | {bucket()}):
        try:
            s3().head_bucket(Bucket=name)
            reachable[name] = True
        except ClientError as e:
            reachable[name] = False
            errors[name] = str(e)[:200]
        except Exception as e:                      # NoCredentials, endpoint, DNS
            reachable[name] = False
            errors[name] = f"{type(e).__name__}: {str(e)[:160]}"
    status["s3_buckets_reachable"] = reachable
    status["s3_reachable"] = all(reachable.values()) if reachable else False
    if errors:
        status["s3_errors"] = errors
    # Liveness WITHOUT rekognition:ListCollections. Describing an id that
    # cannot exist proves the endpoint is reachable and this identity may talk
    # to Rekognition: ResourceNotFound IS the success signal. Enumerating every
    # collection in the account to answer "is the service up" is a permission
    # the backend has no business holding, and under the least-privilege
    # runtime policy the old probe reported AccessDenied as "unreachable".
    probe = describe_face_collection(HEALTH_PROBE_COLLECTION)
    status["rekognition_reachable"] = probe["error"] is None
    if probe["error"]:
        status["rekognition_error"] = probe["error"]
    return status
