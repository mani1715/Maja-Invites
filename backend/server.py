from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Request, Response, Header
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.encoders import jsonable_encoder
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import logging
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Any
import json
from datetime import datetime, timedelta, timezone
import re
import random
import string
import io
import bleach
import uuid
import base64
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib import colors as rl_colors
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage
import qrcode
from io import BytesIO
import razorpay
import hmac
import hashlib


from models import (
    Admin, AdminLogin, AdminResponse, AdminRegister, AdminRole, AdminStatus,
    PhotographerSignupRequest, OTPSendRequest, OTPVerifyRequest,
    Profile, ProfileCreate, ProfileUpdate, ProfileResponse,
    ProfileMedia, ProfileMediaCreate,
    Greeting, GreetingCreate, GreetingResponse,
    InvitationPublicView, SectionsEnabled, BackgroundMusic, MapSettings, ContactInfo,
    RSVPSettings, HoneymoonFund,
    LiveStreamSettings, SongRequestSettings, DressCodeSettings, DressCodeItem,
    SongRequest, SongRequestCreate, SongRequestResponse,
    CheckIn, CheckInCreate, CheckInResponse, CheckInStats,
    GuestRoom, PreWeddingLink,
    WeddingEvent, EventType,
    EventInvitation, EventInvitationCreate, EventInvitationUpdate, EventInvitationResponse,
    RSVP, RSVPCreate, RSVPResponse, RSVPStats,
    Analytics, ViewSession, DailyView, ViewTrackingRequest, InteractionTrackingRequest, 
    LanguageTrackingRequest, AnalyticsResponse, AnalyticsSummary,
    RateLimit, AuditLog, AuditLogResponse,
    DesignConfig, DesignConfigResponse, UpdateEventBackgroundRequest,
    LordLibrary, LordLibraryResponse, UpdateEventLordSettingsRequest,
    GuestWish, GuestWishCreate, GuestWishResponse,
    GuestReaction, GuestReactionCreate, GuestReactionStats,
    UpdateEventEngagementSettingsRequest,
    # PHASE 26: AI-Powered Personalization
    TranslationCache, TranslationRequest, TranslationResponse,
    GenerateDescriptionRequest, GenerateDescriptionResponse,
    RSVPSuggestionsRequest, RSVPSuggestionsResponse,
    GuestInsightsRequest, GuestInsightsResponse,
    AIRateLimitStatus,
    # PHASE 27: Post-Wedding Value (Combined)
    ThankYouMessage, ThankYouMessageCreate, ThankYouMessageResponse,
    WeddingAlbumMedia, WeddingAlbumMediaCreate, WeddingAlbumMediaResponse,
    MemoryModeStatus,
    # PHASE 28: Viral Sharing & Growth Engine
    ShareMetadata, QRCodeRequest, QRCodeResponse,
    # PHASE 29E: Admin Safety Nets & Recovery
    ProfileVersion, ProfileVersionResponse, ProfileVersionListResponse, RestoreVersionRequest,
    # PHASE 30: Analytics, Insights & Guest Intelligence
    DeviceType, AnalyticsEventType, IPLocationCache, ViewAnalytics, EngagementAnalytics,
    AnalyticsTrackRequest, AnalyticsSummaryRequest, ViewAnalyticsData, EngagementAnalyticsData,
    RSVPAnalyticsData, AnalyticsSummaryResponse,
    # PHASE 31: SEO, Social Sharing & Discovery
    SEOSettings,
    # PHASE 32: Security & Access Control
    CaptchaChallenge, CaptchaVerifyRequest, SubmissionAttempt,
    # PHASE 33: Monetization & Premium Plans
    UpdatePlanRequest, PlanInfoResponse, FeatureFlagsResponse,
    # PHASE 35: Referral & Viral Growth (the "Credits" half is deleted)
    Referral, ReferralStatus,
    ReferralCodeResponse, ReferralStatsResponse, ApplyReferralRequest,
    AdminReferralOverrideRequest,
    # PHASE 34: Design System & Theme Engine
    ThemeSettings, ThemeUpdateRequest, ThemePreviewRequest,
    # PHASE 36: Template Marketplace & Creator Ecosystem
    Template, TemplateCreate, TemplateUpdate, TemplateResponse, TemplateListResponse,
    TemplateCategory, TemplateStatus, CreatorProfile, CreatorProfileCreate,
    CreatorProfileUpdate, CreatorProfileResponse, CreatorStatus, TemplatePurchase,
    TemplatePurchaseRequest, TemplatePurchaseResponse, TemplateReview, TemplateReviewRequest,
    AdminTemplateReviewRequest, AdminCreatorActionRequest, TemplateEarnings,
    TemplateStats, MarketplaceFilters
)
from auth import (
    get_password_hash, verify_password,
    create_access_token, get_current_admin,
    get_current_admin_with_role, require_super_admin, require_admin,
    security, get_current_event_client,
)
from fastapi.security import HTTPAuthorizationCredentials
from design_registry import (
    get_all_designs, get_designs_by_event_type, 
    get_design_by_id, get_default_design_for_event,
    validate_design_for_event
)
from lord_library import (
    get_all_lords, get_lords_by_event_type,
    get_lord_by_id, get_default_lord,
    is_lord_allowed_for_event
)
# PHASE 26: AI-Powered Personalization
from ai_service import (
    ai_service,
    check_translation_rate_limit,
    check_admin_generation_rate_limit,
    SUPPORTED_LANGUAGES,
    gemini_generate,
    DEFAULT_GEMINI_MODEL,
)
# PHASE 32: Security & Access Control
from security_middleware import (
    SecurityHeadersMiddleware,
    BotDetectionMiddleware,
    AbusePreventionMiddleware,
    OriginCheckMiddleware,
    BodySizeLimitMiddleware
)
from access_control import (
    hash_passcode,
    validate_passcode_format,
    check_event_access
)
# PHASE 33: Monetization & Premium Plans
from feature_gating import (
    has_feature,
    Feature,
    get_gallery_limit,
    get_feature_flags,
    requires_watermark,
    get_plan_info
)
# PHASE 36: Template Marketplace & Creator Ecosystem
from template_validator import (
    validate_template,
    sanitize_template_for_storage,
    calculate_performance_score
)
# PHASE 35: Credit Management Service
import hashlib



ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database — self-hosted Supabase / Postgres ONLY (MongoDB removed). All data
# access goes through pg_adapter.py, the Mongo-compatible async layer over
# Postgres JSONB. New features must use Postgres (this `db`), never MongoDB.
from pg_adapter import Database as _PGDatabase
_pg_dsn = os.environ.get("SUPABASE_DB_URL")
if not _pg_dsn:
    raise RuntimeError("SUPABASE_DB_URL must be set in the environment (Postgres-only).")
# Lazy pool — connected in the FastAPI startup hook below (async context).
db = _PGDatabase.lazy(
    _pg_dsn,
    min_size=int(os.environ.get("DB_POOL_MIN", "1")),
    max_size=int(os.environ.get("DB_POOL_MAX", "20")),
)
client = None  # retained as None for any legacy reference; Mongo client removed

# PHASE 35: Initialize Credit Service

# PHASE 37: Initialize Wedding Lifecycle Service
from wedding_lifecycle_service import WeddingLifecycleService
wedding_lifecycle_service = WeddingLifecycleService(db)

# PHASE 34: Razorpay Payment Gateway Client
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', 'rzp_test_PLACEHOLDER_KEY_ID')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', 'PLACEHOLDER_SECRET_KEY')

try:
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    # The razorpay SDK wraps a plain requests.Session with NO default timeout, so
    # a stalled Razorpay endpoint would block the calling coroutine — and, since
    # these calls run un-threaded inside async handlers, the whole uvicorn worker
    # event loop — indefinitely. Force a hard socket timeout on every SDK request
    # so a hang becomes a bounded error instead. (env RAZORPAY_TIMEOUT, default 15s)
    try:
        import requests as _rzp_requests
        _RZP_TIMEOUT = float(os.environ.get("RAZORPAY_TIMEOUT", "15"))

        class _TimeoutSession(_rzp_requests.Session):
            def request(self, *a, **kw):
                kw.setdefault("timeout", _RZP_TIMEOUT)
                return super().request(*a, **kw)

        _sess = _TimeoutSession()
        if getattr(razorpay_client, "auth", None):
            _sess.auth = razorpay_client.auth
        razorpay_client.session = _sess
    except Exception as _rzp_sess_err:
        print(f"⚠️  Razorpay timeout session not applied: {_rzp_sess_err}")
    print("✅ Razorpay client initialized successfully")
except Exception as e:
    print(f"⚠️  Razorpay client initialization failed: {e}")
    print("⚠️  Payment features will not work until valid credentials are provided")
    razorpay_client = None


# Create the main app without a prefix.
# Security: disable interactive docs / OpenAPI schema in production so the full
# API surface can't be enumerated. Set ENV=production (or APP_ENV) to enable.
# Accept ENVIRONMENT too: backend/.env.example documents ENVIRONMENT=production
# and the prod-readiness warnings key off it, but this flag only read ENV/APP_ENV
# — so a deploy that set ENVIRONMENT (as told) left /docs, /openapi.json and the
# prod CORS guard OFF. All three names now count.
_IS_PROD = os.environ.get(
    'ENV', os.environ.get('APP_ENV', os.environ.get('ENVIRONMENT', ''))
).strip().lower() in ('production', 'prod')
app = FastAPI(
    docs_url=None if _IS_PROD else "/docs",
    redoc_url=None if _IS_PROD else "/redoc",
    openapi_url=None if _IS_PROD else "/openapi.json",
)

# Error tracking (SECURITY_AUDIT.md §13 — the platform had none). This is a
# complete no-op unless BOTH `sentry-sdk` is installed AND SENTRY_DSN is set, so
# it can never affect boot. To enable: `pip install sentry-sdk` (already in
# requirements) + set SENTRY_DSN in the environment.
try:
    _sentry_dsn = os.environ.get("SENTRY_DSN")
    if _sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(
            dsn=_sentry_dsn,
            environment=os.environ.get("ENVIRONMENT", "development"),
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            send_default_pii=False,   # never ship user PII to Sentry
        )
        logging.getLogger("server").info("[sentry] error tracking enabled")
except Exception as _sentry_err:   # pragma: no cover - monitoring must never break boot
    logging.getLogger("server").warning("[sentry] init skipped: %s", _sentry_err)


@app.on_event("startup")
async def _connect_pg_pool():
    """Open the Postgres connection pool now (async context)."""
    await db.ensure_connected()
    logging.getLogger("server").info("Postgres pool connected")
    # Seed the invite-number counter row + unique backstop index before any
    # concurrent create_profile can run: the adapter's upsert-create branch is
    # racy, but a pre-seeded row makes next_invite_no a serial FOR UPDATE CAS.
    try:
        await ensure_counter(db)
    except Exception as _e:
        logging.getLogger("server").warning("ensure_counter failed at startup: %s", _e)


# Create uploads directory
UPLOADS_DIR = Path("/app/uploads/photos")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Serve uploaded media. This REPLACED two StaticFiles mounts when Google Drive
# became the primary store: the same two URL prefixes now resolve through
# storage_serve, which tries the local cache, then the Drive mirror, then the
# original file on disk. With the storage-pool flag off (or a file not yet
# backfilled) it lands on that last branch, which is byte-for-byte the old
# behaviour — so this is safe to ship ahead of any migration, and the flag is
# the rollback.
#
# It is registered HERE, not with the other routers at the bottom, because
# Starlette matches routes in registration order: a Mount or route added
# earlier for /api/uploads would shadow it. `db` is already live from L173.
#
# It also fixes an existing bug on the way past: Starlette 0.37.2's
# FileResponse ignores Range, so video seeking never worked on these paths.
from storage_serve import build_storage_serve_router  # noqa: E402
app.include_router(build_storage_serve_router(db, UPLOADS_DIR.parent))

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ---- health / readiness probe (reliability) -------------------------------
@app.get("/api/health", include_in_schema=False)
async def health_check():
    """Liveness + DB readiness. Used by uptime monitors / load balancers."""
    db_ok = True
    try:
        await db.profiles.count_documents({})
    except Exception:
        db_ok = False
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={"status": "ok" if db_ok else "degraded", "db": db_ok},
    )

# ===========================================================================
# 2026 — Universal Invitation Categories (Wedding + 4 new ceremony types)
# ===========================================================================
from invitation_categories import (
    get_all_categories as _ic_all,
    get_category as _ic_get,
    get_category_designs as _ic_designs,
    get_category_features as _ic_features,
    get_category_pricing as _ic_pricing,
    DEFAULT_CATEGORY_PRICING as _ic_default_pricing,
)


@api_router.get("/event-categories")
async def list_event_categories():
    """Public list of all invitation categories (wedding + ceremonies).

    Returned shape:
      { categories: [ { id, label, label_traditional, tagline, icon,
                        cover_preview, hero_gradient, primary_color,
                        accent_color, order } ] }
    """
    return {"categories": _ic_all()}


@api_router.get("/event-categories/{category_id}")
async def get_event_category(category_id: str):
    cat = _ic_get(category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return {
        **cat,
        "designs": _ic_designs(category_id),
        "features": _ic_features(category_id),
    }


@api_router.get("/event-categories/{category_id}/designs")
async def list_category_designs(category_id: str):
    if not _ic_get(category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"designs": _ic_designs(category_id)}


@api_router.get("/event-categories/{category_id}/features")
async def list_category_features(category_id: str):
    if not _ic_get(category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"features": _ic_features(category_id)}


@api_router.get("/event-categories/{category_id}/pricing")
async def get_event_category_pricing(category_id: str, user_type: str = "photographer"):
    """Returns credit cost configuration for a category and user type.

    Checks DB overrides first (event_category_pricing), then falls back to
    the in-memory defaults from invitation_categories.
    """
    if not _ic_get(category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    if user_type not in ("photographer", "normal_user"):
        raise HTTPException(status_code=400, detail="user_type must be photographer|normal_user")
    # 1. DB override
    override = await db.event_category_pricing.find_one(
        {"category_id": category_id, "user_type": user_type},
        {"_id": 0, "category_id": 0, "user_type": 0},
    )
    defaults = _ic_pricing(category_id, user_type)
    if override:
        # Merge: DB values win, but missing keys fall back to defaults.
        out = {
            "design_credits": override.get("design_credits", defaults.get("design_credits", 1)),
            "feature_credits": {
                **defaults.get("feature_credits", {}),
                **(override.get("feature_credits") or {}),
            },
        }
        return out
    return defaults


@api_router.get("/super-admin/event-categories/pricing")
async def super_admin_get_all_category_pricing(
    _super_admin_id: str = Depends(require_super_admin),
):
    """Super-admin view: full pricing matrix for all non-wedding categories."""
    # In a future iteration we will read overrides from DB; for now return defaults.
    return _ic_default_pricing


class CategoryPricingUpdateBody(BaseModel):
    category_id: str
    user_type: str  # 'photographer' | 'normal_user'
    design_credits: Optional[int] = None
    feature_credits: Optional[Dict[str, int]] = None


@api_router.post("/super-admin/event-categories/pricing")
async def super_admin_update_category_pricing(
    body: CategoryPricingUpdateBody,
    _super_admin_id: str = Depends(require_super_admin),
):
    """Update credit pricing for a non-wedding category. Persists to MongoDB."""
    if body.category_id not in _ic_default_pricing:
        raise HTTPException(status_code=400, detail="Unknown category_id")
    if body.user_type not in ("photographer", "normal_user"):
        raise HTTPException(status_code=400, detail="user_type must be photographer|normal_user")
    update_doc = {"category_id": body.category_id, "user_type": body.user_type}
    if body.design_credits is not None:
        update_doc["design_credits"] = body.design_credits
    if body.feature_credits is not None:
        update_doc["feature_credits"] = body.feature_credits
    # Upsert into a small collection so super-admin overrides are persisted.
    await db.event_category_pricing.update_one(
        {"category_id": body.category_id, "user_type": body.user_type},
        {"$set": update_doc},
        upsert=True,
    )
    # Update in-memory cache so subsequent reads reflect immediately.
    current = _ic_default_pricing.setdefault(body.category_id, {}).setdefault(body.user_type, {})
    if body.design_credits is not None:
        current["design_credits"] = body.design_credits
    if body.feature_credits is not None:
        current.setdefault("feature_credits", {}).update(body.feature_credits)
    return {"success": True, "pricing": current}


# ===========================================================================



# PHASE 29C: Standardized Error Response Helper
class ErrorResponse:
    """Standardized error response format"""
    
    @staticmethod
    def not_found(detail: str = "Resource not found"):
        """404 - Resource not found"""
        return HTTPException(
            status_code=404,
            detail={
                "error": "Not Found",
                "message": detail,
                "status_code": 404
            }
        )
    
    @staticmethod
    def expired(detail: str = "Resource has expired"):
        """410 - Resource expired/gone"""
        return HTTPException(
            status_code=410,
            detail={
                "error": "Expired",
                "message": detail,
                "status_code": 410
            }
        )
    
    @staticmethod
    def bad_request(detail: str = "Invalid request"):
        """400 - Bad request/validation error"""
        return HTTPException(
            status_code=400,
            detail={
                "error": "Bad Request",
                "message": detail,
                "status_code": 400
            }
        )
    
    @staticmethod
    def rate_limited(detail: str = "Too many requests"):
        """429 - Rate limit exceeded"""
        return HTTPException(
            status_code=429,
            detail={
                "error": "Too Many Requests",
                "message": detail,
                "status_code": 429
            }
        )
    
    @staticmethod
    def server_error(detail: str = "Internal server error"):
        """500 - Internal server error"""
        return HTTPException(
            status_code=500,
            detail={
                "error": "Internal Server Error",
                "message": detail,
                "status_code": 500
            }
        )


# Helper Functions
def generate_slug(groom_name: str, bride_name: str) -> str:
    """Generate unique URL slug from names. Robust to empty / whitespace-only /
    non-alphabetic names: `"".split()[0]` used to raise IndexError and 500 the
    whole profile-create — a draft saved before names are filled hits exactly
    that."""
    def _first(name: str) -> str:
        parts = (name or "").split()
        return re.sub(r'[^a-zA-Z]', '', parts[0].lower()) if parts else ""
    groom = _first(groom_name) or "invite"
    bride = _first(bride_name) or "guest"
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{groom}-{bride}-{suffix}"


def calculate_expiry_date(expiry_type: str, expiry_value: Optional[int]) -> Optional[datetime]:
    """Calculate link expiry date"""
    now = datetime.now(timezone.utc)
    
    # Default to 30 days if not specified
    if not expiry_type or expiry_type == "days":
        days = expiry_value if expiry_value else 30
        return now + timedelta(days=days)
    elif expiry_type == "hours" and expiry_value:
        return now + timedelta(hours=expiry_value)
    
    return None


def calculate_invitation_expires_at(event_date: datetime, expires_at: Optional[datetime] = None) -> datetime:
    """Calculate invitation expiry date. Default: event_date + 7 days"""
    if expires_at:
        return expires_at
    
    # Ensure event_date is timezone-aware
    if event_date.tzinfo is None:
        event_date = event_date.replace(tzinfo=timezone.utc)
    
    # Default: wedding date + 7 days
    return event_date + timedelta(days=7)


async def check_profile_active(profile: dict) -> bool:
    """Check if profile is active and not expired"""
    if not profile:
        return False
    # If explicitly disabled, treat as inactive
    if profile.get('is_active') is False:
        return False
    # Check link_expiry_date if present
    expiry = profile.get('link_expiry_date') or profile.get('expires_at')
    if expiry:
        if isinstance(expiry, str):
            try:
                expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
            except Exception:
                return True
        if getattr(expiry, 'tzinfo', None) is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expiry:
            return False
    return True


# ---------------------------------------------------------------------------
# Canonical public URL + numeric-invite resolution
#   url_utils.build_public_url is the ONE source of the public origin (never
#   request.host / VM IP). invite_number holds the atomic sequential number.
# ---------------------------------------------------------------------------
from url_utils import build_public_url, public_base_url  # noqa: E402
from invite_number import assign_invite_no, invite_code, ensure_counter  # noqa: E402


def _invite_identifier(profile: dict) -> str:
    """Preferred public path segment: the zero-padded number when present, else
    the legacy slug (back-compat for rows created before numbering)."""
    return invite_code(profile.get('invite_no')) or profile.get('slug') or ''


def _canonical_invite_link(profile: dict) -> str:
    """Relative canonical invite path /invite/{number|slug}/{name-slug}. Set as
    `invitation_link` on admin responses so the studio panel shows guests' URL."""
    ident = _invite_identifier(profile)
    name = profile.get('name_slug')
    return f"/invite/{ident}/{name}" if name else f"/invite/{ident}"


def _invite_canonical_url(profile: dict) -> Optional[str]:
    ident = _invite_identifier(profile)
    base = public_base_url()
    if not ident or not base:
        return None
    name = profile.get('name_slug')
    return f"{base}/invite/{ident}/{name}" if name else f"{base}/invite/{ident}"


def _invite_face_match_url(profile: dict) -> Optional[str]:
    ident = _invite_identifier(profile)
    base = public_base_url()
    if not ident or not base:
        return None
    return f"{base}/invite/{ident}/find-my-photos"


def _is_publicly_visible(profile: dict) -> bool:
    """Extra guard applied ONLY to numeric-code resolution: a sequential number
    is guessable, so a draft/template must not be reachable BY NUMBER even though
    the owner can still preview it via its (random, unguessable) slug."""
    if not profile:
        return False
    if profile.get('is_template') is True:
        return False
    if profile.get('is_published') is False:
        return False
    return True


async def _resolve_public_profile(identifier: str) -> Optional[dict]:
    """Resolve a public invite identifier → profile doc (or None). An all-digit
    identifier ('00001' / '1') resolves by invite_no; anything else by the legacy
    slug. This is the ONLY place number→profile happens; every other slug lookup
    in the app is untouched (they receive the legacy slug from the payload)."""
    ident = (identifier or '').strip()
    if ident.isdigit():
        try:
            prof = await db.profiles.find_one({"invite_no": int(ident)}, {"_id": 0})
        except Exception:
            prof = None
        if prof:
            return prof
        # generate_slug never emits an all-digit slug, so nothing else matches;
        # fall through is harmless.
    return await db.profiles.find_one({"slug": ident}, {"_id": 0})



async def _track_invitation_view_audit(profile_id: str, client_ip: str):
    """Track invitation view. Counters (view_count / unique_visitors) are
    buffered in Redis and flushed in batches by _flush_view_counts, so a hot or
    viral invitation never serialises every view on the same profile row — the
    exact contention a single-slug load test exposed (Lock/tuple waits).

    Redis path also uses a per-invite IP set to detect new visitors WITHOUT the
    per-view find_one. Visitor DETAIL rows (used by the analytics list) are still
    written, but only for genuinely new IPs, so repeat views do zero DB work."""
    try:
        now = datetime.now(timezone.utc)
        handled, is_new_visitor = await view_track_redis(profile_id, client_ip)

        if handled:
            if is_new_visitor:
                # Different row per visitor_key — not the hot profile row, so no
                # contention. Kept for the admin visitor-analytics view.
                try:
                    await db.invitation_visitors.insert_one({
                        "visitor_key": f"{profile_id}_{client_ip}",
                        "profile_id": profile_id,
                        "client_ip": client_ip,
                        "first_visit": now,
                        "last_visit": now,
                    })
                except Exception:
                    pass  # duplicate under a race is harmless
            return

        # ---- Fallback: no Redis (single-worker/dev). Original direct-DB path. ----
        await db.profiles.update_one(
            {"id": profile_id},
            {"$inc": {"view_count": 1}, "$set": {"last_viewed_at": now}},
        )
        visitor_key = f"{profile_id}_{client_ip}"
        visitor_exists = await db.invitation_visitors.find_one({"visitor_key": visitor_key})
        if not visitor_exists:
            await db.invitation_visitors.insert_one({
                "visitor_key": visitor_key,
                "profile_id": profile_id,
                "client_ip": client_ip,
                "first_visit": now,
                "last_visit": now,
            })
            await db.profiles.update_one(
                {"id": profile_id}, {"$inc": {"unique_visitors": 1}},
            )
        else:
            await db.invitation_visitors.update_one(
                {"visitor_key": visitor_key}, {"$set": {"last_visit": now}},
            )
    except Exception as e:
        # Don't fail the request if tracking fails
        logger.error(f"Error tracking invitation view: {str(e)}")


# Imported here (not at module top) to sit beside the tracker that uses it.
from cache_backend import view_track_redis, view_flush_redis  # noqa: E402


async def _flush_view_counts():
    """Drain the Redis view buffers into Postgres — one batched UPDATE per
    profile. Registered on the leader-only scheduler, so it runs in exactly one
    worker regardless of WEB_CONCURRENCY."""
    try:
        deltas = await view_flush_redis()
        if not deltas:
            return
        now = datetime.now(timezone.utc)
        for pid, (views, uniq) in deltas.items():
            inc = {}
            if views:
                inc["view_count"] = views
            if uniq:
                inc["unique_visitors"] = uniq
            upd = {"$set": {"last_viewed_at": now}}
            if inc:
                upd["$inc"] = inc
            await db.profiles.update_one({"id": pid}, upd)
    except Exception as e:
        logger.warning("[view-flush] failed: %s", e)


# PHASE 35: Data Isolation Helper
def build_isolation_query(base_query: dict, admin_data: dict) -> dict:
    """
    Build query with data isolation for multi-tenant architecture
    Super Admin can access all data, regular Admins only their own
    """
    query = base_query.copy()
    
    # Super Admin bypass - can access all data
    if admin_data['role'] == 'super_admin':
        return query
    
    # Regular Admin - enforce data isolation
    query['admin_id'] = admin_data['admin_id']
    return query


async def check_profile_ownership(profile_id: str, admin_data, db) -> dict:
    """
    Check if admin owns the profile (or is Super Admin)
    Accepts either an admin_id string (from get_current_admin) or an admin dict.
    Returns profile if authorized, raises 404 if not found or unauthorized.
    """
    # Normalize to a dict with 'role' + 'admin_id'
    if isinstance(admin_data, str):
        admin_doc = await db.admins.find_one({"id": admin_data}) or {}
        admin_data = {"role": admin_doc.get("role", "admin"), "admin_id": admin_data}
    elif "admin_id" not in admin_data:
        admin_data = {"role": admin_data.get("role", "admin"), "admin_id": admin_data.get("id")}
    
    query = build_isolation_query({"id": profile_id}, admin_data)
    profile = await db.profiles.find_one(query, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return profile


async def check_profile_active_old(profile: dict) -> bool:
    """Check if profile is active and not expired"""
    if not profile.get('is_active', True):
        return False
    
    expiry_date = profile.get('link_expiry_date')
    if expiry_date:
        if isinstance(expiry_date, str):
            expiry_date = datetime.fromisoformat(expiry_date)
        
        # Ensure expiry_date is timezone-aware
        if expiry_date.tzinfo is None:
            expiry_date = expiry_date.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expiry_date:
            return False
    
    return True


def get_client_ip(request: Request) -> str:
    """Get client IP address from request.

    Delegates to cache_backend.client_ip — trusting X-Forwarded-For[0]
    unconditionally (the old body of this function) is spoofable by the
    client, which defeated every per-IP rate limit in the app. The shared
    helper only trusts XFF for as many hops as TRUSTED_PROXY_COUNT names
    (default 0 = direct peer only)."""
    from cache_backend import client_ip as _safe_client_ip
    return _safe_client_ip(request)


from rsvp_status import normalize_rsvp_status  # noqa: E402  one vocab for all RSVP aggregations


async def check_rate_limit(ip_address: str, endpoint: str, max_count: int) -> bool:
    """
    Check if IP has exceeded rate limit for endpoint
    Returns True if allowed, False if limit exceeded
    
    Args:
        ip_address: Client IP address
        endpoint: "rsvp" or "wishes"
        max_count: Maximum allowed submissions per day
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Find or create rate limit record
    rate_record = await db.rate_limits.find_one({
        "ip_address": ip_address,
        "endpoint": endpoint,
        "date": today
    }, {"_id": 0})
    
    if not rate_record:
        # Create new record
        new_record = RateLimit(
            ip_address=ip_address,
            endpoint=endpoint,
            date=today,
            count=1
        )
        doc = new_record.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.rate_limits.insert_one(doc)
        return True
    
    # Check if limit exceeded
    if rate_record['count'] >= max_count:
        return False

    # Phase-2 audit fix: increment counter for existing record + return True.
    # The original function fell off the end (implicit None) which the
    # caller `if not await check_rate_limit(...)` treated as "limit hit"
    # → every 2nd request from the same IP was rejected with 429.
    await db.rate_limits.update_one(
        {"ip_address": ip_address, "endpoint": endpoint, "date": today},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return True


def generate_event_links(slug: str, events: List) -> Dict[str, str]:
    """
    PHASE 13: Generate event-specific invitation links
    
    Args:
        slug: Profile slug
        events: List of event dictionaries or WeddingEvent objects
    
    Returns:
        Dictionary mapping event_type to full invitation link
    """
    event_links = {}
    for event in events:
        # Handle both dict and WeddingEvent object
        if hasattr(event, 'event_type'):
            # WeddingEvent object - handle enum properly
            event_type_raw = event.event_type
            if hasattr(event_type_raw, 'value'):
                event_type = event_type_raw.value.lower()
            else:
                event_type = str(event_type_raw).lower()
            visible = getattr(event, 'visible', True)
        else:
            # Dictionary
            event_type = event.get('event_type', '').lower()
            visible = event.get('visible', True)
            
        if event_type and visible:
            event_links[event_type] = f"/invite/{slug}/{event_type}"
    return event_links


async def log_audit_action(
    action: str, 
    admin_id: str, 
    profile_id: Optional[str] = None,
    profile_slug: Optional[str] = None,
    details: Optional[dict] = None
):
    """
    Log admin action to audit log
    Automatically maintains last 1000 logs
    
    Args:
        action: Action type (profile_create, profile_update, profile_delete, profile_duplicate, template_save)
        admin_id: Admin user ID
        profile_id: Profile ID if applicable
        profile_slug: Profile slug if applicable
        details: Additional context like profile names
    """
    try:
        # Create audit log entry
        audit_log = AuditLog(
            action=action,
            admin_id=admin_id,
            profile_id=profile_id,
            profile_slug=profile_slug,
            details=details or {}
        )
        
        doc = audit_log.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        
        # Insert log
        await db.audit_logs.insert_one(doc)
        
        # Maintain only last 1000 logs
        total_logs = await db.audit_logs.count_documents({})
        if total_logs > 1000:
            # Get the 1000th oldest log timestamp
            logs_to_keep = await db.audit_logs.find({}, {"_id": 0, "timestamp": 1}).sort("timestamp", -1).skip(999).limit(1).to_list(1)
            if logs_to_keep:
                cutoff_timestamp = logs_to_keep[0]['timestamp']
                # Delete all logs older than cutoff
                await db.audit_logs.delete_many({"timestamp": {"$lt": cutoff_timestamp}})
    
    except Exception as e:
        # Log error but don't fail the main operation
        logging.error(f"Failed to create audit log: {e}")





# HTML Sanitization
ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'h4']
ALLOWED_ATTRIBUTES = {'a': ['href', 'title']}

def sanitize_html(html: str) -> str:
    """Sanitize HTML to prevent XSS attacks"""
    if not html:
        return html
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )


# File Upload Validation
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

def validate_image_file(file: UploadFile) -> tuple[bool, str]:
    """Validate image file"""
    # Check extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, "Invalid file type. Allowed: JPG, PNG, WebP, GIF"
    
    # Check file size
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        return False, "File too large. Maximum size: 5MB"
    
    return True, ""


async def convert_to_webp(file: UploadFile, quality: int = 85) -> tuple[bytes, int]:
    """Convert image to WebP format and return bytes with size"""
    try:
        # Read image
        image_data = await file.read()
        img = PILImage.open(io.BytesIO(image_data))
        
        # Convert RGBA to RGB if necessary
        if img.mode in ('RGBA', 'LA', 'P'):
            background = PILImage.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        
        # Resize if too large (max 1920px width)
        max_width = 1920
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), PILImage.Resampling.LANCZOS)
        
        # Convert to WebP
        output = io.BytesIO()
        img.save(output, format='WebP', quality=quality, optimize=True)
        webp_data = output.getvalue()
        
        return webp_data, len(webp_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")


# Mobile-perf: multi-size responsive WebP pipeline.
# Generates 320 / 640 / 1280 / original variants from a single upload, all WebP,
# preserves EXIF orientation, preserves aspect ratio (no crop). Returns paths
# + intrinsic dimensions so the frontend can render <picture srcset> + width/height
# without layout shift.
RESPONSIVE_WIDTHS = [
    ("small",  320),
    ("medium", 640),
    ("large",  1280),
]
RESPONSIVE_ORIGINAL_MAX = 1920  # cap for "original" variant to avoid 10MP files
RESPONSIVE_QUALITY = {
    "small":    78,
    "medium":   82,
    "large":    85,
    "original": 88,
}


async def convert_to_webp_responsive(
    file: UploadFile,
    out_dir: Path,
    base_name: str,
) -> Dict[str, Any]:
    """Generate small/medium/large/original WebP variants of an upload.

    Args:
        file:       FastAPI UploadFile (image)
        out_dir:    directory to write files into (must exist)
        base_name:  filename without extension. Variant suffix is appended:
                    {base_name}_small.webp, _medium.webp, _large.webp, .webp (= original)

    Returns dict with shape:
        {
          "small":    "/uploads/.../base_small.webp",
          "medium":   "/uploads/.../base_medium.webp",
          "large":    "/uploads/.../base_large.webp",
          "original": "/uploads/.../base.webp",
          "width":    intrinsic original width (after orientation fix, capped),
          "height":   intrinsic original height,
          "size":     bytes of original variant (legacy compat),
        }

    Paths returned are URL paths (prefixed with /uploads/...) — caller is
    responsible for passing out_dir that lives under /app/uploads.
    """
    try:
        raw = await file.read()
        img = PILImage.open(io.BytesIO(raw))

        # Preserve EXIF orientation (phones photograph sideways).
        from PIL import ImageOps as _ImageOps
        img = _ImageOps.exif_transpose(img)

        # Flatten alpha onto white for predictable WebP
        if img.mode in ('RGBA', 'LA', 'P'):
            bg = PILImage.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Cap original variant width
        orig = img
        if orig.width > RESPONSIVE_ORIGINAL_MAX:
            ratio = RESPONSIVE_ORIGINAL_MAX / orig.width
            new_h = int(orig.height * ratio)
            orig = orig.resize((RESPONSIVE_ORIGINAL_MAX, new_h), PILImage.Resampling.LANCZOS)

        out_dir.mkdir(parents=True, exist_ok=True)
        # Map filesystem dir -> URL prefix
        try:
            rel = out_dir.relative_to(Path("/app"))
            url_prefix = f"/{rel.as_posix()}"
        except Exception:
            url_prefix = f"/uploads/{out_dir.name}"

        variants: Dict[str, str] = {}
        # Original (capped)
        orig_path = out_dir / f"{base_name}.webp"
        with open(orig_path, "wb") as f:
            buf = io.BytesIO()
            orig.save(buf, format="WebP", quality=RESPONSIVE_QUALITY["original"], optimize=True)
            data = buf.getvalue()
            f.write(data)
        variants["original"] = f"{url_prefix}/{orig_path.name}"
        original_size = len(data)

        # Smaller variants — never upscale.
        for label, target_w in RESPONSIVE_WIDTHS:
            if target_w >= orig.width:
                # Source is already smaller than target — reuse original.
                variants[label] = variants["original"]
                continue
            ratio = target_w / orig.width
            new_h = max(1, int(orig.height * ratio))
            small = orig.resize((target_w, new_h), PILImage.Resampling.LANCZOS)
            sbuf = io.BytesIO()
            small.save(sbuf, format="WebP", quality=RESPONSIVE_QUALITY[label], optimize=True)
            sp = out_dir / f"{base_name}_{label}.webp"
            with open(sp, "wb") as fh:
                fh.write(sbuf.getvalue())
            variants[label] = f"{url_prefix}/{sp.name}"

        variants["width"]  = orig.width
        variants["height"] = orig.height
        variants["size"]   = original_size
        return variants
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")


# ---------------------------------------------------------------------------
# Invitation media -> S3 (invitation bucket), keyed by event.
#
# The invitation upload endpoints historically wrote to /app/uploads on the VM
# and served the bytes back through the app server. These helpers send the same
# assets to the invitation S3 bucket (maja-invitations-media-2026) under
# photographer/{pid}/event/{eid}/invitation/{iid}/... and return a signed
# /api/media URL that 302s to a presigned S3 GET. When the invitation bucket is
# NOT configured (local dev / no AWS) they fall back to the old on-disk path so
# development keeps working; production, where the bucket is set, never writes
# invitation media to the VM disk. aws_service/media_storage are imported at
# call time (they are not module-level here) — same pattern as gallery_features.
# ---------------------------------------------------------------------------
# Invitation media URLs are STORED in the DB (couple_photo_url, media_url, …) and
# returned in the public invite payload, so their /api/media token must not expire
# like the per-request gallery tokens do. The token is only an authz wrapper — the
# actual S3 URL is still minted fresh (short-lived) on every 302 — and invitation
# media is public on the invite page anyway, so a long-lived token is safe.
_INVITE_MEDIA_URL_TTL = 10 * 365 * 24 * 3600  # ~10 years


def _invitation_bucket() -> str:
    try:
        import media_storage
        return media_storage.bucket_for("invitation") or ""
    except Exception:
        return ""


def _invitation_ids(profile: dict, event_id: Optional[str] = None):
    """(photographer_id, event_id, invitation_id) for the invitation S3 key. A
    wedding profile IS its own event + invitation, so its id doubles for both
    when a more specific id is not supplied."""
    pid = profile.get("id") or "unknown"
    return (profile.get("admin_id") or "unknown", event_id or pid, pid)


def _store_invitation_bytes(data: bytes, *, kind: str, mime: str, profile: dict,
                            event_id: Optional[str], disk_path: Path, disk_url: str,
                            fallback_ext: str = ".bin") -> str:
    """Store one invitation asset (video/music/image blob). S3 invitation bucket
    when configured, else local disk (dev). Returns the URL to persist."""
    bucket = _invitation_bucket()
    if bucket:
        import media_storage
        import aws_service
        from storage_serve import media_url
        ext = media_storage.extension_for(kind, mime or "") or fallback_ext
        photographer_id, eid, iid = _invitation_ids(profile, event_id)
        key = media_storage.invitation_media_key(photographer_id, eid, iid, kind, ext)
        aws_service.upload_bytes(key, data, mime or "application/octet-stream",
                                 bucket_name=bucket)
        return media_url(key, expiry_seconds=_INVITE_MEDIA_URL_TTL, bucket=bucket)
    disk_path.parent.mkdir(parents=True, exist_ok=True)
    with open(disk_path, "wb") as f:
        f.write(data)
    return disk_url


def _render_webp_variants(raw: bytes):
    """Responsive WebP variants as bytes (no I/O): {label: bytes} + (w, h).
    Reused labels share the SAME bytes object so callers upload/write once.
    Mirrors convert_to_webp_responsive's image pipeline exactly."""
    img = PILImage.open(io.BytesIO(raw))
    from PIL import ImageOps as _ImageOps
    img = _ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'LA', 'P'):
        bg = PILImage.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        bg.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    orig = img
    if orig.width > RESPONSIVE_ORIGINAL_MAX:
        ratio = RESPONSIVE_ORIGINAL_MAX / orig.width
        orig = orig.resize((RESPONSIVE_ORIGINAL_MAX, int(orig.height * ratio)),
                           PILImage.Resampling.LANCZOS)

    def _enc(im, q):
        b = io.BytesIO()
        im.save(b, format="WebP", quality=q, optimize=True)
        return b.getvalue()

    variants = {"original": _enc(orig, RESPONSIVE_QUALITY["original"])}
    for label, target_w in RESPONSIVE_WIDTHS:
        if target_w >= orig.width:
            variants[label] = variants["original"]  # never upscale — reuse
        else:
            ratio = target_w / orig.width
            small = orig.resize((target_w, max(1, int(orig.height * ratio))),
                                PILImage.Resampling.LANCZOS)
            variants[label] = _enc(small, RESPONSIVE_QUALITY[label])
    return variants, orig.width, orig.height


def store_invitation_image_variants(raw: bytes, *, profile: dict,
                                    event_id: Optional[str], out_dir: Path,
                                    base_name: str) -> Dict[str, Any]:
    """S3 counterpart of convert_to_webp_responsive for invitation images:
    responsive WebP variants to the invitation bucket, returning signed
    /api/media URLs (shape: small/medium/large/original/width/height/size).
    Dev/no-AWS fallback writes the variants to `out_dir` on disk."""
    variants, width, height = _render_webp_variants(raw)
    order = ("original", "small", "medium", "large")
    out: Dict[str, Any] = {}
    bucket = _invitation_bucket()
    if bucket:
        import media_storage
        import aws_service
        from storage_serve import media_url
        photographer_id, eid, iid = _invitation_ids(profile, event_id)
        seen: Dict[int, str] = {}
        for label in order:
            data = variants[label]
            oid = id(data)
            if oid not in seen:
                key = media_storage.invitation_media_key(photographer_id, eid, iid, "image", ".webp")
                aws_service.upload_bytes(key, data, "image/webp", bucket_name=bucket)
                seen[oid] = media_url(key, expiry_seconds=_INVITE_MEDIA_URL_TTL, bucket=bucket)
            out[label] = seen[oid]
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        try:
            rel = out_dir.relative_to(Path("/app"))
            url_prefix = f"/{rel.as_posix()}"
        except Exception:
            url_prefix = f"/uploads/{out_dir.name}"
        seen_paths: Dict[int, str] = {}
        for label in order:
            data = variants[label]
            oid = id(data)
            if oid not in seen_paths:
                name = f"{base_name}.webp" if label == "original" else f"{base_name}_{label}.webp"
                with open(out_dir / name, "wb") as fh:
                    fh.write(data)
                seen_paths[oid] = f"{url_prefix}/{name}"
            out[label] = seen_paths[oid]
    out["width"] = width
    out["height"] = height
    out["size"] = len(variants["original"])
    return out


# PHASE 25: Basic Profanity Filter
PROFANITY_WORDS = [
    'damn', 'hell', 'shit', 'fuck', 'ass', 'bitch', 'bastard', 'crap',
    'dick', 'piss', 'slut', 'whore', 'idiot', 'stupid', 'dumb'
]

def contains_profanity(text: str) -> bool:
    """Basic profanity filter check"""
    text_lower = text.lower()
    for word in PROFANITY_WORDS:
        if word in text_lower:
            return True
    return False


# ==================== AUTH ROUTES ====================

@api_router.post("/auth/login")
async def login(login_data: AdminLogin, request: Request, response: Response):
    """Admin login endpoint - supports both Super Admin and Admin.
    Accepts either email or username via `email` or `username_or_email`."""
    identifier = (login_data.username_or_email or login_data.email or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or username is required")

    # H4: brute-force throttle — cap attempts per source IP and per identifier
    # (fixed window, Redis-backed with in-memory fallback). Stops credential
    # spraying without affecting normal use.
    from cache_backend import rate_limit_allow
    _ip = (request.client.host if request and request.client else "unknown")
    if not await rate_limit_allow(f"login:ip:{_ip}", limit=15, window_seconds=900):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in a few minutes.")
    if not await rate_limit_allow(f"login:id:{identifier.lower()}", limit=10, window_seconds=900):
        raise HTTPException(status_code=429, detail="Too many login attempts for this account. Try again later.")

    # H4c: exponential lockout backoff on repeated failures (password or MFA),
    # layered on top of the fixed-window rate limits above.
    from cache_backend import kv_get_json, kv_set_json, kv_del
    _backoff_key = f"login_backoff:{identifier.lower()}"
    _backoff = await kv_get_json(_backoff_key) or {}
    if _backoff.get("until"):
        _until_dt = datetime.fromisoformat(_backoff["until"])
        _now_dt = datetime.now(timezone.utc)
        if _now_dt < _until_dt:
            _retry_after = int((_until_dt - _now_dt).total_seconds()) + 1
            raise HTTPException(
                status_code=429,
                detail="Too many failed attempts. Try again later.",
                headers={"Retry-After": str(_retry_after)},
            )

    async def _login_backoff_bump():
        fails = int(_backoff.get("fails", 0)) + 1
        upd = {"fails": fails}
        if fails >= 5:
            delay = min(60 * (2 ** (fails - 5)), 3600)
            upd["until"] = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
        await kv_set_json(_backoff_key, upd, 7200)

    # Look up by email first, then by username (case-insensitive)
    admin = await db.admins.find_one({"email": identifier.lower()}, {"_id": 0})
    if not admin:
        admin = await db.admins.find_one({"username": identifier.lower()}, {"_id": 0})

    # FIX (Bug 9): Supabase-created accounts have password_hash="$supabase$"
    # which is not a valid bcrypt/passlib hash. passlib.verify() would raise
    # UnknownHashError and turn into an unhandled 500. Intercept first and
    # return a clear 400 telling the user to use Google/Supabase sign-in.
    if admin and (admin.get('password_hash') == "$supabase$" or
                  (isinstance(admin.get('password_hash'), str) and admin['password_hash'].startswith("$supabase"))):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google/Supabase sign-in. Please use 'Sign in with Google' or request a magic link instead of a password."
        )

    # Wrap verify_password in try/except so any malformed legacy hash also
    # returns a clean 401 rather than crashing the request with a 500.
    password_ok = False
    if admin:
        try:
            password_ok = verify_password(login_data.password, admin.get('password_hash') or "")
        except Exception as _verify_err:
            logger.warning(f"verify_password raised for admin {admin.get('email')}: {_verify_err}")
            password_ok = False

    if not admin or not password_ok:
        # Persist the failed attempt for the User Investigation Center (Phase 5).
        try:
            from user_investigation import record_login_attempt
            await record_login_attempt(db, identifier, _ip, "admin", ok=False,
                                       reason="no_such_admin" if not admin else "bad_password")
        except Exception:
            pass
        await _login_backoff_bump()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials"
        )

    # PHASE 35: Check account status
    if admin.get('status') == AdminStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended. Please contact support."
        )
    
    if admin.get('status') == AdminStatus.INACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account inactive. Please contact support."
        )

    # PHASE 32/T4: MFA — if enabled on this admin, require a valid TOTP code
    # (or an unused hashed backup code) before issuing a token.
    _mfa = admin.get("mfa") or {}
    if _mfa.get("enabled"):
        from admin_security import verify_totp, _hash_code
        _code = (login_data.totp_code or "").strip()
        if not _code:
            raise HTTPException(status_code=401, detail={"code": "MFA_REQUIRED", "message": "TOTP code required"})
        _backup_codes = _mfa.get("backup_codes") or []
        _hashed = _hash_code(_code)
        if verify_totp(_mfa.get("secret", ""), _code):
            pass
        elif _hashed in _backup_codes:
            # Backup codes are single-use — remove the consumed one.
            await db.admins.update_one({"id": admin["id"]}, {"$pull": {"mfa.backup_codes": _hashed}})
        else:
            await _login_backoff_bump()
            raise HTTPException(status_code=401, detail={"code": "MFA_INVALID", "message": "Invalid TOTP or backup code"})

    await kv_del(_backoff_key)

    # PHASE 35: Include role in token
    access_token = create_access_token(data={
        "sub": admin['id'],
        "role": admin.get('role', AdminRole.ADMIN.value)
    })

    # Migrate-on-next-login: idempotently mirror this admin into Supabase Auth
    # so subsequent logins can go directly through supabase-js. Best-effort —
    # any failure is logged but never blocks the legacy login flow.
    if not admin.get("supabase_user_id"):
        try:
            from supabase_admin import create_or_get_user as _supa_create
            sup_id = _supa_create(
                email=admin["email"],
                password=login_data.password,
                name=admin.get("name"),
                phone=admin.get("phone"),
            )
            if sup_id:
                await db.admins.update_one(
                    {"id": admin["id"]},
                    {"$set": {"supabase_user_id": sup_id}},
                )
        except Exception as _migrate_exc:
            import logging as _lg
            _lg.getLogger("auth").warning(
                "Supabase migrate-on-login failed for %s: %s",
                admin["email"], _migrate_exc,
            )

    # Phase 1c: start a refresh-token rotation family + device session, delivered
    # as an HttpOnly cookie. Best-effort — never block the (working) login flow.
    try:
        from auth_sessions import issue_session
        await issue_session(db, subject_id=admin['id'], subject_kind='admin',
                            request=request, response=response)
    except Exception as _sess_err:
        logger.warning("issue_session failed for %s: %s", admin.get('email'), _sess_err)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "admin": {
            "id": admin['id'],
            "email": admin['email'],
            "name": admin.get('name', admin['email']),
            "role": admin.get('role', AdminRole.ADMIN.value),
            "status": admin.get('status', AdminStatus.ACTIVE.value),
        }
    }


@api_router.post("/admin/logout")
async def admin_logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """S3 fix (Phase-2 audit): revoke the caller's JWT by inserting its `jti`
    into the `jwt_blacklist` collection. Subsequent requests with this token
    are rejected by `_is_jwt_blacklisted` in auth.py.

    Bounding the collection used to be left to a Mongo TTL index on `exp`.
    Postgres has no TTL index, so that expiry never happened and the table grew
    by one row per logout forever. Nothing breaks — a blacklist entry for an
    already-expired token is merely redundant — but it grows without limit, so
    each logout now sweeps the entries whose tokens have already expired. The
    writer is the only caller, which makes this the cheapest place to keep it
    honest: no scheduler to forget to run."""
    from auth import decode_access_token as _decode
    token = credentials.credentials
    payload = _decode(token) or {}
    jti = payload.get("jti")
    if not jti:
        # Supabase tokens are revoked on the IdP side; nothing to blacklist
        # locally. Still return 200 so the client clears state.
        return {"success": True, "blacklisted": False}

    exp = payload.get("exp")
    try:
        await db.jwt_blacklist.update_one(
            {"jti": jti},
            {"$set": {
                "jti": jti,
                "admin_id": payload.get("sub"),
                "exp": datetime.fromtimestamp(int(exp), tz=timezone.utc) if exp else None,
                "blacklisted_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
        # Keep the lookup index and drop what the TTL index would have dropped.
        try:
            await db.jwt_blacklist.create_index("jti", name="jwt_blacklist_jti")
            await db.jwt_blacklist.delete_many(
                {"exp": {"$lt": datetime.now(timezone.utc).isoformat()}})
        except Exception as e:
            logger.warning("admin_logout: blacklist maintenance failed: %s", e)
    except Exception as e:
        logger.warning("admin_logout: blacklist insert failed: %s", e)
        return {"success": True, "blacklisted": False}

    return {"success": True, "blacklisted": True}



@api_router.get("/auth/me", response_model=AdminResponse)
async def get_current_admin_info(admin_id: str = Depends(get_current_admin)):
    """Get current admin info"""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})

    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    # Credits are stored as total_credits/used_credits — derive available_credits.
    total = admin.get("total_credits", 0) or 0
    used  = admin.get("used_credits", 0) or 0
    admin["available_credits"] = max(total - used, 0)

    # LEGACY-ROW MIGRATION (lazy backfill): rows inserted as raw dicts before/
    # outside the Admin model (demo-studio seeder, manual inserts) can lack the
    # credit keys entirely. AdminResponse now defaults them to 0, but we also
    # normalize the stored row ONCE here so any other code reading these keys
    # directly sees consistent data. Best-effort: a failed backfill must never
    # break /auth/me.
    if "total_credits" not in admin or "used_credits" not in admin:
        admin.setdefault("total_credits", 0)
        admin.setdefault("used_credits", 0)
        try:
            await db.admins.update_one(
                {"id": admin_id},
                {"$set": {"total_credits": int(admin["total_credits"]),
                          "used_credits": int(admin["used_credits"])}},
            )
        except Exception as _bf_err:
            logger.warning("auth/me: legacy credit backfill failed for %s: %s",
                           admin_id, _bf_err)

    return AdminResponse(**admin)


# ==================== SUPABASE AUTH BRIDGE ====================
# Lets the frontend authenticate via Supabase (any flow: email/password,
# magic-link, Google, phone OTP) and still pull its admin row from MongoDB.
# Flow:
#   1. Frontend signs in with supabase-js → obtains access_token (JWT)
#   2. Frontend calls /api/auth/me-supabase with `Authorization: Bearer <sb_jwt>`
#   3. Backend verifies the JWT locally against Supabase JWKS
#   4. Backend finds the admins doc by supabase_user_id, falling back to email
#      (auto-links on first call), then returns the admin profile.
@api_router.get("/auth/me-supabase")
async def get_current_admin_via_supabase(request: Request, response: Response):
    """Verify a Supabase access token and return the linked admin row.

    The frontend uses this once after a successful supabase-js sign-in to
    discover which MongoDB admin the Supabase user corresponds to. The admin
    is auto-linked on first call (matched by email) if needed.
    """
    from auth_supabase import verify_supabase_jwt, SupabaseAuthError

    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth_header.split(None, 1)[1].strip()

    try:
        claims = verify_supabase_jwt(token)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Supabase token: {exc}")

    sb_user_id = claims.get("sub")
    sb_email = (claims.get("email") or "").lower()
    if not sb_user_id:
        raise HTTPException(status_code=401, detail="Token missing user id")

    # 1) Prefer match by supabase_user_id
    admin = await db.admins.find_one({"supabase_user_id": sb_user_id}, {"_id": 0})

    # 2) Fall back to email match — auto-link on first call
    if not admin and sb_email:
        admin = await db.admins.find_one({"email": sb_email}, {"_id": 0})
        if admin:
            await db.admins.update_one(
                {"id": admin["id"]},
                {"$set": {"supabase_user_id": sb_user_id}},
            )
            admin["supabase_user_id"] = sb_user_id

    if not admin:
        # Brand-new Supabase user with no MongoDB counterpart yet.
        # Return enough info so the frontend can present a "complete profile" UI.
        raise HTTPException(
            status_code=404,
            detail={
                "error": "no_admin_record",
                "message": "Supabase user has no admin profile yet. Complete sign-up first.",
                "supabase_user_id": sb_user_id,
                "email": sb_email,
            },
        )

    # Status guards (suspended / inactive)
    if admin.get("status") == AdminStatus.SUSPENDED.value:
        raise HTTPException(status_code=403, detail="Account suspended. Please contact support.")
    if admin.get("status") == AdminStatus.INACTIVE.value:
        raise HTTPException(status_code=403, detail="Account inactive. Please contact support.")

    # Issue a legacy app JWT so existing /api/* endpoints (which use the legacy
    # token via get_current_admin) work without rewiring every route.
    legacy_token = create_access_token(data={
        "sub": admin["id"],
        "role": admin.get("role", AdminRole.ADMIN.value),
    })

    # Every admin session gets a refresh cookie (maja_rt) so the frontend's
    # silent-refresh works and access tokens can stay short-lived. Guarded so a
    # session issue never breaks sign-in.
    try:
        from auth_sessions import issue_session
        await issue_session(db, subject_id=admin["id"], subject_kind="admin",
                            request=request, response=response)
    except Exception as _sess_err:
        logger.warning("issue_session (me-supabase) failed: %s", _sess_err)

    total = admin.get("total_credits", 0) or 0
    used = admin.get("used_credits", 0) or 0

    return {
        "access_token": legacy_token,
        "token_type": "bearer",
        "admin": {
            "id": admin["id"],
            "email": admin["email"],
            "name": admin.get("name", admin["email"]),
            "username": admin.get("username"),
            "phone": admin.get("phone"),
            "role": admin.get("role", AdminRole.ADMIN.value),
            "status": admin.get("status", AdminStatus.ACTIVE.value),
            "available_credits": max(total - used, 0),
            "supabase_user_id": sb_user_id,
        },
    }


@api_router.post("/auth/sync-supabase-user")
async def sync_supabase_user(request: Request, response: Response, payload: dict):
    """Create a MongoDB admin row for a freshly-signed-up Supabase user.

    Called by the frontend right after a successful supabase.auth.signUp()
    (email/password) or after the email verification redirect completes.
    Returns the same shape as /api/auth/login so the frontend can drop the
    user straight into the dashboard.

    Body: { name: str, phone?: str, username?: str }
    Auth: Authorization: Bearer <supabase_access_token>
    """
    from auth_supabase import verify_supabase_jwt, SupabaseAuthError

    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth_header.split(None, 1)[1].strip()

    try:
        claims = verify_supabase_jwt(token)
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Supabase token: {exc}")

    sb_user_id = claims.get("sub")
    sb_email = (claims.get("email") or "").lower()
    if not sb_user_id or not sb_email:
        raise HTTPException(status_code=400, detail="Supabase token missing sub/email")

    name = (payload.get("name") or "").strip() or sb_email.split("@")[0]
    phone = (payload.get("phone") or "").strip() or None
    username = (payload.get("username") or "").strip().lower() or None

    # Idempotent: if a row already exists (by supabase_user_id or email), return it.
    existing = await db.admins.find_one(
        {"$or": [{"supabase_user_id": sb_user_id}, {"email": sb_email}]},
        {"_id": 0},
    )
    if existing:
        # Make sure the link is set so future /me-supabase calls don't re-link
        if not existing.get("supabase_user_id"):
            await db.admins.update_one(
                {"id": existing["id"]},
                {"$set": {"supabase_user_id": sb_user_id}},
            )
        admin = existing
    else:
        # Uniqueness pre-checks
        if username and await db.admins.find_one({"username": username}):
            raise HTTPException(status_code=400, detail="Username already taken")
        if phone and await db.admins.find_one({"phone": phone}):
            raise HTTPException(status_code=400, detail="Phone number already registered")

        new_admin = Admin(
            email=sb_email,
            password_hash="$supabase$",  # placeholder — auth is delegated to Supabase
            name=name,
            role=AdminRole.ADMIN,
            status=AdminStatus.ACTIVE,
            total_credits=0,
            used_credits=0,
            username=username,
            phone=phone,
            phone_verified=bool(phone) and bool(claims.get("phone_verified")),
            self_signup=True,
            created_by=None,
        )
        doc = new_admin.model_dump()
        doc["supabase_user_id"] = sb_user_id
        await db.admins.insert_one(doc)
        admin = doc

    legacy_token = create_access_token(data={
        "sub": admin["id"],
        "role": admin.get("role", AdminRole.ADMIN.value),
    })
    # Refresh cookie so silent-refresh works for Supabase signups too (guarded).
    try:
        from auth_sessions import issue_session
        await issue_session(db, subject_id=admin["id"], subject_kind="admin",
                            request=request, response=response)
    except Exception as _sess_err:
        logger.warning("issue_session (sync-supabase) failed: %s", _sess_err)
    total = admin.get("total_credits", 0) or 0
    used = admin.get("used_credits", 0) or 0
    return {
        "success": True,
        "access_token": legacy_token,
        "token_type": "bearer",
        "admin": {
            "id": admin["id"],
            "email": admin["email"],
            "name": admin.get("name"),
            "username": admin.get("username"),
            "phone": admin.get("phone"),
            "phone_verified": admin.get("phone_verified", False),
            "role": admin.get("role", AdminRole.ADMIN.value),
            "status": admin.get("status", AdminStatus.ACTIVE.value),
            "available_credits": max(total - used, 0),
            "supabase_user_id": sb_user_id,
        },
    }


# ==================== PHOTOGRAPHER SELF-SIGNUP ====================

# OTP store lives in the shared KV (Redis when REDIS_URL is set) so a code
# issued on one worker can be verified on another — required once the app runs
# with --workers > 1. Falls back to process-local memory for single-worker dev.
from cache_backend import kv_set_json as _kv_set, kv_get_json as _kv_get, kv_del as _kv_del, acquire_lock as _acquire_lock  # noqa: E402
_OTP_TTL_SECONDS = 600  # 10 minutes


def _otp_key(k: str) -> str:
    return f"otp:{(k or '').strip().lower()}"
# DEV mode flag — when no provider is configured AND DEV_MODE_OTP=1, the OTP is
# returned in the API RESPONSE so signup works locally with no SMS/SMTP.
#
# Defaults to OFF. It used to default ON, which meant a production box with no
# provider configured handed the code straight back to the caller — anyone could
# "verify" any phone or email address, and the OTP gate protected nothing. It is
# now strictly opt-in: set DEV_MODE_OTP=1 in local .env only.
_DEV_MODE_OTP = os.environ.get("DEV_MODE_OTP", "0") == "1"

from sms_service import send_otp_sms, sms_provider_status  # noqa: E402


def _generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))


# ---------------------------------------------------------------------------
# Password reset for LEGACY (bcrypt) admins. Supabase users reset via Supabase.
# No user enumeration: forgot-password always returns 200.
# ---------------------------------------------------------------------------
class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@api_router.post("/auth/forgot-password")
async def auth_forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Email a single-use reset link to a legacy admin. Always returns 200
    (no account enumeration). Supabase-auth users use Supabase's own reset."""
    email = (payload.email or "").strip().lower()
    generic = {"ok": True, "message": "If an account exists, a reset link has been sent."}
    if not email:
        return generic
    # Rate limit so this can't be used to bomb a victim's inbox with reset
    # emails. Per-IP and per-email caps; over the limit we silently no-op
    # (still 200, so no account enumeration).
    from cache_backend import rate_limit_allow, client_ip
    _ip = client_ip(request)
    _ip_ok = await rate_limit_allow(f"forgot_pw_ip:{_ip}", 10, 3600)
    _email_ok = await rate_limit_allow(f"forgot_pw_email:{email}", 3, 3600)
    if not (_ip_ok and _email_ok):
        return generic
    # Photographer/admin (admins collection) first, then normal user (users
    # collection) — the reset flow now covers BOTH identity kinds.
    admin = await db.admins.find_one({"email": email})
    user = None if admin else await db.users.find_one({"email": email})
    if not admin and not user:
        return generic
    import secrets as _secrets
    raw_token = _secrets.token_urlsafe(32)
    await db.password_resets.insert_one({
        "id": uuid.uuid4().hex,
        "kind": "admin" if admin else "user",
        "admin_id": admin["id"] if admin else None,
        "user_id": None if admin else (user.get("user_id") or user.get("id")),
        "email": email,
        "token_hash": _hash_reset_token(raw_token),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        "used": False,
        "created_at": datetime.now(timezone.utc),
    })
    try:
        from email_service import send_email, password_reset_email
        frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        link = f"{frontend}/reset-password?token={raw_token}"
        name = (admin.get("name") if admin else user.get("name")) or ""
        subj, html, text = password_reset_email(name, link)
        await send_email(email, subj, html, text=text, db=db, tags=["password-reset"])
    except Exception as e:
        logger.warning("[auth] reset email send failed: %s", e)
    return generic


@api_router.post("/auth/reset-password")
async def auth_reset_password(payload: ResetPasswordRequest):
    """Complete a legacy-admin password reset using a single-use token."""
    if not payload.token or not payload.password or len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Token and a password (min 8 chars) are required")
    rec = await db.password_resets.find_one({"token_hash": _hash_reset_token(payload.token)})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or already-used reset link")
    expires = rec.get("expires_at")
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Reset link has expired")
    new_hash = get_password_hash(payload.password)
    if rec.get("kind") == "user" or rec.get("user_id"):
        await db.users.update_one(
            {"user_id": rec.get("user_id")},
            {"$set": {"password_hash": new_hash}},
        )
    else:
        await db.admins.update_one(
            {"id": rec["admin_id"]},
            {"$set": {"password_hash": new_hash}},
        )
    await db.password_resets.update_one(
        {"id": rec["id"]}, {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}}
    )
    return {"ok": True, "message": "Password updated. You can now log in."}


@api_router.post("/auth/send-otp")
async def auth_send_otp(payload: OTPSendRequest, request: Request):
    """Send an OTP to a phone number for signup verification.

    Provider auto-selected from env (MSG91 > Twilio > dev mode). When no
    real provider is configured AND DEV_MODE_OTP=1 (default), the OTP is
    echoed back in the response so signup works without an SMS gateway."""
    channel = (payload.channel or "phone").lower()
    email = (payload.email or "").strip().lower()
    # Abuse guard — each send costs a real SMS/email and floods the recipient.
    # Cap per source IP and per recipient (fixed window, Redis w/ mem fallback).
    # The 6-digit code entry is separately capped at 5 tries (verify-otp).
    from cache_backend import rate_limit_allow
    _ip = (request.client.host if request and request.client else "unknown")
    _recipient = (email or (payload.phone or "")).strip().lower()
    if not await rate_limit_allow(f"otp:send:ip:{_ip}", limit=12, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many verification requests. Please wait a while and try again.")
    if _recipient and not await rate_limit_allow(f"otp:send:to:{_recipient}", limit=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many codes requested for this contact. Please wait before requesting another.")
    # The OTP is stored under whichever identifier we deliver to, so verify can
    # match it regardless of channel.
    key = email if (channel == "email" and email) else payload.phone
    otp = _generate_otp()
    await _kv_set(_otp_key(key), {
        "otp": otp,
        "attempts": 0,
        "channel": channel,
        "verified": False,
    }, _OTP_TTL_SECONDS)

    if channel == "email" and email:
        provider = "email"
        real_provider = False
        try:
            from email_service import send_email
            subj = "Your MAJA Invites verification code"
            html = (f"<p>Your MAJA Invites verification code is "
                    f"<b style='font-size:20px'>{otp}</b>.</p>"
                    f"<p>It is valid for 10 minutes.</p>")
            res = await send_email(email, subj, html,
                                   text=f"Your MAJA Invites verification code is {otp} (valid 10 minutes).",
                                   db=db, tags=["otp"])
            # send_email returns a dict; a real provider sets ok=True and a
            # provider other than 'dev'. In dev the OTP is surfaced in the response.
            real_provider = bool(res and res.get("ok") and res.get("provider") != "dev")
        except Exception as e:
            logger.warning("[auth] OTP email send failed for %s: %s", email, e)
        if real_provider:
            logger.info("OTP emailed to %s", email)
        elif _DEV_MODE_OTP:
            logger.info("OTP for %s (dev fallback): %s", email, otp)
        else:
            # Provider failed AND not in dev mode: never write the raw code to a
            # production log sink — a transient outage would leak live OTPs.
            logger.warning("OTP email not delivered for %s (no real provider); code withheld from logs", email)
    else:
        provider = None
        delivery = send_otp_sms(payload.phone, otp)
        provider = delivery.get("provider", "none")
        real_provider = delivery.get("ok") and not delivery.get("dev_mode")
        # Delivery observability (Phase 12) — log the SMS send.
        try:
            from delivery_tracking import record_send
            await record_send(db, "sms", payload.phone, provider,
                              message_id=delivery.get("message_id") or delivery.get("sid"),
                              ok=bool(delivery.get("ok")), dev=bool(delivery.get("dev_mode")),
                              tags=["otp"])
        except Exception:
            pass
        if real_provider:
            logger.info("OTP sent to %s via %s", payload.phone, provider)
        elif _DEV_MODE_OTP:
            logger.info("OTP for %s (dev fallback): %s", payload.phone, otp)
        else:
            logger.warning("OTP SMS not delivered for %s (no real provider); code withheld from logs", payload.phone)

    # Nothing actually delivered it and we are not in explicit dev mode: say so
    # instead of reporting success. Returning "OTP sent" here used to strand the
    # user on a code-entry screen for a code that was never sent anywhere.
    if not real_provider and not _DEV_MODE_OTP:
        await _kv_del(_otp_key(key))
        raise HTTPException(
            status_code=503,
            detail=("Verification codes cannot be sent right now — no email/SMS "
                    "provider is configured. Please contact support."),
        )

    resp: Dict[str, Any] = {
        "success": True,
        "message": "OTP sent successfully",
        "provider": provider,
        "channel": channel,
    }
    # Surface the OTP in the response ONLY when no real provider delivered it
    # and DEV_MODE_OTP is explicitly enabled, so signup still works locally.
    if not real_provider and _DEV_MODE_OTP:
        resp["otp"] = otp
        resp["dev_mode"] = True
    return resp


@api_router.get("/auth/sms-status")
async def auth_sms_status():
    """Diagnostic — surface which SMS provider is currently active."""
    return sms_provider_status()


@api_router.post("/auth/verify-otp")
async def auth_verify_otp(payload: OTPVerifyRequest, request: Request):
    """Verify a previously-issued OTP (phone SMS or email channel)."""
    channel = (payload.channel or "phone").lower()
    email = (payload.email or "").strip().lower()
    key = email if (channel == "email" and email) else payload.phone
    kkey = _otp_key(key)
    entry = await _kv_get(kkey)
    # A missing entry means "never requested" OR "expired" (the KV TTL removed
    # it) — both map to "request a new OTP".
    if not entry:
        raise HTTPException(status_code=400, detail="No OTP requested or it has expired. Please request a new OTP.")
    entry["attempts"] = int(entry.get("attempts", 0)) + 1
    if entry["attempts"] > 5:
        await _kv_del(kkey)
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Please request a new OTP.")
    if entry.get("otp") != payload.otp:
        # Persist the incremented attempt count so the 5-try cap actually holds.
        await _kv_set(kkey, entry, _OTP_TTL_SECONDS)
        try:
            from user_investigation import record_login_attempt
            _otp_ip = request.client.host if request and request.client else "unknown"
            await record_login_attempt(db, key or "", _otp_ip, "otp", ok=False, reason="wrong_otp")
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Incorrect OTP")
    entry["verified"] = True
    await _kv_set(kkey, entry, _OTP_TTL_SECONDS)
    return {"success": True, "verified": True, "channel": channel}


async def _is_verified(key: str) -> bool:
    # Present in the KV (not yet TTL-expired) AND flagged verified.
    entry = await _kv_get(_otp_key(key))
    return bool(entry and entry.get("verified"))


async def _is_phone_verified(phone: str) -> bool:
    return await _is_verified(phone)


@api_router.post("/auth/register")
async def auth_register_photographer(payload: PhotographerSignupRequest,
                                     request: Request, response: Response):
    """Photographer self-signup. Requires that the phone was previously verified
    via /api/auth/send-otp + /api/auth/verify-otp in the same OTP session."""

    # Verified via EITHER channel (phone SMS or email OTP) is sufficient.
    if not (await _is_verified(payload.phone) or await _is_verified((payload.email or "").lower())):
        raise HTTPException(
            status_code=400,
            detail="Contact not verified. Please verify via the OTP (phone or email) before signing up."
        )

    email_lower = payload.email.lower()
    username_lower = payload.username.lower()

    # Uniqueness checks
    if await db.admins.find_one({"email": email_lower}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if await db.admins.find_one({"username": username_lower}):
        raise HTTPException(status_code=400, detail="Username already taken")
    if await db.admins.find_one({"phone": payload.phone}):
        raise HTTPException(status_code=400, detail="Phone number already registered")

    new_admin = Admin(
        email=email_lower,
        password_hash=get_password_hash(payload.password),
        name=payload.name,
        role=AdminRole.ADMIN,
        status=AdminStatus.ACTIVE,
        total_credits=0,
        used_credits=0,
        username=username_lower,
        phone=payload.phone,
        phone_verified=True,
        self_signup=True,
        created_by=None,
    )
    await db.admins.insert_one(new_admin.model_dump())

    # Clear OTP entry
    await _kv_del(_otp_key(payload.phone))

    # Storage pool (V1 multi-drive): provision Photographers/<Name>/... tree.
    # Fire-and-forget + flag-gated (default off) — can never fail registration.
    try:
        from storage_pool_hooks import provision_photographer
        provision_photographer(db, new_admin.id, new_admin.name)
    except Exception:
        pass

    # Auto-login: issue access token immediately so user lands in dashboard
    access_token = create_access_token(data={
        "sub": new_admin.id,
        "role": AdminRole.ADMIN.value,
    })
    # Refresh cookie so silent-refresh works right after signup (guarded).
    try:
        from auth_sessions import issue_session
        await issue_session(db, subject_id=new_admin.id, subject_kind="admin",
                            request=request, response=response)
    except Exception as _sess_err:
        logger.warning("issue_session (register) failed: %s", _sess_err)
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "admin": {
            "id": new_admin.id,
            "email": new_admin.email,
            "name": new_admin.name,
            "username": new_admin.username,
            "phone": new_admin.phone,
            "phone_verified": True,
            "role": AdminRole.ADMIN.value,
            "status": AdminStatus.ACTIVE.value,
            "available_credits": 0,
        }
    }


# ==================== END PHOTOGRAPHER SELF-SIGNUP ====================



# ==================== PHASE 35: SUPER ADMIN ROUTES ====================

@api_router.post("/super-admin/admins", response_model=AdminResponse)
async def create_admin_account(
    admin_data: AdminRegister,
    super_admin_id: str = Depends(require_super_admin)
):
    """PHASE 35: Create a new Admin (Photographer) account - Super Admin only"""
    
    # Check if email already exists
    existing_admin = await db.admins.find_one({"email": admin_data.email})
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new admin
    new_admin = Admin(
        email=admin_data.email,
        password_hash=get_password_hash(admin_data.password),
        name=admin_data.name,
        role=AdminRole.ADMIN,  # Always create as regular Admin
        status=AdminStatus.ACTIVE,
        total_credits=admin_data.initial_credits,
        used_credits=0,
        created_by=super_admin_id
    )
    
    await db.admins.insert_one(new_admin.model_dump())

    # credits retired - no signup grant

    return AdminResponse(
        id=new_admin.id,
        email=new_admin.email,
        name=new_admin.name,
        role=new_admin.role,
        status=new_admin.status,
        total_credits=new_admin.total_credits,
        used_credits=new_admin.used_credits,
        available_credits=new_admin.available_credits,
        created_at=new_admin.created_at,
        created_by=new_admin.created_by
    )


@api_router.get("/super-admin/admins", response_model=List[AdminResponse])
async def get_all_admins(
    super_admin_id: str = Depends(require_super_admin),
    status_filter: Optional[str] = None
):
    """PHASE 35: Get all Admin accounts - Super Admin only"""
    
    # Build filter
    query = {"role": AdminRole.ADMIN.value}  # Exclude other Super Admins
    if status_filter:
        query["status"] = status_filter
    
    # Get all admins
    admins = await db.admins.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Format response
    admin_list = []
    for admin in admins:
        # Photographer-directory demo listings (photographer_directory.py's
        # is_demo seed rows) live in this same table and default to
        # role="admin" via the generated column, but they are not real
        # login accounts and have no email — skip them here the same way
        # photographer_directory.py already excludes is_demo elsewhere.
        if not admin.get('email'):
            continue
        # `created_at` was a bare subscript. Any row missing it — a seed, an
        # older account, a fixture — raised KeyError and 500'd the WHOLE list,
        # so one bad row took out the entire platform console. Same failure
        # shape as the RSVP list. A row that still cannot be built is skipped
        # and logged; a partial list beats none.
        try:
            admin_list.append(AdminResponse(
                id=admin['id'],
                email=admin['email'],
                name=admin.get('name', admin['email']),
                role=admin.get('role', AdminRole.ADMIN.value),
                status=admin.get('status', AdminStatus.ACTIVE.value),
                total_credits=admin.get('total_credits', 0),
                used_credits=admin.get('used_credits', 0),
                available_credits=admin.get('total_credits', 0) - admin.get('used_credits', 0),
                username=admin.get('username'),
                phone=admin.get('phone'),
                phone_verified=admin.get('phone_verified', False),
                created_at=admin.get('created_at') or datetime.now(timezone.utc),
                created_by=admin.get('created_by')
            ))
        except Exception:
            logger.warning("super-admin/admins: skipping unparseable admin row %s",
                           admin.get('id'), exc_info=True)

    return admin_list


class _AdminStatusBody(BaseModel):
    """Body shape accepted by /super-admin/admins/{id}/status — keeps the
    super-admin UI's `axios.put(..., { status: 'suspended' })` working
    without forcing the frontend to always send a query-string."""
    status: AdminStatus


@api_router.put("/super-admin/admins/{admin_id}/status")
async def update_admin_status(
    admin_id: str,
    body: Optional[_AdminStatusBody] = None,
    status: Optional[AdminStatus] = None,
    super_admin_id: str = Depends(require_super_admin)
):
    """PHASE 35: Update Admin account status - Super Admin only.
    Accepts EITHER:
      - query string: `?status=active|suspended|inactive`
      - JSON body:    `{ "status": "active" }`
    The body wins when both are provided. This fix removes a 422 the user
    hit because the frontend always sent JSON.
    """
    # Resolve the requested status from whichever transport the caller used
    new_status_enum = (body.status if body else None) or status
    if new_status_enum is None:
        raise HTTPException(
            status_code=422,
            detail="Missing 'status' — pass either ?status=… or JSON body {status: …}",
        )

    # Check if admin exists (use numeric codes — `status` arg shadows the fastapi.status import)
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(
            status_code=404,
            detail="Admin not found"
        )

    # Prevent modifying Super Admin accounts
    if admin.get('role') == AdminRole.SUPER_ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail="Cannot modify Super Admin accounts"
        )

    # Update status
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {"status": new_status_enum.value}}
    )

    return {
        "success": True,
        "message": f"Admin status updated to {new_status_enum.value}",
        "admin_id": admin_id,
        "new_status": new_status_enum.value
    }


# ==================== Phase 3 P1: Per-invitation watermark override ====================
class _WatermarkOverrideBody(BaseModel):
    force: str  # "on" | "off" | "user"


@api_router.put("/super-admin/profiles/{profile_id}/watermark")
async def super_admin_set_watermark_override(
    profile_id: str,
    body: _WatermarkOverrideBody,
    super_admin_id: str = Depends(require_super_admin),
):
    """Force watermark on/off for a given invitation, overriding the user's
    own watermark setting. `force` must be one of 'on', 'off', 'user' — where
    'user' clears the override and falls back to the photographer's own
    toggle."""
    wanted = (body.force or "").strip().lower()
    if wanted not in ("on", "off", "user"):
        raise HTTPException(status_code=422, detail="force must be 'on' | 'off' | 'user'")

    profile = await db.profiles.find_one({"id": profile_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {
            "admin_watermark_override": wanted,
            "admin_watermark_override_at": datetime.now(timezone.utc).isoformat(),
            "admin_watermark_override_by": super_admin_id,
        }},
    )
    return {
        "success": True,
        "profile_id": profile_id,
        "admin_watermark_override": wanted,
    }




# ==================== ADMIN - PROFILE ROUTES ====================

@api_router.get("/admin/profiles", response_model=List[ProfileResponse])
async def get_all_profiles(admin_data: dict = Depends(require_admin)):
    """Get all profiles (excluding templates) - PHASE 35: Data isolation enforced"""
    admin_id = admin_data['admin_id']
    role = admin_data['role']
    
    # PHASE 35: Data isolation - Admins see only their data, Super Admin sees all
    query = {"is_template": {"$ne": True}}
    if role != 'super_admin':
        query['admin_id'] = admin_id
    
    profiles = await db.profiles.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Convert date strings back to datetime
    for profile in profiles:
        if isinstance(profile.get('event_date'), str):
            profile['event_date'] = datetime.fromisoformat(profile['event_date'])
        if isinstance(profile.get('created_at'), str):
            profile['created_at'] = datetime.fromisoformat(profile['created_at'])
        if isinstance(profile.get('updated_at'), str):
            profile['updated_at'] = datetime.fromisoformat(profile['updated_at'])
        if profile.get('link_expiry_date') and isinstance(profile['link_expiry_date'], str):
            profile['link_expiry_date'] = datetime.fromisoformat(profile['link_expiry_date'])
        if profile.get('expires_at') and isinstance(profile['expires_at'], str):
            profile['expires_at'] = datetime.fromisoformat(profile['expires_at'])
        
        # Add invitation link
        profile['invitation_link'] = f"/invite/{profile['slug']}"
        
        # PHASE 13: Generate event-specific links
        profile['event_links'] = generate_event_links(profile['slug'], profile.get('events', []))
    
    return profiles


@api_router.post("/admin/profiles", response_model=ProfileResponse)
async def create_profile(
    profile_data: ProfileCreate,
    on_behalf_of: Optional[str] = None,
    admin_data: dict = Depends(require_admin),
):
    """Create new profile - PHASE 35: Auto-assign admin_id.
    Super-admins may pass ?on_behalf_of=<photographer_admin_id> to create
    an invitation under that photographer's account.
    """
    admin_id = admin_data['admin_id']

    # Event creation is a MAJA-team action (2026-08-21 business rule): only a
    # super-admin creates an invitation, optionally assigning it to a
    # photographer via ?on_behalf_of=. Photographers receive events ASSIGNED to
    # them and never self-create. Enforced here at the API so the guard does not
    # depend on the studio UI hiding a button (Phase 2 authz).
    if admin_data.get('role') != 'super_admin':
        raise HTTPException(
            status_code=403,
            detail="Only the MAJA team can create events. Ask your MAJA admin to "
                   "create the event and assign it to your studio.",
        )

    # Optional assignment: create the invitation under a specific photographer's
    # account (the "create & assign" flow). Role is already guaranteed super here.
    if on_behalf_of:
        target = await db.admins.find_one({"id": on_behalf_of, "role": "admin"}, {"_id": 0, "id": 1})
        if not target:
            raise HTTPException(status_code=404, detail="Photographer not found")
        admin_id = on_behalf_of
    
    # Generate unique slug
    slug = generate_slug(profile_data.groom_name, profile_data.bride_name)
    
    # Check if slug exists (rare but possible)
    while await db.profiles.find_one({"slug": slug}):
        slug = generate_slug(profile_data.groom_name, profile_data.bride_name)
    
    # Calculate expiry date
    expiry_date = calculate_expiry_date(
        profile_data.link_expiry_type,
        profile_data.link_expiry_value
    )
    
    # Calculate invitation expiry (PHASE 12: default event_date + 7 days)
    invitation_expires_at = calculate_invitation_expires_at(
        profile_data.event_date,
        profile_data.expires_at
    )
    
    # Sanitize HTML fields
    about_couple = sanitize_html(profile_data.about_couple) if profile_data.about_couple else None
    family_details = sanitize_html(profile_data.family_details) if profile_data.family_details else None
    love_story = sanitize_html(profile_data.love_story) if profile_data.love_story else None
    
    # Create profile object
    profile = Profile(
        admin_id=admin_id,  # PHASE 35: Owner admin ID
        slug=slug,
        groom_name=profile_data.groom_name,
        bride_name=profile_data.bride_name,
        event_type=profile_data.event_type,
        event_date=profile_data.event_date,
        venue=profile_data.venue,
        city=profile_data.city,
        invitation_message=profile_data.invitation_message,
        language=profile_data.language,
        design_id=profile_data.design_id,
        deity_id=profile_data.deity_id,
        whatsapp_groom=profile_data.whatsapp_groom,
        whatsapp_bride=profile_data.whatsapp_bride,
        enabled_languages=profile_data.enabled_languages,
        custom_text=profile_data.custom_text,
        about_couple=about_couple,
        family_details=family_details,
        love_story=love_story,
        bride_photo_url=profile_data.bride_photo_url,
        groom_photo_url=profile_data.groom_photo_url,
        couple_photo_url=profile_data.couple_photo_url,
        bride_about=sanitize_html(profile_data.bride_about) if profile_data.bride_about else None,
        groom_about=sanitize_html(profile_data.groom_about) if profile_data.groom_about else None,
        cover_photo_id=profile_data.cover_photo_id,
        show_couple_photo=getattr(profile_data, 'show_couple_photo', True),
        show_bride_photo=getattr(profile_data, 'show_bride_photo', True),
        show_groom_photo=getattr(profile_data, 'show_groom_photo', True),
        use_couple_photo_as_opening_bg=getattr(profile_data, 'use_couple_photo_as_opening_bg', True),
        opening_bg_source=getattr(profile_data, 'opening_bg_source', 'couple') or 'couple',
        opening_photo_url=getattr(profile_data, 'opening_photo_url', None),
        sections_enabled=profile_data.sections_enabled,
        background_music=profile_data.background_music,
        map_settings=profile_data.map_settings,
        events=profile_data.events,
        # July 2025 — defensive access. ProfileCreate now includes these
        # fields but use getattr() so older callers / tests that pass a
        # subset still survive instead of 500-ing on AttributeError.
        guest_rooms=getattr(profile_data, 'guest_rooms', None) or [],
        pre_wedding_links=getattr(profile_data, 'pre_wedding_links', None) or [],
        rsvp_settings=getattr(profile_data, 'rsvp_settings', None) or RSVPSettings(),  # Phase 1C
        honeymoon_fund=getattr(profile_data, 'honeymoon_fund', None) or HoneymoonFund(),  # Phase 1H
        link_expiry_type=profile_data.link_expiry_type,
        link_expiry_value=profile_data.link_expiry_value,
        link_expiry_date=expiry_date,
        expires_at=invitation_expires_at,
        # 2026 — Universal Invitation Categories
        invitation_category=getattr(profile_data, 'invitation_category', None) or "wedding",
        celebrant_info=getattr(profile_data, 'celebrant_info', None),
        design_selections=getattr(profile_data, 'design_selections', None) or {},
    )
    
    # Convert to dict and serialize dates
    doc = profile.model_dump()
    doc['event_date'] = doc['event_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc['link_expiry_date']:
        doc['link_expiry_date'] = doc['link_expiry_date'].isoformat()
    if doc['expires_at']:
        doc['expires_at'] = doc['expires_at'].isoformat()
    
    # Sequential PUBLIC number (00001, 00002, …) + cosmetic name slug, assigned
    # atomically. Public id only — access is still gated by the resolver.
    await assign_invite_no(db, doc)

    await db.profiles.insert_one(doc)

    # Storage pool (V1 multi-drive): provision Events/<Event>/{QR_Photos,Selfies}.
    # Fire-and-forget + flag-gated (default off) — can never fail event creation.
    try:
        from storage_pool_hooks import provision_event
        _ev_label = f"{profile_data.bride_name}-{profile_data.groom_name}-" \
                    f"{str(profile_data.event_date)[:10]}".replace("/", "-")
        provision_event(db, admin_id, profile.id, _ev_label)
    except Exception:
        pass

    # PHASE 12 - PART 5: Audit log
    await log_audit_action(
        action="profile_create",
        admin_id=admin_id,
        profile_id=profile.id,
        profile_slug=profile.slug,
        details={
            "groom_name": profile_data.groom_name,
            "bride_name": profile_data.bride_name,
            "event_type": profile_data.event_type
        }
    )
    
    # Prepare response
    response_data = profile.model_dump()
    response_data['invitation_link'] = f"/invite/{profile.slug}"
    
    # PHASE 13: Generate event-specific links
    response_data['event_links'] = generate_event_links(profile.slug, profile_data.events)
    
    return ProfileResponse(**response_data)


@api_router.get("/admin/profiles/{profile_id}", response_model=ProfileResponse)
async def get_profile(profile_id: str, admin_data: dict = Depends(require_admin)):
    """Get single profile - PHASE 35: Data isolation enforced"""
    admin_id = admin_data['admin_id']
    role = admin_data['role']
    
    # PHASE 35: Data isolation query
    query = {"id": profile_id}
    if role != 'super_admin':
        query['admin_id'] = admin_id
    
    profile = await db.profiles.find_one(query, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Convert date strings safely
    for date_field in ['event_date', 'created_at', 'updated_at', 'link_expiry_date', 'expires_at']:
        val = profile.get(date_field)
        if isinstance(val, str) and val.strip():
            try:
                profile[date_field] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except Exception:
                try:
                    profile[date_field] = datetime.strptime(val[:10], "%Y-%m-%d")
                except Exception:
                    profile[date_field] = None

    profile['invite_code'] = invite_code(profile.get('invite_no')) or None
    profile['invitation_link'] = _canonical_invite_link(profile)

    # PHASE 13: Generate event-specific links
    profile['event_links'] = generate_event_links(profile.get('slug', ''), profile.get('events', []))

    return ProfileResponse(**profile)


@api_router.put("/admin/profiles/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: str,
    update_data: ProfileUpdate,
    admin_data: dict = Depends(require_admin)
):
    """Update profile - PHASE 35: Data isolation enforced"""
    admin_id = admin_data['admin_id']
    role = admin_data['role']
    
    # PHASE 35: Data isolation query
    query = {"id": profile_id}
    if role != 'super_admin':
        query['admin_id'] = admin_id
    
    existing_profile = await db.profiles.find_one(query, {"_id": 0})
    
    if not existing_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Prepare update
    update_dict = update_data.model_dump(exclude_unset=True)
    
    # Sanitize HTML fields if present
    if 'about_couple' in update_dict and update_dict['about_couple']:
        update_dict['about_couple'] = sanitize_html(update_dict['about_couple'])
    if 'family_details' in update_dict and update_dict['family_details']:
        update_dict['family_details'] = sanitize_html(update_dict['family_details'])
    if 'love_story' in update_dict and update_dict['love_story']:
        update_dict['love_story'] = sanitize_html(update_dict['love_story'])
    # Bride / Groom mini-bios — sanitize too (these surface on the public page)
    if 'bride_about' in update_dict and update_dict['bride_about']:
        update_dict['bride_about'] = sanitize_html(update_dict['bride_about'])
    if 'groom_about' in update_dict and update_dict['groom_about']:
        update_dict['groom_about'] = sanitize_html(update_dict['groom_about'])
    
    # Recalculate expiry if changed
    if 'link_expiry_type' in update_dict or 'link_expiry_value' in update_dict:
        expiry_type = update_dict.get('link_expiry_type', existing_profile['link_expiry_type'])
        expiry_value = update_dict.get('link_expiry_value', existing_profile.get('link_expiry_value'))
        update_dict['link_expiry_date'] = calculate_expiry_date(expiry_type, expiry_value)
    
    # PHASE 12: Recalculate invitation expiry if event_date or expires_at changed
    if 'event_date' in update_dict or 'expires_at' in update_dict:
        event_date_for_calc = update_dict.get('event_date', existing_profile.get('event_date'))
        if isinstance(event_date_for_calc, str):
            event_date_for_calc = datetime.fromisoformat(event_date_for_calc)
        expires_at = update_dict.get('expires_at')
        update_dict['expires_at'] = calculate_invitation_expires_at(event_date_for_calc, expires_at)
    
    # Update timestamp
    update_dict['updated_at'] = datetime.now(timezone.utc)
    
    # Serialize dates
    if 'event_date' in update_dict:
        update_dict['event_date'] = update_dict['event_date'].isoformat()
    update_dict['updated_at'] = update_dict['updated_at'].isoformat()
    if 'link_expiry_date' in update_dict and update_dict['link_expiry_date']:
        update_dict['link_expiry_date'] = update_dict['link_expiry_date'].isoformat()
    if 'expires_at' in update_dict and update_dict['expires_at']:
        update_dict['expires_at'] = update_dict['expires_at'].isoformat()
    
    await db.profiles.update_one(
        {"id": profile_id},
        {"$set": update_dict}
    )
    
    # Get updated profile
    updated_profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    # PHASE 12 - PART 5: Audit log
    await log_audit_action(
        action="profile_update",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=updated_profile.get('slug'),
        details={
            "updated_fields": list(update_data.model_dump(exclude_unset=True).keys()),
            "groom_name": updated_profile.get('groom_name'),
            "bride_name": updated_profile.get('bride_name')
        }
    )
    
    # PHASE 29E: Save version snapshot on major updates
    # Detect if this is a "publish" action (significant update)
    updated_fields = update_data.model_dump(exclude_unset=True).keys()
    major_fields = {'groom_name', 'bride_name', 'event_date', 'venue', 'events', 'sections_enabled'}
    is_major_update = bool(major_fields.intersection(updated_fields))
    
    if is_major_update:
        await save_profile_version(profile_id, admin_id, "publish")
    
    # Convert dates back
    if isinstance(updated_profile.get('event_date'), str):
        updated_profile['event_date'] = datetime.fromisoformat(updated_profile['event_date'])
    if isinstance(updated_profile.get('created_at'), str):
        updated_profile['created_at'] = datetime.fromisoformat(updated_profile['created_at'])
    if isinstance(updated_profile.get('updated_at'), str):
        updated_profile['updated_at'] = datetime.fromisoformat(updated_profile['updated_at'])
    if updated_profile.get('link_expiry_date') and isinstance(updated_profile['link_expiry_date'], str):
        updated_profile['link_expiry_date'] = datetime.fromisoformat(updated_profile['link_expiry_date'])
    if updated_profile.get('expires_at') and isinstance(updated_profile['expires_at'], str):
        updated_profile['expires_at'] = datetime.fromisoformat(updated_profile['expires_at'])
    
    updated_profile['invite_code'] = invite_code(updated_profile.get('invite_no')) or None
    updated_profile['invitation_link'] = _canonical_invite_link(updated_profile)
    
    # PHASE 13: Generate event-specific links
    updated_profile['event_links'] = generate_event_links(updated_profile['slug'], updated_profile.get('events', []))
    
    return ProfileResponse(**updated_profile)


@api_router.delete("/admin/profiles/{profile_id}")
async def delete_profile(profile_id: str, admin_data: dict = Depends(require_admin)):
    """Delete profile (soft delete) - PHASE 35: Data isolation enforced"""
    admin_id = admin_data['admin_id']
    
    # PHASE 35: Check ownership
    profile = await check_profile_ownership(profile_id, admin_data, db)

    # Soft-delete INTO the trash: set deleted_at so this profile appears in the
    # 5-day recycle bin (GET /admin/profiles/trash) and can be restored — keeping
    # the app trash in lockstep with the storage-pool 5-day recycle that the
    # on_event_deleted hook below starts. (Previously this set is_active=False
    # only, so the profile was invisible/unrecoverable while its Drive-pool copies
    # were still being purged after 5 days — R1.)
    now_iso = datetime.now(timezone.utc).isoformat()
    result = await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"is_active": False, "deleted_at": now_iso, "updated_at": now_iso}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Storage pool: start the 5-day soft-delete of this event's pooled files
    # (fire-and-forget, flag-gated — inert when the pool is off).
    try:
        from storage_pool_hooks import on_event_deleted
        on_event_deleted(db, profile_id, admin_id)
    except Exception as _e:
        logger.warning("storage-pool on_event_deleted hook failed to schedule: %s", _e)

    # PHASE 12 - PART 5: Audit log
    await log_audit_action(
        action="profile_delete",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=profile.get('slug'),
        details={
            "groom_name": profile.get('groom_name'),
            "bride_name": profile.get('bride_name')
        }
    )

    return {"message": "Profile deleted successfully"}



# PHASE 32: Admin Action Security - Disable/Enable/Expire Invitation Endpoints
@api_router.put("/admin/profiles/{profile_id}/disable")
async def disable_profile(profile_id: str, admin_data: dict = Depends(require_admin)):
    """
    PHASE 32: Disable invitation (make it inaccessible) - PHASE 35: Data isolation enforced
    Guests cannot view the invitation when disabled
    Can be re-enabled later
    """
    admin_id = admin_data['admin_id']
    
    # PHASE 35: Check ownership
    profile = await check_profile_ownership(profile_id, admin_data, db)
    
    result = await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Audit log
    await log_audit_action(
        action="profile_disable",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=profile.get('slug'),
        details={
            "groom_name": profile.get('groom_name'),
            "bride_name": profile.get('bride_name'),
            "action": "disable_invitation"
        }
    )
    
    return {"message": "Invitation disabled successfully", "is_active": False}


@api_router.put("/admin/profiles/{profile_id}/enable")
async def enable_profile(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """
    PHASE 32: Re-enable previously disabled invitation
    Makes invitation accessible again
    """
    profile = await check_profile_ownership(profile_id, admin_id, db)
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    result = await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"is_active": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Storage pool: cancel any pending 5-day soft-delete (no-op if none pending).
    try:
        from storage_pool_hooks import on_event_restored
        on_event_restored(db, profile_id)
    except Exception as _e:
        logger.warning("storage-pool on_event_restored hook failed to schedule: %s", _e)

    # Audit log
    await log_audit_action(
        action="profile_enable",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=profile.get('slug'),
        details={
            "groom_name": profile.get('groom_name'),
            "bride_name": profile.get('bride_name'),
            "action": "enable_invitation"
        }
    )
    
    return {"message": "Invitation enabled successfully", "is_active": True, "share_link": profile.get('slug'), "slug": profile.get('slug')}


@api_router.put("/admin/profiles/{profile_id}/expire")
async def expire_profile(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """
    PHASE 32: Expire invitation (mark as past event)
    Sets expires_at to now, making invitation inactive
    Typically done after event is over
    """
    profile = await check_profile_ownership(profile_id, admin_id, db)
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Set expires_at to current time
    now = datetime.now(timezone.utc)
    result = await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {
            "expires_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Audit log
    await log_audit_action(
        action="profile_expire",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=profile.get('slug'),
        details={
            "groom_name": profile.get('groom_name'),
            "bride_name": profile.get('bride_name'),
            "action": "expire_invitation",
            "expired_at": now.isoformat()
        }
    )
    
    return {"message": "Invitation expired successfully", "expires_at": now.isoformat()}


@api_router.put("/admin/profiles/{profile_id}/unexpire")
async def unexpire_profile(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """
    PHASE 32: Remove expiration from invitation
    Useful if invitation was expired by mistake
    """
    profile = await check_profile_ownership(profile_id, admin_id, db)
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Calculate new expiry based on event date (30 days after event)
    event_date = profile.get('event_date')
    if isinstance(event_date, str):
        event_date = datetime.fromisoformat(event_date)
    
    new_expires_at = event_date + timedelta(days=30) if event_date else None
    
    result = await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {
            "expires_at": new_expires_at.isoformat() if new_expires_at else None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Audit log
    await log_audit_action(
        action="profile_unexpire",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=profile.get('slug'),
        details={
            "groom_name": profile.get('groom_name'),
            "bride_name": profile.get('bride_name'),
            "action": "unexpire_invitation",
            "new_expires_at": new_expires_at.isoformat() if new_expires_at else None
        }
    )
    
    return {"message": "Invitation expiration removed successfully", "expires_at": new_expires_at.isoformat() if new_expires_at else None}


@api_router.post("/admin/profiles/{profile_id}/duplicate", response_model=ProfileResponse)
async def duplicate_profile(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Duplicate an existing profile with new slug and appended (Copy) to names"""
    # Fetch the original profile
    original_profile = await check_profile_ownership(profile_id, admin_id, db)
    
    if not original_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Convert date strings back to datetime objects
    if isinstance(original_profile.get('event_date'), str):
        original_profile['event_date'] = datetime.fromisoformat(original_profile['event_date'])
    if isinstance(original_profile.get('created_at'), str):
        original_profile['created_at'] = datetime.fromisoformat(original_profile['created_at'])
    if isinstance(original_profile.get('updated_at'), str):
        original_profile['updated_at'] = datetime.fromisoformat(original_profile['updated_at'])
    if original_profile.get('link_expiry_date') and isinstance(original_profile['link_expiry_date'], str):
        original_profile['link_expiry_date'] = datetime.fromisoformat(original_profile['link_expiry_date'])
    if original_profile.get('expires_at') and isinstance(original_profile['expires_at'], str):
        original_profile['expires_at'] = datetime.fromisoformat(original_profile['expires_at'])
    
    # Create new profile data from original
    new_profile_data = original_profile.copy()
    
    # Generate new unique ID and slug
    new_profile_data['id'] = str(uuid.uuid4())
    
    # Append "(Copy)" to groom and bride names
    new_profile_data['groom_name'] = f"{original_profile['groom_name']} (Copy)"
    new_profile_data['bride_name'] = f"{original_profile['bride_name']} (Copy)"
    
    # Generate unique slug with new names
    slug = generate_slug(new_profile_data['groom_name'], new_profile_data['bride_name'])
    while await db.profiles.find_one({"slug": slug}):
        slug = generate_slug(new_profile_data['groom_name'], new_profile_data['bride_name'])
    new_profile_data['slug'] = slug
    
    # Reset timestamps
    now = datetime.now(timezone.utc)
    new_profile_data['created_at'] = now
    new_profile_data['updated_at'] = now
    
    # Recalculate expiry dates
    expiry_date = calculate_expiry_date(
        new_profile_data.get('link_expiry_type', 'days'),
        new_profile_data.get('link_expiry_value', 30)
    )
    new_profile_data['link_expiry_date'] = expiry_date
    
    invitation_expires_at = calculate_invitation_expires_at(
        new_profile_data['event_date'],
        None  # Will use default: event_date + 7 days
    )
    new_profile_data['expires_at'] = invitation_expires_at
    
    # Copy media references (photos will reference same media items)
    # Note: Media items themselves are not duplicated, only references in the profile
    
    # Serialize dates for MongoDB
    new_profile_data['event_date'] = new_profile_data['event_date'].isoformat()
    new_profile_data['created_at'] = new_profile_data['created_at'].isoformat()
    new_profile_data['updated_at'] = new_profile_data['updated_at'].isoformat()
    if new_profile_data['link_expiry_date']:
        new_profile_data['link_expiry_date'] = new_profile_data['link_expiry_date'].isoformat()
    if new_profile_data['expires_at']:
        new_profile_data['expires_at'] = new_profile_data['expires_at'].isoformat()
    
    # Fresh sequential number — pop the one inherited from the .copy() so the
    # duplicate never shares the original's number.
    await assign_invite_no(db, new_profile_data)
    # Insert the duplicated profile
    await db.profiles.insert_one(new_profile_data)
    
    # PHASE 12 - PART 5: Audit log
    await log_audit_action(
        action="profile_duplicate",
        admin_id=admin_id,
        profile_id=new_profile_data['id'],
        profile_slug=new_profile_data['slug'],
        details={
            "original_profile_id": profile_id,
            "original_slug": original_profile['slug'],
            "groom_name": new_profile_data['groom_name'],
            "bride_name": new_profile_data['bride_name']
        }
    )
    
    # Prepare response with datetime objects
    response_data = new_profile_data.copy()
    response_data['event_date'] = datetime.fromisoformat(response_data['event_date'])
    response_data['created_at'] = datetime.fromisoformat(response_data['created_at'])
    response_data['updated_at'] = datetime.fromisoformat(response_data['updated_at'])
    if response_data['link_expiry_date']:
        response_data['link_expiry_date'] = datetime.fromisoformat(response_data['link_expiry_date'])
    if response_data['expires_at']:
        response_data['expires_at'] = datetime.fromisoformat(response_data['expires_at'])
    
    response_data['invitation_link'] = f"/invite/{response_data['slug']}"
    
    return ProfileResponse(**response_data)


# ==================== ADMIN - TEMPLATE ROUTES ====================

@api_router.post("/admin/profiles/{profile_id}/save-as-template", response_model=ProfileResponse)
async def save_profile_as_template(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Save an existing profile as a template"""
    # Fetch the profile
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Update the profile to mark it as a template
    await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"is_template": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # PHASE 12 - PART 5: Audit log
    await log_audit_action(
        action="template_save",
        admin_id=admin_id,
        profile_id=profile_id,
        profile_slug=profile.get('slug'),
        details={
            "groom_name": profile.get('groom_name'),
            "bride_name": profile.get('bride_name')
        }
    )
    
    # Fetch updated profile
    updated_profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    # Convert date strings back to datetime
    if isinstance(updated_profile.get('event_date'), str):
        updated_profile['event_date'] = datetime.fromisoformat(updated_profile['event_date'])
    if isinstance(updated_profile.get('created_at'), str):
        updated_profile['created_at'] = datetime.fromisoformat(updated_profile['created_at'])
    if isinstance(updated_profile.get('updated_at'), str):
        updated_profile['updated_at'] = datetime.fromisoformat(updated_profile['updated_at'])
    if updated_profile.get('link_expiry_date') and isinstance(updated_profile['link_expiry_date'], str):
        updated_profile['link_expiry_date'] = datetime.fromisoformat(updated_profile['link_expiry_date'])
    if updated_profile.get('expires_at') and isinstance(updated_profile['expires_at'], str):
        updated_profile['expires_at'] = datetime.fromisoformat(updated_profile['expires_at'])
    
    updated_profile['invite_code'] = invite_code(updated_profile.get('invite_no')) or None
    updated_profile['invitation_link'] = _canonical_invite_link(updated_profile)
    
    return ProfileResponse(**updated_profile)


@api_router.get("/admin/templates", response_model=List[ProfileResponse])
async def get_all_templates(admin_id: str = Depends(get_current_admin)):
    """Get all template profiles"""
    templates = await db.profiles.find({"is_template": True}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Convert date strings back to datetime
    for template in templates:
        if isinstance(template.get('event_date'), str):
            template['event_date'] = datetime.fromisoformat(template['event_date'])
        if isinstance(template.get('created_at'), str):
            template['created_at'] = datetime.fromisoformat(template['created_at'])
        if isinstance(template.get('updated_at'), str):
            template['updated_at'] = datetime.fromisoformat(template['updated_at'])
        if template.get('link_expiry_date') and isinstance(template['link_expiry_date'], str):
            template['link_expiry_date'] = datetime.fromisoformat(template['link_expiry_date'])
        if template.get('expires_at') and isinstance(template['expires_at'], str):
            template['expires_at'] = datetime.fromisoformat(template['expires_at'])
        
        # Add invitation link
        template['invitation_link'] = f"/invite/{template['slug']}"
    
    return templates


@api_router.post("/admin/profiles/from-template/{template_id}", response_model=ProfileResponse)
async def create_profile_from_template(template_id: str, admin_id: str = Depends(get_current_admin)):
    """Create a new profile from a template"""
    # Fetch the template
    template = await db.profiles.find_one({"id": template_id, "is_template": True}, {"_id": 0})
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Convert date strings back to datetime objects
    if isinstance(template.get('event_date'), str):
        template['event_date'] = datetime.fromisoformat(template['event_date'])
    if isinstance(template.get('created_at'), str):
        template['created_at'] = datetime.fromisoformat(template['created_at'])
    if isinstance(template.get('updated_at'), str):
        template['updated_at'] = datetime.fromisoformat(template['updated_at'])
    if template.get('link_expiry_date') and isinstance(template['link_expiry_date'], str):
        template['link_expiry_date'] = datetime.fromisoformat(template['link_expiry_date'])
    if template.get('expires_at') and isinstance(template['expires_at'], str):
        template['expires_at'] = datetime.fromisoformat(template['expires_at'])
    
    # Create new profile data from template
    new_profile_data = template.copy()
    
    # Generate new unique ID and slug
    new_profile_data['id'] = str(uuid.uuid4())
    
    # Keep the template names but allow editing later
    # Generate unique slug
    slug = generate_slug(template['groom_name'], template['bride_name'])
    while await db.profiles.find_one({"slug": slug}):
        slug = generate_slug(template['groom_name'], template['bride_name'])
    new_profile_data['slug'] = slug
    
    # Mark as NOT a template (this is a real profile created from template)
    new_profile_data['is_template'] = False
    
    # Reset timestamps
    now = datetime.now(timezone.utc)
    new_profile_data['created_at'] = now
    new_profile_data['updated_at'] = now
    
    # Recalculate expiry dates
    expiry_date = calculate_expiry_date(
        new_profile_data.get('link_expiry_type', 'days'),
        new_profile_data.get('link_expiry_value', 30)
    )
    new_profile_data['link_expiry_date'] = expiry_date
    
    invitation_expires_at = calculate_invitation_expires_at(
        new_profile_data['event_date'],
        None  # Will use default: event_date + 7 days
    )
    new_profile_data['expires_at'] = invitation_expires_at
    
    # Serialize dates for MongoDB
    new_profile_data['event_date'] = new_profile_data['event_date'].isoformat()
    new_profile_data['created_at'] = new_profile_data['created_at'].isoformat()
    new_profile_data['updated_at'] = new_profile_data['updated_at'].isoformat()
    if new_profile_data['link_expiry_date']:
        new_profile_data['link_expiry_date'] = new_profile_data['link_expiry_date'].isoformat()
    if new_profile_data['expires_at']:
        new_profile_data['expires_at'] = new_profile_data['expires_at'].isoformat()
    
    # Fresh sequential number — pop the one inherited from the template .copy().
    await assign_invite_no(db, new_profile_data)
    # Insert the new profile
    await db.profiles.insert_one(new_profile_data)
    
    # Prepare response with datetime objects
    response_data = new_profile_data.copy()
    response_data['event_date'] = datetime.fromisoformat(response_data['event_date'])
    response_data['created_at'] = datetime.fromisoformat(response_data['created_at'])
    response_data['updated_at'] = datetime.fromisoformat(response_data['updated_at'])
    if response_data['link_expiry_date']:
        response_data['link_expiry_date'] = datetime.fromisoformat(response_data['link_expiry_date'])
    if response_data['expires_at']:
        response_data['expires_at'] = datetime.fromisoformat(response_data['expires_at'])
    
    response_data['invitation_link'] = f"/invite/{response_data['slug']}"
    
    return ProfileResponse(**response_data)



# ==================== BRANDED QR HELPERS ====================

_THEME_PRIMARY_COLOR_MAP = {
    "royal_mughal":         "#7B1E1E",
    "south_indian_temple":  "#B8860B",
    "bengali_aristocracy":  "#8B0000",
    "punjabi_grandeur":     "#FFB700",
    "kerala_backwaters":    "#0A7C5A",
    "rajasthani":           "#C2185B",
    "maharashtrian":        "#8B5E3C",
    "muslim_nikah":         "#0E7C4F",
    "minimal_modern":       "#1F1F1F",
    "nature_garden":        "#3F6B2A",
}


def _theme_primary_color(design_id: Optional[str]) -> str:
    if not design_id:
        return "#7B1E1E"
    return _THEME_PRIMARY_COLOR_MAP.get(design_id, "#7B1E1E")


def _couple_monogram(profile: Dict[str, Any]) -> str:
    g = (profile.get("groom_name") or "").strip()
    b = (profile.get("bride_name") or "").strip()
    initials = ""
    if g:
        initials += g[0].upper()
    if b:
        initials += b[0].upper()
    return initials or "✦"


def _hex_to_rgb(hex_color: str):
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return (123, 30, 30)


def _build_branded_qr(
    payload: str,
    monogram: str = "",
    primary_hex: str = "#7B1E1E",
    background_image_bytes: Optional[bytes] = None,
) -> str:
    """Generate a QR with a couple-monogram + theme-color accent ring in the center.
    Optionally composites the QR on top of a background photo (the couple's
    cover photo by default) with a soft cream gradient veil so cells stay readable.

    Returns a data:image/png;base64 string ready for <img src=...>.
    """
    from PIL import Image, ImageDraw, ImageFont, ImageFilter

    qr = qrcode.QRCode(
        version=4,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    primary_rgb = _hex_to_rgb(primary_hex)
    # Render QR cells as fully transparent on white so we can composite over a photo.
    qr_layer = qr.make_image(fill_color=(14, 10, 6), back_color=(255, 255, 255)).convert("RGBA")
    w, h = qr_layer.size

    # Build the canvas: photo background (if provided) + cream veil, then QR cells
    base = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    if background_image_bytes:
        try:
            photo = Image.open(BytesIO(background_image_bytes)).convert("RGB")
            # Cover-crop to QR canvas size
            ratio = max(w / photo.width, h / photo.height)
            nw, nh = int(photo.width * ratio), int(photo.height * ratio)
            photo = photo.resize((nw, nh), Image.LANCZOS)
            left = (nw - w) // 2
            top = (nh - h) // 2
            photo = photo.crop((left, top, left + w, top + h))
            # Gentle blur so it doesn't compete with QR cells
            photo = photo.filter(ImageFilter.GaussianBlur(radius=3))
            base = photo.convert("RGBA")
            # Cream veil for QR contrast — tuned for readability vs photo visibility
            veil = Image.new("RGBA", (w, h), (255, 248, 230, 165))
            base = Image.alpha_composite(base, veil)
        except Exception as e:
            logger.warning(f"QR background composite failed, falling back to white: {e}")

    # Drop the white pixels from the QR layer so only the dark cells remain
    qr_pixels = qr_layer.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _a = qr_pixels[x, y]
            if r > 200 and g > 200 and b > 200:
                qr_pixels[x, y] = (255, 255, 255, 0)
            else:
                qr_pixels[x, y] = (14, 10, 6, 255)
    canvas = Image.alpha_composite(base, qr_layer)

    # Centerpiece — accent ring + cream disc + monogram
    overlay = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = w // 2, h // 2
    badge_r = int(min(w, h) * 0.16)
    ring_r = badge_r + max(6, int(badge_r * 0.18))

    draw.ellipse(
        (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
        fill=(*primary_rgb, 255),
    )
    draw.ellipse(
        (cx - badge_r, cy - badge_r, cx + badge_r, cy + badge_r),
        fill=(255, 248, 230, 255),
    )

    label = monogram or "✦"
    font_size = int(badge_r * 1.1)
    font = None
    for cand in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            font = ImageFont.truetype(cand, font_size)
            break
        except Exception:
            font = None
    if font is None:
        font = ImageFont.load_default()
    try:
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = cx - tw // 2 - bbox[0]
        ty = cy - th // 2 - bbox[1]
    except Exception:
        tw, th = (badge_r, badge_r)
        tx, ty = cx - tw // 2, cy - th // 2
    draw.text((tx, ty), label, fill=(*primary_rgb, 255), font=font)

    composed = Image.alpha_composite(canvas, overlay).convert("RGB")
    buf = BytesIO()
    composed.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


async def _load_qr_background_bytes(profile: Dict[str, Any]) -> Optional[bytes]:
    """Resolve which media to use as the QR background and fetch its bytes.

    Resolution order:
      1. If `use_couple_photo_as_qr_bg` is True (default) → couple_photo_url
         from custom_text._maja, or cover_photo_id.
      2. Else → qr_background_media_id OR custom_text._maja.qr_background_photo_url.
      3. Last-resort fallback → couple_photo_url / cover_photo_id.
    """
    maja = (profile.get("custom_text") or {}).get("_maja") or {}
    use_couple = profile.get("use_couple_photo_as_qr_bg", True)

    candidate_urls = []
    candidate_media_ids = []
    if use_couple:
        if maja.get("couple_photo_url"):
            candidate_urls.append(maja["couple_photo_url"])
        if profile.get("cover_photo_id"):
            candidate_media_ids.append(profile["cover_photo_id"])
    else:
        if maja.get("qr_background_photo_url"):
            candidate_urls.append(maja["qr_background_photo_url"])
        if profile.get("qr_background_media_id"):
            candidate_media_ids.append(profile["qr_background_media_id"])

    # last-resort fallback: try the couple photo / cover even if toggle is off
    if maja.get("couple_photo_url"):
        candidate_urls.append(maja["couple_photo_url"])
    if profile.get("cover_photo_id"):
        candidate_media_ids.append(profile["cover_photo_id"])

    async def _bytes_from_url(url: str) -> Optional[bytes]:
        try:
            if url.startswith("/"):
                local = Path("/app") / url.lstrip("/")
                if local.exists():
                    return local.read_bytes()
                # Also try frontend's public/ dir
                alt = Path("/app/frontend/public") / url.lstrip("/")
                if alt.exists():
                    return alt.read_bytes()
            if url.startswith("http"):
                import httpx
                async with httpx.AsyncClient(timeout=10) as c:
                    r = await c.get(url)
                    if r.status_code == 200:
                        return r.content
        except Exception as e:
            logger.warning(f"QR bg URL fetch failed for {url}: {e}")
        return None

    for url in candidate_urls:
        b = await _bytes_from_url(url)
        if b:
            return b

    for media_id in candidate_media_ids:
        try:
            media = await db.profile_media.find_one({"id": media_id}, {"_id": 0})
            if not media:
                continue
            url = media.get("media_url") or media.get("file_url") or media.get("url")
            if url:
                b = await _bytes_from_url(url)
                if b:
                    return b
        except Exception as e:
            logger.warning(f"QR bg media lookup failed for {media_id}: {e}")
    return None




# ==================== ADMIN - EVENT INVITATION ROUTES ====================

@api_router.get("/admin/profiles/{profile_id}/event-invitations", response_model=List[EventInvitationResponse])
async def get_profile_event_invitations(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Get all event invitations for a profile"""
    # Check if profile exists
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Ownership check — admin can only access invitations on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
    
    # Get all event invitations for this profile
    event_invitations = await db.event_invitations.find(
        {"profile_id": profile_id}, 
        {"_id": 0}
    ).to_list(100)
    
    # Lazy-generate QR for old invitations missing one (created before QR feature)
    public_base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    bg_bytes_cached = None  # load once per profile
    for ei in event_invitations:
        if not ei.get("qr_image"):
            try:
                if bg_bytes_cached is None:
                    bg_bytes_cached = await _load_qr_background_bytes(profile)
                link_path = f"/invite/{profile['slug']}/{ei['event_type']}"
                qr_target = f"{public_base}{link_path}" if public_base else link_path
                ei["qr_image"] = _build_branded_qr(
                    payload=qr_target,
                    monogram=_couple_monogram(profile),
                    primary_hex=_theme_primary_color(ei.get("design_id")),
                    background_image_bytes=bg_bytes_cached,
                )
                ei["qr_url"] = qr_target
                await db.event_invitations.update_one(
                    {"id": ei["id"]},
                    {"$set": {"qr_image": ei["qr_image"], "qr_url": qr_target}},
                )
            except Exception as e:
                logger.warning(f"Lazy QR generation failed for {ei.get('id')}: {e}")
    
    # Convert datetime strings back to datetime objects and add invitation_link
    for ei in event_invitations:
        if isinstance(ei.get('created_at'), str):
            ei['created_at'] = datetime.fromisoformat(ei['created_at'])
        if isinstance(ei.get('updated_at'), str):
            ei['updated_at'] = datetime.fromisoformat(ei['updated_at'])
        if isinstance(ei.get('expires_at'), str):
            try:
                ei['expires_at'] = datetime.fromisoformat(ei['expires_at'])
            except Exception:
                ei['expires_at'] = None
        
        # Generate invitation link
        ei['invitation_link'] = f"/invite/{profile['slug']}/{ei['event_type']}"
    
    return [EventInvitationResponse(**ei) for ei in event_invitations]


@api_router.post("/admin/profiles/{profile_id}/event-invitations", response_model=EventInvitationResponse)
async def create_event_invitation(
    profile_id: str,
    event_data: EventInvitationCreate,
    admin_id: str = Depends(get_current_admin)
):
    """Create a new event-specific invitation link for a profile"""
    # Check if profile exists
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Ownership check
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
    
    # Check if event invitation already exists for this event_type
    existing = await db.event_invitations.find_one({
        "profile_id": profile_id,
        "event_type": event_data.event_type
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Event invitation for {event_data.event_type} already exists"
        )
    
    # Apply deity validation rules based on event_type
    deity_id = event_data.deity_id
    if event_data.event_type in ['haldi', 'mehendi']:
        # Force deity_id to None for Haldi/Mehendi
        deity_id = None
    
    # Compute expiry: explicit if provided, else event_date + 7d, else +30d
    expires_at = event_data.expires_at
    if expires_at is None:
        event_date = profile.get("event_date")
        if isinstance(event_date, str):
            try:
                event_date = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
            except Exception:
                event_date = None
        if isinstance(event_date, datetime):
            base = event_date if event_date.tzinfo else event_date.replace(tzinfo=timezone.utc)
            expires_at = base + timedelta(days=7)
        else:
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    # Create event invitation
    event_invitation = EventInvitation(
        profile_id=profile_id,
        event_type=event_data.event_type,
        design_id=event_data.design_id,
        deity_id=deity_id,
        enabled=True,
        expires_at=expires_at,
    )
    
    # Serialize to dict and convert datetime to ISO format
    doc = event_invitation.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    if doc.get('expires_at') is not None:
        doc['expires_at'] = doc['expires_at'].isoformat()
    # event_type is already serialized to string by model_dump (use_enum_values=True)
    if hasattr(doc.get('event_type'), 'value'):
        doc['event_type'] = doc['event_type'].value
    
    # Insert into database
    await db.event_invitations.insert_one(doc)

    # === AI Photo Delivery integration (best-effort, never blocks the API) ===
    invitation_link_path = f"/invite/{profile['slug']}/{doc['event_type']}"
    qr_image_b64 = None
    rekognition_collection_id = None
    public_base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    qr_target = f"{public_base}{invitation_link_path}" if public_base else invitation_link_path
    try:
        bg_bytes = await _load_qr_background_bytes(profile)
        qr_image_b64 = _build_branded_qr(
            payload=qr_target,
            monogram=_couple_monogram(profile),
            primary_hex=_theme_primary_color(event_data.design_id),
            background_image_bytes=bg_bytes,
        )
    except Exception as qr_err:
        logger.warning(f"Branded QR generation failed for {event_invitation.id}: {qr_err}")
        qr_image_b64 = None

    # ponytail: no longer creating a per-event Rekognition collection here (dead
    # feature, never read back). rekognition_collection_id stays None on new rows;
    # _purge_invitation_assets still tolerates legacy rows that do have one.

    # Persist QR + Rekognition metadata
    qr_doc = {
        "qr_url": qr_target,
        "qr_image": qr_image_b64,
        "rekognition_collection_id": rekognition_collection_id,
    }
    await db.event_invitations.update_one({"id": event_invitation.id}, {"$set": qr_doc})

    # Prepare response
    response_data = doc.copy()
    response_data['created_at'] = datetime.fromisoformat(response_data['created_at'])
    response_data['updated_at'] = datetime.fromisoformat(response_data['updated_at'])
    if response_data.get('expires_at') and isinstance(response_data['expires_at'], str):
        response_data['expires_at'] = datetime.fromisoformat(response_data['expires_at'])
    response_data['invitation_link'] = invitation_link_path
    response_data.update(qr_doc)
    
    return EventInvitationResponse(**response_data)


@api_router.put("/admin/event-invitations/{invitation_id}", response_model=EventInvitationResponse)
async def update_event_invitation(
    invitation_id: str,
    update_data: EventInvitationUpdate,
    admin_id: str = Depends(get_current_admin)
):
    """Update an event invitation"""
    # Find the event invitation
    event_invitation = await db.event_invitations.find_one({"id": invitation_id}, {"_id": 0})
    if not event_invitation:
        raise HTTPException(status_code=404, detail="Event invitation not found")
    
    # Get profile for slug + ownership check
    profile = await db.profiles.find_one({"id": event_invitation['profile_id']}, {"_id": 0, "slug": 1, "admin_id": 1})
    if profile and profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
    
    # Prepare update data
    update_dict = {}
    if update_data.design_id is not None:
        update_dict['design_id'] = update_data.design_id
    if update_data.deity_id is not None:
        # Apply deity validation rules based on event_type
        if event_invitation['event_type'] in ['haldi', 'mehendi']:
            # Force deity_id to None for Haldi/Mehendi
            update_dict['deity_id'] = None
        else:
            update_dict['deity_id'] = update_data.deity_id
    if update_data.enabled is not None:
        update_dict['enabled'] = update_data.enabled
        # Re-enabling a previously expired link extends its life
        if update_data.enabled and event_invitation.get('expired'):
            update_dict['expired'] = False
    if update_data.expires_at is not None:
        update_dict['expires_at'] = update_data.expires_at.isoformat() if isinstance(update_data.expires_at, datetime) else update_data.expires_at
        update_dict['expired'] = False  # rescheduling un-expires
    
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Update in database
    await db.event_invitations.update_one(
        {"id": invitation_id},
        {"$set": update_dict}
    )
    
    # Fetch updated document
    updated = await db.event_invitations.find_one({"id": invitation_id}, {"_id": 0})
    
    # Convert datetime strings
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'])
    if isinstance(updated.get('expires_at'), str):
        try:
            updated['expires_at'] = datetime.fromisoformat(updated['expires_at'])
        except Exception:
            updated['expires_at'] = None
    
    updated['invitation_link'] = f"/invite/{profile['slug']}/{updated['event_type']}"
    
    return EventInvitationResponse(**updated)


@api_router.delete("/admin/event-invitations/{invitation_id}")
async def delete_event_invitation(invitation_id: str, admin_id: str = Depends(get_current_admin)):
    """Delete an event invitation, and purge its Rekognition collection + R2 media."""
    invitation = await db.event_invitations.find_one({"id": invitation_id}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Event invitation not found")
    # Ownership check via parent profile
    profile = await db.profiles.find_one({"id": invitation["profile_id"]}, {"_id": 0, "admin_id": 1})
    if profile and profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")

    # Best-effort cleanup of associated AI face collection + media
    await _purge_invitation_assets(invitation)

    result = await db.event_invitations.delete_one({"id": invitation_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event invitation not found")
    
    return {"message": "Event invitation deleted successfully"}


async def _purge_invitation_assets(invitation: Dict[str, Any]) -> Dict[str, Any]:
    """Delete an invitation's media + AI face collection. Safe to call repeatedly."""
    summary: Dict[str, Any] = {"rekognition": False, "media_files_deleted": 0}
    # 1. Drop Rekognition face collection (if AWS configured)
    coll = invitation.get("rekognition_collection_id")
    if coll:
        try:
            from aws_service import is_configured as aws_is_configured, delete_face_collection, delete_prefix
            if aws_is_configured():
                summary["rekognition"] = bool(delete_face_collection(coll))
                # Drop any photos uploaded to this invitation's S3/R2 prefix
                try:
                    delete_prefix(f"event-invitations/{invitation['id']}/")
                except Exception as e:
                    logger.warning(f"R2 prefix delete failed: {e}")
        except Exception as e:
            logger.warning(f"Rekognition cleanup skipped: {e}")
    # 2. Delete profile_media docs referencing this invitation
    try:
        m_result = await db.profile_media.delete_many({"event_invitation_id": invitation["id"]})
        summary["media_files_deleted"] = m_result.deleted_count
    except Exception as e:
        logger.warning(f"profile_media cleanup failed: {e}")
    # 3. Delete face_matches index entries
    try:
        await db.face_matches.delete_many({"event_invitation_id": invitation["id"]})
    except Exception:
        pass
    return summary


async def _expiry_sweep_once() -> Dict[str, int]:
    """Run one pass: disable expired invitations and purge their media."""
    now = datetime.now(timezone.utc)
    disabled = 0
    purged = 0
    cursor = db.event_invitations.find(
        {
            "expires_at": {"$ne": None, "$lte": now.isoformat()},
            "$or": [{"expired": {"$ne": True}}, {"media_purged": {"$ne": True}}],
        },
        {"_id": 0},
    )
    async for inv in cursor:
        if not inv.get("expired"):
            await db.event_invitations.update_one(
                {"id": inv["id"]},
                {"$set": {"expired": True, "enabled": False, "updated_at": now.isoformat()}},
            )
            disabled += 1
        if not inv.get("media_purged"):
            await _purge_invitation_assets(inv)
            await db.event_invitations.update_one(
                {"id": inv["id"]},
                {"$set": {"media_purged": True, "purged_at": now.isoformat()}},
            )
            purged += 1
    if disabled or purged:
        logger.info(f"Expiry sweep: disabled={disabled} purged={purged}")
    return {"disabled": disabled, "purged": purged}


async def _expiry_sweep_loop():
    """Background loop — wakes every hour and reconciles expired invitations.
    Runs once per uvicorn worker, so each iteration first takes a Redis lock
    (TTL == the sweep interval, re-acquired every iteration); only the worker
    that wins it runs the sweep body, the rest just keep looping. Without this
    every worker swept concurrently (A4 recon)."""
    while True:
        interval = int(os.environ.get("EXPIRY_SWEEP_INTERVAL_SECONDS", "3600"))
        try:
            if await _acquire_lock("expiry_sweep_leader", interval):
                await _expiry_sweep_once()
        except Exception as e:
            logger.error(f"Expiry sweep loop error: {e}")
        await asyncio.sleep(interval)


@api_router.post("/admin/event-invitations/sweep-expired")
async def sweep_expired_now(admin_id: str = Depends(require_super_admin)):
    """Manual trigger for the expiry sweep (super admin only)."""
    return await _expiry_sweep_once()


@api_router.post("/admin/event-invitations/{invitation_id}/regenerate-qr")
async def regenerate_qr(invitation_id: str, admin_id: str = Depends(get_current_admin)):
    """Rebuild the QR for one invitation — picks up new couple-photo / background-photo settings."""
    inv = await db.event_invitations.find_one({"id": invitation_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Event invitation not found")
    profile = await db.profiles.find_one({"id": inv["profile_id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Ownership check
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")

    public_base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    link_path = f"/invite/{profile['slug']}/{inv['event_type']}"
    qr_target = f"{public_base}{link_path}" if public_base else link_path
    bg_bytes = await _load_qr_background_bytes(profile)
    qr_image_b64 = _build_branded_qr(
        payload=qr_target,
        monogram=_couple_monogram(profile),
        primary_hex=_theme_primary_color(inv.get("design_id")),
        background_image_bytes=bg_bytes,
    )
    await db.event_invitations.update_one(
        {"id": invitation_id},
        {"$set": {"qr_image": qr_image_b64, "qr_url": qr_target,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"qr_url": qr_target, "qr_image": qr_image_b64, "used_background": bool(bg_bytes)}


@api_router.get("/admin/profiles/{profile_id}/face-match-qr")
async def face_match_qr(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """The ONE face-match QR for a wedding.

    Every other QR in this file is an INVITATION QR: there is one per
    event_invitation (haldi, sangeet, wedding...) and each opens that
    ceremony's invitation page. None of them is a face-match entry point, so a
    studio printing a "scan to find your photos" sign had nothing to print.

    This is that one code, and deliberately one PER WEDDING rather than per
    ceremony — the Rekognition collection is per wedding
    (gallery_features._profile_collection_id), so a guest's face is searched
    against the same set of photos whichever ceremony they attended. A QR per
    ceremony would be several codes pointing at one identical search.

    It resolves to the existing public gallery entry, /invite/{slug}/live-gallery,
    which already runs the selfie -> SearchFacesByImage flow behind the gallery
    privacy gate. No second face-match surface is introduced.

    On the identifier: the target carries the wedding's public slug, which is
    already printed on every invitation and encoded in every invitation QR. A
    separate opaque token here would add a second identifier for a page that is
    reachable by the first one anyway — it would not make the gallery less
    reachable. What actually gates the photos is gallery_privacy (access code +
    device trust); that is the control to strengthen if enumeration matters,
    not this URL.
    """
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")

    gc = profile.get("gallery_config") or {}
    if not gc.get("enabled"):
        # Printing a code that leads to an empty page is worse than printing
        # none: the guest blames the couple, not the setup step nobody ran.
        raise HTTPException(status_code=409, detail={
            "code": "GALLERY_NOT_ENABLED",
            "message": "Enable the AI photo gallery for this wedding before printing its face-match QR.",
        })

    # The event QR lands the guest DIRECTLY on AI face-match (selfie -> their own
    # photos), no intermediate chooser (Phase 5). Encodes the CANONICAL public URL
    # via build_public_url — never request.host / the VM IP — using the sequential
    # number when present (…/00001/find-my-photos), else the legacy slug. The
    # identifier is server-controlled, so the event context cannot be spoofed.
    # (Cache below is keyed on qr_target, so a retarget rebuilds the artwork.)
    _ident = invite_code(profile.get('invite_no')) or profile['slug']
    link_path = f"/invite/{_ident}/find-my-photos"
    qr_target = build_public_url(link_path)

    # Cached on the profile so reprinting does not re-render the artwork, and
    # invalidated by target so a slug change rebuilds it.
    cached = gc.get("face_match_qr") or {}
    if cached.get("qr_url") == qr_target and cached.get("qr_image"):
        return {**cached, "cached": True}

    bg_bytes = await _load_qr_background_bytes(profile)
    qr_image_b64 = _build_branded_qr(
        payload=qr_target,
        monogram=_couple_monogram(profile),
        primary_hex=_theme_primary_color(None),
        background_image_bytes=bg_bytes,
    )
    out = {"qr_url": qr_target, "qr_image": qr_image_b64,
           "generated_at": datetime.now(timezone.utc).isoformat()}
    await db.profiles.update_one(
        {"id": profile_id}, {"$set": {"gallery_config.face_match_qr": out}})
    return {**out, "cached": False}


@api_router.post("/admin/profiles/{profile_id}/regenerate-all-qrs")
async def regenerate_all_qrs(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Rebuild every invitation's QR for a profile — used after the couple photo / QR-bg settings change."""
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
    bg_bytes = await _load_qr_background_bytes(profile)
    monogram = _couple_monogram(profile)
    public_base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    n = 0
    async for inv in db.event_invitations.find({"profile_id": profile_id}, {"_id": 0}):
        link_path = f"/invite/{profile['slug']}/{inv['event_type']}"
        qr_target = f"{public_base}{link_path}" if public_base else link_path
        try:
            qr_image_b64 = _build_branded_qr(
                payload=qr_target,
                monogram=monogram,
                primary_hex=_theme_primary_color(inv.get("design_id")),
                background_image_bytes=bg_bytes,
            )
            await db.event_invitations.update_one(
                {"id": inv["id"]},
                {"$set": {"qr_image": qr_image_b64, "qr_url": qr_target,
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            n += 1
        except Exception as e:
            logger.warning(f"regenerate QR failed for {inv.get('id')}: {e}")
    return {"regenerated": n, "used_background": bool(bg_bytes)}


# ==================== PHASE 32: EVENT SECURITY SETTINGS ====================

@api_router.put("/admin/event-invitations/{invitation_id}/security")
async def update_event_security(
    invitation_id: str,
    visibility_mode: str = Form(...),
    passcode: Optional[str] = Form(None),
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 32: Update security settings for an event invitation
    
    Args:
        invitation_id: Event invitation ID
        visibility_mode: "public", "unlisted", or "private"
        passcode: 4-6 digit numeric passcode (required if private, optional to clear)
        admin_id: Current admin ID (from auth)
    
    Returns:
        Updated event invitation with security settings
    """
    # Validate visibility mode
    if visibility_mode not in ["public", "unlisted", "private"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid visibility_mode. Must be 'public', 'unlisted', or 'private'"
        )
    
    # Find the event invitation
    event_invitation = await db.event_invitations.find_one({"id": invitation_id}, {"_id": 0})
    if not event_invitation:
        raise HTTPException(status_code=404, detail="Event invitation not found")
    
    # Prepare update
    update_dict = {
        "visibility_mode": visibility_mode,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Handle passcode based on visibility mode
    if visibility_mode == "private":
        # Private mode requires passcode
        if not passcode or passcode.strip() == "":
            raise HTTPException(
                status_code=400,
                detail="Passcode is required for private events"
            )
        
        # Validate passcode format
        if not validate_passcode_format(passcode):
            raise HTTPException(
                status_code=400,
                detail="Passcode must be 4-6 digits numeric only"
            )
        
        # Hash and store passcode
        update_dict["access_passcode_hash"] = hash_passcode(passcode)
        logger.info(f"Setting passcode for event {invitation_id}")
    else:
        # Public/unlisted mode - clear passcode if exists
        update_dict["access_passcode_hash"] = None
        logger.info(f"Clearing passcode for event {invitation_id} (mode: {visibility_mode})")
    
    # Update in database
    await db.event_invitations.update_one(
        {"id": invitation_id},
        {"$set": update_dict}
    )
    
    # Also update events array in profile
    profile = await db.profiles.find_one({"id": event_invitation['profile_id']}, {"_id": 0})
    if profile and 'events' in profile:
        events = profile['events']
        for event in events:
            if event.get('event_id') == event_invitation.get('event_id'):
                event['visibility_mode'] = visibility_mode
                event['access_passcode_hash'] = update_dict["access_passcode_hash"]
                break
        
        await db.profiles.update_one(
            {"id": event_invitation['profile_id']},
            {"$set": {"events": events}}
        )
    
    # Fetch updated event invitation
    updated = await db.event_invitations.find_one({"id": invitation_id}, {"_id": 0})
    
    # Convert datetime strings
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'])
    
    # Add invitation link
    if profile:
        updated['invitation_link'] = f"/invite/{profile['slug']}/{updated['event_type']}"
    
    return EventInvitationResponse(**updated)



# ==================== PHASE 17: EVENT-LEVEL CMS CRUD ROUTES ====================

@api_router.post("/admin/profiles/{profile_id}/events")
async def create_event(
    profile_id: str,
    event: WeddingEvent,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 17: Create a new event for a profile
    
    Features:
    - Auto-generates slug if not provided
    - Validates event-type specific required fields
    - Prevents duplicate event types per profile
    - Validates language_enabled list
    """
    # Check if profile exists
    profile = await check_profile_ownership(profile_id, admin_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Get existing events
    existing_events = profile.get('events', [])
    
    # Check for duplicate event type
    event_type_lower = str(event.event_type).lower()
    for existing_event in existing_events:
        existing_type = existing_event.get('event_type', '').lower()
        if existing_type == event_type_lower:
            raise HTTPException(
                status_code=400,
                detail=f"Event type '{event.event_type}' already exists for this profile. Each profile can only have one event of each type."
            )
    
    # Auto-generate slug if not provided or empty
    if not event.slug or event.slug.strip() == "":
        short_id = event.event_id[:8]
        event.slug = f"{event_type_lower}-{short_id}"
    
    # Validate that slug is unique within this profile
    for existing_event in existing_events:
        if existing_event.get('slug') == event.slug:
            raise HTTPException(
                status_code=400,
                detail=f"Slug '{event.slug}' already exists for another event in this profile"
            )
    
    # Convert event to dict
    event_dict = event.model_dump()
    
    # Add event to profile's events list
    existing_events.append(event_dict)
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile_id},
        {
            "$set": {
                "events": existing_events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_created",
        "resource_type": "event",
        "resource_id": event.event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile_id,
            "event_type": str(event.event_type),
            "event_slug": event.slug
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Event created successfully",
        "event": event_dict
    }


@api_router.put("/admin/events/{event_id}")
async def update_event(
    event_id: str,
    event_update: Dict,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 17: Update an existing event
    
    Features:
    - Updates event fields
    - Validates event-type specific requirements
    - Prevents changing event_type to duplicate
    - Validates language_enabled if provided
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event in the events list
    events = profile.get('events', [])
    event_index = None
    current_event = None

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            current_event = evt
            break
    
    if event_index is None:
        raise HTTPException(status_code=404, detail="Event not found in profile")
    
    # Check if changing event_type would create duplicate
    if 'event_type' in event_update:
        new_event_type = event_update['event_type'].lower()
        current_event_type = current_event.get('event_type', '').lower()
        
        if new_event_type != current_event_type:
            # Check if new event_type already exists in profile
            for evt in events:
                if evt.get('event_id') != event_id and evt.get('event_type', '').lower() == new_event_type:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Event type '{event_update['event_type']}' already exists for this profile"
                    )
    
    # Check if changing slug would create duplicate
    if 'slug' in event_update and event_update['slug']:
        new_slug = event_update['slug']
        for evt in events:
            if evt.get('event_id') != event_id and evt.get('slug') == new_slug:
                raise HTTPException(
                    status_code=400,
                    detail=f"Slug '{new_slug}' already exists for another event in this profile"
                )
    
    # Update the event
    updated_event = {**current_event, **event_update}
    events[event_index] = updated_event
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_updated",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "updated_fields": list(event_update.keys())
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Event updated successfully",
        "event": updated_event
    }


@api_router.delete("/admin/events/{event_id}")
async def delete_event(
    event_id: str,
    hard_delete: bool = False,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 17: Delete an event (soft or hard delete)
    
    By default, performs soft delete (sets enabled=false)
    Set hard_delete=true to permanently remove the event
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])

    if hard_delete:
        # Hard delete - remove event from list
        updated_events = [evt for evt in events if evt.get('event_id') != event_id]
        
        if len(updated_events) == len(events):
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Update profile
        await db.profiles.update_one(
            {"id": profile['id']},
            {
                "$set": {
                    "events": updated_events,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        action = "event_deleted_hard"
        message = "Event permanently deleted successfully"
    else:
        # Soft delete - set enabled=false
        event_found = False
        for evt in events:
            if evt.get('event_id') == event_id:
                evt['enabled'] = False
                event_found = True
                break
        
        if not event_found:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Update profile
        await db.profiles.update_one(
            {"id": profile['id']},
            {
                "$set": {
                    "events": events,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        action = "event_deleted_soft"
        message = "Event disabled successfully"
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": action,
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "hard_delete": hard_delete
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": message}



@api_router.post("/admin/events/{event_id}/upload-music")
async def upload_event_music(
    event_id: str,
    file: UploadFile = File(...),
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 20: Upload background music for an event
    
    Requirements:
    - MP3 files only
    - Max file size: 5 MB
    - One music file per event
    """
    # Validate file is MP3
    if not file.filename.lower().endswith('.mp3'):
        raise HTTPException(status_code=400, detail="Only MP3 files are allowed")
    
    # Read file to check size
    file_content = await file.read()
    file_size_mb = len(file_content) / (1024 * 1024)
    
    if file_size_mb > 5:
        raise HTTPException(status_code=400, detail="Music file size must be less than 5 MB")
    
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Create music uploads directory
    music_dir = Path("/app/uploads/music")
    music_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    filename = f"event_{event_id[:8]}_{timestamp}_{random_suffix}.mp3"
    file_path = music_dir / filename
    
    # Delete old music file if exists
    events = profile.get('events', [])
    for evt in events:
        if evt.get('event_id') == event_id and evt.get('music_file'):
            old_file_path = Path(f"/app{evt['music_file']}")
            if old_file_path.exists():
                try:
                    old_file_path.unlink()
                except Exception as e:
                    logging.warning(f"Failed to delete old music file: {e}")
    
    # Store to the invitation S3 bucket (music) — dev/no-AWS falls back to disk.
    music_url = _store_invitation_bytes(
        file_content, kind="music", mime=file.content_type or "audio/mpeg",
        profile=profile, event_id=event_id,
        disk_path=file_path, disk_url=f"/uploads/music/{filename}",
        fallback_ext=".mp3")

    for evt in events:
        if evt.get('event_id') == event_id:
            evt['music_file'] = music_url
            evt['music_enabled'] = True  # Auto-enable when uploading
            break
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_music_uploaded",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "filename": filename,
            "file_size_mb": round(file_size_mb, 2)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Music uploaded successfully",
        "music_url": music_url,
        "music_enabled": True
    }


@api_router.delete("/admin/events/{event_id}/music")
async def delete_event_music(
    event_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 20: Delete background music for an event
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_found = False

    for evt in events:
        if evt.get('event_id') == event_id:
            event_found = True

            # Delete file if exists
            if evt.get('music_file'):
                old_file_path = Path(f"/app{evt['music_file']}")
                if old_file_path.exists():
                    try:
                        old_file_path.unlink()
                    except Exception as e:
                        logging.warning(f"Failed to delete music file: {e}")
            
            # Clear music fields
            evt['music_file'] = None
            evt['music_enabled'] = False
            break
    
    if not event_found:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_music_deleted",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id']
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Music deleted successfully"}



@api_router.patch("/admin/events/{event_id}/music-toggle")
async def toggle_event_music(
    event_id: str,
    music_enabled: bool,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 20: Toggle background music enabled/disabled for an event
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_found = False

    for evt in events:
        if evt.get('event_id') == event_id:
            event_found = True
            evt['music_enabled'] = music_enabled
            break
    
    if not event_found:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": f"event_music_{'enabled' if music_enabled else 'disabled'}",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "music_enabled": music_enabled
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Music {'enabled' if music_enabled else 'disabled'} successfully",
        "music_enabled": music_enabled
    }


@api_router.get("/admin/profiles/{profile_id}/events")
async def get_profile_events(
    profile_id: str,
    include_disabled: bool = False,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 17: Get all events for a profile
    
    By default, returns only enabled events
    Set include_disabled=true to include disabled events
    """
    # Check ownership (raises 404 if not found or not owned; super_admin bypasses)
    profile = await check_profile_ownership(profile_id, admin_id, db)

    events = profile.get('events', [])
    
    if not include_disabled:
        events = [evt for evt in events if evt.get('enabled', True)]
    
    return {
        "profile_id": profile_id,
        "events": events,
        "total_count": len(events)
    }


# ==================== PHASE 21: EVENT GALLERY ROUTES ====================

@api_router.post("/admin/events/{event_id}/upload-gallery-images")
async def upload_event_gallery_images(
    event_id: str,
    files: List[UploadFile] = File(...),
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 21: Upload multiple images to event gallery
    - Max 20 images per event
    - Max 3MB per image
    - Auto-converts to WebP (quality 80)
    - Resizes if width > 2000px
    - Stores in /app/uploads/gallery/{profile_id}/{event_type}/
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event
    events = profile.get('events', [])
    event = None
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event = evt
            event_index = idx
            break

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # PHASE 33: Check gallery feature access
    gallery_limit = get_gallery_limit(profile)
    if gallery_limit == 0:
        raise HTTPException(
            status_code=403,
            detail="Gallery feature not available on FREE plan. Please upgrade to access gallery features."
        )
    
    # Check current gallery count against plan limit
    current_gallery = event.get('gallery_images', [])
    max_limit = gallery_limit if gallery_limit is not None else 20  # Use plan limit or default
    
    if len(current_gallery) + len(files) > max_limit:
        raise HTTPException(
            status_code=400, 
            detail=f"Gallery limit exceeded. Current: {len(current_gallery)}, Trying to add: {len(files)}, Max allowed: {max_limit}. Upgrade your plan for more storage."
        )
    
    # Create gallery directory
    profile_id = profile['id']
    event_type = event.get('event_type', 'unknown')
    gallery_dir = Path(f"/app/uploads/gallery/{profile_id}/{event_type}")
    gallery_dir.mkdir(parents=True, exist_ok=True)
    
    uploaded_images = []
    
    for file in files:
        # Validate file size (3MB = 3 * 1024 * 1024 bytes)
        content = await file.read()
        if len(content) > 3 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} exceeds 3MB limit"
            )
        
        try:
            # Mobile-perf: responsive variants → invitation S3 bucket keyed by
            # this event (dev/no-AWS falls back to /app/uploads/gallery).
            image_id = str(uuid.uuid4())
            variants = store_invitation_image_variants(
                content, profile=profile, event_id=event.get('event_id'),
                out_dir=gallery_dir, base_name=image_id)

            image_obj = {
                "id": image_id,
                "image_url": variants["original"],
                "variants": variants,
                "order": len(current_gallery) + len(uploaded_images),
            }
            uploaded_images.append(image_obj)
            
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to process image {file.filename}: {str(e)}"
            )
    
    # Add images to gallery
    current_gallery.extend(uploaded_images)
    events[event_index]['gallery_images'] = current_gallery
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile_id},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_gallery_images_uploaded",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile_id,
            "images_count": len(uploaded_images),
            "total_gallery_count": len(current_gallery)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Uploaded {len(uploaded_images)} images successfully",
        "uploaded_images": uploaded_images,
        "total_gallery_count": len(current_gallery)
    }


@api_router.delete("/admin/events/{event_id}/gallery-images/{image_id}")
async def delete_event_gallery_image(
    event_id: str,
    image_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 21: Delete a specific image from event gallery
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event
    events = profile.get('events', [])
    event = None
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event = evt
            event_index = idx
            break

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Find and remove image
    gallery_images = event.get('gallery_images', [])
    image_to_delete = None
    
    for img in gallery_images:
        if img.get('id') == image_id:
            image_to_delete = img
            break
    
    if not image_to_delete:
        raise HTTPException(status_code=404, detail="Image not found in gallery")
    
    # Delete file from filesystem
    image_path = Path(f"/app{image_to_delete['image_url']}")
    if image_path.exists():
        image_path.unlink()
    
    # Remove from gallery
    gallery_images = [img for img in gallery_images if img.get('id') != image_id]
    
    # Reorder remaining images
    for idx, img in enumerate(gallery_images):
        img['order'] = idx
    
    events[event_index]['gallery_images'] = gallery_images
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_gallery_image_deleted",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "image_id": image_id,
            "remaining_count": len(gallery_images)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Image deleted successfully",
        "remaining_count": len(gallery_images)
    }


@api_router.patch("/admin/events/{event_id}/reorder-gallery")
async def reorder_event_gallery(
    event_id: str,
    image_order: List[str],
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 21: Reorder gallery images
    Accepts array of image IDs in desired order
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event
    events = profile.get('events', [])
    event = None
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event = evt
            event_index = idx
            break

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    gallery_images = event.get('gallery_images', [])

    # Validate that all image IDs exist
    existing_ids = {img.get('id') for img in gallery_images}
    provided_ids = set(image_order)
    
    if existing_ids != provided_ids:
        raise HTTPException(
            status_code=400,
            detail="Image order array must contain all existing image IDs"
        )
    
    # Create a mapping of id to image
    image_map = {img.get('id'): img for img in gallery_images}
    
    # Reorder images
    reordered_images = []
    for idx, img_id in enumerate(image_order):
        img = image_map[img_id]
        img['order'] = idx
        reordered_images.append(img)
    
    events[event_index]['gallery_images'] = reordered_images
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_gallery_reordered",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "new_order": image_order
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Gallery reordered successfully",
        "gallery_images": reordered_images
    }


@api_router.patch("/admin/events/{event_id}/gallery-toggle")
async def toggle_event_gallery(
    event_id: str,
    gallery_enabled: bool,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 21: Toggle gallery enabled/disabled for an event
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_found = False

    for evt in events:
        if evt.get('event_id') == event_id:
            event_found = True
            evt['gallery_enabled'] = gallery_enabled
            break
    
    if not event_found:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": f"event_gallery_{'enabled' if gallery_enabled else 'disabled'}",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "gallery_enabled": gallery_enabled
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Gallery {'enabled' if gallery_enabled else 'disabled'} successfully",
        "gallery_enabled": gallery_enabled
    }


# ==================== ADMIN - AUDIT LOG ROUTES ====================

@api_router.get("/admin/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(admin_id: str = Depends(get_current_admin)):
    """
    Get audit logs for admin actions
    Returns last 1000 logs in reverse chronological order (newest first)

    July 2025 — be permissive: older / newer writers (notably the
    super-admin user-management endpoints in `user_features.py`) write
    slightly different shapes. We normalise here so one bad row never
    crashes the whole endpoint and the audit UI stays useful.
    """
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(1000).to_list(1000)

    out: List[AuditLogResponse] = []
    for log in logs:
        # Normalise timestamp → datetime
        ts = log.get('timestamp')
        if isinstance(ts, str):
            try:
                log['timestamp'] = datetime.fromisoformat(ts)
            except Exception:
                log['timestamp'] = datetime.now(timezone.utc)
        elif ts is None:
            log['timestamp'] = datetime.now(timezone.utc)

        # Back-fill admin_id from actor_id if writer used the new field
        if not log.get('admin_id') and log.get('actor_id'):
            log['admin_id'] = log['actor_id']

        # Wrap string `details` so old AuditLogResponse(details: Dict)
        # consumers keep working even with the new permissive schema.
        if isinstance(log.get('details'), str):
            log['details'] = {"message": log['details']}

        try:
            out.append(AuditLogResponse(**log))
        except Exception as _e:
            # Don't 500 the whole endpoint for one malformed row.
            logger.warning(f"audit-log row skipped: {_e}")
            continue
    return out

# ==================== ADMIN - MEDIA ROUTES ====================

@api_router.post("/admin/profiles/{profile_id}/media", response_model=ProfileMedia)
async def add_profile_media(
    profile_id: str,
    media_data: ProfileMediaCreate,
    admin_id: str = Depends(get_current_admin)
):
    """Add media to profile"""
    # Check ownership (raises 404 if not found or not owned; super_admin bypasses)
    await check_profile_ownership(profile_id, admin_id, db)

    media = ProfileMedia(
        profile_id=profile_id,
        media_type=media_data.media_type,
        media_url=media_data.media_url,
        caption=media_data.caption,
        order=media_data.order
    )
    
    doc = media.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.profile_media.insert_one(doc)
    
    return media


@api_router.delete("/admin/media/{media_id}")
async def delete_media(media_id: str, admin_id: str = Depends(get_current_admin)):
    """Delete media"""
    media = await db.profile_media.find_one({"id": media_id}, {"_id": 0, "profile_id": 1})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    await check_profile_ownership(media["profile_id"], admin_id, db)

    result = await db.profile_media.delete_one({"id": media_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Media not found")

    return {"message": "Media deleted successfully"}


@api_router.get("/admin/profiles/{profile_id}/media", response_model=List[ProfileMedia])
async def get_profile_media(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Get all media for a profile"""
    await check_profile_ownership(profile_id, admin_id, db)

    media_list = await db.profile_media.find(
        {"profile_id": profile_id},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    for media in media_list:
        if isinstance(media.get('created_at'), str):
            media['created_at'] = datetime.fromisoformat(media['created_at'])
    
    return media_list



@api_router.post("/admin/upload-image")
async def admin_upload_image(
    file: UploadFile = File(...),
    slot: str = Form("misc"),
    admin_id: str = Depends(get_current_admin),
):
    """Pre-save image upload for the photographer dashboard.
    Used by the wedding-create wizard BEFORE the profile_id exists.
    Returns a public URL the caller stores on the draft form."""
    is_valid, error_msg = validate_image_file(file)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    webp_data, file_size = await convert_to_webp(file, quality=85)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    slot_safe = ''.join(c for c in (slot or 'misc') if c.isalnum() or c in '-_')[:20] or 'misc'
    filename = f"admin-{admin_id}-{slot_safe}-{ts}-{suffix}.webp"
    out_path = UPLOADS_DIR / filename
    # Store to the invitation S3 bucket; dev/no-AWS falls back to disk. This is a
    # pre-save upload (no profile/event yet), so it lands under a per-photographer
    # "staging" namespace. The dev URL stays under /api/ — Caddy only forwards
    # /api/* to the backend; a bare /uploads/... URL is served by the frontend.
    url = _store_invitation_bytes(
        webp_data, kind="image", mime="image/webp",
        profile={"id": "staging", "admin_id": admin_id}, event_id=None,
        disk_path=out_path, disk_url=f"/api/uploads/photos/{filename}",
        fallback_ext=".webp")
    try:
        await db.admin_uploads.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "slot": slot_safe,
            "url": url,
            "file_size": file_size,
            "original_filename": file.filename,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"admin_uploads insert failed: {e}")
    return {"url": url, "file_size": file_size}


@api_router.post("/admin/upload-video")
async def admin_upload_video(
    file: UploadFile = File(...),
    profile_id: str = Form(""),
    type: str = Form("misc"),
    admin_id: str = Depends(get_current_admin),
):
    """Generic pre-save VIDEO upload for the dashboard (thank-you films, hero
    clips, etc.). Sibling of /admin/upload-image — the frontend assumed this
    existed but it was never implemented, so the "Upload Video" button 404'd.
    Keeps the raw video (no transcode) and returns a public /api/uploads URL."""
    allowed = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}
    if not file.content_type or file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="File must be a video (MP4, WebM or MOV).")
    MAX_VIDEO_BYTES = 200 * 1024 * 1024  # 200 MB
    content = await file.read()
    if len(content) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=400, detail="Video is too large (max 200 MB).")
    ext = allowed[file.content_type]
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    slot_safe = ''.join(c for c in (type or 'misc') if c.isalnum() or c in '-_')[:24] or 'misc'
    video_dir = Path("/app/uploads/videos/admin")
    video_dir.mkdir(parents=True, exist_ok=True)
    filename = f"admin-{admin_id}-{slot_safe}-{ts}-{suffix}.{ext}"
    out_path = video_dir / filename
    # Invitation S3 bucket (dev falls back to disk). Pre-save upload → staging.
    url = _store_invitation_bytes(
        content, kind="video", mime=file.content_type or "video/mp4",
        profile={"id": "staging", "admin_id": admin_id}, event_id=None,
        disk_path=out_path, disk_url=f"/api/uploads/videos/admin/{filename}",
        fallback_ext=f".{ext}")
    try:
        await db.admin_uploads.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "slot": slot_safe,
            "url": url,
            "media_type": "video",
            "profile_id": profile_id or None,
            "file_size": len(content),
            "original_filename": file.filename,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"admin_uploads (video) insert failed: {e}")
    # Return both keys — the caller reads `video_url`; `url` matches upload-image.
    return {"video_url": url, "url": url, "thumbnail_url": None, "file_size": len(content)}


@api_router.post("/admin/profiles/{profile_id}/upload-photo", response_model=ProfileMedia)
async def upload_photo(
    profile_id: str,
    file: UploadFile = File(...),
    caption: str = Form(""),
    admin_id: str = Depends(get_current_admin)
):
    """Upload a photo for a profile with WebP conversion"""
    # Check ownership (raises 404 if not found or not owned; super_admin bypasses)
    await check_profile_ownership(profile_id, admin_id, db)

    # Validate max 20 photos per profile
    media_count = await db.profile_media.count_documents({
        "profile_id": profile_id,
        "media_type": "photo"
    })
    if media_count >= 20:
        raise HTTPException(status_code=400, detail="Maximum 20 photos allowed per profile")
    
    # Validate image file
    is_valid, error_msg = validate_image_file(file)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Mobile-perf: responsive variants (small/medium/large/original) in one pass,
    # uploaded to the invitation S3 bucket keyed by this profile (dev/no-AWS falls
    # back to /app/uploads/photos). media_url == original variant for compat.
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    base_name = f"{profile_id}_{timestamp}_{random_suffix}"
    raw = await file.read()
    variants = store_invitation_image_variants(
        raw, profile={"id": profile_id, "admin_id": admin_id},
        event_id=None, out_dir=UPLOADS_DIR, base_name=base_name)
    file_size = int(variants.get("size") or 0)
    
    # Get next order number
    max_order = await db.profile_media.find_one(
        {"profile_id": profile_id},
        sort=[("order", -1)]
    )
    next_order = (max_order.get('order', 0) + 1) if max_order else 0
    
    # Create media record. `media_url` keeps backwards compat (== original variant).
    media = ProfileMedia(
        profile_id=profile_id,
        media_type="photo",
        media_url=variants["original"],
        caption=caption if caption else None,
        order=next_order,
        is_cover=False,
        file_size=file_size,
        original_filename=file.filename,
        media_variants=variants,
    )
    
    doc = media.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.profile_media.insert_one(doc)
    
    return media


@api_router.put("/admin/media/{media_id}/set-cover")
async def set_cover_photo(
    media_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """Set a photo as the cover photo"""
    # Find the media
    media = await db.profile_media.find_one({"id": media_id})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    if media['media_type'] != 'photo':
        raise HTTPException(status_code=400, detail="Only photos can be set as cover")

    profile_id = media['profile_id']
    await check_profile_ownership(profile_id, admin_id, db)

    # Unset all other covers for this profile
    await db.profile_media.update_many(
        {"profile_id": profile_id},
        {"$set": {"is_cover": False}}
    )
    
    # Set this media as cover
    await db.profile_media.update_one(
        {"id": media_id},
        {"$set": {"is_cover": True}}
    )
    
    # Update profile cover_photo_id
    await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"cover_photo_id": media_id}}
    )
    
    return {"message": "Cover photo updated successfully"}


@api_router.post("/admin/profiles/{profile_id}/reorder-media")
async def reorder_media(
    profile_id: str,
    media_ids: List[str],
    admin_id: str = Depends(get_current_admin)
):
    """Reorder media items"""
    # Check ownership (raises 404 if not found or not owned; super_admin bypasses)
    await check_profile_ownership(profile_id, admin_id, db)

    # Update order for each media
    for index, media_id in enumerate(media_ids):
        await db.profile_media.update_one(
            {"id": media_id, "profile_id": profile_id},
            {"$set": {"order": index}}
        )
    
    return {"message": "Media reordered successfully"}


@api_router.put("/admin/media/{media_id}/caption")
async def update_media_caption(
    media_id: str,
    caption: str = Form(""),
    admin_id: str = Depends(get_current_admin)
):
    """Update media caption"""
    media = await db.profile_media.find_one({"id": media_id}, {"_id": 0, "profile_id": 1})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    await check_profile_ownership(media["profile_id"], admin_id, db)

    result = await db.profile_media.update_one(
        {"id": media_id},
        {"$set": {"caption": caption if caption else None}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Media not found")

    return {"message": "Caption updated successfully"}


# ==================== PUBLIC INVITATION ROUTES ====================

async def _public_granted_features(profile: dict):
    """The feature-pack entitlement to expose on the public payload.

    Reversibility rule: only gate when `new_pricing_enabled` is ON. When the flag is
    OFF (default, or a rollback) we return None so the renderer shows every feature —
    even if a `granted_features` list was written on the profile during a prior ON
    window. Legacy / grandfathered links never had one written, so they are None too.
    """
    try:
        import pricing_activation as _pa
        if not await _pa.flag_on(db):
            return None
        return _pa.granted_features(profile)
    except Exception:
        return None


async def _studio_credit_for_profile(profile: dict) -> Optional[dict]:
    """The "Managed by <Studio>" credit for the studio that built this invitation.
    Present only for a PREMIUM studio with a published portfolio (see
    studio_credit). Best-effort — never breaks the invitation load."""
    try:
        from studio_credit import studio_credit
        credit = await studio_credit(db, profile.get("admin_id"))
        return credit if credit.get("show") else None
    except Exception as e:
        logger.warning("studio credit lookup failed for %s: %s", profile.get("id"), e)
        return None


async def _build_invitation_public_view(profile: dict) -> "InvitationPublicView":
    """Builds an InvitationPublicView from a raw profile doc.
    Shared helper used by /invite/{slug} and the batched /invite/{slug}/full.
    Assumes caller has already validated existence + expiry."""
    # PHASE 12: Check invitation expiry (separate from link expiry)
    is_expired = False
    expires_at = profile.get('expires_at')
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            is_expired = True

    media_list = await db.profile_media.find(
        {"profile_id": profile['id']},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)

    greetings_list = await db.greetings.find(
        {"profile_id": profile['id'], "approval_status": "approved"},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    if isinstance(profile.get('event_date'), str):
        profile['event_date'] = datetime.fromisoformat(profile['event_date'])

    for media in media_list:
        if isinstance(media.get('created_at'), str):
            media['created_at'] = datetime.fromisoformat(media['created_at'])

    for greeting in greetings_list:
        if isinstance(greeting.get('created_at'), str):
            greeting['created_at'] = datetime.fromisoformat(greeting['created_at'])

    return InvitationPublicView(
        slug=profile['slug'],
        invite_no=profile.get('invite_no'),
        invite_code=invite_code(profile.get('invite_no')) or None,
        name_slug=profile.get('name_slug'),
        canonical_url=_invite_canonical_url(profile),
        face_match_url=_invite_face_match_url(profile),
        public_base=public_base_url() or None,
        groom_name=profile['groom_name'],
        bride_name=profile['bride_name'],
        event_type=profile['event_type'],
        event_date=profile['event_date'],
        venue=profile['venue'],
        city=profile.get('city'),
        invitation_message=profile.get('invitation_message'),
        language=profile['language'],
        design_id=profile['design_id'],
        deity_id=profile.get('deity_id'),
        whatsapp_groom=profile.get('whatsapp_groom'),
        whatsapp_bride=profile.get('whatsapp_bride'),
        enabled_languages=profile.get('enabled_languages', ['english']),
        custom_text=profile.get('custom_text', {}),
        translations=profile.get('translations') or {},
        accent_color=profile.get('accent_color'),
        closing_text=profile.get('closing_text'),
        closing_signature=profile.get('closing_signature'),
        closing_animation_id=profile.get('closing_animation_id'),
        about_couple=profile.get('about_couple'),
        family_details=profile.get('family_details'),
        love_story=profile.get('love_story'),
        bride_photo_url=profile.get('bride_photo_url') or (profile.get('custom_text', {}).get('_maja', {}) or {}).get('bride_photo_url'),
        groom_photo_url=profile.get('groom_photo_url') or (profile.get('custom_text', {}).get('_maja', {}) or {}).get('groom_photo_url'),
        couple_photo_url=profile.get('couple_photo_url') or (profile.get('custom_text', {}).get('_maja', {}) or {}).get('couple_photo_url'),
        bride_about=profile.get('bride_about'),
        groom_about=profile.get('groom_about'),
        cover_photo_id=profile.get('cover_photo_id'),
        show_couple_photo=profile.get('show_couple_photo', True),
        show_bride_photo=profile.get('show_bride_photo', True),
        show_groom_photo=profile.get('show_groom_photo', True),
        use_couple_photo_as_opening_bg=profile.get('use_couple_photo_as_opening_bg', True),
        opening_bg_source=profile.get('opening_bg_source') or 'couple',
        opening_photo_url=profile.get('opening_photo_url'),
        sections_enabled=SectionsEnabled(**profile['sections_enabled']),
        background_music=BackgroundMusic(**profile.get('background_music', {'enabled': False, 'file_url': None})),
        map_settings=MapSettings(**profile.get('map_settings', {'embed_enabled': False})),
        contact_info=ContactInfo(**profile.get('contact_info', {})),
        rsvp_settings=RSVPSettings(**(profile.get('rsvp_settings') or {})),
        honeymoon_fund=HoneymoonFund(**(profile.get('honeymoon_fund') or {})),
        live_stream=LiveStreamSettings(**(profile.get('live_stream') or {})),
        song_requests_settings=SongRequestSettings(**(profile.get('song_requests_settings') or {})),
        dress_code_settings=DressCodeSettings(**(profile.get('dress_code_settings') or {})),
        events=[WeddingEvent(**e) for e in profile.get('events', [])],
        media=[ProfileMedia(**m) for m in media_list],
        greetings=[GreetingResponse(**g) for g in greetings_list],
        guest_rooms=[GuestRoom(**{k: v for k, v in gr.items() if k != 'phone'}) for gr in (profile.get('guest_rooms') or [])],
        pre_wedding_links=[PreWeddingLink(**pl) for pl in (profile.get('pre_wedding_links') or [])],
        is_expired=is_expired,
        decorative_effects=profile.get('sections_enabled', {}).get('decorative_effects', True),
        seo_settings=SEOSettings(**profile.get("seo_settings", {"seo_enabled": True, "social_sharing_enabled": True, "custom_description": None})),
        design_selections=profile.get("design_selections", {}) or {},
        faq_settings=profile.get("faq_settings"),
        invitation_category=profile.get("invitation_category", "wedding"),
        celebrant_info=profile.get("celebrant_info"),
        requires_watermark=requires_watermark(profile),
        admin_watermark_override=profile.get("admin_watermark_override"),
        granted_features=await _public_granted_features(profile),
        managed_by=await _studio_credit_for_profile(profile),
    )


@api_router.get("/invite/{slug}", response_model=InvitationPublicView)
async def get_invitation(slug: str, request: Request):
    """Get public invitation by slug"""
    # S1 fix (Phase-2 audit): rate-limit unauthenticated slug fetches per IP to
    # slow down scrapers / enumeration attempts. 500 per rolling 24h per IP —
    # generous for a host refreshing their own invitation, tight enough to
    # throttle bulk enumeration.
    #
    # Moved off the DB-persisted `check_rate_limit` (see docs/RATE_LIMITING.md).
    # That one buckets by UTC CALENDAR DAY and stores a durable row, so an
    # exhausted counter stayed exhausted until midnight — which on a dev box
    # means a heavy test run poisons every later run of the day with 429s that
    # look exactly like a code regression. It cost three debugging detours in
    # one session. A rolling window on the canonical limiter recovers on its
    # own, and in production (Redis present) it is still a single global
    # counter across all four workers.
    #
    # get_client_ip() rather than request.client.host: the old line trusted the
    # peer address as rewritten from X-Forwarded-For, which a client can spoof
    # to mint a fresh 500-request budget per forged header. get_client_ip only
    # trusts XFF for as many hops as TRUSTED_PROXY_COUNT names.
    from cache_backend import rate_limit_allow
    client_ip = get_client_ip(request)
    # Env-tunable because a dev box IS the pathological client: every full test
    # run makes a few hundred localhost invite views, so a handful of runs in
    # one day crosses 500 from 127.0.0.1 and ten unrelated tests start failing
    # with 429s. Production keeps the 500 default; backend/.env (gitignored)
    # raises it locally. The knob changes the budget, never the mechanism.
    _invite_limit = int(os.environ.get("INVITE_VIEW_LIMIT_PER_DAY", "500"))
    if not await rate_limit_allow(f"invite_view:{client_ip}", _invite_limit, 86400):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    is_numeric = slug.isdigit()
    profile = await _resolve_public_profile(slug)
    # A numeric code is guessable, so a draft/template/inactive event must look
    # exactly like a nonexistent one (uniform 404, no existence oracle). The
    # legacy random slug keeps its friendlier 410-on-expiry.
    if not profile or (is_numeric and not _is_publicly_visible(profile)):
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Track view for audit logs — fire-and-forget so it never adds latency to
    # the read response (matches the /full handler). Critical under viral load.
    asyncio.create_task(_track_invitation_view_audit(profile['id'], client_ip))

    if not await check_profile_active(profile):
        raise HTTPException(
            status_code=404 if is_numeric else 410,
            detail="Invitation not found" if is_numeric else "This invitation link has expired")

    return await _build_invitation_public_view(profile)


@api_router.get("/invite/by-number/{number}")
async def resolve_invite_number(number: str, request: Request):
    """Resolve a public invite NUMBER (e.g. 00001) → stable slug + canonical URLs.

    Registered BEFORE /invite/{slug}/{event_type} so Starlette matches it first.
    Client pages that only carry the number (e.g. the face-match QR
    /invite/00001/find-my-photos) call this once, then use the returned legacy
    slug for every downstream API call — so no other endpoint learns about
    numbers, and the enumeration guard lives in exactly one place."""
    from cache_backend import rate_limit_allow
    if not await rate_limit_allow(
            f"invite_view:{get_client_ip(request)}",
            int(os.environ.get("INVITE_VIEW_LIMIT_PER_DAY", "500")), 86400):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    if not number.isdigit():
        raise HTTPException(status_code=404, detail="Invitation not found")
    profile = await db.profiles.find_one({"invite_no": int(number)}, {"_id": 0})
    if (not profile or not _is_publicly_visible(profile)
            or not await check_profile_active(profile)):
        raise HTTPException(status_code=404, detail="Invitation not found")
    return {
        "slug": profile["slug"],
        "invite_no": profile.get("invite_no"),
        "invite_code": invite_code(profile.get("invite_no")) or None,
        "name_slug": profile.get("name_slug"),
        "canonical_url": _invite_canonical_url(profile),
        "face_match_url": _invite_face_match_url(profile),
        "public_base": public_base_url() or None,
    }


# -----------------------------------------------------------------------------
# Mobile perf: batched endpoint — returns invite + side-data in one round-trip.
# Cuts initial mobile load from ~8-10 parallel requests down to 1.
# -----------------------------------------------------------------------------
@api_router.get("/invite/{slug}/full")
async def get_invitation_full(slug: str, request: Request, wishes_limit: int = 50):
    """Batched public invitation payload — merges /invite/{slug} with side-data
    (wishes, gifts, blessings, gallery_info, referral_code) in a single
    request. Designed to reduce mobile network round-trips & speed up first
    paint on the public invitation page.
    """
    wishes_n = max(1, min(int(wishes_limit or 50), 200))

    # Rate-limit /full too — it is the RICHEST public payload and previously had
    # no limiter (only /invite/{slug} did), leaving sequential-number enumeration
    # a wide-open door. Same per-IP rolling bucket as get_invitation.
    from cache_backend import rate_limit_allow as _rl_full
    _full_ip = get_client_ip(request)
    _full_limit = int(os.environ.get("INVITE_VIEW_LIMIT_PER_DAY", "500"))
    if not await _rl_full(f"invite_view:{_full_ip}", _full_limit, 86400):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    # Short-lived Redis cache of the whole payload. This endpoint runs ~8 DB
    # queries per call; a hot/viral link (or a single-slug load test) hitting the
    # same slug means those queries repeat needlessly. Serving from cache turns
    # thousands of identical views into ~one DB build per _FULL_CACHE_TTL seconds.
    # Views are still counted on every hit (cheap Redis buffer). Staleness is
    # bounded by the TTL — new wishes / edits appear within a few seconds.
    _ck = f"full:{slug}:{wishes_n}"

    def _serve_cached(env):
        _pid = env.get("pid")
        if _pid:
            _ip = request.client.host if request.client else "unknown"
            asyncio.create_task(_track_invitation_view_audit(_pid, _ip))
        return env["payload"]

    _cached = await _kv_get(_ck)
    if _cached and _cached.get("payload") is not None:
        return _serve_cached(_cached)

    # Cache miss. Single-flight so an expired key doesn't trigger a stampede —
    # dozens of concurrent misses all running the ~8-query build at once is what
    # produced the periodic latency tail (fast median, 6s+ p95). Only the lock
    # winner rebuilds; everyone else waits briefly for it to populate the cache,
    # then serves that. acquire_lock returns True with no Redis (single process),
    # so single-worker/dev just builds directly.
    if not await _acquire_lock(f"lock:{_ck}", 10):
        for _ in range(25):                      # up to ~2s waiting on the builder
            await asyncio.sleep(0.08)
            _c2 = await _kv_get(_ck)
            if _c2 and _c2.get("payload") is not None:
                return _serve_cached(_c2)
        # Builder didn't finish in time — fall through and build ourselves.

    is_numeric = slug.isdigit()
    profile = await _resolve_public_profile(slug)
    if not profile or (is_numeric and not _is_publicly_visible(profile)):
        raise HTTPException(status_code=404, detail="Invitation not found")

    client_ip = request.client.host if request.client else "unknown"
    # Track view (best-effort, don't block)
    asyncio.create_task(_track_invitation_view_audit(profile['id'], client_ip))

    if not await check_profile_active(profile):
        raise HTTPException(
            status_code=404 if is_numeric else 410,
            detail="Invitation not found" if is_numeric else "This invitation link has expired")

    profile_id = profile['id']

    # Fire all side queries in parallel — safe failures degrade to defaults.
    async def _safe(coro, default):
        try:
            return await coro
        except Exception as e:
            logger.warning(f"/invite/{slug}/full side-query failed: {e}")
            return default

    invite_task         = _build_invitation_public_view(profile)
    wishes_task         = _safe(db.guest_wishes.find(
                            {"profile_id": profile_id, "status": "approved"},
                            {"_id": 0, "ip_hash": 0}
                          ).to_list(wishes_n), [])
    wishes_count_t      = _safe(db.guest_wishes.count_documents(
                            {"profile_id": profile_id, "status": "approved"}), 0)
    gifts_task          = _safe(db.gift_registry.find_one(
                            {"profile_id": profile_id}, {"_id": 0}), None)
    blessings_recent_t  = _safe(db.shagun_records.find(
                            {"profile_id": profile_id}, {"_id": 0}
                          ).sort("created_at", -1).limit(30).to_list(30), [])
    blessings_count_t   = _safe(db.shagun_records.count_documents(
                            {"profile_id": profile_id}), 0)
    blessings_total_t   = _safe(db.shagun_records.aggregate([
                            {"$match": {"profile_id": profile_id}},
                            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
                          ]).to_list(1), [])
    # `db.referral_codes` has an index (server.py's index bootstrap creates one)
    # and NOTHING has ever written to it — every referral in this codebase lives
    # in `db.referrals` as {referrer_profile_id, referral_code}. So this field
    # was null on every invitation ever served. Read the collection that is
    # actually populated. Read-only on purpose: /api/public/referral-code-by-slug
    # lazily MINTS a code, which a cached public page render must not do.
    # `referred_profile_id: None` is the UNUSED code. A code is one-use: once a
    # guest redeems it the row records who they were and a fresh code is minted.
    # Advertising any old row would hand visitors a code that /referrals/apply
    # rejects as "already used".
    referral_task       = _safe(db.referrals.find_one(
                            {"referrer_profile_id": profile_id,
                             "referred_profile_id": None},
                            {"_id": 0, "referral_code": 1}), None)

    (invite, wishes, wishes_count, gifts_doc, bless_recent, bless_count, bless_total_doc, referral_doc) = await asyncio.gather(
        invite_task, wishes_task, wishes_count_t, gifts_task, blessings_recent_t, blessings_count_t, blessings_total_t, referral_task
    )
    bless_total_amount = int((bless_total_doc[0]["total"] if bless_total_doc else 0) or 0)

    # Sort wishes: featured first, then newest first
    def _ts(w):
        v = w.get("approved_at") or w.get("created_at")
        try:
            return datetime.fromisoformat(v).timestamp() if v else 0
        except Exception:
            return 0
    wishes.sort(key=lambda w: (not w.get("is_featured"), -_ts(w)))
    wishes = wishes[:wishes_n]

    gc = profile.get("gallery_config") or {}
    gallery_info = {
        "enabled":             bool(gc.get("enabled")),
        "total_photos":        int(gc.get("total_photos") or 0),
        "downloads_enabled":   bool(gc.get("downloads_enabled", True)),
        "watermark_enabled":   bool(gc.get("watermark_enabled", False)),
        "watermark_position":  gc.get("watermark_position", "bottom-right"),
        "watermark_text":      gc.get("watermark_text"),
        "upload_methods":      gc.get("upload_methods") or {"face_match": True, "qr_code": True, "shared_link": True},
        "privacy":             gc.get("privacy") or "public",
    }

    s = profile.get("shagun_settings") or {}
    shagun_enabled = bool(s.get("enabled")) and bool(s.get("upi_id"))

    # ---- Build full shagun payload (mirrors /invite/{slug}/shagun) so the
    # public DigitalShagunSection doesn't need a second round-trip.
    shagun_payload: Dict[str, Any] = {"enabled": False}
    if shagun_enabled:
        try:
            import urllib.parse as _up
            couple_str = f"{profile.get('groom_name','')} & {profile.get('bride_name','')}"

            def _upi_link(amount: int) -> str:
                return "upi://pay?" + _up.urlencode({
                    "pa": s["upi_id"],
                    "pn": s.get("payee_name") or couple_str,
                    "am": str(amount),
                    "cu": "INR",
                    "tn": f"Shagun for {couple_str}",
                })

            suggested = [
                {"amount": a, "link": _upi_link(a)}
                for a in s.get("suggested_amounts", [101, 501, 1001])
            ]
            shagun_payload = {
                "enabled": True,
                "couple": couple_str,
                "payee_name": s.get("payee_name") or couple_str,
                "blessing_message": s.get("blessing_message"),
                "upi_id": s["upi_id"],
                "gpay_handle": s.get("gpay_handle"),
                "phonepe_handle": s.get("phonepe_handle"),
                "paytm_handle": s.get("paytm_handle"),
                "suggested": suggested,
                "razorpay_enabled": bool(
                    s.get("razorpay_enabled")
                    and s.get("razorpay_key_id")
                    and s.get("razorpay_key_secret")
                ),
                "platform_fee_percent": float(s.get("platform_fee_percent", 5.0)),
            }
        except Exception as _e:
            logger.warning(f"/full shagun build failed: {_e}")

    # ---- Build venues payload (mirrors /invite/{slug}/venues)
    venues_payload: Dict[str, Any] = {"main_venue": None, "events": []}
    try:
        import urllib.parse as _up

        def _venue_links(lat, lng, name, map_link_paste, w3w):
            name_q = _up.quote(name or "")
            if lat is not None and lng is not None:
                google = (map_link_paste
                          or f"https://www.google.com/maps/search/?api=1&query={lat},{lng}")
                apple = f"https://maps.apple.com/?ll={lat},{lng}&q={name_q}"
                uber = (f"https://m.uber.com/ul/?action=setPickup&pickup=my_location"
                        f"&dropoff[latitude]={lat}&dropoff[longitude]={lng}"
                        f"&dropoff[nickname]={name_q}")
                ola = f"https://book.olacabs.com/?lat={lat}&lng={lng}&drop_name={name_q}"
                rapido = f"https://rapido.bike/Booknow?dropLat={lat}&dropLng={lng}"
                wa = "https://wa.me/?text=" + _up.quote(f"{name or 'Venue'} — {google}")
            else:
                google = (map_link_paste
                          or f"https://www.google.com/maps/search/?api=1&query={name_q}")
                apple = f"https://maps.apple.com/?q={name_q}"
                uber = f"https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[nickname]={name_q}"
                ola = f"https://book.olacabs.com/?drop_name={name_q}"
                rapido = "https://rapido.bike"
                wa = "https://wa.me/?text=" + _up.quote(f"{name or 'Venue'} — {google}")
            return {
                "google_maps": google, "apple_maps": apple,
                "uber": uber, "ola": ola, "rapido": rapido,
                "whatsapp_share": wa,
                "what3words_link": (f"https://what3words.com/{w3w}" if w3w else None),
            }

        ms = profile.get("map_settings", {}) or {}
        main_venue = {
            "kind": "main",
            "name": profile.get("venue") or "Wedding venue",
            "address": profile.get("venue_address") or profile.get("city") or "",
            "latitude": ms.get("latitude"),
            "longitude": ms.get("longitude"),
            "what3words": ms.get("what3words"),
            "parking_info": ms.get("parking_info"),
            "links": _venue_links(ms.get("latitude"), ms.get("longitude"),
                                  profile.get("venue"), ms.get("map_link"),
                                  ms.get("what3words")),
        }
        event_list = []
        for ev in profile.get("events", []) or []:
            event_list.append({
                "kind": "event",
                "event_id": ev.get("event_id"),
                "event_type": ev.get("event_type"),
                "event_name": ev.get("name") or ev.get("event_name") or "Event",
                "date": ev.get("date"),
                "start_time": ev.get("start_time"),
                "name": ev.get("venue_name") or main_venue["name"],
                "address": ev.get("venue_address") or "",
                "latitude": ev.get("latitude"),
                "longitude": ev.get("longitude"),
                "what3words": ev.get("what3words"),
                "parking_info": ev.get("parking_info"),
                "links": _venue_links(ev.get("latitude"), ev.get("longitude"),
                                      ev.get("venue_name") or main_venue["name"],
                                      ev.get("map_link"),
                                      ev.get("what3words")),
            })
        venues_payload = {"main_venue": main_venue, "events": event_list}
    except Exception as _e:
        logger.warning(f"/full venues build failed: {_e}")

    # ---- Travel payload — same builder as /invite/{slug}/travel (travel_links.py),
    # so the two can never drift again.
    travel_payload: Dict[str, Any] = {}
    try:
        from travel_links import travel_payload_for_profile
        travel_payload = travel_payload_for_profile(profile)
    except Exception as _e:
        logger.warning(f"/full travel build failed: {_e}")

    resp = {
        "invite":        jsonable_encoder(invite),
        "wishes":        wishes,
        "gifts":         gifts_doc,
        "blessings": {
            # legacy-compatible keys used by DigitalShagunSection / Wall of Love
            "blessing_count":        int(bless_count or 0),
            "blessing_total_amount": bless_total_amount,
            "wishes_count":          int(wishes_count or 0),
            "recent_blessings":      bless_recent,
            # new-shape keys retained for other consumers
            "total_count":           int(bless_count or 0),
            "recent":                bless_recent,
        },
        "gallery_info":  gallery_info,
        "shagun_enabled": shagun_enabled,
        "shagun":        shagun_payload,
        "venues":        venues_payload,
        "travel":        travel_payload,
        "referral_code": (referral_doc or {}).get("referral_code"),
    }
    # Cache the built payload for the next few seconds of same-slug traffic.
    # 15s TTL: absorbs a viral spike while keeping the page effectively live.
    try:
        await _kv_set(_ck, {"pid": profile_id, "payload": resp}, 15)
    except Exception:
        pass
    return resp


# Phase 2A — Save the Date (lightweight teaser page, separate from full invitation)
@api_router.get("/save-the-date/{slug}")
async def get_save_the_date(slug: str):
    """Lightweight teaser endpoint: returns only what's needed for the Save the Date page.
    No view tracking, no expensive joins."""
    profile = await db.profiles.find_one(
        {"slug": slug},
        {
            "_id": 0,
            "slug": 1,
            "groom_name": 1,
            "bride_name": 1,
            "event_date": 1,
            "venue": 1,
            "city": 1,
            "design_id": 1,
            "bride_photo_url": 1,
            "groom_photo_url": 1,
            "couple_photo_url": 1,
            "cover_photo_id": 1,
            "invitation_message": 1,
            "is_active": 1,
            "link_expiry_date": 1,
            "expires_at": 1,
        },
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")

    # Normalise event_date
    if isinstance(profile.get('event_date'), str):
        try:
            profile['event_date'] = datetime.fromisoformat(profile['event_date'])
        except Exception:
            pass

    return {
        "slug": profile["slug"],
        "groom_name": profile.get("groom_name", ""),
        "bride_name": profile.get("bride_name", ""),
        "event_date": profile.get("event_date"),
        "venue": profile.get("venue", ""),
        "city": profile.get("city"),
        "design_id": profile.get("design_id", "royal_mughal"),
        "bride_photo_url": profile.get("bride_photo_url"),
        "groom_photo_url": profile.get("groom_photo_url"),
        "couple_photo_url": profile.get("couple_photo_url"),
        "cover_photo_id": profile.get("cover_photo_id"),
        "invitation_message": profile.get("invitation_message"),
        "invitation_link": f"/invite/{profile['slug']}",
    }


# Find My Room — must be declared BEFORE /invite/{slug}/{event_type}
# (FastAPI routes are matched in declaration order — the event_type wildcard
# would otherwise swallow `room-lookup` as if it were an event type.)
@api_router.get("/invite/{slug}/room-lookup")
async def room_lookup_v2(slug: str, name: str = ""):
    """Public endpoint: case-insensitive partial-match search for a guest's room
    in the invitation's guest_rooms list. Returns up to 10 matches.
    """
    name_q = (name or "").strip().lower()
    if len(name_q) < 2:
        raise HTTPException(status_code=400, detail="Please enter at least 2 characters of your name")

    profile = await db.profiles.find_one(
        {"slug": slug},
        {"_id": 0, "guest_rooms": 1, "is_active": 1, "expires_at": 1, "link_expiry_date": 1},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")

    rooms = profile.get("guest_rooms") or []
    matches = []
    for r in rooms:
        gname = (r.get("guest_name") or "").lower()
        if name_q in gname:
            safe = {k: v for k, v in r.items() if k != "phone"}
            matches.append(safe)
        if len(matches) >= 10:
            break

    return {"count": len(matches), "matches": matches}


@api_router.get("/invite/{slug}/songs", response_model=List[SongRequestResponse])
async def list_song_requests_public_alias(slug: str, limit: int = 30):
    """Public alias for song requests list (avoids catch-all event_type route)."""
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    settings = (profile.get('song_requests_settings') or {})
    if not settings.get('enabled', False):
        return []
    rows = await db.song_requests.find(
        {"profile_id": profile['id']}, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(int(limit or 30), 100))).to_list(100)
    out = []
    for r in rows:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
        out.append(SongRequestResponse(
            id=r['id'], guest_name=r.get('guest_name', ''), song_title=r.get('song_title', ''),
            artist=r.get('artist'), provider_url=r.get('provider_url'), message=r.get('message'),
            created_at=r['created_at'],
        ))
    return out


# IMPORTANT: this alias MUST stay above the catch-all `/invite/{slug}/{event_type}`
# below — FastAPI matches routes by registration order, so /calendar would otherwise
# be eaten by the catch-all and return 400 "Invalid event type". The original handler
# lives further down in the file; this alias just forwards to it lazily.
@api_router.get("/invite/{slug}/calendar")
async def download_calendar_alias(slug: str, event_id: Optional[str] = None):
    """Public alias for ICS calendar (registered before catch-all)."""
    # Late-bound delegate — `download_calendar` is defined later in this file.
    return await download_calendar(slug, event_id=event_id)  # noqa: F821 (defined later)


@api_router.get("/invite/{slug}/{event_type}", response_model=InvitationPublicView)
async def get_event_invitation(slug: str, event_type: str):
    """Get public invitation for a specific ceremony.

    The path segment accepts EITHER a ceremony type (`/invite/x/mehendi`) or a
    ceremony's own unique slug (`/invite/x/mehendi-a1b2c3d4`).

    `WeddingEvent.slug` is generated and uniqueness-checked at creation time
    (see create-event), but until now nothing ever read it back — every public
    URL was the guessable enum, so a ceremony page could be enumerated from the
    profile slug alone, and two ceremonies of the same type were unaddressable.
    Resolving the slug first restores opaque per-ceremony URLs without breaking
    the type-based links already printed on cards and QR codes.

    NEW: Checks EventInvitation first (dedicated event invitation links)
    FALLBACK: Falls back to WeddingEvent within profile (PHASE 13 legacy)
    """
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})

    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Check if active and not expired (link expiry)
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")

    valid_event_types = ['engagement', 'haldi', 'mehendi', 'marriage', 'reception']
    event_type_lower = (event_type or "").lower()
    # When the segment is a ceremony slug, keep the matched ceremony itself —
    # picking "first of this type" would defeat the point of a unique slug.
    slug_matched_event = None
    if event_type_lower not in valid_event_types:
        for evt in profile.get('events', []) or []:
            if (evt.get('slug') or '').lower() == event_type_lower:
                slug_matched_event = evt
                event_type_lower = (evt.get('event_type') or '').lower()
                break
        if slug_matched_event is None:
            raise HTTPException(
                status_code=404,
                detail=f"Event '{event_type}' not found in this invitation"
            )

    # NEW: Check if EventInvitation exists for this profile and event_type
    event_invitation = await db.event_invitations.find_one({
        "profile_id": profile['id'],
        "event_type": event_type_lower
    }, {"_id": 0})

    # A slug-addressed ceremony always renders that exact ceremony; the
    # per-type EventInvitation record is only consulted for type-addressed URLs.
    if event_invitation and slug_matched_event is None:
        # Check if enabled
        if not event_invitation.get('enabled', True):
            raise HTTPException(status_code=404, detail="This event invitation is not available")

        # Use EventInvitation's design_id and deity_id
        design_id = event_invitation.get('design_id', profile['design_id'])
        deity_id = event_invitation.get('deity_id', profile.get('deity_id'))
    else:
        # FALLBACK: Find the specific event in the profile (PHASE 13 legacy)
        event_data = slug_matched_event
        if event_data is None:
            for evt in profile.get('events', []) or []:
                if evt.get('event_type', '').lower() == event_type_lower:
                    event_data = evt
                    break

        if not event_data:
            raise HTTPException(
                status_code=404,
                detail=f"Event '{event_type}' not found in this invitation"
            )
        
        # PHASE 17: Check if event is enabled (soft delete check)
        if not event_data.get('enabled', True):
            raise HTTPException(
                status_code=404,
                detail="This event is not available"
            )
        
        # Use event's design or profile default
        design_id = event_data.get('design_preset_id') or profile['design_id']
        deity_id = profile.get('deity_id')
    
    # PHASE 12: Check invitation expiry (separate from link expiry)
    is_expired = False
    expires_at = profile.get('expires_at')
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        
        # Ensure timezone-aware
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expires_at:
            is_expired = True
    
    # Get media
    media_list = await db.profile_media.find(
        {"profile_id": profile['id']},
        {"_id": 0}
    ).sort("order", 1).to_list(1000)
    
    # Get greetings - Only return approved greetings for public view (last 20)
    greetings_list = await db.greetings.find(
        {"profile_id": profile['id'], "approval_status": "approved"},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Convert date strings
    if isinstance(profile.get('event_date'), str):
        profile['event_date'] = datetime.fromisoformat(profile['event_date'])
    
    for media in media_list:
        if isinstance(media.get('created_at'), str):
            media['created_at'] = datetime.fromisoformat(media['created_at'])
    
    for greeting in greetings_list:
        if isinstance(greeting.get('created_at'), str):
            greeting['created_at'] = datetime.fromisoformat(greeting['created_at'])
    
    # Filter events to only show events matching the event_type (for backward compatibility)
    filtered_events = []
    for evt in profile.get('events', []):
        if evt.get('event_type', '').lower() == event_type_lower:
            filtered_events.append(WeddingEvent(**evt))
    
    return InvitationPublicView(
        slug=profile['slug'],
        invite_no=profile.get('invite_no'),
        invite_code=invite_code(profile.get('invite_no')) or None,
        name_slug=profile.get('name_slug'),
        canonical_url=_invite_canonical_url(profile),
        face_match_url=_invite_face_match_url(profile),
        public_base=public_base_url() or None,
        groom_name=profile['groom_name'],
        bride_name=profile['bride_name'],
        event_type=profile['event_type'],
        event_date=profile['event_date'],
        venue=profile['venue'],
        city=profile.get('city'),
        invitation_message=profile.get('invitation_message'),
        language=profile['language'],
        design_id=design_id,  # Use EventInvitation's design or fallback
        deity_id=deity_id,  # Use EventInvitation's deity or fallback
        whatsapp_groom=profile.get('whatsapp_groom'),
        whatsapp_bride=profile.get('whatsapp_bride'),
        enabled_languages=profile.get('enabled_languages', ['english']),
        custom_text=profile.get('custom_text', {}),
        translations=profile.get('translations') or {},
        accent_color=profile.get('accent_color'),
        closing_text=profile.get('closing_text'),
        closing_signature=profile.get('closing_signature'),
        closing_animation_id=profile.get('closing_animation_id'),
        about_couple=profile.get('about_couple'),
        family_details=profile.get('family_details'),
        love_story=profile.get('love_story'),
        bride_photo_url=profile.get('bride_photo_url') or (profile.get('custom_text', {}).get('_maja', {}) or {}).get('bride_photo_url'),
        groom_photo_url=profile.get('groom_photo_url') or (profile.get('custom_text', {}).get('_maja', {}) or {}).get('groom_photo_url'),
        couple_photo_url=profile.get('couple_photo_url') or (profile.get('custom_text', {}).get('_maja', {}) or {}).get('couple_photo_url'),
        bride_about=profile.get('bride_about'),
        groom_about=profile.get('groom_about'),
        cover_photo_id=profile.get('cover_photo_id'),
        show_couple_photo=profile.get('show_couple_photo', True),
        show_bride_photo=profile.get('show_bride_photo', True),
        show_groom_photo=profile.get('show_groom_photo', True),
        use_couple_photo_as_opening_bg=profile.get('use_couple_photo_as_opening_bg', True),
        opening_bg_source=profile.get('opening_bg_source') or 'couple',
        opening_photo_url=profile.get('opening_photo_url'),
        sections_enabled=SectionsEnabled(**profile['sections_enabled']),
        background_music=BackgroundMusic(**profile.get('background_music', {'enabled': False, 'file_url': None})),
        map_settings=MapSettings(**profile.get('map_settings', {'embed_enabled': False})),
        contact_info=ContactInfo(**profile.get('contact_info', {})),
        rsvp_settings=RSVPSettings(**(profile.get('rsvp_settings') or {})),
        honeymoon_fund=HoneymoonFund(**(profile.get('honeymoon_fund') or {})),
        live_stream=LiveStreamSettings(**(profile.get('live_stream') or {})),
        song_requests_settings=SongRequestSettings(**(profile.get('song_requests_settings') or {})),
        dress_code_settings=DressCodeSettings(**(profile.get('dress_code_settings') or {})),
        events=filtered_events,  # Show matching events
        media=[ProfileMedia(**m) for m in media_list],
        greetings=[GreetingResponse(**g) for g in greetings_list],
        guest_rooms=[GuestRoom(**gr) for gr in (profile.get('guest_rooms') or [])],
        pre_wedding_links=[PreWeddingLink(**pl) for pl in (profile.get('pre_wedding_links') or [])],
        is_expired=is_expired,
        decorative_effects=profile.get('sections_enabled', {}).get('decorative_effects', True),  # PHASE 17: Decorative effects
        seo_settings=SEOSettings(**profile.get("seo_settings", {"seo_enabled": True, "social_sharing_enabled": True, "custom_description": None})),
        design_selections=profile.get("design_selections", {}) or {},
        faq_settings=profile.get("faq_settings"),
        invitation_category=profile.get("invitation_category", "wedding"),
        celebrant_info=profile.get("celebrant_info"),
        requires_watermark=requires_watermark(profile),
        admin_watermark_override=profile.get("admin_watermark_override"),
        granted_features=await _public_granted_features(profile),
        managed_by=await _studio_credit_for_profile(profile),
    )


@api_router.post("/invite/{slug}/greetings", response_model=GreetingResponse)
async def submit_greeting(
    slug: str, 
    greeting_data: GreetingCreate, 
    request: Request,
    captcha_id: Optional[str] = None,
    captcha_answer: Optional[str] = None
):
    """
    Submit greeting for invitation
    
    PHASE 11: Default status is 'pending' for moderation
    PHASE 32: Now includes CAPTCHA verification if required
    """
    # PHASE 12 - PART 4: Rate limiting - 3 wishes per IP per day
    client_ip = get_client_ip(request)
    if not await check_rate_limit(client_ip, "wishes", 3):
        raise HTTPException(
            status_code=429,
            detail="You have exceeded the maximum number of wishes submissions for today. Please try again tomorrow."
        )
    
    # PHASE 32: Check if CAPTCHA is required for this IP/device
    device_id = request.headers.get("X-Device-Id", None)
    captcha_check = await check_submission_captcha_required(slug, client_ip, device_id, "wishes")
    
    if captcha_check["requires_captcha"]:
        # CAPTCHA is required, verify it
        if not captcha_id or not captcha_answer:
            raise HTTPException(
                status_code=400,
                detail="CAPTCHA verification is required. Please complete the CAPTCHA challenge."
            )
        
        # Verify CAPTCHA
        try:
            captcha_challenge = await db.captcha_challenges.find_one({"id": captcha_id}, {"_id": 0})
            
            if not captcha_challenge:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid CAPTCHA. Please try again."
                )
            
            # Check if expired
            expires_at = captcha_challenge.get('expires_at')
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            if datetime.now(timezone.utc) > expires_at:
                await db.captcha_challenges.delete_one({"id": captcha_id})
                raise HTTPException(
                    status_code=400,
                    detail="CAPTCHA expired. Please request a new challenge."
                )
            
            # Verify answer
            expected_answer_hash = captcha_challenge.get('answer')
            provided_answer_hash = hashlib.sha256(str(captcha_answer).encode()).hexdigest()
            
            if provided_answer_hash != expected_answer_hash:
                # Wrong answer - track failed attempt
                await track_submission_attempt(client_ip, device_id, "wishes", slug, False, True)
                await db.captcha_challenges.delete_one({"id": captcha_id})
                raise HTTPException(
                    status_code=400,
                    detail="Incorrect CAPTCHA answer. Please try again."
                )
            
            # Correct answer - delete challenge
            await db.captcha_challenges.delete_one({"id": captcha_id})
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"CAPTCHA verification error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="CAPTCHA verification failed. Please try again."
            )
    
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")
    
    # PHASE 12: Check invitation expiry (separate from link expiry)
    expires_at = profile.get('expires_at')
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=403, detail="This invitation has expired. Submitting wishes is no longer available.")
    
    # Sanitize input using bleach
    import bleach
    sanitized_name = bleach.clean(greeting_data.guest_name, tags=[], strip=True)
    sanitized_message = bleach.clean(greeting_data.message, tags=[], strip=True)
    
    greeting = Greeting(
        profile_id=profile['id'],
        guest_name=sanitized_name,
        message=sanitized_message,
        approval_status="pending"  # PHASE 11: Default to pending for moderation
    )
    
    doc = greeting.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.greetings.insert_one(doc)
    
    # PHASE 32: Track successful submission (resets CAPTCHA requirement)
    await track_submission_attempt(client_ip, device_id, "wishes", slug, True, captcha_check["requires_captcha"])
    
    return GreetingResponse(
        id=greeting.id,
        guest_name=greeting.guest_name,
        message=greeting.message,
        approval_status=greeting.approval_status,
        created_at=greeting.created_at
    )


@api_router.get("/admin/profiles/{profile_id}/greetings", response_model=List[GreetingResponse])
async def get_profile_greetings(
    profile_id: str, 
    status: Optional[str] = None,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 11: Get all greetings for a profile with optional status filter"""
    await check_profile_ownership(profile_id, admin_id, db)
    # Build query filter
    query_filter = {"profile_id": profile_id}
    if status and status in ['pending', 'approved', 'rejected']:
        query_filter["approval_status"] = status
    
    greetings = await db.greetings.find(
        query_filter,
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    for greeting in greetings:
        if isinstance(greeting.get('created_at'), str):
            greeting['created_at'] = datetime.fromisoformat(greeting['created_at'])
        # Set default approval_status for old greetings without this field
        if 'approval_status' not in greeting:
            greeting['approval_status'] = 'approved'
    
    return [GreetingResponse(**g) for g in greetings]


# ==================== PHASE 11: GREETING MODERATION ROUTES ====================

@api_router.put("/admin/greetings/{greeting_id}/approve")
async def approve_greeting(greeting_id: str, admin_id: str = Depends(get_current_admin)):
    """PHASE 11: Approve a greeting"""
    greeting = await db.greetings.find_one({"id": greeting_id}, {"_id": 0, "profile_id": 1})
    if not greeting:
        raise HTTPException(status_code=404, detail="Greeting not found")
    await check_profile_ownership(greeting["profile_id"], admin_id, db)

    result = await db.greetings.update_one(
        {"id": greeting_id},
        {"$set": {"approval_status": "approved"}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Greeting not found")

    return {"message": "Greeting approved successfully"}


@api_router.put("/admin/greetings/{greeting_id}/reject")
async def reject_greeting(greeting_id: str, admin_id: str = Depends(get_current_admin)):
    """PHASE 11: Reject a greeting"""
    greeting = await db.greetings.find_one({"id": greeting_id}, {"_id": 0, "profile_id": 1})
    if not greeting:
        raise HTTPException(status_code=404, detail="Greeting not found")
    await check_profile_ownership(greeting["profile_id"], admin_id, db)

    result = await db.greetings.update_one(
        {"id": greeting_id},
        {"$set": {"approval_status": "rejected"}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Greeting not found")

    return {"message": "Greeting rejected successfully"}


@api_router.delete("/admin/greetings/{greeting_id}")
async def delete_greeting(greeting_id: str, admin_id: str = Depends(get_current_admin)):
    """PHASE 11: Delete a greeting"""
    greeting = await db.greetings.find_one({"id": greeting_id}, {"_id": 0, "profile_id": 1})
    if not greeting:
        raise HTTPException(status_code=404, detail="Greeting not found")
    await check_profile_ownership(greeting["profile_id"], admin_id, db)

    result = await db.greetings.delete_one({"id": greeting_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Greeting not found")

    return {"message": "Greeting deleted successfully"}


# ==================== RSVP ROUTES ====================

@api_router.post("/rsvp", response_model=RSVPResponse)
async def submit_rsvp(
    slug: str, 
    rsvp_data: RSVPCreate, 
    request: Request,
    captcha_id: Optional[str] = None,
    captcha_answer: Optional[str] = None
):
    """
    Submit RSVP for invitation (public endpoint)
    
    PHASE 32: Now includes CAPTCHA verification if required
    """
    # PHASE 12 - PART 4: Rate limiting - 5 RSVPs per IP per day
    client_ip = get_client_ip(request)
    if not await check_rate_limit(client_ip, "rsvp", 5):
        raise HTTPException(
            status_code=429,
            detail="You have exceeded the maximum number of RSVP submissions for today. Please try again tomorrow."
        )
    
    # PHASE 32: Check if CAPTCHA is required for this IP/device
    device_id = request.headers.get("X-Device-Id", None)
    captcha_check = await check_submission_captcha_required(slug, client_ip, device_id, "rsvp")
    
    if captcha_check["requires_captcha"]:
        # CAPTCHA is required, verify it
        if not captcha_id or not captcha_answer:
            raise HTTPException(
                status_code=400,
                detail="CAPTCHA verification is required. Please complete the CAPTCHA challenge."
            )
        
        # Verify CAPTCHA
        try:
            captcha_challenge = await db.captcha_challenges.find_one({"id": captcha_id}, {"_id": 0})
            
            if not captcha_challenge:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid CAPTCHA. Please try again."
                )
            
            # Check if expired
            expires_at = captcha_challenge.get('expires_at')
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            if datetime.now(timezone.utc) > expires_at:
                await db.captcha_challenges.delete_one({"id": captcha_id})
                raise HTTPException(
                    status_code=400,
                    detail="CAPTCHA expired. Please request a new challenge."
                )
            
            # Verify answer
            expected_answer_hash = captcha_challenge.get('answer')
            provided_answer_hash = hashlib.sha256(str(captcha_answer).encode()).hexdigest()
            
            if provided_answer_hash != expected_answer_hash:
                # Wrong answer - track failed attempt
                await track_submission_attempt(client_ip, device_id, "rsvp", slug, False, True)
                await db.captcha_challenges.delete_one({"id": captcha_id})
                raise HTTPException(
                    status_code=400,
                    detail="Incorrect CAPTCHA answer. Please try again."
                )
            
            # Correct answer - delete challenge
            await db.captcha_challenges.delete_one({"id": captcha_id})
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"CAPTCHA verification error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="CAPTCHA verification failed. Please try again."
            )
    
    # Find profile by slug
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Check if profile is active and not expired
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")
    
    # PHASE 12: Check invitation expiry (separate from link expiry)
    expires_at = profile.get('expires_at')
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=403, detail="This invitation has expired. RSVP submissions are no longer available.")
    
    # Check for duplicate RSVP (profile_id + guest_phone)
    existing_rsvp = await db.rsvps.find_one({
        "profile_id": profile['id'],
        "guest_phone": rsvp_data.guest_phone
    }, {"_id": 0})
    
    if existing_rsvp:
        # PHASE 11: Check if within 48 hours - allow update instead
        if isinstance(existing_rsvp.get('created_at'), str):
            created_at = datetime.fromisoformat(existing_rsvp['created_at'])
        else:
            created_at = existing_rsvp['created_at']
        
        time_since_creation = datetime.now(timezone.utc) - created_at
        if time_since_creation <= timedelta(hours=48):
            # Update existing RSVP
            update_doc = {
                "guest_name": rsvp_data.guest_name,
                "status": rsvp_data.status,
                "guest_count": rsvp_data.guest_count,
                "message": rsvp_data.message,
                "dietary_preference": rsvp_data.dietary_preference,
                "allergies": rsvp_data.allergies,
                "plus_one": rsvp_data.plus_one,
                "kids_count": rsvp_data.kids_count,
            }
            
            await db.rsvps.update_one(
                {"id": existing_rsvp['id']},
                {"$set": update_doc}
            )
            
            # Fetch updated RSVP
            updated_rsvp = await db.rsvps.find_one({"id": existing_rsvp['id']}, {"_id": 0})
            if isinstance(updated_rsvp.get('created_at'), str):
                updated_rsvp['created_at'] = datetime.fromisoformat(updated_rsvp['created_at'])
            
            return RSVPResponse(**updated_rsvp)
        else:
            raise HTTPException(
                status_code=400,
                detail="You have already submitted an RSVP. Edits are only allowed within 48 hours of submission."
            )
    
    # Create RSVP
    rsvp = RSVP(
        profile_id=profile['id'],
        guest_name=rsvp_data.guest_name,
        guest_phone=rsvp_data.guest_phone,
        status=rsvp_data.status,
        guest_count=rsvp_data.guest_count,
        message=rsvp_data.message,
        dietary_preference=rsvp_data.dietary_preference,
        allergies=rsvp_data.allergies,
        plus_one=rsvp_data.plus_one,
        kids_count=rsvp_data.kids_count,
    )
    
    doc = rsvp.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.rsvps.insert_one(doc)
    
    # PHASE 32: Track successful submission (resets CAPTCHA requirement)
    await track_submission_attempt(client_ip, device_id, "rsvp", slug, True, captcha_check["requires_captcha"])
    
    return RSVPResponse(
        id=rsvp.id,
        guest_name=rsvp.guest_name,
        guest_phone=rsvp.guest_phone,
        status=rsvp.status,
        guest_count=rsvp.guest_count,
        message=rsvp.message,
        dietary_preference=rsvp.dietary_preference,
        allergies=rsvp.allergies,
        plus_one=rsvp.plus_one,
        kids_count=rsvp.kids_count,
        created_at=rsvp.created_at
    )


@api_router.get("/invite/{slug}/rsvp/check")
async def check_rsvp_status(slug: str, phone: str, request: Request, guest_name: Optional[str] = None):
    """
    PHASE 11 + PHASE 32: Check if RSVP exists and if it can be edited

    SECURITY FIX:
    - Without guest_name: Returns only minimal data (exists, can_edit, hours_remaining)
    - With guest_name: Verifies ownership and returns full RSVP data for editing
    This prevents unauthorized access to RSVP data while maintaining edit functionality

    Rate-limited per IP: this endpoint is otherwise a phone-number oracle — an
    attacker with a public slug could enumerate which numbers RSVP'd, and with a
    guessed name pull the guest's full RSVP. 30/day is generous for real guests.
    """
    client_ip = get_client_ip(request)
    if not await check_rate_limit(client_ip, "rsvp_check", 30):
        raise HTTPException(status_code=429, detail="Too many RSVP lookups today. Please try again tomorrow.")
    # Find profile by slug
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Find RSVP by phone
    existing_rsvp = await db.rsvps.find_one({
        "profile_id": profile['id'],
        "guest_phone": phone
    }, {"_id": 0})
    
    if not existing_rsvp:
        return {
            "exists": False,
            "can_edit": False,
            "hours_remaining": 0
        }
    
    # Convert created_at if string
    if isinstance(existing_rsvp.get('created_at'), str):
        created_at = datetime.fromisoformat(existing_rsvp['created_at'])
    else:
        created_at = existing_rsvp['created_at']
    
    # Check if within 48 hours
    time_since_creation = datetime.now(timezone.utc) - created_at
    can_edit = time_since_creation <= timedelta(hours=48)
    
    # If guest_name is provided, verify ownership before returning full data
    if guest_name and can_edit:
        # Case-insensitive comparison for name verification
        provided_name = guest_name.strip().lower()
        stored_name = existing_rsvp.get('guest_name', '').strip().lower()
        
        if provided_name == stored_name:
            # Ownership verified - return full RSVP data for editing
            if isinstance(existing_rsvp.get('created_at'), str):
                existing_rsvp['created_at'] = datetime.fromisoformat(existing_rsvp['created_at'])
            
            return {
                "exists": True,
                "can_edit": True,
                "hours_remaining": max(0, 48 - (time_since_creation.total_seconds() / 3600)),
                "rsvp": RSVPResponse(**existing_rsvp)
            }
        else:
            # Name doesn't match - potential unauthorized access attempt
            return {
                "exists": True,
                "can_edit": False,
                "hours_remaining": 0,
                "error": "Name verification failed"
            }
    
    # SECURITY: Without name verification, only return minimal information
    return {
        "exists": True,
        "can_edit": can_edit,
        "hours_remaining": max(0, 48 - (time_since_creation.total_seconds() / 3600)) if can_edit else 0
    }


@api_router.put("/rsvp/{rsvp_id}", response_model=RSVPResponse)
async def update_rsvp(rsvp_id: str, rsvp_data: RSVPCreate, request: Request):
    """PHASE 11: Update RSVP within 48 hours of creation

    Rate-limited per IP: the only "auth" here is re-supplying the guest's phone
    number, so an unthrottled attacker who learned an rsvp_id could brute-force
    the phone match and silently rewrite a guest's RSVP."""
    client_ip = get_client_ip(request)
    if not await check_rate_limit(client_ip, "rsvp_update", 10):
        raise HTTPException(status_code=429, detail="Too many RSVP updates today. Please try again tomorrow.")
    # Find existing RSVP
    existing_rsvp = await db.rsvps.find_one({"id": rsvp_id}, {"_id": 0})
    
    if not existing_rsvp:
        raise HTTPException(status_code=404, detail="RSVP not found")
    
    # Convert created_at if string
    if isinstance(existing_rsvp.get('created_at'), str):
        created_at = datetime.fromisoformat(existing_rsvp['created_at'])
    else:
        created_at = existing_rsvp['created_at']
    
    # Check if within 48 hours
    time_since_creation = datetime.now(timezone.utc) - created_at
    if time_since_creation > timedelta(hours=48):
        raise HTTPException(
            status_code=403,
            detail="Cannot edit RSVP after 48 hours of submission"
        )
    
    # Verify phone number matches (security check)
    if existing_rsvp['guest_phone'] != rsvp_data.guest_phone:
        raise HTTPException(
            status_code=403,
            detail="Phone number does not match original RSVP"
        )
    
    # Update RSVP
    update_doc = {
        "guest_name": rsvp_data.guest_name,
        "status": rsvp_data.status,
        "guest_count": rsvp_data.guest_count,
        "message": rsvp_data.message
    }
    
    result = await db.rsvps.update_one(
        {"id": rsvp_id},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="RSVP not found or no changes made")
    
    # Fetch updated RSVP
    updated_rsvp = await db.rsvps.find_one({"id": rsvp_id}, {"_id": 0})
    
    # Convert date strings
    if isinstance(updated_rsvp.get('created_at'), str):
        updated_rsvp['created_at'] = datetime.fromisoformat(updated_rsvp['created_at'])
    
    return RSVPResponse(**updated_rsvp)


@api_router.get("/admin/profiles/{profile_id}/rsvps", response_model=List[RSVPResponse])
async def get_profile_rsvps(
    profile_id: str,
    status: Optional[str] = None,
    admin_id: str = Depends(get_current_admin)
):
    """Get all RSVPs for a profile with optional status filter"""
    # Build query
    query = {"profile_id": profile_id}
    if status and status in ['yes', 'no', 'maybe']:
        query['status'] = status
    
    # Fetch RSVPs (limit 500)
    rsvps = await db.rsvps.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(500).to_list(500)
    
    # Convert date strings
    for rsvp in rsvps:
        if isinstance(rsvp.get('created_at'), str):
            rsvp['created_at'] = datetime.fromisoformat(rsvp['created_at'])

    # ONE unparseable row must not take out the whole list.
    #
    # `RSVPResponse` requires guest_name / guest_phone / guest_count, which is
    # what the public RSVP writer produces. Older rows (and the demo seed) use
    # `name` / `guests` and carry no phone, so a single one of them raised a
    # ValidationError inside the response_model and answered **500 for every
    # RSVP on that wedding** — the photographer's whole guest list, gone,
    # because of one legacy row.
    #
    # Legacy keys are mapped; anything still unparseable is skipped and logged
    # rather than allowed to fail the request. A partial list beats none.
    out: List[RSVPResponse] = []
    for r in rsvps:
        row = dict(r)
        row.setdefault('guest_name', row.get('name') or 'Guest')
        row.setdefault('guest_phone', row.get('phone') or '')
        row.setdefault('guest_count', row.get('guests') or 1)
        try:
            out.append(RSVPResponse(**row))
        except Exception:
            logger.warning("rsvps: skipping unparseable row %s on profile %s",
                           row.get('id'), profile_id, exc_info=True)
    return out


@api_router.get("/admin/profiles/{profile_id}/rsvps/stats", response_model=RSVPStats)
async def get_rsvp_stats(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Get RSVP statistics for a profile"""
    # Get all RSVPs for the profile
    rsvps = await db.rsvps.find(
        {"profile_id": profile_id},
        {"_id": 0}
    ).to_list(500)
    
    # Calculate statistics
    total_rsvps = len(rsvps)
    # `r['status']` would KeyError on a row that predates the field; `.get` is
    # the same fix the list endpoint above needed. `guests` is the legacy name
    # for guest_count and is counted rather than silently read as 1.
    attending_count = sum(1 for r in rsvps if normalize_rsvp_status(r.get('status')) == 'yes')
    not_attending_count = sum(1 for r in rsvps if normalize_rsvp_status(r.get('status')) == 'no')
    maybe_count = sum(1 for r in rsvps if normalize_rsvp_status(r.get('status')) == 'maybe')
    total_guest_count = sum(r.get('guest_count', r.get('guests', 1)) or 1
                            for r in rsvps if normalize_rsvp_status(r.get('status')) == 'yes')
    
    return RSVPStats(
        total_rsvps=total_rsvps,
        attending_count=attending_count,
        not_attending_count=not_attending_count,
        maybe_count=maybe_count,
        total_guest_count=total_guest_count
    )


@api_router.get("/admin/profiles/{profile_id}/rsvps/export")
async def export_rsvps_csv(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Export RSVPs as CSV"""
    from fastapi.responses import StreamingResponse
    import io
    import csv
    
    # Fetch all RSVPs
    rsvps = await db.rsvps.find(
        {"profile_id": profile_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Convert to CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(['Guest Name', 'Phone', 'Status', 'Guest Count', 'Message', 'Submitted At'])
    
    # Write data
    for rsvp in rsvps:
        created_at = rsvp.get('created_at')
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        
        writer.writerow([
            rsvp.get('guest_name', ''),
            rsvp.get('guest_phone', ''),
            rsvp.get('status', ''),
            rsvp.get('guest_count', 1),
            rsvp.get('message', ''),
            created_at.strftime('%Y-%m-%d %H:%M:%S') if created_at else ''
        ])
    
    # Prepare response
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=rsvps_{profile_id}.csv"
        }
    )


# ============================================================================
# BUCKET 1A — Song Requests & Guest Check-Ins
# ============================================================================

@api_router.post("/invite/{slug}/song-requests", response_model=SongRequestResponse)
async def submit_song_request(slug: str, payload: SongRequestCreate):
    """Public endpoint — guest submits a song suggestion."""
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")

    settings = (profile.get('song_requests_settings') or {})
    if not settings.get('enabled', False):
        raise HTTPException(status_code=403, detail="Song requests are not enabled for this invitation")

    max_per_guest = int(settings.get('max_per_guest', 3) or 3)

    # Per-guest limit (by name + phone)
    query = {"profile_id": profile['id'], "guest_name": payload.guest_name.strip()}
    if payload.guest_phone:
        query["guest_phone"] = payload.guest_phone
    existing = await db.song_requests.count_documents(query)
    if existing >= max_per_guest:
        raise HTTPException(
            status_code=429,
            detail=f"You have reached the limit of {max_per_guest} song requests."
        )

    sr = SongRequest(
        profile_id=profile['id'],
        guest_name=payload.guest_name,
        guest_phone=payload.guest_phone,
        song_title=payload.song_title,
        artist=payload.artist,
        provider_url=payload.provider_url,
        message=payload.message,
    )
    await db.song_requests.insert_one(sr.model_dump())
    return SongRequestResponse(
        id=sr.id,
        guest_name=sr.guest_name,
        song_title=sr.song_title,
        artist=sr.artist,
        provider_url=sr.provider_url,
        message=sr.message,
        created_at=sr.created_at,
    )


@api_router.get("/invite/{slug}/song-requests", response_model=List[SongRequestResponse])
async def list_song_requests_public(slug: str, limit: int = 30):
    """Public endpoint — list recent song requests (no PII)."""
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")

    settings = (profile.get('song_requests_settings') or {})
    if not settings.get('enabled', False):
        return []

    rows = await db.song_requests.find(
        {"profile_id": profile['id']}, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(int(limit or 30), 100))).to_list(100)

    out: List[SongRequestResponse] = []
    for r in rows:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
        out.append(SongRequestResponse(
            id=r['id'],
            guest_name=r.get('guest_name', ''),
            song_title=r.get('song_title', ''),
            artist=r.get('artist'),
            provider_url=r.get('provider_url'),
            message=r.get('message'),
            created_at=r['created_at'],
        ))
    return out


@api_router.get("/admin/profiles/{profile_id}/song-requests", response_model=List[SongRequestResponse])
async def admin_list_song_requests(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Admin endpoint — list all song requests for a profile."""
    # Ownership check (admin must own profile)
    profile = await db.profiles.find_one({"id": profile_id, "admin_id": admin_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    rows = await db.song_requests.find(
        {"profile_id": profile_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    out = []
    for r in rows:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
        out.append(SongRequestResponse(
            id=r['id'],
            guest_name=r.get('guest_name', ''),
            song_title=r.get('song_title', ''),
            artist=r.get('artist'),
            provider_url=r.get('provider_url'),
            message=r.get('message'),
            created_at=r['created_at'],
        ))
    return out


@api_router.delete("/admin/song-requests/{request_id}")
async def admin_delete_song_request(request_id: str, admin_id: str = Depends(get_current_admin)):
    """Admin endpoint — delete a song request (owner-only)."""
    sr = await db.song_requests.find_one({"id": request_id}, {"_id": 0})
    if not sr:
        raise HTTPException(status_code=404, detail="Song request not found")

    profile = await db.profiles.find_one({"id": sr.get('profile_id'), "admin_id": admin_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=403, detail="Not authorized to delete this song request")

    await db.song_requests.delete_one({"id": request_id})
    return {"success": True}


@api_router.post("/invite/{slug}/check-in", response_model=CheckInResponse)
async def guest_check_in(slug: str, payload: CheckInCreate):
    """Public endpoint — guest checks in at the venue/event."""
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")

    sections = profile.get('sections_enabled', {}) or {}
    if not sections.get('check_in', False):
        raise HTTPException(status_code=403, detail="Check-in is not enabled for this invitation")

    # Validate event_id (if provided) belongs to this profile
    event_id = payload.event_id
    if event_id:
        events = profile.get('events', []) or []
        if not any((e.get('event_id') == event_id) for e in events):
            raise HTTPException(status_code=400, detail="Invalid event_id")

    # Prevent rapid duplicates (same guest_name + phone + event within 30 min)
    # Match guest_name case-insensitively to avoid 'Riya' vs 'riya' duplicates.
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    # `{"guest_name": re.compile(...)}` is Mongo/BSON syntax. pg_adapter speaks
    # the dict form ($regex/$options) and treated a compiled Pattern as a plain
    # value, so this filter matched NOTHING and the 30-minute dedup never fired
    # once — every re-tap of the check-in button added another guest to the
    # venue count. No error was raised, which is why it survived.
    name_regex = {"$regex": f"^{re.escape(payload.guest_name.strip())}$",
                  "$options": "i"}
    dup_q: Dict[str, Any] = {"profile_id": profile['id'], "guest_name": name_regex}
    if event_id:
        dup_q["event_id"] = event_id
    if payload.guest_phone:
        dup_q["guest_phone"] = payload.guest_phone
    recent = await db.check_ins.find(dup_q, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
    if recent:
        ts = recent[0].get('created_at')
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        if ts and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts and ts > cutoff:
            return CheckInResponse(
                id=recent[0]['id'],
                guest_name=recent[0]['guest_name'],
                event_id=recent[0].get('event_id'),
                created_at=ts,
            )

    ci = CheckIn(
        profile_id=profile['id'],
        event_id=event_id,
        guest_name=payload.guest_name,
        guest_phone=payload.guest_phone,
        note=payload.note,
        source=(payload.source or "web"),
    )
    await db.check_ins.insert_one(ci.model_dump())
    return CheckInResponse(
        id=ci.id,
        guest_name=ci.guest_name,
        event_id=ci.event_id,
        created_at=ci.created_at,
    )


@api_router.get("/admin/profiles/{profile_id}/check-ins")
async def admin_list_check_ins(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Admin endpoint — list check-ins + per-event stats."""
    profile = await db.profiles.find_one({"id": profile_id, "admin_id": admin_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    rows = await db.check_ins.find(
        {"profile_id": profile_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    per_event: Dict[str, int] = {}
    for r in rows:
        key = r.get('event_id') or "_general"
        per_event[key] = per_event.get(key, 0) + 1

    # Coerce timestamps
    for r in rows:
        if isinstance(r.get('created_at'), str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])

    return {
        "check_ins": rows,
        "stats": {
            "total_check_ins": len(rows),
            "per_event": per_event,
        }
    }


# ============================================================================
# END Bucket 1A routes
# ============================================================================


# ==================== ANALYTICS ROUTES (PHASE 9 - ENHANCED) ====================

@api_router.post("/invite/{slug}/view", status_code=204)
async def track_invitation_view(slug: str, view_data: ViewTrackingRequest):
    """Track invitation view with session-based unique visitor tracking (Phase 9)"""
    # Find profile by slug
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    profile_id = profile['id']
    now = datetime.now(timezone.utc)
    current_date = now.date().isoformat()
    current_hour = str(now.hour)
    
    # Check if session exists and is valid (24-hour window)
    existing_session = await db.view_sessions.find_one({
        "session_id": view_data.session_id,
        "profile_id": profile_id,
        "expires_at": {"$gt": now.isoformat()}
    })
    
    is_unique_view = existing_session is None
    
    # If no valid session exists, create one
    if is_unique_view:
        session = ViewSession(
            session_id=view_data.session_id,
            profile_id=profile_id,
            device_type=view_data.device_type,
            created_at=now,
            expires_at=now + timedelta(hours=24)
        )
        
        session_doc = session.model_dump()
        session_doc['created_at'] = session_doc['created_at'].isoformat()
        session_doc['expires_at'] = session_doc['expires_at'].isoformat()
        
        await db.view_sessions.insert_one(session_doc)
    
    # Find or create analytics document
    analytics_doc = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0})
    
    if analytics_doc:
        # Update existing analytics
        update_data = {
            "total_views": analytics_doc.get('total_views', 0) + 1,
            "last_viewed_at": now.isoformat()
        }
        
        # Update unique views if new session
        if is_unique_view:
            update_data["unique_views"] = analytics_doc.get('unique_views', 0) + 1
            
            # Set first_viewed_at if not set
            if not analytics_doc.get('first_viewed_at'):
                update_data["first_viewed_at"] = now.isoformat()
        
        # Increment device-specific counter
        if view_data.device_type == "mobile":
            update_data["mobile_views"] = analytics_doc.get('mobile_views', 0) + 1
        elif view_data.device_type == "desktop":
            update_data["desktop_views"] = analytics_doc.get('desktop_views', 0) + 1
        elif view_data.device_type == "tablet":
            update_data["tablet_views"] = analytics_doc.get('tablet_views', 0) + 1
        
        # Update hourly distribution
        hourly_dist = analytics_doc.get('hourly_distribution', {})
        hourly_dist[current_hour] = hourly_dist.get(current_hour, 0) + 1
        update_data["hourly_distribution"] = hourly_dist
        
        # Update daily views (keep last 30 days)
        daily_views = analytics_doc.get('daily_views', [])
        today_entry = next((dv for dv in daily_views if dv['date'] == current_date), None)
        
        if today_entry:
            today_entry['count'] += 1
        else:
            daily_views.append({"date": current_date, "count": 1})
        
        # Keep only last 30 days
        if len(daily_views) > 30:
            daily_views = sorted(daily_views, key=lambda x: x['date'], reverse=True)[:30]
        
        update_data["daily_views"] = daily_views
        
        await db.analytics.update_one(
            {"profile_id": profile_id},
            {"$set": update_data}
        )
    else:
        # Create new analytics document
        analytics = Analytics(
            profile_id=profile_id,
            total_views=1,
            unique_views=1 if is_unique_view else 0,
            mobile_views=1 if view_data.device_type == "mobile" else 0,
            desktop_views=1 if view_data.device_type == "desktop" else 0,
            tablet_views=1 if view_data.device_type == "tablet" else 0,
            first_viewed_at=now,
            last_viewed_at=now,
            daily_views=[{"date": current_date, "count": 1}],
            hourly_distribution={current_hour: 1},
            language_views={},
            map_clicks=0,
            rsvp_clicks=0,
            music_plays=0,
            music_pauses=0
        )
        
        doc = analytics.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['first_viewed_at'] = doc['first_viewed_at'].isoformat()
        doc['last_viewed_at'] = doc['last_viewed_at'].isoformat()
        
        await db.analytics.insert_one(doc)
    
    # Return 204 No Content for fast response
    return None


@api_router.post("/invite/{slug}/track-language", status_code=204)
async def track_language_view(slug: str, language_data: LanguageTrackingRequest):
    """Track language selection (public endpoint, Phase 9)"""
    # Find profile by slug
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    profile_id = profile['id']
    
    # Update analytics with language view
    analytics_doc = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0})
    
    if analytics_doc:
        language_views = analytics_doc.get('language_views', {})
        language_views[language_data.language_code] = language_views.get(language_data.language_code, 0) + 1
        
        await db.analytics.update_one(
            {"profile_id": profile_id},
            {"$set": {"language_views": language_views}}
        )
    
    return None


@api_router.post("/invite/{slug}/track-interaction", status_code=204)
async def track_interaction(slug: str, interaction_data: InteractionTrackingRequest):
    """Track user interactions (public endpoint, Phase 9)"""
    # Find profile by slug
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    profile_id = profile['id']
    
    # Update analytics with interaction
    analytics_doc = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0})
    
    if analytics_doc:
        update_data = {}
        
        if interaction_data.interaction_type == "map_click":
            update_data["map_clicks"] = analytics_doc.get('map_clicks', 0) + 1
        elif interaction_data.interaction_type == "rsvp_click":
            update_data["rsvp_clicks"] = analytics_doc.get('rsvp_clicks', 0) + 1
        elif interaction_data.interaction_type == "music_play":
            update_data["music_plays"] = analytics_doc.get('music_plays', 0) + 1
        elif interaction_data.interaction_type == "music_pause":
            update_data["music_pauses"] = analytics_doc.get('music_pauses', 0) + 1
        
        if update_data:
            await db.analytics.update_one(
                {"profile_id": profile_id},
                {"$set": update_data}
            )
    
    return None


@api_router.get("/admin/profiles/{profile_id}/analytics", response_model=AnalyticsResponse)
async def get_profile_analytics(profile_id: str, admin_id: str = Depends(get_current_admin)):
    """Get detailed analytics for a specific profile (admin only, Phase 9)"""
    # Verify profile exists
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Get analytics
    analytics_doc = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0})
    
    if not analytics_doc:
        # Return zero stats if no views yet
        return AnalyticsResponse(
            profile_id=profile_id,
            total_views=0,
            unique_views=0,
            mobile_views=0,
            desktop_views=0,
            tablet_views=0,
            first_viewed_at=None,
            last_viewed_at=None,
            daily_views=[],
            hourly_distribution={},
            language_views={},
            map_clicks=0,
            rsvp_clicks=0,
            music_plays=0,
            music_pauses=0
        )
    
    # Convert datetime strings if needed
    first_viewed = analytics_doc.get('first_viewed_at')
    if isinstance(first_viewed, str):
        first_viewed = datetime.fromisoformat(first_viewed)
    
    last_viewed = analytics_doc.get('last_viewed_at')
    if isinstance(last_viewed, str):
        last_viewed = datetime.fromisoformat(last_viewed)
    
    # Convert daily_views to DailyView objects
    daily_views_data = analytics_doc.get('daily_views', [])
    daily_views = [DailyView(**dv) if isinstance(dv, dict) else dv for dv in daily_views_data]
    
    return AnalyticsResponse(
        profile_id=analytics_doc['profile_id'],
        total_views=analytics_doc.get('total_views', 0),
        unique_views=analytics_doc.get('unique_views', 0),
        mobile_views=analytics_doc.get('mobile_views', 0),
        desktop_views=analytics_doc.get('desktop_views', 0),
        tablet_views=analytics_doc.get('tablet_views', 0),
        first_viewed_at=first_viewed,
        last_viewed_at=last_viewed,
        daily_views=daily_views,
        hourly_distribution=analytics_doc.get('hourly_distribution', {}),
        language_views=analytics_doc.get('language_views', {}),
        map_clicks=analytics_doc.get('map_clicks', 0),
        rsvp_clicks=analytics_doc.get('rsvp_clicks', 0),
        music_plays=analytics_doc.get('music_plays', 0),
        music_pauses=analytics_doc.get('music_pauses', 0)
    )


@api_router.get("/admin/profiles/{profile_id}/analytics/summary", response_model=AnalyticsSummary)
async def get_analytics_summary(profile_id: str, date_range: str = "7d", admin_id: str = Depends(get_current_admin)):
    """Get analytics summary with date range filter (admin only, Phase 9)
    
    Args:
        date_range: "7d" (last 7 days), "30d" (last 30 days), or "all" (all time)
    """
    # Verify profile exists
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Get analytics
    analytics_doc = await db.analytics.find_one({"profile_id": profile_id}, {"_id": 0})
    
    if not analytics_doc:
        return AnalyticsSummary(
            total_views=0,
            unique_visitors=0,
            most_viewed_language=None,
            peak_hour=None,
            device_breakdown={"mobile": 0, "desktop": 0, "tablet": 0}
        )
    
    # Apply date range filter for daily views
    daily_views = analytics_doc.get('daily_views', [])
    if date_range != "all" and daily_views:
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=int(date_range[:-1]))).date().isoformat()
        daily_views = [dv for dv in daily_views if dv['date'] >= cutoff_date]
    
    # Calculate filtered total views
    if date_range == "all":
        filtered_total_views = analytics_doc.get('total_views', 0)
    else:
        filtered_total_views = sum(dv['count'] for dv in daily_views)
    
    # Find most viewed language
    language_views = analytics_doc.get('language_views', {})
    most_viewed_language = max(language_views.items(), key=lambda x: x[1])[0] if language_views else None
    
    # Find peak hour
    hourly_dist = analytics_doc.get('hourly_distribution', {})
    peak_hour = int(max(hourly_dist.items(), key=lambda x: x[1])[0]) if hourly_dist else None
    
    return AnalyticsSummary(
        total_views=filtered_total_views,
        unique_visitors=analytics_doc.get('unique_views', 0),
        most_viewed_language=most_viewed_language,
        peak_hour=peak_hour,
        device_breakdown={
            "mobile": analytics_doc.get('mobile_views', 0),
            "desktop": analytics_doc.get('desktop_views', 0),
            "tablet": analytics_doc.get('tablet_views', 0)
        }
    )


# =====================================================================
# Audit Logs - Track invitation views and visitors
# =====================================================================

@api_router.get("/admin/profiles/{profile_id}/audit-logs")
async def get_profile_audit_logs(
    profile_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Get audit logs for invitation views and visitors"""
    try:
        # Check ownership
        profile = await check_profile_ownership(profile_id, current_admin, db)
        
        # Get view statistics
        view_count = profile.get("view_count", 0)
        unique_visitors = profile.get("unique_visitors", 0)
        last_viewed_at = profile.get("last_viewed_at")
        
        # Get recent visitors
        visitors = await db.invitation_visitors.find(
            {"profile_id": profile_id}
        ).sort("last_visit", -1).limit(100).to_list(100)
        
        # Format visitors data
        visitors_data = []
        for visitor in visitors:
            visitors_data.append({
                "client_ip": visitor.get("client_ip", "unknown"),
                "first_visit": visitor.get("first_visit"),
                "last_visit": visitor.get("last_visit")
            })
        
        return {
            "success": True,
            "profile_id": profile_id,
            "view_count": view_count,
            "unique_visitors": unique_visitors,
            "last_viewed_at": last_viewed_at,
            "recent_visitors": visitors_data
        }
    except Exception as e:
        logger.error(f"Error retrieving audit logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/profiles/{profile_id}/digital-shagun")
async def update_digital_shagun(
    profile_id: str,
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """Enable/update Digital Shagun (PhonePe integration)"""
    try:
        # Check ownership
        profile = await check_profile_ownership(profile_id, current_admin, db)
        
        enabled = request.get("enabled", False)
        phonepe_upi_id = request.get("phonepe_upi_id")
        
        update_data = {
            "digital_shagun_enabled": enabled,
            "phonepe_upi_id": phonepe_upi_id,
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.profiles.update_one(
            {"id": profile_id},
            {"$set": update_data}
        )
        
        return {
            "success": True,
            "message": "Digital Shagun updated successfully"
        }
    except Exception as e:
        logger.error(f"Error updating digital shagun: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PDF GENERATION ====================

# Design theme color mappings for PDF
THEME_COLORS = {
    'temple_divine': {'primary': (139, 115, 85), 'secondary': (212, 175, 55), 'text': (74, 55, 40), 'bg': (255, 248, 231)},
    'royal_classic': {'primary': (139, 0, 0), 'secondary': (255, 215, 0), 'text': (74, 26, 26), 'bg': (255, 245, 230)},
    'floral_soft': {'primary': (255, 182, 193), 'secondary': (255, 218, 185), 'text': (107, 78, 113), 'bg': (255, 240, 245)},
    'cinematic_luxury': {'primary': (26, 26, 26), 'secondary': (212, 175, 55), 'text': (245, 245, 245), 'bg': (44, 44, 44)},
    'heritage_scroll': {'primary': (139, 90, 43), 'secondary': (205, 133, 63), 'text': (74, 48, 23), 'bg': (250, 240, 230)},
    'minimal_elegant': {'primary': (128, 128, 128), 'secondary': (169, 169, 169), 'text': (64, 64, 64), 'bg': (255, 255, 255)},
    'modern_premium': {'primary': (47, 79, 79), 'secondary': (72, 209, 204), 'text': (245, 245, 245), 'bg': (32, 32, 32)},
    'artistic_handcrafted': {'primary': (160, 82, 45), 'secondary': (210, 180, 140), 'text': (101, 67, 33), 'bg': (255, 250, 240)}
}

# Language templates for PDF
LANGUAGE_TEMPLATES = {
    'english': {
        'opening_title': 'Wedding Invitation',
        'couple_label': 'Join us in celebrating the union of',
        'events_title': 'Event Schedule',
        'date_label': 'Date',
        'time_label': 'Time',
        'venue_label': 'Venue',
        'contact_title': 'Contact Information',
        'groom_label': 'Groom',
        'bride_label': 'Bride'
    },
    'telugu': {
        'opening_title': 'వివాహ ఆహ్వానం',
        'couple_label': 'మా వివాహ వేడుకలో పాల్గొనండి',
        'events_title': 'కార్యక్రమ షెడ్యూల్',
        'date_label': 'తేదీ',
        'time_label': 'సమయం',
        'venue_label': 'స్థలం',
        'contact_title': 'సంప్రదించండి',
        'groom_label': 'వరుడు',
        'bride_label': 'వధువు'
    },
    'hindi': {
        'opening_title': 'विवाह निमंत्रण',
        'couple_label': 'हमारे विवाह समारोह में शामिल हों',
        'events_title': 'कार्यक्रम कार्यक्रम',
        'date_label': 'तारीख',
        'time_label': 'समय',
        'venue_label': 'स्थान',
        'contact_title': 'संपर्क जानकारी',
        'groom_label': 'वर',
        'bride_label': 'वधू'
    },
    'tamil': {
        'opening_title': 'திருமண அழைப்பிதழ்',
        'couple_label': 'எங்கள் திருமண நிகழ்வில் சேரவும்',
        'events_title': 'நிகழ்வு அட்டவணை',
        'date_label': 'தேதி',
        'time_label': 'நேரம்',
        'venue_label': 'இடம்',
        'contact_title': 'தொடர்பு தகவல்',
        'groom_label': 'மணமகன்',
        'bride_label': 'மணமகள்'
    },
    'kannada': {
        'opening_title': 'ಮದುವೆ ಆಮಂತ್ರಣ',
        'couple_label': 'ನಮ್ಮ ಮದುವೆ ಸಮಾರಂಭದಲ್ಲಿ ಸೇರಿ',
        'events_title': 'ಕಾರ್ಯಕ್ರಮದ ವೇಳಾಪಟ್ಟಿ',
        'date_label': 'ದಿನಾಂಕ',
        'time_label': 'ಸಮಯ',
        'venue_label': 'ಸ್ಥಳ',
        'contact_title': 'ಸಂಪರ್ಕ ಮಾಹಿತಿ',
        'groom_label': 'ವರ',
        'bride_label': 'ವಧು'
    },
    'malayalam': {
        'opening_title': 'വിവാഹ ക്ഷണം',
        'couple_label': 'ഞങ്ങളുടെ വിവാഹ ചടങ്ങിൽ പങ്കെടുക്കൂ',
        'events_title': 'പരിപാടി ഷെഡ്യൂൾ',
        'date_label': 'തീയതി',
        'time_label': 'സമയം',
        'venue_label': 'സ്ഥലം',
        'contact_title': 'ബന്ധപ്പെടുക',
        'groom_label': 'വരൻ',
        'bride_label': 'വധു'
    }
}


def get_theme_colors(design_id: str):
    """Get theme colors for PDF generation"""
    return THEME_COLORS.get(design_id, THEME_COLORS['royal_classic'])


def get_language_text(language: str):
    """Get language-specific text for PDF"""
    return LANGUAGE_TEMPLATES.get(language, LANGUAGE_TEMPLATES['english'])


def rgb_to_reportlab_color(rgb_tuple):
    """Convert RGB tuple to ReportLab color"""
    r, g, b = rgb_tuple
    return rl_colors.Color(r/255.0, g/255.0, b/255.0)


async def generate_invitation_pdf(profile: dict, language: str = 'english'):
    """Generate PDF invitation from profile data"""
    buffer = io.BytesIO()
    
    # Get theme colors and language text
    theme = get_theme_colors(profile.get('design_id', 'royal_classic'))
    lang_text = get_language_text(language)
    
    # Convert colors
    primary_color = rgb_to_reportlab_color(theme['primary'])
    secondary_color = rgb_to_reportlab_color(theme['secondary'])
    text_color = rgb_to_reportlab_color(theme['text'])
    
    # Get deity background path if present
    deity_id = profile.get('deity_id')
    deity_bg_path = None
    if deity_id and deity_id != 'none':
        # Map deity IDs to local file paths
        deity_file_map = {
            'ganesha': '/app/frontend/public/assets/deities/ganesha_desktop.jpg',
            'venkateswara_padmavati': '/app/frontend/public/assets/deities/venkateswara_padmavati_desktop.jpg',
            'shiva_parvati': '/app/frontend/public/assets/deities/shiva_parvati_desktop.jpg',
            'lakshmi_vishnu': '/app/frontend/public/assets/deities/lakshmi_vishnu_desktop.jpg'
        }
        deity_bg_path = deity_file_map.get(deity_id)
    
    # Create PDF document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch
    )
    
    # Container for PDF elements
    story = []
    
    # Define styles
    styles = getSampleStyleSheet()
    
    # Title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=primary_color,
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    # Heading style
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=18,
        textColor=secondary_color,
        spaceAfter=12,
        spaceBefore=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    # Subheading style
    subheading_style = ParagraphStyle(
        'CustomSubHeading',
        parent=styles['Heading3'],
        fontSize=14,
        textColor=primary_color,
        spaceAfter=8,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    # Body style
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=11,
        textColor=text_color,
        spaceAfter=6,
        alignment=TA_LEFT,
        fontName='Helvetica'
    )
    
    # Center body style
    center_body_style = ParagraphStyle(
        'CustomCenterBody',
        parent=body_style,
        alignment=TA_CENTER
    )
    
    # Add title
    story.append(Paragraph(lang_text['opening_title'], title_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Add couple names
    story.append(Paragraph(lang_text['couple_label'], center_body_style))
    story.append(Spacer(1, 0.2*inch))
    
    couple_text = f"<b>{profile['groom_name']}</b> & <b>{profile['bride_name']}</b>"
    story.append(Paragraph(couple_text, heading_style))
    story.append(Spacer(1, 0.4*inch))
    
    # Add events section
    events = profile.get('events', [])
    visible_events = [e for e in events if e.get('visible', True)]
    
    if visible_events:
        story.append(Paragraph(lang_text['events_title'], heading_style))
        story.append(Spacer(1, 0.2*inch))
        
        # Sort events by date
        sorted_events = sorted(visible_events, key=lambda x: x.get('date', ''))
        
        for event in sorted_events:
            # Event name
            event_name_style = ParagraphStyle(
                'EventName',
                parent=subheading_style,
                fontSize=14,
                textColor=primary_color,
                alignment=TA_LEFT
            )
            story.append(Paragraph(f"<b>{event['name']}</b>", event_name_style))
            story.append(Spacer(1, 0.1*inch))
            
            # Event details
            date_str = event.get('date', '')
            time_str = event.get('start_time', '')
            if event.get('end_time'):
                time_str += f" - {event['end_time']}"
            
            story.append(Paragraph(f"<b>{lang_text['date_label']}:</b> {date_str}", body_style))
            story.append(Paragraph(f"<b>{lang_text['time_label']}:</b> {time_str}", body_style))
            story.append(Paragraph(f"<b>{lang_text['venue_label']}:</b> {event.get('venue_name', '')}", body_style))
            story.append(Paragraph(f"{event.get('venue_address', '')}", body_style))
            
            if event.get('description'):
                story.append(Spacer(1, 0.05*inch))
                story.append(Paragraph(event['description'], body_style))
            
            story.append(Spacer(1, 0.25*inch))
    
    # Add contact information
    if profile.get('whatsapp_groom') or profile.get('whatsapp_bride'):
        story.append(Spacer(1, 0.3*inch))
        story.append(Paragraph(lang_text['contact_title'], heading_style))
        story.append(Spacer(1, 0.15*inch))
        
        if profile.get('whatsapp_groom'):
            story.append(Paragraph(
                f"<b>{lang_text['groom_label']}:</b> {profile['whatsapp_groom']}", 
                body_style
            ))
        
        if profile.get('whatsapp_bride'):
            story.append(Paragraph(
                f"<b>{lang_text['bride_label']}:</b> {profile['whatsapp_bride']}", 
                body_style
            ))
    
    # Build PDF with deity background if present
    if deity_bg_path and os.path.exists(deity_bg_path):
        def add_deity_background(canvas_obj, doc_obj):
            """Add deity background with very light opacity"""
            canvas_obj.saveState()
            try:
                # Load and compress deity image
                img = PILImage.open(deity_bg_path)
                
                # Resize to optimize file size (max 800px width)
                max_width = 800
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((max_width, new_height), PILImage.Resampling.LANCZOS)
                
                # Convert to RGB if needed
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Save compressed image to buffer
                img_buffer = io.BytesIO()
                img.save(img_buffer, format='JPEG', quality=70, optimize=True)
                img_buffer.seek(0)
                
                # Create ReportLab Image
                img_reader = ImageReader(img_buffer)
                
                # Calculate centered position
                page_width, page_height = A4
                img_width, img_height = img.size
                
                # Scale to fit page while maintaining aspect ratio
                scale = min(page_width / img_width, page_height / img_height)
                scaled_width = img_width * scale
                scaled_height = img_height * scale
                
                # Center on page
                x = (page_width - scaled_width) / 2
                y = (page_height - scaled_height) / 2
                
                # Draw with very light opacity (0.12)
                canvas_obj.setFillAlpha(0.12)
                canvas_obj.drawImage(
                    img_reader, 
                    x, y, 
                    width=scaled_width, 
                    height=scaled_height,
                    preserveAspectRatio=True,
                    mask='auto'
                )
            except Exception as e:
                # If deity image fails, continue without it
                logging.warning(f"Failed to add deity background: {e}")
            finally:
                canvas_obj.restoreState()
        
        doc.build(story, onFirstPage=add_deity_background, onLaterPages=add_deity_background)
    else:
        doc.build(story)
    
    # Get PDF data
    buffer.seek(0)
    return buffer


@api_router.get("/admin/profiles/{profile_id}/download-pdf")
async def download_invitation_pdf(
    profile_id: str, 
    language: str = 'english',
    admin_id: str = Depends(get_current_admin)
):
    """Generate and download PDF invitation (admin only)"""
    # Fetch profile
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Generate PDF
    pdf_buffer = await generate_invitation_pdf(profile, language)
    
    # Create filename
    groom_name = re.sub(r'[^a-zA-Z]', '', profile['groom_name'].split()[0].lower())
    bride_name = re.sub(r'[^a-zA-Z]', '', profile['bride_name'].split()[0].lower())
    filename = f"wedding-invitation-{groom_name}-{bride_name}.pdf"
    
    # Return PDF as download
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


# ==================== CONFIGURATION ROUTES ====================

@api_router.get("/config/designs")
async def get_designs():
    """Get all available design themes"""
    designs = [
        {
            "id": "royal_classic",
            "name": "Royal Classic",
            "description": "Elegant maroon and gold with traditional motifs",
            "thumbnail": "/assets/designs/royal_classic_thumb.webp",
            "preview": "/assets/designs/royal_classic_preview.webp"
        },
        {
            "id": "floral_soft",
            "name": "Floral Soft",
            "description": "Pastel pink with delicate floral patterns",
            "thumbnail": "/assets/designs/floral_soft_thumb.webp",
            "preview": "/assets/designs/floral_soft_preview.webp"
        },
        {
            "id": "divine_temple",
            "name": "Divine Temple",
            "description": "Warm ivory and gold with sacred temple aesthetics",
            "thumbnail": "/assets/designs/divine_temple_thumb.webp",
            "preview": "/assets/designs/divine_temple_preview.webp"
        },
        {
            "id": "modern_minimal",
            "name": "Modern Minimal",
            "description": "Clean white and gray with contemporary design",
            "thumbnail": "/assets/designs/modern_minimal_thumb.webp",
            "preview": "/assets/designs/modern_minimal_preview.webp"
        },
        {
            "id": "cinematic_luxury",
            "name": "Cinematic Luxury",
            "description": "Dark gradient with gold accents and premium feel",
            "thumbnail": "/assets/designs/cinematic_luxury_thumb.webp",
            "preview": "/assets/designs/cinematic_luxury_preview.webp"
        }
    ]
    return designs


@api_router.get("/config/deities")
async def get_deities():
    """Get all available deity options"""
    deities = [
        {
            "id": "none",
            "name": "No Religious Theme",
            "description": "Secular invitation without deity imagery",
            "thumbnail": "/assets/deities/none.svg"
        },
        {
            "id": "ganesha",
            "name": "Lord Ganesha",
            "description": "Remover of obstacles, auspicious beginning",
            "thumbnail": "/assets/deities/ganesha_thumb.webp",
            "languages": ["english", "telugu", "hindi"]
        },
        {
            "id": "venkateswara_padmavati",
            "name": "Lord Venkateswara & Padmavati",
            "description": "Divine couple symbolizing eternal love",
            "thumbnail": "/assets/deities/venkateswara_padmavati_thumb.webp",
            "languages": ["english", "telugu", "hindi"]
        },
        {
            "id": "shiva_parvati",
            "name": "Lord Shiva & Parvati",
            "description": "Perfect union of masculine and feminine energy",
            "thumbnail": "/assets/deities/shiva_parvati_thumb.webp",
            "languages": ["english", "telugu", "hindi"]
        },
        {
            "id": "lakshmi_vishnu",
            "name": "Lakshmi & Vishnu",
            "description": "Wealth, prosperity, and harmony",
            "thumbnail": "/assets/deities/lakshmi_vishnu_thumb.webp",
            "languages": ["english", "telugu", "hindi"]
        }
    ]
    return deities


@api_router.get("/config/languages")
async def get_languages():
    """Get available language configuration"""
    languages = [
        {
            "code": "english",
            "name": "English",
            "nativeName": "English",
            "rtl": False
        },
        {
            "code": "telugu",
            "name": "Telugu",
            "nativeName": "తెలుగు",
            "rtl": False
        },
        {
            "code": "hindi",
            "name": "Hindi",
            "nativeName": "हिन्दी",
            "rtl": False
        }
    ]
    return languages



# ==================== GUEST ROOM LOOKUP (Find My Room) ====================
# NOTE: The actual route handler is defined earlier (right after the public
# /invite/{slug} block) to win FastAPI's order-based route matching against
# `/invite/{slug}/{event_type}`. This section header remains for navigability.



# ==================== PHASE 11: QR CODE & CALENDAR ROUTES ====================

@api_router.get("/invite/{slug}/qr")
async def generate_qr_code(slug: str):
    """PHASE 11: Generate QR code for invitation link"""
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Canonical public invitation URL via build_public_url (never request.host).
    # Sequential number + cosmetic name when present, else the legacy slug.
    _ident = invite_code(profile.get('invite_no')) or slug
    _name = profile.get('name_slug')
    invitation_url = build_public_url(f"/invite/{_ident}/{_name}" if _name else f"/invite/{_ident}")
    
    # Create QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(invitation_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to bytes
    img_bytes = BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    
    return StreamingResponse(img_bytes, media_type="image/png")


@api_router.get("/invite/{slug}/calendar")
async def download_calendar(slug: str, event_id: Optional[str] = None):
    """PHASE 11: Generate .ics calendar file for wedding events.

    If `event_id` is provided, only that single event is exported (used by the
    per-event "Add to Calendar" pill on the live timeline).
    """
    profile = await db.profiles.find_one({"slug": slug}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if not await check_profile_active(profile):
        raise HTTPException(status_code=410, detail="This invitation link has expired")
    
    # Convert date string if needed
    if isinstance(profile.get('event_date'), str):
        profile['event_date'] = datetime.fromisoformat(profile['event_date'])
    
    # Get events (optionally filtered to a single event_id)
    events = profile.get('events', []) or []
    if event_id:
        events = [e for e in events if e.get('event_id') == event_id]
        if not events:
            raise HTTPException(status_code=404, detail="Event not found for this invitation")
    
    # Build .ics file content
    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Wedding Invitation//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH"
    ]
    
    # If events exist, use those; otherwise use main event_date
    if events and len(events) > 0:
        for event in events:
            if not event.get('visible', True):
                continue
            
            # Parse event date and time
            event_date = datetime.strptime(event['date'], '%Y-%m-%d')
            start_time_parts = event['start_time'].split(':')
            event_datetime = event_date.replace(
                hour=int(start_time_parts[0]),
                minute=int(start_time_parts[1])
            )
            
            # End time (default to 2 hours later if not specified)
            if event.get('end_time'):
                end_time_parts = event['end_time'].split(':')
                end_datetime = event_date.replace(
                    hour=int(end_time_parts[0]),
                    minute=int(end_time_parts[1])
                )
            else:
                end_datetime = event_datetime + timedelta(hours=2)
            
            # Format dates for .ics
            dtstart = event_datetime.strftime('%Y%m%dT%H%M%S')
            dtend = end_datetime.strftime('%Y%m%dT%H%M%S')
            
            ics_lines.extend([
                "BEGIN:VEVENT",
                f"UID:{event.get('event_id', str(uuid.uuid4()))}@wedding-invitation",
                f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
                f"DTSTART:{dtstart}",
                f"DTEND:{dtend}",
                f"SUMMARY:{event['name']} - {profile['groom_name']} & {profile['bride_name']}",
                f"LOCATION:{event['venue_name']}, {event['venue_address']}",
                f"DESCRIPTION:{event.get('description', '')}",
                "STATUS:CONFIRMED",
                "END:VEVENT"
            ])
    else:
        # Use main event_date
        event_datetime = profile['event_date']
        end_datetime = event_datetime + timedelta(hours=4)
        
        dtstart = event_datetime.strftime('%Y%m%dT%H%M%S')
        dtend = end_datetime.strftime('%Y%m%dT%H%M%S')
        
        ics_lines.extend([
            "BEGIN:VEVENT",
            f"UID:{profile['id']}@wedding-invitation",
            f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{profile['event_type'].title()} - {profile['groom_name']} & {profile['bride_name']}",
            f"LOCATION:{profile['venue']}, {profile.get('city', '')}",
            f"DESCRIPTION:Join us for our {profile['event_type']}",
            "STATUS:CONFIRMED",
            "END:VEVENT"
        ])
    
    ics_lines.append("END:VCALENDAR")
    ics_content = "\r\n".join(ics_lines)
    
    # Return as downloadable file
    from fastapi.responses import Response
    filename = f"wedding-{profile['groom_name']}-{profile['bride_name']}.ics".replace(" ", "-").lower()
    
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


# ============================================================================
# PHASE 22: EVENT-WISE BACKGROUND & DESIGN ENGINE API ENDPOINTS
# ============================================================================

@api_router.get("/designs", response_model=DesignConfigResponse)
async def get_design_configurations(
    event_type: Optional[str] = None
):
    """
    Get all available design configurations, optionally filtered by event type
    
    Query Parameters:
    - event_type: Filter designs by event type (engagement, haldi, mehendi, marriage, reception)
    
    Returns list of design configurations with preview images and metadata
    """
    try:
        if event_type:
            # Validate and convert event type
            try:
                event_type_enum = EventType(event_type.lower())
                designs = get_designs_by_event_type(event_type_enum)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid event_type. Must be one of: engagement, haldi, mehendi, marriage, reception"
                )
        else:
            designs = get_all_designs()
        
        return DesignConfigResponse(
            designs=designs,
            total=len(designs)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching design configurations: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch design configurations")


@api_router.get("/designs/{design_id}", response_model=DesignConfig)
async def get_design_by_id_endpoint(design_id: str):
    """
    Get specific design configuration by ID
    
    Path Parameters:
    - design_id: Unique design identifier (e.g., "design_1")
    
    Returns complete design configuration including colors, preview, and metadata
    """
    try:
        design = get_design_by_id(design_id)
        
        if not design:
            raise HTTPException(
                status_code=404,
                detail=f"Design with ID '{design_id}' not found"
            )
        
        return design
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching design {design_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch design configuration")


@api_router.put("/admin/events/{event_id}/background")
async def update_event_background(
    event_id: str,
    background_request: UpdateEventBackgroundRequest,
    admin: Admin = Depends(get_current_admin)
):
    """
    Update background design for a specific event
    
    Path Parameters:
    - event_id: Event identifier
    
    Body:
    - background_design_id: Selected design ID
    - background_type: Rendering type (css, image, hybrid)
    - color_palette: Color scheme {primary, secondary, accent}
    
    Validates design compatibility with event type and lord decoration settings
    """
    try:
        # Find profile containing this event
        profile = await db.profiles.find_one({
            "events.event_id": event_id
        })
        
        if not profile:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Check admin authorization
        if profile['admin_id'] != admin:
            raise HTTPException(status_code=403, detail="Not authorized to modify this event")
        
        # Find the specific event
        event_index = None
        current_event = None
        for idx, event in enumerate(profile.get('events', [])):
            if event['event_id'] == event_id:
                event_index = idx
                current_event = event
                break
        
        if current_event is None:
            raise HTTPException(status_code=404, detail="Event not found in profile")
        
        # Validate design exists
        design = get_design_by_id(background_request.background_design_id)
        if not design:
            raise HTTPException(
                status_code=404,
                detail=f"Design '{background_request.background_design_id}' not found"
            )
        
        # Validate design compatibility with event
        event_type = EventType(current_event['event_type'])
        show_lord = current_event.get('show_lord', True)
        
        is_valid, message = validate_design_for_event(
            background_request.background_design_id,
            event_type,
            show_lord
        )
        
        if not is_valid:
            raise HTTPException(status_code=400, detail=message)
        
        # Validate color palette
        required_colors = ['primary', 'secondary', 'accent']
        for color in required_colors:
            if color not in background_request.color_palette:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required color: {color}"
                )
        
        # Update event background
        update_result = await db.profiles.update_one(
            {"id": profile['id'], "events.event_id": event_id},
            {
                "$set": {
                    f"events.{event_index}.background_design_id": background_request.background_design_id,
                    f"events.{event_index}.background_type": background_request.background_type,
                    f"events.{event_index}.color_palette": background_request.color_palette,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        if update_result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to update event background")
        
        # Create audit log
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin,
            "action": "update_event_background",
            "resource_type": "event",
            "resource_id": event_id,
            "details": {
                "design_id": background_request.background_design_id,
                "background_type": background_request.background_type,
                "event_type": current_event['event_type']
            },
            "timestamp": datetime.now(timezone.utc),
            "ip_address": None
        })
        
        return {
            "success": True,
            "message": "Event background updated successfully",
            "event_id": event_id,
            "design_id": background_request.background_design_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating event background: {e}")
        raise HTTPException(status_code=500, detail="Failed to update event background")


@api_router.get("/admin/events/{event_id}/default-design")
async def get_default_design_for_event_endpoint(
    event_id: str,
    admin: Admin = Depends(get_current_admin)
):
    """
    Get the recommended default design for a specific event
    
    Returns the default design based on event type
    """
    try:
        # Find profile containing this event
        profile = await db.profiles.find_one({
            "events.event_id": event_id
        })
        
        if not profile:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Check admin authorization
        if profile['admin_id'] != admin:
            raise HTTPException(status_code=403, detail="Not authorized to access this event")
        
        # Find the specific event
        current_event = None
        for event in profile.get('events', []):
            if event['event_id'] == event_id:
                current_event = event
                break
        
        if current_event is None:
            raise HTTPException(status_code=404, detail="Event not found in profile")
        
        # Get default design for this event type
        event_type = EventType(current_event['event_type'])
        default_design = get_default_design_for_event(event_type)
        
        if not default_design:
            raise HTTPException(status_code=404, detail="No default design found for this event type")
        
        return default_design
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching default design: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch default design")


# ============================================================================
# PHASE 23: LORD IMAGE ENGINE & PLACEMENT RULES API ENDPOINTS
# ============================================================================

@api_router.get("/lords", response_model=LordLibraryResponse)
async def get_lord_library(
    event_type: Optional[str] = None
):
    """
    Get all available lord images from the library, optionally filtered by event type
    
    Query Parameters:
    - event_type: Filter lords by event type (engagement, marriage, reception)
    
    Returns list of lord configurations with images and metadata
    
    Rules:
    - Engagement, Marriage, Reception: All lords available
    - Haldi, Mehendi: Empty list (lords not allowed)
    """
    try:
        if event_type:
            # Validate and convert event type
            try:
                event_type_enum = EventType(event_type.lower())
                
                # Haldi and Mehendi cannot have lords
                if event_type_enum in [EventType.HALDI, EventType.MEHENDI]:
                    return LordLibraryResponse(lords=[], total=0)
                
                lords = get_lords_by_event_type(event_type_enum)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid event_type. Must be one of: engagement, haldi, mehendi, marriage, reception"
                )
        else:
            lords = get_all_lords()
        
        return LordLibraryResponse(
            lords=lords,
            total=len(lords)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching lord library: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch lord library")


@api_router.get("/lords/{lord_id}", response_model=LordLibrary)
async def get_lord_by_id_endpoint(lord_id: str):
    """
    Get specific lord configuration by ID
    
    Path Parameters:
    - lord_id: Unique lord identifier (e.g., "ganesha")
    
    Returns complete lord configuration including images and metadata
    """
    try:
        lord = get_lord_by_id(lord_id)
        
        if not lord:
            raise HTTPException(
                status_code=404,
                detail=f"Lord with ID '{lord_id}' not found"
            )
        
        return lord
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching lord {lord_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch lord configuration")


@api_router.put("/admin/events/{event_id}/lord-settings")
async def update_event_lord_settings(
    event_id: str,
    lord_settings: UpdateEventLordSettingsRequest,
    admin: Admin = Depends(get_current_admin)
):
    """
    PHASE 23: Update lord settings for a specific event
    
    Path Parameters:
    - event_id: Unique event identifier
    
    Request Body:
    - lord_enabled: Enable/disable lord image
    - lord_id: Lord identifier from library (optional if disabled)
    - lord_display_mode: "hero_only" or "section_based"
    - lord_visibility_duration: Duration in seconds (1-10)
    
    Rules:
    - Engagement, Marriage, Reception: Lords allowed
    - Haldi, Mehendi: Lord forced disabled (returns error)
    - Auto-applies Ganesha as default if lord_id not provided
    """
    try:
        # Find profile containing this event
        profile = await db.profiles.find_one({
            "events.event_id": event_id
        })
        
        if not profile:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Check admin authorization
        if profile['admin_id'] != admin:
            raise HTTPException(status_code=403, detail="Not authorized to access this event")
        
        # Find the specific event and its index
        current_event = None
        event_index = -1
        for idx, event in enumerate(profile.get('events', [])):
            if event['event_id'] == event_id:
                current_event = event
                event_index = idx
                break
        
        if current_event is None:
            raise HTTPException(status_code=404, detail="Event not found in profile")
        
        # Get event type
        event_type = EventType(current_event['event_type'])
        
        # PHASE 23: Validate lord settings based on event type
        if event_type in [EventType.HALDI, EventType.MEHENDI]:
            if lord_settings.lord_enabled:
                raise HTTPException(
                    status_code=400,
                    detail=f"Lord images are not allowed for {event_type.value} events"
                )
        
        # Validate lord_id if provided and enabled
        if lord_settings.lord_enabled and lord_settings.lord_id:
            # Check if lord exists
            lord = get_lord_by_id(lord_settings.lord_id)
            if not lord:
                raise HTTPException(
                    status_code=400,
                    detail=f"Lord with ID '{lord_settings.lord_id}' not found"
                )
            
            # Check if lord is allowed for this event type
            if not is_lord_allowed_for_event(lord_settings.lord_id, event_type):
                raise HTTPException(
                    status_code=400,
                    detail=f"Lord '{lord.name}' is not allowed for {event_type.value} events"
                )
        
        # If enabled but no lord_id provided, use default (Ganesha)
        final_lord_id = lord_settings.lord_id
        if lord_settings.lord_enabled and not final_lord_id:
            default_lord = get_default_lord()
            final_lord_id = default_lord.lord_id if default_lord else "ganesha"
        
        # Update event lord settings
        update_result = await db.profiles.update_one(
            {"id": profile['id'], "events.event_id": event_id},
            {
                "$set": {
                    f"events.{event_index}.lord_enabled": lord_settings.lord_enabled,
                    f"events.{event_index}.lord_id": final_lord_id if lord_settings.lord_enabled else None,
                    f"events.{event_index}.lord_display_mode": lord_settings.lord_display_mode,
                    f"events.{event_index}.lord_visibility_duration": lord_settings.lord_visibility_duration,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        if update_result.modified_count == 0:
            raise HTTPException(status_code=500, detail="Failed to update event lord settings")
        
        # Create audit log
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin,
            "action": "update_event_lord_settings",
            "resource_type": "event",
            "resource_id": event_id,
            "details": {
                "lord_enabled": lord_settings.lord_enabled,
                "lord_id": final_lord_id,
                "lord_display_mode": lord_settings.lord_display_mode,
                "lord_visibility_duration": lord_settings.lord_visibility_duration,
                "event_type": current_event['event_type']
            },
            "timestamp": datetime.now(timezone.utc),
            "ip_address": None
        })
        
        return {
            "success": True,
            "message": "Event lord settings updated successfully",
            "event_id": event_id,
            "lord_enabled": lord_settings.lord_enabled,
            "lord_id": final_lord_id,
            "lord_display_mode": lord_settings.lord_display_mode,
            "lord_visibility_duration": lord_settings.lord_visibility_duration
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating event lord settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update event lord settings")


@api_router.get("/admin/events/{event_id}/default-lord")
async def get_default_lord_for_event_endpoint(
    event_id: str,
    admin: Admin = Depends(get_current_admin)
):
    """
    Get the default lord for a specific event
    
    Returns Ganesha as the default lord for allowed events
    Returns null for Haldi and Mehendi events
    """
    try:
        # Find profile containing this event
        profile = await db.profiles.find_one({
            "events.event_id": event_id
        })
        
        if not profile:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Check admin authorization
        if profile['admin_id'] != admin:
            raise HTTPException(status_code=403, detail="Not authorized to access this event")
        
        # Find the specific event
        current_event = None
        for event in profile.get('events', []):
            if event['event_id'] == event_id:
                current_event = event
                break
        
        if current_event is None:
            raise HTTPException(status_code=404, detail="Event not found in profile")
        
        # Get event type
        event_type = EventType(current_event['event_type'])
        
        # Haldi and Mehendi cannot have lords
        if event_type in [EventType.HALDI, EventType.MEHENDI]:
            return None
        
        # Get default lord (Ganesha)
        default_lord = get_default_lord()
        
        if not default_lord:
            raise HTTPException(status_code=404, detail="No default lord found")
        
        return default_lord
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching default lord: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch default lord")


# ============================================================================
# PHASE 24: VIDEO & MUSIC EXPERIENCE API ENDPOINTS
# ============================================================================

@api_router.post("/admin/events/{event_id}/upload-hero-video")
async def upload_hero_video(
    event_id: str,
    file: UploadFile = File(...),
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 24: Upload hero background video for event
    - Max 10MB
    - Formats: MP4, WebM
    - Auto-generates thumbnail from first frame
    - Stores in /app/uploads/videos/{profile_id}/{event_type}/
    - Duration recommendation: 5-8 seconds (warning only, not enforced)
    """
    # Validate file format
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="File must be a video (MP4 or WebM)")
    
    allowed_formats = ['video/mp4', 'video/webm']
    if file.content_type not in allowed_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video format. Allowed: MP4, WebM. Got: {file.content_type}"
        )
    
    # Read file content
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    
    # Validate file size (10MB limit)
    if file_size_mb > 10:
        raise HTTPException(
            status_code=400,
            detail=f"File size {file_size_mb:.2f}MB exceeds 10MB limit"
        )
    
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event
    events = profile.get('events', [])
    event = None
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event = evt
            event_index = idx
            break

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Create video directory
    profile_id = profile['id']
    event_type = event.get('event_type', 'unknown')
    video_dir = Path(f"/app/uploads/videos/{profile_id}/{event_type}")
    video_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    video_id = str(uuid.uuid4())
    file_extension = 'mp4' if file.content_type == 'video/mp4' else 'webm'
    video_filename = f"hero_{video_id}.{file_extension}"
    video_path = video_dir / video_filename

    # Store to the invitation S3 bucket (dev/no-AWS falls back to disk).
    video_url = _store_invitation_bytes(
        content, kind="video", mime=file.content_type or "video/mp4",
        profile=profile, event_id=event_id,
        disk_path=video_path,
        disk_url=f"/uploads/videos/{profile_id}/{event_type}/{video_filename}",
        fallback_ext=f".{file_extension}")

    # Generate thumbnail (extract first frame if possible, otherwise skip)
    thumbnail_url = None
    try:
        # Try to generate thumbnail using PIL (works for some video formats)
        # This is a basic implementation; for production, use ffmpeg
        thumbnail_filename = f"hero_{video_id}_thumb.jpg"
        thumbnail_path = video_dir / thumbnail_filename
        
        # For now, we'll skip auto-generation and use a default poster
        # In production, use ffmpeg: ffmpeg -i video.mp4 -ss 00:00:01 -vframes 1 output.jpg
        thumbnail_url = None  # Will be handled by browser's poster attribute
        
    except Exception as e:
        logger.warning(f"Could not generate thumbnail: {e}")
        thumbnail_url = None
    
    # (video_url set above — S3 or disk depending on config)

    # Delete old hero video if exists
    old_video_url = event.get('hero_video_url')
    if old_video_url:
        try:
            old_video_path = Path(f"/app{old_video_url}")
            if old_video_path.exists():
                old_video_path.unlink()
            # Delete old thumbnail if exists
            old_thumbnail_url = event.get('hero_video_thumbnail')
            if old_thumbnail_url:
                old_thumbnail_path = Path(f"/app{old_thumbnail_url}")
                if old_thumbnail_path.exists():
                    old_thumbnail_path.unlink()
        except Exception as e:
            logger.warning(f"Could not delete old hero video: {e}")
    
    # Update event with video URL
    events[event_index]['hero_video_url'] = video_url
    events[event_index]['hero_video_thumbnail'] = thumbnail_url
    events[event_index]['hero_video_enabled'] = True
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile_id},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "hero_video_uploaded",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile_id,
            "video_url": video_url,
            "file_size_mb": round(file_size_mb, 2)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Hero video uploaded successfully",
        "video_url": video_url,
        "thumbnail_url": thumbnail_url,
        "file_size_mb": round(file_size_mb, 2)
    }


@api_router.post("/admin/events/{event_id}/upload-message-video")
async def upload_message_video(
    event_id: str,
    file: UploadFile = File(...),
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 24: Upload message video (bride/groom video) for event
    - Max 10MB
    - Formats: MP4, WebM
    - Duration recommendation: max 30 seconds (warning only, not enforced)
    """
    # Validate file format
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="File must be a video (MP4 or WebM)")
    
    allowed_formats = ['video/mp4', 'video/webm']
    if file.content_type not in allowed_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video format. Allowed: MP4, WebM. Got: {file.content_type}"
        )
    
    # Read file content
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    
    # Validate file size (10MB limit)
    if file_size_mb > 10:
        raise HTTPException(
            status_code=400,
            detail=f"File size {file_size_mb:.2f}MB exceeds 10MB limit"
        )
    
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event
    events = profile.get('events', [])
    event = None
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event = evt
            event_index = idx
            break

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Create video directory
    profile_id = profile['id']
    event_type = event.get('event_type', 'unknown')
    video_dir = Path(f"/app/uploads/videos/{profile_id}/{event_type}")
    video_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique filename
    video_id = str(uuid.uuid4())
    file_extension = 'mp4' if file.content_type == 'video/mp4' else 'webm'
    video_filename = f"message_{video_id}.{file_extension}"
    video_path = video_dir / video_filename

    # Store to the invitation S3 bucket (dev/no-AWS falls back to disk).
    video_url = _store_invitation_bytes(
        content, kind="video", mime=file.content_type or "video/mp4",
        profile=profile, event_id=event_id,
        disk_path=video_path,
        disk_url=f"/uploads/videos/{profile_id}/{event_type}/{video_filename}",
        fallback_ext=f".{file_extension}")

    # Delete old message video if exists
    old_video_url = event.get('message_video_url')
    if old_video_url:
        try:
            old_video_path = Path(f"/app{old_video_url}")
            if old_video_path.exists():
                old_video_path.unlink()
        except Exception as e:
            logger.warning(f"Could not delete old message video: {e}")
    
    # Update event with video URL
    events[event_index]['message_video_url'] = video_url
    events[event_index]['message_video_enabled'] = True
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile_id},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "message_video_uploaded",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile_id,
            "video_url": video_url,
            "file_size_mb": round(file_size_mb, 2)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Message video uploaded successfully",
        "video_url": video_url,
        "file_size_mb": round(file_size_mb, 2)
    }


@api_router.post("/admin/events/{event_id}/upload-music")
async def upload_background_music(
    event_id: str,
    file: UploadFile = File(...),
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 24: Upload background music for event
    - Max 5MB
    - Format: MP3 only
    """
    # Validate file format
    if not file.content_type or file.content_type not in ['audio/mpeg', 'audio/mp3']:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid audio format. Only MP3 allowed. Got: {file.content_type}"
        )
    
    # Read file content
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    
    # Validate file size (5MB limit)
    if file_size_mb > 5:
        raise HTTPException(
            status_code=400,
            detail=f"File size {file_size_mb:.2f}MB exceeds 5MB limit"
        )
    
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event
    events = profile.get('events', [])
    event = None
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event = evt
            event_index = idx
            break

    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Create music directory
    profile_id = profile['id']
    event_type = event.get('event_type', 'unknown')
    music_dir = Path(f"/app/uploads/music/{profile_id}/{event_type}")
    music_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    music_id = str(uuid.uuid4())
    music_filename = f"bg_music_{music_id}.mp3"
    music_path = music_dir / music_filename

    # Store to the invitation S3 bucket (dev/no-AWS falls back to disk).
    music_url = _store_invitation_bytes(
        content, kind="music", mime=file.content_type or "audio/mpeg",
        profile=profile, event_id=event_id,
        disk_path=music_path,
        disk_url=f"/uploads/music/{profile_id}/{event_type}/{music_filename}",
        fallback_ext=".mp3")

    # Delete old music if exists
    old_music_url = event.get('background_music_url')
    if old_music_url:
        try:
            old_music_path = Path(f"/app{old_music_url}")
            if old_music_path.exists():
                old_music_path.unlink()
        except Exception as e:
            logger.warning(f"Could not delete old music: {e}")
    
    # Update event with music URL
    events[event_index]['background_music_url'] = music_url
    events[event_index]['background_music_enabled'] = True
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile_id},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "background_music_uploaded",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile_id,
            "music_url": music_url,
            "file_size_mb": round(file_size_mb, 2)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Background music uploaded successfully",
        "music_url": music_url,
        "file_size_mb": round(file_size_mb, 2)
    }


@api_router.delete("/admin/events/{event_id}/hero-video")
async def delete_hero_video(
    event_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 24: Delete hero video from event"""
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            break

    if event_index == -1:
        raise HTTPException(status_code=404, detail="Event not found")

    event = events[event_index]
    video_url = event.get('hero_video_url')
    
    if not video_url:
        raise HTTPException(status_code=404, detail="No hero video found")
    
    # Delete video file
    try:
        video_path = Path(f"/app{video_url}")
        if video_path.exists():
            video_path.unlink()
        
        # Delete thumbnail if exists
        thumbnail_url = event.get('hero_video_thumbnail')
        if thumbnail_url:
            thumbnail_path = Path(f"/app{thumbnail_url}")
            if thumbnail_path.exists():
                thumbnail_path.unlink()
    except Exception as e:
        logger.warning(f"Could not delete video files: {e}")
    
    # Update event
    events[event_index]['hero_video_url'] = None
    events[event_index]['hero_video_thumbnail'] = None
    events[event_index]['hero_video_enabled'] = False
    
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "hero_video_deleted",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {"profile_id": profile['id']},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Hero video deleted successfully"}


@api_router.delete("/admin/events/{event_id}/message-video")
async def delete_message_video(
    event_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 24: Delete message video from event"""
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            break

    if event_index == -1:
        raise HTTPException(status_code=404, detail="Event not found")

    event = events[event_index]
    video_url = event.get('message_video_url')
    
    if not video_url:
        raise HTTPException(status_code=404, detail="No message video found")
    
    # Delete video file
    try:
        video_path = Path(f"/app{video_url}")
        if video_path.exists():
            video_path.unlink()
    except Exception as e:
        logger.warning(f"Could not delete video file: {e}")
    
    # Update event
    events[event_index]['message_video_url'] = None
    events[event_index]['message_video_enabled'] = False
    
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "message_video_deleted",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {"profile_id": profile['id']},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Message video deleted successfully"}


@api_router.delete("/admin/events/{event_id}/music")
async def delete_background_music(
    event_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 24: Delete background music from event"""
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            break

    if event_index == -1:
        raise HTTPException(status_code=404, detail="Event not found")

    event = events[event_index]
    music_url = event.get('background_music_url')
    
    if not music_url:
        raise HTTPException(status_code=404, detail="No background music found")
    
    # Delete music file
    try:
        music_path = Path(f"/app{music_url}")
        if music_path.exists():
            music_path.unlink()
    except Exception as e:
        logger.warning(f"Could not delete music file: {e}")
    
    # Update event
    events[event_index]['background_music_url'] = None
    events[event_index]['background_music_enabled'] = False
    
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "background_music_deleted",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {"profile_id": profile['id']},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Background music deleted successfully"}


@api_router.patch("/admin/events/{event_id}/toggle-hero-video")
async def toggle_hero_video(
    event_id: str,
    enabled: bool,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 24: Toggle hero video enable/disable"""
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            break

    if event_index == -1:
        raise HTTPException(status_code=404, detail="Event not found")

    events[event_index]['hero_video_enabled'] = enabled
    
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "hero_video_toggled",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {"profile_id": profile['id'], "enabled": enabled},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Hero video {'enabled' if enabled else 'disabled'} successfully"}


@api_router.patch("/admin/events/{event_id}/toggle-message-video")
async def toggle_message_video(
    event_id: str,
    enabled: bool,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 24: Toggle message video enable/disable"""
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            break

    if event_index == -1:
        raise HTTPException(status_code=404, detail="Event not found")

    events[event_index]['message_video_enabled'] = enabled
    
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "message_video_toggled",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {"profile_id": profile['id'], "enabled": enabled},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Message video {'enabled' if enabled else 'disabled'} successfully"}


@api_router.patch("/admin/events/{event_id}/toggle-music")
async def toggle_background_music(
    event_id: str,
    enabled: bool,
    admin_id: str = Depends(get_current_admin)
):
    """PHASE 24: Toggle background music enable/disable"""
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    events = profile.get('events', [])
    event_index = -1

    for idx, evt in enumerate(events):
        if evt.get('event_id') == event_id:
            event_index = idx
            break

    if event_index == -1:
        raise HTTPException(status_code=404, detail="Event not found")

    events[event_index]['background_music_enabled'] = enabled
    
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "background_music_toggled",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {"profile_id": profile['id'], "enabled": enabled},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Background music {'enabled' if enabled else 'disabled'} successfully"}



# ==================== PHASE 25: GUEST ENGAGEMENT ENGINE ====================

@api_router.post("/events/{event_id}/wishes")
async def create_guest_wish(
    event_id: str,
    wish_data: GuestWishCreate,
    request: Request
):
    """
    PHASE 25: Create a guest wish for an event
    
    Public endpoint with rate limiting (max 5 wishes per IP per day)
    """
    # Get client IP
    ip_address = get_client_ip(request)
    
    # Check rate limit (max 5 wishes per IP per day)
    rate_allowed = await check_rate_limit(ip_address, "wishes", 5)
    if not rate_allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 5 wishes per day."
        )
    
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0, "id": 1, "events": 1}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Find the specific event and check if wishes are enabled
    event = None
    for evt in profile.get('events', []):
        if evt.get('event_id') == event_id:
            event = evt
            break
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event.get('wishes_enabled', True):
        raise HTTPException(
            status_code=403,
            detail="Wishes are disabled for this event"
        )
    
    # Basic profanity filter
    if contains_profanity(wish_data.message):
        raise HTTPException(
            status_code=400,
            detail="Message contains inappropriate content"
        )
    
    # Create guest wish
    guest_wish = GuestWish(
        event_id=event_id,
        profile_id=profile['id'],
        guest_name=wish_data.guest_name,
        message=wish_data.message,
        emoji=wish_data.emoji,
        ip_address=ip_address
    )
    
    # Convert to dict and serialize
    doc = guest_wish.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.guest_wishes.insert_one(doc)
    
    # Update rate limit count
    await db.rate_limits.update_one(
        {
            "ip_address": ip_address,
            "endpoint": "wishes",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
        },
        {"$inc": {"count": 1}},
        upsert=False
    )
    
    return {
        "message": "Wish created successfully",
        "wish": GuestWishResponse(**guest_wish.model_dump())
    }


@api_router.get("/admin/events/{event_id}/wishes")
async def get_event_wishes(
    event_id: str,
    limit: int = 50,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 25 + PHASE 32: Get all wishes for an event
    
    SECURITY FIX: Changed to admin-only endpoint
    Guests should not be able to view all wishes - only approved ones show on public invitation
    """
    # Find profile containing this event + ownership check (super_admin bypasses)
    profile = await db.profiles.find_one({"events.event_id": event_id}, {"_id": 0, "admin_id": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    wishes = await db.guest_wishes.find(
        {"event_id": event_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Convert datetime strings
    for wish in wishes:
        if isinstance(wish.get('created_at'), str):
            wish['created_at'] = datetime.fromisoformat(wish['created_at'])
    
    return {
        "wishes": [GuestWishResponse(**wish) for wish in wishes],
        "total": len(wishes)
    }


@api_router.delete("/admin/wishes/{wish_id}")
async def delete_guest_wish(
    wish_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 25: Admin delete a guest wish
    """
    wish = await db.guest_wishes.find_one({"id": wish_id}, {"_id": 0, "profile_id": 1})
    if not wish:
        raise HTTPException(status_code=404, detail="Wish not found")
    await check_profile_ownership(wish["profile_id"], admin_id, db)

    result = await db.guest_wishes.delete_one({"id": wish_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wish not found")

    return {"message": "Wish deleted successfully"}


@api_router.post("/events/{event_id}/reactions")
async def create_guest_reaction(
    event_id: str,
    reaction_data: GuestReactionCreate,
    request: Request
):
    """
    PHASE 25: Add/update guest reaction for an event
    
    Public endpoint - one reaction per device (IP address)
    """
    # Get client IP
    ip_address = get_client_ip(request)
    
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0, "id": 1, "events": 1}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Find the specific event and check if reactions are enabled
    event = None
    for evt in profile.get('events', []):
        if evt.get('event_id') == event_id:
            event = evt
            break
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event.get('reactions_enabled', True):
        raise HTTPException(
            status_code=403,
            detail="Reactions are disabled for this event"
        )
    
    # Check if IP already reacted today
    existing_reaction = await db.guest_reactions.find_one({
        "event_id": event_id,
        "ip_address": ip_address
    })
    
    if existing_reaction:
        # Update existing reaction
        await db.guest_reactions.update_one(
            {"id": existing_reaction['id']},
            {
                "$set": {
                    "reaction_type": reaction_data.reaction_type,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        return {
            "message": "Reaction updated successfully",
            "reaction_type": reaction_data.reaction_type
        }
    else:
        # Create new reaction
        guest_reaction = GuestReaction(
            event_id=event_id,
            profile_id=profile['id'],
            reaction_type=reaction_data.reaction_type,
            ip_address=ip_address
        )
        
        doc = guest_reaction.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        
        await db.guest_reactions.insert_one(doc)
        
        return {
            "message": "Reaction created successfully",
            "reaction_type": reaction_data.reaction_type
        }


@api_router.get("/events/{event_id}/reactions")
async def get_event_reactions(event_id: str):
    """
    PHASE 25: Get reaction statistics for an event
    
    Public endpoint - returns aggregate counts only
    """
    reactions = await db.guest_reactions.find(
        {"event_id": event_id},
        {"_id": 0, "reaction_type": 1}
    ).to_list(1000)
    
    # Count reactions by type
    love_count = sum(1 for r in reactions if r.get('reaction_type') == 'love')
    blessings_count = sum(1 for r in reactions if r.get('reaction_type') == 'blessings')
    excited_count = sum(1 for r in reactions if r.get('reaction_type') == 'excited')
    
    return GuestReactionStats(
        event_id=event_id,
        love_count=love_count,
        blessings_count=blessings_count,
        excited_count=excited_count,
        total_reactions=len(reactions)
    )


@api_router.patch("/admin/events/{event_id}/engagement-settings")
async def update_event_engagement_settings(
    event_id: str,
    settings: UpdateEventEngagementSettingsRequest,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 25: Update engagement settings for an event
    
    Admin endpoint - toggle wishes, reactions, countdown
    """
    # Find profile containing this event
    profile = await db.profiles.find_one(
        {"events.event_id": event_id},
        {"_id": 0}
    )
    
    if not profile:
        raise HTTPException(status_code=404, detail="Event not found")

    # Ownership check — admin can only modify events on profiles they own (super_admin bypasses)
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Find the event and update settings
    events = profile.get('events', [])
    event_found = False
    
    for evt in events:
        if evt.get('event_id') == event_id:
            event_found = True
            
            if settings.wishes_enabled is not None:
                evt['wishes_enabled'] = settings.wishes_enabled
            if settings.reactions_enabled is not None:
                evt['reactions_enabled'] = settings.reactions_enabled
            if settings.countdown_enabled is not None:
                evt['countdown_enabled'] = settings.countdown_enabled
            
            break
    
    if not event_found:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Update profile
    await db.profiles.update_one(
        {"id": profile['id']},
        {
            "$set": {
                "events": events,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "event_engagement_settings_updated",
        "resource_type": "event",
        "resource_id": event_id,
        "admin_id": admin_id,
        "details": {
            "profile_id": profile['id'],
            "settings": settings.model_dump(exclude_none=True)
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": "Engagement settings updated successfully",
        "settings": {
            "wishes_enabled": evt.get('wishes_enabled'),
            "reactions_enabled": evt.get('reactions_enabled'),
            "countdown_enabled": evt.get('countdown_enabled')
        }
    }


# ==========================================
# PHASE 26: AI-POWERED PERSONALIZATION
# ==========================================

@api_router.post("/translate", response_model=TranslationResponse)
async def translate_content(
    request_data: TranslationRequest,
    req: Request
):
    """
    PHASE 26: Translate content to target language using AI
    
    Guest endpoint - Rate limited to 10 requests per minute per IP
    Supports: English (en), Telugu (te), Hindi (hi), Tamil (ta)
    """
    # Get client IP for rate limiting
    client_ip = req.client.host
    
    # Check rate limit
    if not check_translation_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Translation rate limit exceeded. Please try again in a minute."
        )
    
    # Generate content hash for cache lookup
    content_hash = hashlib.md5(
        f"{request_data.content}_{request_data.target_language}".encode()
    ).hexdigest()
    
    # Check cache first
    cached_translation = await db.translation_cache.find_one(
        {
            "content_hash": content_hash,
            "target_language": request_data.target_language,
            "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}
        },
        {"_id": 0}
    )
    
    if cached_translation:
        return TranslationResponse(
            original_content=request_data.content,
            translated_content=cached_translation['translated_content'],
            source_language="en",
            target_language=request_data.target_language,
            cached=True
        )
    
    # Translate using AI
    try:
        translated_text = await ai_service.translate_content(
            content=request_data.content,
            target_language=request_data.target_language,
            context=request_data.context
        )
        
        # Cache the translation (expires in 7 days)
        cache_entry = {
            "id": str(uuid.uuid4()),
            "content_hash": content_hash,
            "original_language": "en",
            "target_language": request_data.target_language,
            "original_content": request_data.content,
            "translated_content": translated_text,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        }
        
        await db.translation_cache.insert_one(cache_entry)
        
        return TranslationResponse(
            original_content=request_data.content,
            translated_content=translated_text,
            source_language="en",
            target_language=request_data.target_language,
            cached=False
        )
    
    except Exception as e:
        logger.error(f"Translation error: {e}")
        # Return original content as fallback
        return TranslationResponse(
            original_content=request_data.content,
            translated_content=request_data.content,
            source_language="en",
            target_language=request_data.target_language,
            cached=False
        )


@api_router.post("/admin/generate-event-description", response_model=GenerateDescriptionResponse)
async def generate_event_description(
    request_data: GenerateDescriptionRequest,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 26: Generate event description using AI
    
    Admin endpoint - Rate limited to 5 requests per hour per admin
    """
    # Check rate limit
    if not check_admin_generation_rate_limit(admin_id):
        raise HTTPException(
            status_code=429,
            detail="AI generation rate limit exceeded. Please try again later (5 requests per hour)."
        )
    
    # Generate description using AI
    try:
        description = await ai_service.generate_event_description(
            event_type=request_data.event_type,
            couple_names=request_data.couple_names,
            date=request_data.date,
            venue=request_data.venue
        )
        
        # Create audit log
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "action": "ai_description_generated",
            "resource_type": "event",
            "resource_id": None,
            "admin_id": admin_id,
            "details": {
                "event_type": request_data.event_type,
                "description_length": len(description)
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        return GenerateDescriptionResponse(
            description=description,
            event_type=request_data.event_type
        )
    
    except Exception as e:
        logger.error(f"Description generation error: {e}")
        # Return fallback description
        return GenerateDescriptionResponse(
            description=f"Join us to celebrate this beautiful {request_data.event_type} ceremony.",
            event_type=request_data.event_type
        )


@api_router.get("/rsvp-suggestions", response_model=RSVPSuggestionsResponse)
async def get_rsvp_suggestions(
    event_type: str = "marriage",
    guest_name: Optional[str] = None
):
    """
    PHASE 26: Get AI-generated RSVP message suggestions
    
    Guest endpoint - No authentication required
    Returns 3 contextual message suggestions
    """
    try:
        suggestions = await ai_service.generate_rsvp_suggestions(
            event_type=event_type,
            guest_name=guest_name
        )
        
        return RSVPSuggestionsResponse(suggestions=suggestions)
    
    except Exception as e:
        logger.error(f"RSVP suggestions error: {e}")
        # Return fallback suggestions
        return RSVPSuggestionsResponse(
            suggestions=[
                "Can't wait to celebrate with you! 🎉",
                "Blessings to the beautiful couple ❤️",
                "Excited for your special day! 💐"
            ]
        )


@api_router.get("/admin/guest-insights/{profile_id}", response_model=GuestInsightsResponse)
async def get_guest_insights(
    profile_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 26: Get AI-generated guest segment insights
    
    Admin endpoint - Analyzes RSVP data and provides insights
    """
    # Get profile
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Get all RSVPs for this profile
    rsvps = await db.rsvps.find({"profile_id": profile_id}, {"_id": 0}).to_list(length=2000)
    
    # Calculate statistics
    total_rsvps = len(rsvps)
    # normalize_rsvp_status: rows are written as yes/no/maybe — the literal
    # 'confirmed/declined/pending' comparisons matched nothing, ever.
    confirmed = sum(1 for r in rsvps if normalize_rsvp_status(r.get('status')) == 'yes')
    declined = sum(1 for r in rsvps if normalize_rsvp_status(r.get('status')) == 'no')
    pending = sum(1 for r in rsvps if normalize_rsvp_status(r.get('status')) == 'maybe')
    with_messages = sum(1 for r in rsvps if r.get('message') and len(r.get('message', '').strip()) > 0)
    
    # Calculate early and late responses
    # Get the profile creation date as reference
    profile_created = datetime.fromisoformat(profile.get('created_at', datetime.now(timezone.utc).isoformat()))
    early_responses = 0
    late_responses = 0
    
    for rsvp in rsvps:
        rsvp_time = datetime.fromisoformat(rsvp.get('created_at', datetime.now(timezone.utc).isoformat()))
        time_diff = (rsvp_time - profile_created).total_seconds() / 3600  # hours
        
        if time_diff <= 24:
            early_responses += 1
        elif time_diff > 72:
            late_responses += 1
    
    # Prepare data for AI insights
    rsvp_data = {
        'total': total_rsvps,
        'confirmed': confirmed,
        'declined': declined,
        'pending': pending,
        'early_responses': early_responses,
        'late_responses': late_responses,
        'with_messages': with_messages
    }
    
    # Generate insights using AI
    try:
        insights_text = await ai_service.generate_guest_insights(rsvp_data)
    except Exception as e:
        logger.error(f"Guest insights generation error: {e}")
        # Fallback insights
        confirmed_rate = (confirmed / max(total_rsvps, 1)) * 100
        insights_text = f"You have received {total_rsvps} RSVPs so far, with {confirmed_rate:.0f}% confirming attendance."
    
    # Create audit log
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "guest_insights_generated",
        "resource_type": "profile",
        "resource_id": profile_id,
        "admin_id": admin_id,
        "details": {
            "total_rsvps": total_rsvps,
            "confirmed": confirmed
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return GuestInsightsResponse(
        profile_id=profile_id,
        total_rsvps=total_rsvps,
        confirmed=confirmed,
        declined=declined,
        pending=pending,
        early_responses=early_responses,
        late_responses=late_responses,
        with_messages=with_messages,
        insights_text=insights_text,
        generated_at=datetime.now(timezone.utc)
    )


@api_router.get("/languages")
async def get_supported_languages():
    """
    PHASE 26: Get list of supported languages for translation
    
    Public endpoint - Returns language codes and names
    """
    return {
        "languages": [
            {"code": code, "name": name}
            for code, name in SUPPORTED_LANGUAGES.items()
        ],
        "default": "en"
    }


# ==================== PHASE 27: POST-WEDDING VALUE (COMBINED) ====================

@api_router.put("/admin/profiles/{profile_id}/thank-you")
async def create_or_update_thank_you_message(
    profile_id: str,
    thank_you_data: ThankYouMessageCreate,
    admin_data: dict = Depends(require_admin)
):
    """
    PHASE 27: Create or update thank you message for a profile
    
    Admin endpoint - Couple can send thank-you message after wedding
    """
    try:
        admin = admin_data
        
        # Verify profile exists
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Check if thank you message already exists
        existing_thank_you = await db.thank_you_messages.find_one({"profile_id": profile_id})
        
        now = datetime.now(timezone.utc)
        
        # Determine if message should be published
        # Published if: enabled AND (no scheduled date OR scheduled date has passed)
        is_published = thank_you_data.enabled
        if thank_you_data.scheduled_date:
            is_published = is_published and (now >= thank_you_data.scheduled_date)
        
        if existing_thank_you:
            # Update existing
            update_data = {
                "enabled": thank_you_data.enabled,
                "message_type": thank_you_data.message_type,
                "message_text": thank_you_data.message_text,
                "video_url": thank_you_data.video_url,
                "video_thumbnail": thank_you_data.video_thumbnail,
                "scheduled_date": thank_you_data.scheduled_date,
                "is_published": is_published,
                "updated_at": now
            }
            
            await db.thank_you_messages.update_one(
                {"profile_id": profile_id},
                {"$set": update_data}
            )
            
            thank_you_id = existing_thank_you["id"]
        else:
            # Create new
            thank_you = ThankYouMessage(
                profile_id=profile_id,
                enabled=thank_you_data.enabled,
                message_type=thank_you_data.message_type,
                message_text=thank_you_data.message_text,
                video_url=thank_you_data.video_url,
                video_thumbnail=thank_you_data.video_thumbnail,
                scheduled_date=thank_you_data.scheduled_date,
                is_published=is_published,
                created_at=now,
                updated_at=now
            )
            
            await db.thank_you_messages.insert_one(thank_you.model_dump())
            thank_you_id = thank_you.id
        
        # Create audit log
        await db.audit_logs.insert_one(
            AuditLog(
                action="thank_you_message_update",
                admin_id=admin["admin_id"],
                profile_id=profile_id,
                profile_slug=profile["slug"],
                details={
                    "message_type": thank_you_data.message_type,
                    "enabled": thank_you_data.enabled,
                    "scheduled": thank_you_data.scheduled_date is not None
                }
            ).model_dump()
        )
        
        return {
            "message": "Thank you message saved successfully",
            "id": thank_you_id,
            "is_published": is_published
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving thank you message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/admin/profiles/{profile_id}/thank-you")
async def get_thank_you_message_admin(
    profile_id: str,
    admin_data: dict = Depends(require_admin)
):
    """
    PHASE 27: Get thank you message for admin view
    
    Admin endpoint - View and manage thank you message
    """
    try:
        # auth enforced by Depends(require_admin)
        
        # Get thank you message
        thank_you = await db.thank_you_messages.find_one({"profile_id": profile_id})
        
        if not thank_you:
            return {
                "exists": False,
                "message": "No thank you message created yet"
            }
        
        return ThankYouMessageResponse(**thank_you)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching thank you message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/profiles/{slug_url}/thank-you")
async def get_thank_you_message_public(slug_url: str):
    """
    PHASE 27: Get thank you message for public view
    
    Public endpoint - Guests can view thank you message if published
    """
    try:
        # Get profile
        profile = await db.profiles.find_one({"slug": slug_url})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get thank you message (ponytail: filter is_published in Python — adapter mis-binds bool in query)
        thank_you = await db.thank_you_messages.find_one({"profile_id": profile["id"]})
        if thank_you and not thank_you.get("is_published"):
            thank_you = None
        
        if not thank_you:
            return {
                "exists": False,
                "message": "No thank you message available"
            }
        
        return ThankYouMessageResponse(**thank_you)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching public thank you message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/profiles/{profile_id}/upload-album-media")
async def upload_wedding_album_media(
    profile_id: str,
    files: List[UploadFile] = File(...),
    captions: Optional[str] = Form(None),  # JSON string of captions
    admin_data: dict = Depends(require_admin)
):
    """
    PHASE 27: Upload wedding album photos/videos
    
    Admin endpoint - Upload final wedding photos/videos for album
    Max 50 media items per profile
    """
    try:
        admin = admin_data

        # Verify profile exists
        profile = await check_profile_ownership(profile_id, admin_data, db)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Check existing media count
        existing_count = await db.wedding_album_media.count_documents({"profile_id": profile_id})
        if existing_count + len(files) > 50:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum 50 media items allowed. Current: {existing_count}, Attempting to add: {len(files)}"
            )
        
        # Parse captions if provided
        captions_dict = {}
        if captions:
            import json
            try:
                captions_dict = json.loads(captions)
            except:
                pass
        
        uploaded_media = []
        upload_dir = f"/app/uploads/album/{profile_id}"
        os.makedirs(upload_dir, exist_ok=True)
        
        for idx, file in enumerate(files):
            # Validate file type
            file_ext = file.filename.split('.')[-1].lower()
            if file_ext in ['jpg', 'jpeg', 'png', 'webp']:
                media_type = "photo"
                allowed = True
            elif file_ext in ['mp4', 'webm', 'mov']:
                media_type = "video"
                allowed = True
            else:
                continue  # Skip unsupported files
            
            # Read file
            file_content = await file.read()
            file_size = len(file_content)
            
            # Validate file size (max 10MB for photos, 50MB for videos)
            max_size = 50 * 1024 * 1024 if media_type == "video" else 10 * 1024 * 1024
            if file_size > max_size:
                continue  # Skip oversized files
            
            # Generate unique filename
            file_id = str(uuid.uuid4())[:8]
            filename = f"{file_id}_{file.filename}"
            file_path = os.path.join(upload_dir, filename)
            
            # Process file, then store to the invitation S3 bucket (dev/no-AWS
            # falls back to /app/uploads/album).
            if media_type == "photo":
                from PIL import Image
                import io as _io_album
                img = Image.open(_io_album.BytesIO(file_content))
                if img.width > 2000:
                    ratio = 2000 / img.width
                    img = img.resize((2000, int(img.height * ratio)), Image.Resampling.LANCZOS)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGB")
                _wbuf = _io_album.BytesIO()
                img.save(_wbuf, 'WEBP', quality=85)
                webp_filename = filename.rsplit('.', 1)[0] + '.webp'
                media_url = _store_invitation_bytes(
                    _wbuf.getvalue(), kind="image", mime="image/webp",
                    profile=profile, event_id=None,
                    disk_path=Path(upload_dir) / webp_filename,
                    disk_url=f"/uploads/album/{profile_id}/{webp_filename}",
                    fallback_ext=".webp")
                thumbnail_url = None
            else:
                media_url = _store_invitation_bytes(
                    file_content, kind="video", mime=file.content_type or "video/mp4",
                    profile=profile, event_id=None,
                    disk_path=Path(file_path),
                    disk_url=f"/uploads/album/{profile_id}/{filename}",
                    fallback_ext=f".{file_ext}")
                thumbnail_url = None
            
            # Get caption for this file
            caption = captions_dict.get(file.filename, None)
            
            # Get next order number
            max_order = await db.wedding_album_media.find_one(
                {"profile_id": profile_id},
                sort=[("order", -1)]
            )
            next_order = (max_order["order"] + 1) if max_order else 0
            
            # Create media record
            media = WeddingAlbumMedia(
                profile_id=profile_id,
                media_type=media_type,
                media_url=media_url,
                thumbnail_url=thumbnail_url,
                caption=caption,
                order=next_order,
                file_size=file_size
            )
            
            await db.wedding_album_media.insert_one(media.model_dump())
            uploaded_media.append(media.model_dump())
        
        # Create audit log
        await db.audit_logs.insert_one(
            AuditLog(
                action="wedding_album_upload",
                admin_id=admin["admin_id"],
                profile_id=profile_id,
                profile_slug=profile["slug"],
                details={
                    "files_uploaded": len(uploaded_media),
                    "total_album_items": existing_count + len(uploaded_media)
                }
            ).model_dump()
        )
        
        return {
            "message": f"Uploaded {len(uploaded_media)} media items successfully",
            "uploaded": len(uploaded_media),
            "total": existing_count + len(uploaded_media)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading album media: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/admin/profiles/{profile_id}/album-media")
async def get_album_media_admin(
    profile_id: str,
    admin_data: dict = Depends(require_admin)
):
    """
    PHASE 27: Get wedding album media for admin view
    
    Admin endpoint - View and manage album media
    """
    try:
        # auth enforced by Depends(require_admin) + object-level ownership
        await check_profile_ownership(profile_id, admin_data, db)

        # Get album media sorted by order
        media_cursor = db.wedding_album_media.find(
            {"profile_id": profile_id}
        ).sort("order", 1)
        
        media_list = await media_cursor.to_list(length=100)
        
        return {
            "media": [WeddingAlbumMediaResponse(**m) for m in media_list],
            "total": len(media_list)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching album media: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/profiles/{slug_url}/album-media")
async def get_album_media_public(slug_url: str):
    """
    PHASE 27: Get wedding album media for public view
    
    Public endpoint - Guests can view album (read-only, lifetime access)
    """
    try:
        # Get profile
        profile = await db.profiles.find_one({"slug": slug_url})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get album media sorted by order
        media_cursor = db.wedding_album_media.find(
            {"profile_id": profile["id"]}
        ).sort("order", 1)
        
        media_list = await media_cursor.to_list(length=100)
        
        return {
            "media": [WeddingAlbumMediaResponse(**m) for m in media_list],
            "total": len(media_list)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching public album media: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/admin/profiles/{profile_id}/album-media/{media_id}")
async def delete_album_media(
    profile_id: str,
    media_id: str,
    admin_data: dict = Depends(require_admin)
):
    """
    PHASE 27: Delete wedding album media
    
    Admin endpoint - Delete photo/video from album
    """
    try:
        admin = admin_data
        # Ownership check (raises 404 if not found or not owned; super_admin bypasses)
        profile = await check_profile_ownership(profile_id, admin_data, db)

        # Get media
        media = await db.wedding_album_media.find_one({
            "id": media_id,
            "profile_id": profile_id
        })

        if not media:
            raise HTTPException(status_code=404, detail="Media not found")

        # Delete file from filesystem
        media_path = f"/app{media['media_url']}"
        if os.path.exists(media_path):
            os.remove(media_path)

        # Delete from database
        await db.wedding_album_media.delete_one({"id": media_id})

        # Create audit log
        await db.audit_logs.insert_one(
            AuditLog(
                action="wedding_album_delete",
                admin_id=admin["admin_id"],
                profile_id=profile_id,
                profile_slug=profile["slug"] if profile else None,
                details={"media_id": media_id, "media_type": media["media_type"]}
            ).model_dump()
        )
        
        return {"message": "Media deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting album media: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/profiles/{slug_url}/memory-mode")
async def check_memory_mode(slug_url: str):
    """
    PHASE 27: Check if invitation is in memory mode
    
    Public endpoint - Determines if wedding has passed and memory mode should activate
    Memory mode: RSVP disabled, countdown hidden, focus on photos/videos/thank you
    """
    try:
        # Get profile
        profile = await db.profiles.find_one({"slug": slug_url})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Check if any events exist
        if not profile.get("events") or len(profile["events"]) == 0:
            return MemoryModeStatus(
                is_memory_mode=False,
                message="No events scheduled yet"
            )
        
        # Get current date (date only, no time)
        from datetime import date
        today = date.today()
        
        # Find the latest event date
        latest_event_date = None
        for event in profile["events"]:
            if event.get("visible", True):
                event_date_str = event.get("date")
                if event_date_str:
                    try:
                        # Parse yyyy-mm-dd format
                        event_date = datetime.strptime(event_date_str, "%Y-%m-%d").date()
                        if latest_event_date is None or event_date > latest_event_date:
                            latest_event_date = event_date
                    except:
                        continue
        
        if latest_event_date is None:
            return MemoryModeStatus(
                is_memory_mode=False,
                message="No valid event dates found"
            )
        
        # Check if wedding has passed (compare dates only)
        is_memory_mode = today > latest_event_date
        
        if is_memory_mode:
            days_since = (today - latest_event_date).days
            return MemoryModeStatus(
                is_memory_mode=True,
                wedding_completed_date=datetime.combine(latest_event_date, datetime.min.time()),
                days_since_wedding=days_since,
                message=f"Wedding completed {days_since} day{'s' if days_since != 1 else ''} ago"
            )
        else:
            days_until = (latest_event_date - today).days
            return MemoryModeStatus(
                is_memory_mode=False,
                message=f"Wedding is in {days_until} day{'s' if days_until != 1 else ''}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking memory mode: {str(e)}")


# ============================================
# PHASE 28: VIRAL SHARING & GROWTH ENGINE
# ============================================

@api_router.get("/profiles/{slug_url}/share-metadata", response_model=ShareMetadata)
async def get_share_metadata(slug_url: str):
    """
    PHASE 28: Get share metadata for full wedding invitation
    
    Returns metadata for social sharing preview including title, description, 
    image, and URL. Used by frontend to generate rich previews.
    
    Public endpoint - no authentication required.
    """
    try:
        # Get profile
        profile = await db.profiles.find_one({"slug": slug_url})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get bride and groom names
        bride_name = profile.get('bride_name', 'Bride')
        groom_name = profile.get('groom_name', 'Groom')
        
        # Get earliest wedding date
        events = profile.get('events', [])
        event_dates = []
        for event in events:
            if event.get('event_enabled') and event.get('event_date'):
                try:
                    if isinstance(event['event_date'], str):
                        event_date = datetime.fromisoformat(event['event_date'].replace('Z', '+00:00'))
                    else:
                        event_date = event['event_date']
                    event_dates.append(event_date)
                except:
                    continue
        
        # Format date
        date_str = ""
        if event_dates:
            earliest_date = min(event_dates)
            date_str = earliest_date.strftime("%B %d, %Y")
        
        # Get preview image (use bride/groom photo or first event photo)
        image_url = None
        if profile.get('bride_photo'):
            image_url = profile['bride_photo']
        elif profile.get('groom_photo'):
            image_url = profile['groom_photo']
        else:
            # Try to get first event gallery image
            for event in events:
                if event.get('gallery_enabled') and event.get('gallery_images'):
                    gallery = event['gallery_images']
                    if gallery and len(gallery) > 0:
                        image_url = gallery[0].get('image_url')
                        break
        
        # Build URL
        base_url = public_base_url() or os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        full_url = f"{base_url}/invite/{slug_url}"
        
        # Create metadata
        return ShareMetadata(
            title=f"Join us for the wedding of {bride_name} & {groom_name}",
            description=f"We're getting married{' on ' + date_str if date_str else ''}! Join us in celebrating our special day.",
            url=full_url,
            image_url=image_url,
            event_date=date_str if date_str else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating share metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/events/{event_id}/share-metadata", response_model=ShareMetadata)
async def get_event_share_metadata(event_id: str):
    """
    PHASE 28: Get share metadata for specific event
    
    Returns metadata for sharing individual event on social platforms.
    
    Public endpoint - no authentication required.
    """
    try:
        # Find profile with this event
        profile = await db.profiles.find_one({
            "events.event_id": event_id
        })
        
        if not profile:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Find the specific event
        event = None
        for e in profile.get('events', []):
            if e.get('event_id') == event_id:
                event = e
                break
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Get event details
        event_type = event.get('event_type', 'event').title()
        bride_name = profile.get('bride_name', 'Bride')
        groom_name = profile.get('groom_name', 'Groom')
        
        # Get event date
        date_str = ""
        if event.get('event_date'):
            try:
                if isinstance(event['event_date'], str):
                    event_date = datetime.fromisoformat(event['event_date'].replace('Z', '+00:00'))
                else:
                    event_date = event['event_date']
                date_str = event_date.strftime("%B %d, %Y at %I:%M %p")
            except:
                pass
        
        # Get venue
        venue = event.get('venue', '')
        
        # Get preview image (event gallery or profile photos)
        image_url = None
        if event.get('gallery_enabled') and event.get('gallery_images'):
            gallery = event['gallery_images']
            if gallery and len(gallery) > 0:
                image_url = gallery[0].get('image_url')
        
        if not image_url:
            image_url = profile.get('bride_photo') or profile.get('groom_photo')
        
        # Build URL
        base_url = public_base_url() or os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        full_url = f"{base_url}/invite/{profile['slug']}?event={event_id}"
        
        # Create metadata
        description = f"{event_type} ceremony of {bride_name} & {groom_name}"
        if date_str:
            description += f" on {date_str}"
        if venue:
            description += f" at {venue}"
        
        return ShareMetadata(
            title=f"{event_type} - {bride_name} & {groom_name}",
            description=description,
            url=full_url,
            image_url=image_url,
            event_type=event_type,
            event_date=date_str if date_str else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating event share metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/profiles/{slug_url}/qr-code", response_model=QRCodeResponse)
async def generate_profile_qr_code(
    slug_url: str,
    size: int = 300
):
    """
    PHASE 28: Generate QR code for full wedding invitation
    
    Creates a QR code that guests can scan to view the full invitation.
    Returns base64 encoded PNG image.
    
    Public endpoint - no authentication required (for guest convenience).
    Admins can use this to download QR codes for print materials.
    
    Args:
        slug_url: Profile slug URL
        size: QR code size in pixels (100-1000, default 300)
    """
    try:
        # Validate size
        if size < 100 or size > 1000:
            raise HTTPException(status_code=400, detail="Size must be between 100 and 1000")
        
        # Verify profile exists
        profile = await db.profiles.find_one({"slug": slug_url})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Build URL
        base_url = public_base_url() or os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        full_url = f"{base_url}/invite/{slug_url}"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction
            box_size=10,
            border=4,
        )
        qr.add_data(full_url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Resize to requested size
        img = img.resize((size, size), PILImage.Resampling.LANCZOS)
        
        # Convert to base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Create filename
        bride_name = profile.get('bride_name', 'bride').replace(' ', '_').lower()
        groom_name = profile.get('groom_name', 'groom').replace(' ', '_').lower()
        filename = f"wedding_qr_{bride_name}_{groom_name}.png"
        
        return QRCodeResponse(
            qr_code_base64=img_base64,
            download_filename=filename,
            url=full_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating QR code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/events/{event_id}/qr-code", response_model=QRCodeResponse)
async def generate_event_qr_code(
    event_id: str,
    size: int = 300
):
    """
    PHASE 28: Generate QR code for specific event
    
    Creates a QR code for individual event that links directly to that event
    on the invitation page.
    
    Public endpoint - no authentication required.
    
    Args:
        event_id: Event ID
        size: QR code size in pixels (100-1000, default 300)
    """
    try:
        # Validate size
        if size < 100 or size > 1000:
            raise HTTPException(status_code=400, detail="Size must be between 100 and 1000")
        
        # Find profile with this event
        profile = await db.profiles.find_one({
            "events.event_id": event_id
        })
        
        if not profile:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Find the specific event
        event = None
        for e in profile.get('events', []):
            if e.get('event_id') == event_id:
                event = e
                break
        
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Build URL
        base_url = public_base_url() or os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        full_url = f"{base_url}/invite/{profile['slug']}?event={event_id}"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(full_url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Resize to requested size
        img = img.resize((size, size), PILImage.Resampling.LANCZOS)
        
        # Convert to base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Create filename
        event_type = event.get('event_type', 'event').lower()
        bride_name = profile.get('bride_name', 'bride').replace(' ', '_').lower()
        groom_name = profile.get('groom_name', 'groom').replace(' ', '_').lower()
        filename = f"wedding_qr_{event_type}_{bride_name}_{groom_name}.png"
        
        return QRCodeResponse(
            qr_code_base64=img_base64,
            download_filename=filename,
            url=full_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating event QR code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PHASE 29E: ADMIN SAFETY NETS & RECOVERY ====================

async def save_profile_version(profile_id: str, admin_id: str, version_type: str = "manual_save"):
    """
    PHASE 29E: Save a profile version snapshot
    
    Creates a snapshot of the current profile state for rollback capability.
    Maintains only the last 5 versions per profile.
    """
    try:
        # Get current profile data
        profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        if not profile:
            return None
        
        # Get current version count
        version_count = await db.profile_versions.count_documents({"profile_id": profile_id})
        next_version = version_count + 1
        
        # Create version snapshot
        version = ProfileVersion(
            profile_id=profile_id,
            version_number=next_version,
            snapshot_data=profile,
            admin_id=admin_id,
            version_type=version_type
        )
        
        # Convert to dict and serialize dates
        version_dict = version.model_dump()
        version_dict['created_at'] = version_dict['created_at'].isoformat()
        
        # Insert version
        await db.profile_versions.insert_one(version_dict)
        
        # Keep only last 5 versions - delete older ones
        versions = await db.profile_versions.find(
            {"profile_id": profile_id}
        ).sort("version_number", -1).to_list(length=100)
        
        if len(versions) > 5:
            # Delete versions beyond the last 5
            old_version_ids = [v['id'] for v in versions[5:]]
            await db.profile_versions.delete_many({"id": {"$in": old_version_ids}})
        
        return version_dict
        
    except Exception as e:
        logger.error(f"Error saving profile version: {str(e)}")
        return None


@api_router.post("/admin/profiles/{profile_id}/versions")
async def create_profile_version(
    profile_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 29E: Manually save a profile version snapshot
    
    Creates a version snapshot of the current profile state.
    Used when admin explicitly wants to save a checkpoint.
    """
    try:
        version = await save_profile_version(profile_id, admin_id, "manual_save")
        
        if not version:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        return {"message": "Version saved successfully", "version_id": version['id']}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating profile version: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/admin/profiles/{profile_id}/versions", response_model=ProfileVersionListResponse)
async def get_profile_versions(
    profile_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 29E: Get version history for a profile
    
    Returns list of all saved versions (up to last 5) for the profile.
    Used to show version history UI and enable rollback.
    """
    try:
        # Verify profile exists
        profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get versions sorted by version number (newest first)
        versions_cursor = db.profile_versions.find(
            {"profile_id": profile_id}
        ).sort("version_number", -1)
        
        versions_list = await versions_cursor.to_list(length=5)
        
        # Convert dates
        for v in versions_list:
            if isinstance(v.get('created_at'), str):
                v['created_at'] = datetime.fromisoformat(v['created_at'])
        
        # Get current version number
        current_version = len(versions_list)
        
        return ProfileVersionListResponse(
            versions=[ProfileVersionResponse(**v) for v in versions_list],
            total=len(versions_list),
            current_version=current_version
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching profile versions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/profiles/{profile_id}/restore")
async def restore_profile_version(
    profile_id: str,
    restore_request: RestoreVersionRequest,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 29E: Restore profile from a version snapshot
    
    Rolls back the profile to a previous version state.
    Creates a new version before restoring (for undo capability).
    """
    try:
        # Get the version to restore
        version = await db.profile_versions.find_one(
            {"id": restore_request.version_id, "profile_id": profile_id},
            {"_id": 0}
        )
        
        if not version:
            raise HTTPException(status_code=404, detail="Version not found")
        
        # Save current state before restoring (for undo)
        await save_profile_version(profile_id, admin_id, "auto_save")
        
        # Restore the snapshot data
        snapshot_data = version['snapshot_data']
        snapshot_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        # Update profile with snapshot data
        await db.profiles.update_one(
            {"id": profile_id},
            {"$set": snapshot_data}
        )
        
        # Log audit action
        await log_audit_action(
            action="profile_restore",
            admin_id=admin_id,
            profile_id=profile_id,
            profile_slug=snapshot_data.get('slug'),
            details={
                "restored_from_version": version['version_number'],
                "version_type": version['version_type']
            }
        )
        
        return {
            "message": "Profile restored successfully",
            "restored_version": version['version_number']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring profile version: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))




# ============================================
# PHASE 30: ANALYTICS, INSIGHTS & GUEST INTELLIGENCE
# ============================================

import httpx
from collections import defaultdict

# In-memory cache for IP geolocation (prevents hitting API limits)
ip_location_cache: Dict[str, Dict[str, Optional[str]]] = {}

async def get_ip_location(ip_address: str) -> Dict[str, Optional[str]]:
    """
    Get country and city for an IP address using ipapi.co
    Uses in-memory cache to reduce API calls
    Gracefully fails if API limit exceeded
    """
    # Kill-switch: under viral load, geo enrichment can be disabled entirely so
    # a burst of new IPs never parks the single event loop on external calls.
    if os.environ.get("GEO_LOOKUP_DISABLED", "").lower() in ("1", "true", "yes"):
        return {"country": None, "city": None}

    # Return cached result if exists
    if ip_address in ip_location_cache:
        return ip_location_cache[ip_address]

    # Check MongoDB cache
    cached = await db.ip_location_cache.find_one({"ip_address": ip_address})
    if cached:
        result = {
            "country": cached.get("country"),
            "city": cached.get("city")
        }
        ip_location_cache[ip_address] = result
        return result
    
    # Fetch from API (short timeout so a slow/limited provider can't stall the
    # event loop under a burst of distinct visitor IPs).
    result = {"country": None, "city": None}
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(f"https://ipapi.co/{ip_address}/json/")
            if response.status_code == 200:
                data = response.json()
                result["country"] = data.get("country_name")
                result["city"] = data.get("city")
    except Exception as e:
        logger.warning(f"Failed to get location for IP {ip_address}: {str(e)}")

    # Persist the result (incl. negatives) so repeat misses for the same IP never
    # re-hit the external API. Best-effort.
    try:
        await db.ip_location_cache.insert_one({
            "ip_address": ip_address,
            "country": result["country"],
            "city": result["city"],
            "cached_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass

    # Cache in memory, bounded so it can't grow unbounded under a viral burst.
    if len(ip_location_cache) < 50000:
        ip_location_cache[ip_address] = result
    return result


async def is_admin_session(session_id: str) -> bool:
    """Check if session belongs to logged-in admin"""
    # Simple check: if session has made admin API calls recently, it's admin
    # This prevents admin's own views from being tracked
    # For now, we'll track all views unless explicitly filtered on frontend
    return False


@api_router.post("/analytics/track", status_code=201)
async def track_analytics_event(
    request: AnalyticsTrackRequest,
    req: Request
):
    """
    Track analytics events from guest interactions
    Does NOT track admin views
    Privacy-focused: no cookies, no personal data
    """
    try:
        # Get IP address from request
        ip_address = req.client.host if req.client else "unknown"
        
        # Skip if this is an admin session (implement your admin detection logic)
        # For now, we'll accept all tracking and filter in summary
        
        # For PAGE_VIEW events, create ViewAnalytics record
        if request.event_type == AnalyticsEventType.PAGE_VIEW:
            # Get location data
            location = await get_ip_location(ip_address)
            
            # Check if unique visitor (first time seeing this session)
            existing_view = await db.view_analytics.find_one({
                "session_id": request.session_id,
                "profile_id": request.profile_id
            })
            is_unique = existing_view is None
            
            view_data = {
                "id": str(uuid.uuid4()),
                "profile_id": request.profile_id,
                "event_id": request.event_id,
                "session_id": request.session_id,
                "ip_address": ip_address,
                "country": location["country"],
                "city": location["city"],
                "device_type": request.device_type,
                "user_agent": request.user_agent,
                "viewed_at": datetime.now(timezone.utc),
                "is_unique_visitor": is_unique
            }
            await db.view_analytics.insert_one(view_data)
        
        # For all events, create EngagementAnalytics record
        engagement_data = {
            "id": str(uuid.uuid4()),
            "profile_id": request.profile_id,
            "event_id": request.event_id,
            "session_id": request.session_id,
            "event_type": request.event_type,
            "event_metadata": request.event_metadata,
            "time_spent_seconds": request.time_spent_seconds,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.engagement_analytics.insert_one(engagement_data)
        
        return {"message": "Event tracked successfully"}
        
    except Exception as e:
        logger.error(f"Error tracking analytics: {str(e)}")
        # Don't fail the request if analytics fails
        return {"message": "Event tracking skipped"}


@api_router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    profile_id: str,
    event_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: str = Depends(get_current_admin)
):
    """
    Get comprehensive analytics summary for admin dashboard
    Filters by profile, event, and date range
    """
    try:
        # Verify admin owns this profile
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        if profile["admin_id"] != admin:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # PHASE 33: Check analytics feature access
        if not has_feature(profile, Feature.ANALYTICS_BASIC):
            raise HTTPException(
                status_code=403,
                detail="Analytics feature not available on FREE plan. Please upgrade to SILVER or higher to access analytics."
            )
        
        # Build query filters
        view_filter = {"profile_id": profile_id}
        engagement_filter = {"profile_id": profile_id}
        
        if event_id:
            view_filter["event_id"] = event_id
            engagement_filter["event_id"] = event_id
        
        # Parse dates
        date_filter = {}
        if start_date:
            date_filter["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        if end_date:
            date_filter["$lte"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        
        if date_filter:
            view_filter["viewed_at"] = date_filter
            engagement_filter["timestamp"] = date_filter
        
        # === VIEW ANALYTICS ===
        views = list(await db.view_analytics.find(view_filter).to_list(length=10000))
        
        total_views = len(views)
        unique_visitors = len(set(v["session_id"] for v in views if v.get("is_unique_visitor")))
        repeat_visitors = total_views - unique_visitors
        
        # Device breakdown
        mobile_views = len([v for v in views if v.get("device_type") == "mobile"])
        desktop_views = len([v for v in views if v.get("device_type") == "desktop"])
        tablet_views = len([v for v in views if v.get("device_type") == "tablet"])
        
        # Top countries
        country_counts = defaultdict(int)
        for v in views:
            if v.get("country"):
                country_counts[v["country"]] += 1
        top_countries = [{"country": k, "count": v} for k, v in sorted(country_counts.items(), key=lambda x: x[1], reverse=True)[:10]]
        
        # Top cities
        city_counts = defaultdict(int)
        for v in views:
            if v.get("city"):
                city_counts[v["city"]] += 1
        top_cities = [{"city": k, "count": v} for k, v in sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:10]]
        
        # Views by date
        date_counts = defaultdict(int)
        for v in views:
            date_str = v["viewed_at"].strftime("%Y-%m-%d")
            date_counts[date_str] += 1
        views_by_date = [{"date": k, "count": v} for k, v in sorted(date_counts.items())]
        
        view_analytics = ViewAnalyticsData(
            total_views=total_views,
            unique_visitors=unique_visitors,
            repeat_visitors=repeat_visitors,
            mobile_views=mobile_views,
            desktop_views=desktop_views,
            tablet_views=tablet_views,
            top_countries=top_countries,
            top_cities=top_cities,
            views_by_date=views_by_date
        )
        
        # === ENGAGEMENT ANALYTICS ===
        engagements = list(await db.engagement_analytics.find(engagement_filter).to_list(length=10000))
        
        gallery_opens = len([e for e in engagements if e["event_type"] == "gallery_opened"])
        video_plays = len([e for e in engagements if e["event_type"] == "video_played"])
        music_unmutes = len([e for e in engagements if e["event_type"] == "music_unmuted"])
        map_opens = len([e for e in engagements if e["event_type"] == "map_opened"])
        rsvp_submissions = len([e for e in engagements if e["event_type"] == "rsvp_submitted"])
        scroll_25 = len([e for e in engagements if e["event_type"] == "scroll_25"])
        scroll_50 = len([e for e in engagements if e["event_type"] == "scroll_50"])
        scroll_75 = len([e for e in engagements if e["event_type"] == "scroll_75"])
        scroll_100 = len([e for e in engagements if e["event_type"] == "scroll_100"])
        
        # Average time spent
        time_spent_values = [e["time_spent_seconds"] for e in engagements if e.get("time_spent_seconds")]
        avg_time_spent = sum(time_spent_values) / len(time_spent_values) if time_spent_values else None
        
        engagement_analytics = EngagementAnalyticsData(
            gallery_opens=gallery_opens,
            video_plays=video_plays,
            music_unmutes=music_unmutes,
            map_opens=map_opens,
            rsvp_submissions=rsvp_submissions,
            scroll_25_percent=scroll_25,
            scroll_50_percent=scroll_50,
            scroll_75_percent=scroll_75,
            scroll_100_percent=scroll_100,
            avg_time_spent_seconds=avg_time_spent
        )
        
        # === RSVP ANALYTICS ===
        rsvp_filter = {"profile_id": profile_id}
        if event_id:
            rsvp_filter["event_id"] = event_id
        
        rsvps = list(await db.rsvps.find(rsvp_filter).to_list(length=10000))
        
        total_rsvps = len(rsvps)
        conversion_rate = (total_rsvps / total_views * 100) if total_views > 0 else 0
        
        # normalize_rsvp_status: rows store yes/no/maybe; the old literal
        # 'accepted/pending' comparisons matched nothing, ever.
        accepted_count = len([r for r in rsvps if normalize_rsvp_status(r.get("status")) == "yes"])
        declined_count = len([r for r in rsvps if normalize_rsvp_status(r.get("status")) == "no"])
        pending_count = len([r for r in rsvps if normalize_rsvp_status(r.get("status")) == "maybe"])

        # RSVP by event (response keys keep the legacy accepted/declined/pending
        # names the frontend reads; the mapping from stored values is normalized)
        _bucket = {"yes": "accepted", "no": "declined", "maybe": "pending"}
        event_rsvp_counts = defaultdict(lambda: {"accepted": 0, "declined": 0, "pending": 0})
        for r in rsvps:
            event_id_key = r.get("event_id", "unknown")
            event_rsvp_counts[event_id_key][_bucket[normalize_rsvp_status(r.get("status"))]] += 1
        
        # Get event names
        rsvp_by_event = []
        for eid, counts in event_rsvp_counts.items():
            event = await db.event_invitations.find_one({"id": eid})
            event_name = event.get("event_name", "Unknown Event") if event else "Unknown Event"
            rsvp_by_event.append({
                "event_id": eid,
                "event_name": event_name,
                "accepted": counts["accepted"],
                "declined": counts["declined"],
                "pending": counts["pending"]
            })
        
        # Peak RSVP time
        rsvp_time_counts = defaultdict(int)
        for r in rsvps:
            if r.get("created_at"):
                dt = r["created_at"]
                date_str = dt.strftime("%Y-%m-%d")
                hour = dt.hour
                key = f"{date_str}_{hour}"
                rsvp_time_counts[key] += 1
        
        peak_rsvp_time = None
        if rsvp_time_counts:
            peak_key = max(rsvp_time_counts, key=rsvp_time_counts.get)
            date_str, hour_str = peak_key.split("_")
            peak_rsvp_time = {
                "date": date_str,
                "hour": int(hour_str),
                "count": rsvp_time_counts[peak_key]
            }
        
        rsvp_analytics = RSVPAnalyticsData(
            total_views=total_views,
            total_rsvps=total_rsvps,
            conversion_rate=round(conversion_rate, 2),
            accepted_count=accepted_count,
            declined_count=declined_count,
            pending_count=pending_count,
            rsvp_by_event=rsvp_by_event,
            peak_rsvp_time=peak_rsvp_time
        )
        
        # Build response
        return AnalyticsSummaryResponse(
            profile_id=profile_id,
            date_range={
                "start": start_date,
                "end": end_date
            },
            views=view_analytics,
            engagement=engagement_analytics,
            rsvp=rsvp_analytics
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analytics summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analytics/export")
async def export_analytics_csv(
    profile_id: str,
    event_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: str = Depends(get_current_admin)
):
    """
    Export analytics data as CSV file
    Includes views, engagement, and RSVP data
    """
    try:
        # Verify admin owns this profile
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        if profile["admin_id"] != admin:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Get summary data
        summary = await get_analytics_summary(
            profile_id=profile_id,
            event_id=event_id,
            start_date=start_date,
            end_date=end_date,
            admin=admin
        )
        
        # Build CSV content
        csv_lines = []
        csv_lines.append("Wedding Invitation Analytics Report")
        csv_lines.append(f"Profile ID: {profile_id}")
        csv_lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        csv_lines.append("")
        
        # Views
        csv_lines.append("VIEW ANALYTICS")
        csv_lines.append(f"Total Views,{summary.views.total_views}")
        csv_lines.append(f"Unique Visitors,{summary.views.unique_visitors}")
        csv_lines.append(f"Repeat Visitors,{summary.views.repeat_visitors}")
        csv_lines.append(f"Mobile Views,{summary.views.mobile_views}")
        csv_lines.append(f"Desktop Views,{summary.views.desktop_views}")
        csv_lines.append(f"Tablet Views,{summary.views.tablet_views}")
        csv_lines.append("")
        
        # Top countries
        csv_lines.append("TOP COUNTRIES")
        csv_lines.append("Country,Views")
        for item in summary.views.top_countries:
            csv_lines.append(f"{item['country']},{item['count']}")
        csv_lines.append("")
        
        # Engagement
        csv_lines.append("ENGAGEMENT ANALYTICS")
        csv_lines.append(f"Gallery Opens,{summary.engagement.gallery_opens}")
        csv_lines.append(f"Video Plays,{summary.engagement.video_plays}")
        csv_lines.append(f"Music Unmutes,{summary.engagement.music_unmutes}")
        csv_lines.append(f"Map Opens,{summary.engagement.map_opens}")
        csv_lines.append(f"RSVP Submissions,{summary.engagement.rsvp_submissions}")
        csv_lines.append(f"Scrolled 25%,{summary.engagement.scroll_25_percent}")
        csv_lines.append(f"Scrolled 50%,{summary.engagement.scroll_50_percent}")
        csv_lines.append(f"Scrolled 75%,{summary.engagement.scroll_75_percent}")
        csv_lines.append(f"Scrolled 100%,{summary.engagement.scroll_100_percent}")
        if summary.engagement.avg_time_spent_seconds:
            csv_lines.append(f"Avg Time Spent (seconds),{summary.engagement.avg_time_spent_seconds:.1f}")
        csv_lines.append("")
        
        # RSVP
        csv_lines.append("RSVP ANALYTICS")
        csv_lines.append(f"Total RSVPs,{summary.rsvp.total_rsvps}")
        csv_lines.append(f"Conversion Rate,{summary.rsvp.conversion_rate}%")
        csv_lines.append(f"Accepted,{summary.rsvp.accepted_count}")
        csv_lines.append(f"Declined,{summary.rsvp.declined_count}")
        csv_lines.append(f"Pending,{summary.rsvp.pending_count}")
        csv_lines.append("")
        
        # RSVP by event
        csv_lines.append("RSVP BY EVENT")
        csv_lines.append("Event,Accepted,Declined,Pending")
        for item in summary.rsvp.rsvp_by_event:
            csv_lines.append(f"{item['event_name']},{item['accepted']},{item['declined']},{item['pending']}")
        
        csv_content = "\n".join(csv_lines)
        
        # Return as downloadable file
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=analytics_{profile_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting analytics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PHASE 31: SEO, SOCIAL SHARING & DISCOVERY
# ============================================================================

def _public_base_url() -> str:
    """The canonical PUBLIC origin for crawler-facing URLs (robots + sitemap).

    Must match the canonical the pages themselves emit (portfolio_seo.SITE) or
    Google rejects the sitemap for listing URLs on a different host. The old code
    derived this from REACT_APP_BACKEND_URL and did `.replace(':8001', ':3000')`,
    which — when the env var was unset or was the API origin — put localhost / the
    wrong host into the PRODUCTION sitemap. Prefer an explicit PUBLIC_BASE_URL,
    fall back to the cleaned backend URL, and finally to the live domain.
    """
    base = (os.environ.get('PUBLIC_BASE_URL')
            or os.environ.get('REACT_APP_BACKEND_URL')
            or 'https://majainvites.com')
    base = base.strip().rstrip('/')
    if base.endswith('/api'):
        base = base[:-4]
    # Never emit a localhost origin in crawler files.
    if 'localhost' in base or '127.0.0.1' in base:
        return 'https://majainvites.com'
    return base


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    """Serve robots.txt — allow public pages (invitations, portfolios, landing),
    keep the private panels and the API out of the index."""
    base_url = _public_base_url()
    robots_content = f"""User-agent: *
Allow: /
Disallow: /api/
Disallow: /studio
Disallow: /studio/
Disallow: /super-admin
Disallow: /super-admin/
Disallow: /admin
Disallow: /admin/
Disallow: /order/
Disallow: /cart
Sitemap: {base_url}/sitemap.xml
"""
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=robots_content, media_type="text/plain")


@api_router.post("/csp-report", include_in_schema=False)
async def csp_report(request: Request):
    """Sink for Content-Security-Policy-Report-Only violations (Caddy sets
    report-uri /api/csp-report). Logged so we can see what an ENFORCED policy
    would break before switching the header from -Report-Only to enforcing.
    Never trusts the body for anything but logging. Always 204."""
    from fastapi.responses import Response
    try:
        body = await request.json()
        rep = body.get("csp-report", body) if isinstance(body, dict) else {}
        logger.warning(
            "CSP-Report violated=%s blocked=%s doc=%s",
            rep.get("violated-directive") or rep.get("effective-directive"),
            rep.get("blocked-uri"),
            rep.get("document-uri"),
        )
    except Exception:
        pass
    return Response(status_code=204)


@api_router.post("/client-error", include_in_schema=False)
async def client_error(request: Request):
    """Sink for uncaught frontend errors (frontend-v2 src/lib/reportError.js).

    The legacy app shipped Sentry; this build has no third-party agent, so the
    SPA's ErrorBoundary + global handlers POST here instead. That keeps the
    reporting path inside 'self' — no CSP change, no vendor bundle.

    Untrusted input: every field is truncated and only ever logged, never
    stored, echoed or interpolated into a query. Always 204 so a reporting
    failure can never cascade into a visible error. Rate limiting is handled
    client-side (10/session, 5s dedupe) and by the shared body-cap middleware.
    """
    from fastapi.responses import Response
    try:
        body = await request.json()
        if not isinstance(body, dict):
            return Response(status_code=204)

        def _clip(key, limit):
            v = body.get(key)
            return str(v)[:limit] if v else ""

        logger.error(
            "ClientError name=%s msg=%s url=%s ua=%s\nstack=%s\ncomponents=%s",
            _clip("name", 80),
            _clip("message", 500),
            _clip("url", 500),
            _clip("user_agent", 300),
            _clip("stack", 4000),
            _clip("component_stack", 4000),
        )
    except Exception:
        pass
    return Response(status_code=204)


# ─────────────────────────────────────────────────────────────────────
# H1 fix (Phase-2 audit) — Open Graph meta tags for share crawlers.
#
# When WhatsApp / Facebook / Twitter / LinkedIn / Telegram fetch an
# invitation share link they need `og:*` + `twitter:*` meta tags so the
# rich preview card renders with the couple's photo, names and venue.
# `frontend/public/index.html` has no `og:` tags, so React shares show
# the generic SaaS title.
#
# Implementation: a top-level route at `/invite/{slug}` (no /api prefix)
# AND a mirror at `/api/og/invite/{slug}` (always reachable through the
# k8s ingress). Both inspect the User-Agent header:
#   • Share crawler  → minimal HTML response with og/twitter meta
#   • Everyone else  → HTML that meta-refreshes / JS-redirects to the
#     React SPA path so end-users still see the full invitation UI.
# ─────────────────────────────────────────────────────────────────────
_SHARE_CRAWLER_UAS = (
    "whatsapp", "facebookexternalhit", "facebot",
    "twitterbot", "linkedinbot", "telegrambot", "tg-bot",
    "slackbot", "discordbot", "embedly", "pinterest",
    "skypeuripreview", "vkshare", "redditbot", "applebot",
)


def _is_share_crawler(user_agent: str) -> bool:
    ua = (user_agent or "").lower()
    return any(token in ua for token in _SHARE_CRAWLER_UAS)


def _abs_image_url(url: Optional[str], request: Optional[Request] = None) -> str:
    """Make a best-effort absolute URL out of whatever the profile stored.
    Crawlers reject relative og:image values.

    Order of preference for the base URL:
      1. `PUBLIC_BASE_URL` env var (explicit deployment override)
      2. `portfolio_seo.SITE` — the public https origin every other crawler
         renderer canonicalises against
      3. `request.base_url` — last, not first. Behind the proxy it can be the
         internal origin or `http://`, and an og:image on a different origin
         (or plain http on an https page) is quietly dropped by scrapers. The
         Caddy stack serves /api/* on the same public domain, so SITE + /api
         resolves correctly for uploads.
      4. `REACT_APP_BACKEND_URL` (legacy)
    """
    if not url:
        return ""
    if url.startswith(("http://", "https://", "data:")):
        return url

    base = (os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")
    if not base:
        try:
            from portfolio_seo import SITE as _SITE
            base = _SITE.rstrip("/")
        except Exception:
            base = ""
    if not base and request is not None:
        try:
            base = str(request.base_url).rstrip("/")
        except Exception:
            base = ""
    if not base:
        base = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
    if not base:
        return url
    if url.startswith("/uploads/"):
        return f"{base}/api{url}"
    if url.startswith("/"):
        return f"{base}{url}"
    return f"{base}/{url}"


async def _render_og_for_slug(slug: str, request: Request):
    """Return either an OG-meta HTML (crawler) or a meta-refresh redirect
    to the SPA path (human visitor). Never raises — if the slug is
    unknown we still return a generic share card so the crawler shows
    *something* and the human gets a 404 from the SPA."""
    from fastapi.responses import HTMLResponse

    # Number-aware: a canonical /invite/00001 share resolves by number, else slug.
    # A draft reachable only by its (random) slug must not surface an OG card by
    # its guessable number, so hide it for the numeric case.
    profile = await _resolve_public_profile(slug)
    if profile and slug.isdigit() and not _is_publicly_visible(profile):
        profile = None

    ua = request.headers.get("user-agent", "")
    # `_is_crawler`, not `_is_share_crawler`.
    #
    # This route tested SHARE scrapers only (WhatsApp, Facebook, Twitter…), so
    # Googlebot fell into the human branch and was served
    #     <meta http-equiv="refresh" content="0;url=/invite/{slug}">
    # pointing at the URL it had just fetched — a self-redirect. Caddy sends
    # googlebot here, and 17 invitations are in the sitemap, so Google was being
    # asked to crawl pages that redirect to themselves. Every other renderer in
    # this file uses `_is_crawler` (share scrapers OR search engines); this one
    # was the outlier.
    #
    # Honours the SEO_BOT_RENDER_DISABLED kill switch like the others do, which
    # this route also never did.
    _seo_off = str(os.environ.get("SEO_BOT_RENDER_DISABLED", "")).lower() in ("1", "true", "yes")
    is_bot = (not _seo_off) and _is_crawler(ua)

    # Defined here so the "unknown slug" branch below can be handled the same
    # way: no date and no venue means no Event JSON-LD, which is correct.
    date_str = ""
    venue_line = ""

    if profile:
        groom = profile.get("groom_name") or ""
        bride = profile.get("bride_name") or ""
        celebrant = (profile.get("celebrant_info") or {}).get("celebrant_name") or ""
        if groom and bride:
            couple_name = f"{groom} & {bride}"
        elif celebrant:
            couple_name = celebrant
        else:
            couple_name = profile.get("title") or ""
        # Warm, invitation-style share card — reads like an invitation, not a
        # SaaS page. Couple/celebrant names lead. No emoji (they tofu on some
        # clients and the couple wanted it clean and professional).
        title = f"{couple_name} — You're Invited" if couple_name else "You're Invited"
        venue = profile.get("venue") or ""
        city = profile.get("city") or ""
        venue_line = " · ".join([s for s in (venue, city) if s])
        event_date = profile.get("event_date")
        if event_date:
            try:
                if isinstance(event_date, str):
                    date_str = event_date[:10]
                else:
                    date_str = event_date.strftime("%d %b %Y")
            except Exception:
                date_str = ""
        who = couple_name or "You're invited"
        base_desc = f"{who} — we'd love to celebrate this special day with you."
        description = f"{base_desc} · {date_str}" if date_str else base_desc
        # Prefer the real invitation artwork / a couple photo over any generic
        # image. An explicit share/OG override wins; then real photos; then a
        # per-design artwork fallback (bespoke designs ship their hero as a
        # static asset and carry no couple_photo_url).
        # A dedicated 1200×630 JPEG (~90KB) — WhatsApp/Facebook silently DROP an
        # og:image over a few hundred KB, which is why the 3.2MB hero PNG rendered
        # no card. share-card.jpg is the poster framed for the social aspect ratio.
        DESIGN_SHARE_IMAGE = {"engagement_saivamsi": "/engagement/share-card.jpg"}
        image = _abs_image_url(
            profile.get("share_image_url")
            or profile.get("og_image_url")
            or profile.get("couple_photo_url")
            or profile.get("bride_photo_url")
            or profile.get("groom_photo_url")
            or profile.get("cover_photo_url")
            or DESIGN_SHARE_IMAGE.get(profile.get("design_id") or "", "")
            or "",
            request=request,
        )
    else:
        title = "Invitation · MAJA"
        description = "Open your invitation."
        image = ""

    # The site origin, not request.base_url. Every other crawler renderer here
    # canonicalises against portfolio_seo.SITE; this one derived the base from
    # the incoming request, which behind the proxy can yield the internal
    # origin or `http://` — and a canonical that is not the public https URL is
    # a canonical Google discards.
    try:
        from portfolio_seo import SITE as _SITE
        base_for_canonical = _SITE.rstrip("/")
    except Exception:
        base_for_canonical = (os.environ.get("PUBLIC_BASE_URL")
                              or str(getattr(request, "base_url", ""))
                              or "").rstrip("/")
    canonical = f"{base_for_canonical}/invite/{slug}"

    # An invitation link is shared with a query string more often than not —
    # `?ref=CODE` from the referral CTA under the sign-off, plus whatever
    # WhatsApp and the QR plates append. Without a canonical each variant is a
    # separate URL to a crawler, so one invitation becomes N competing pages.
    # `og:url` alone does not do this; only <link rel="canonical"> does.
    canonical_block = f'<link rel="canonical" href="{canonical}">'

    # Structured data, built ONLY from what the couple actually filled in. No
    # date means no Event node — an Event without startDate is invalid schema,
    # and guessing one would put a wrong date in a search result.
    json_ld_block = ""
    if profile and date_str:
        _event: Dict[str, Any] = {
            "@context": "https://schema.org",
            "@type": "Event",
            "name": title,
            "startDate": date_str,
            "url": canonical,
            "eventStatus": "https://schema.org/EventScheduled",
            "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        }
        if venue_line:
            _event["location"] = {"@type": "Place", "name": venue_line}
        if image:
            _event["image"] = image
        json_ld_block = ('<script type="application/ld+json">'
                         + json.dumps(_event, ensure_ascii=False) + "</script>")

    # Minimal HTML — crawlers parse only <head>, humans get a redirect.
    redirect_block = "" if is_bot else (
        f'<meta http-equiv="refresh" content="0;url=/invite/{slug}">'
        f'<script>window.location.replace("/invite/{slug}");</script>'
    )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
{canonical_block}
<meta property="og:type" content="website">
<meta property="og:site_name" content="MAJA Invites">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{canonical}">
{('<meta property="og:image" content="' + image + '">') if image else ''}
<meta name="twitter:card" content="{'summary_large_image' if image else 'summary'}">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
{('<meta name="twitter:image" content="' + image + '">') if image else ''}
{json_ld_block}
{redirect_block}
</head>
<body><p>Opening your invitation… <a href="/invite/{slug}">Tap here if it doesn't redirect.</a></p></body>
</html>"""
    return HTMLResponse(content=html, status_code=200)


@app.get("/invite/{slug}", include_in_schema=False)
async def og_intercept_invite(slug: str, request: Request):
    """Top-level intercept for share crawlers. Ingress may route this to
    the frontend in some envs; when it does reach the backend, we serve
    OG-meta HTML so WhatsApp/FB/Twitter render rich previews."""
    return await _render_og_for_slug(slug, request)


@app.get("/invite/{ident}/{name_slug}", include_in_schema=False)
async def og_intercept_invite_named(ident: str, name_slug: str, request: Request):
    """OG intercept for the CANONICAL number+name URL (/invite/00001/sai-sai) and
    for any /invite/<id>/<sub> a crawler scrapes. The second segment is cosmetic;
    resolution is on the first segment only (via _render_og_for_slug's
    number-or-slug resolver). Without this, a share of the canonical URL lost its
    rich preview. This is the app-level (crawler) route — the JSON per-ceremony
    endpoint lives under /api/invite/{slug}/{event_type} and is unaffected."""
    return await _render_og_for_slug(ident, request)


@api_router.get("/og/invite/{slug}", include_in_schema=False)
async def og_meta_invite(slug: str, request: Request):
    """Always-reachable mirror through the standard /api ingress path.
    Use this URL in social share buttons / messaging templates so
    crawlers consistently hit the OG handler regardless of how the
    ingress is wired."""
    return await _render_og_for_slug(slug, request)


# ─────────────────────────────────────────────────────────────────────
# Portfolio SEO / OG for crawlers (dynamic rendering).
#
# A photographer's portfolio (/photographer/{slug}/portfolio) is a public
# business website — it must (a) rank on Google and (b) show a rich preview
# when its link is shared. The React SPA injects those tags with JS, which
# search bots run but SOCIAL scrapers (WhatsApp/FB/Twitter) do NOT — so shares
# previewed blank. Caddy routes crawler user-agents for this path to the gateway
# (see microservices/Caddyfile); this renders real <head> meta + LocalBusiness
# JSON-LD for them. Humans keep getting the SPA. Kill switch: set
# SEO_BOT_RENDER_DISABLED=1 to fall back to a plain redirect for everyone.
# ─────────────────────────────────────────────────────────────────────
_SEARCH_CRAWLER_UAS = (
    "googlebot", "bingbot", "yandexbot", "duckduckbot", "baiduspider",
    "sogou", "exabot", "petalbot", "google-inspectiontool", "bingpreview",
)


def _is_crawler(user_agent: str) -> bool:
    """True for a search engine OR a social share scraper."""
    ua = (user_agent or "").lower()
    return (any(t in ua for t in _SHARE_CRAWLER_UAS)
            or any(t in ua for t in _SEARCH_CRAWLER_UAS))


async def _render_og_for_portfolio(slug: str, request: Request):
    """Crawler-facing HTML for a studio/photographer portfolio: real <title>,
    description, canonical, Open Graph + Twitter tags and (premium) JSON-LD.
    Humans are redirected into the SPA. Never raises."""
    import html as _html
    import json as _json
    from fastapi.responses import HTMLResponse

    disabled = str(os.environ.get("SEO_BOT_RENDER_DISABLED", "")).lower() in ("1", "true", "yes")
    ua = request.headers.get("user-agent", "")
    is_bot = (not disabled) and _is_crawler(ua)
    spa_path = f"/photographer/{slug}"

    try:
        from portfolio_service import resolve_public_portfolio_seo
        meta = await resolve_public_portfolio_seo(db, slug)
    except Exception:
        logger.warning("[portfolio-og] resolve failed for %s", slug, exc_info=True)
        meta = {"title": "Photographer Portfolio · MAJA",
                "description": "Discover wedding photographers and studios on MAJA.",
                "keywords": [], "canonical": "", "og_image": "", "json_ld": None}

    canonical_val = meta.get("canonical") or ""
    if not canonical_val:
        try:
            canonical_val = str(request.base_url).rstrip("/") + spa_path
        except Exception:
            canonical_val = ""

    esc = lambda s: _html.escape(str(s or ""), quote=True)
    title = esc(meta.get("title") or "Photographer Portfolio · MAJA")
    desc = esc(meta.get("description") or "")
    canonical = esc(canonical_val)
    image = esc(meta.get("og_image") or "")
    keywords = esc(", ".join(meta.get("keywords") or []))

    json_ld_block = ""
    if meta.get("json_ld"):
        # Escape `<` so the JSON can never break out of the <script> tag.
        safe = _json.dumps(meta["json_ld"], ensure_ascii=False).replace("<", "\\u003c")
        json_ld_block = f'<script type="application/ld+json">{safe}</script>'

    redirect_block = "" if is_bot else (
        f'<meta http-equiv="refresh" content="0;url={spa_path}">'
        f'<script>window.location.replace("{spa_path}");</script>'
    )

    # A portfolio the studio has not written anything into yet is thin content.
    # The page stays live and shareable; it just does not ask to be ranked until
    # there is something on it. `follow` so any links on it are still crawled.
    robots_block = "" if meta.get("indexable", True) else         '<meta name="robots" content="noindex,follow">'

    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<meta name="description" content="{desc}">
{robots_block}
{('<meta name="keywords" content="' + keywords + '">') if keywords else ''}
{('<link rel="canonical" href="' + canonical + '">') if canonical else ''}
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
{('<meta property="og:url" content="' + canonical + '">') if canonical else ''}
{('<meta property="og:image" content="' + image + '">') if image else ''}
<meta name="twitter:card" content="{'summary_large_image' if image else 'summary'}">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
{('<meta name="twitter:image" content="' + image + '">') if image else ''}
{json_ld_block}
{redirect_block}
</head>
<body><p>Opening portfolio… <a href="{spa_path}">Tap here if it doesn't redirect.</a></p></body>
</html>"""
    return HTMLResponse(content=html_doc, status_code=200)


@app.get("/photographer/{slug}", include_in_schema=False)
async def og_intercept_portfolio_canonical(slug: str, request: Request):
    """THE canonical portfolio URL — and until now the only one with no route.

    portfolio_seo.resolve_seo emits `{SITE}/photographer/{slug}` as the
    canonical (the SPA dropped the /portfolio suffix), the sitemap lists that
    same URL, and Caddy routes `/photographer/*` crawler traffic straight here.
    Only `/photographer/{slug}/portfolio` was ever registered, so Googlebot
    following either the sitemap or the page's own canonical got a **404 JSON
    body**. Every portfolio in the sitemap was unreachable to a crawler.
    """
    return await _render_og_for_portfolio(slug, request)


@app.get("/photographer/{slug}/portfolio", include_in_schema=False)
async def og_intercept_portfolio(slug: str, request: Request):
    """The legacy URL, kept because it was shared with clients and indexed
    before the suffix was dropped. Renders the same metadata, whose canonical
    points at the route above — which is the point of having both."""
    return await _render_og_for_portfolio(slug, request)


@api_router.get("/og/photographer/{slug}", include_in_schema=False)
async def og_meta_portfolio(slug: str, request: Request):
    """Always-reachable /api mirror for share buttons + testing."""
    return await _render_og_for_portfolio(slug, request)


# ─────────────────────────────────────────────────────────────────────
# Discovery pages (category / location / combined) — crawler rendering.
# Caddy routes crawler UAs for /photographers/* to the gateway → here; humans
# get the SPA discovery page. Emits the page's SEO + CollectionPage/ItemList
# JSON-LD, and honours the same >= threshold: a thin page renders `noindex`.
# ─────────────────────────────────────────────────────────────────────
def _first_listing_image(photographers: Optional[list]) -> str:
    """First real photo from a directory listing, for the page's og:image.

    Directory pages had no share image at all, so every link to
    /photographers or /photographers/{city} previewed as a bare text card —
    on a page whose entire content is photography. The listings already carry
    `portfolio_images` (photographer_directory.py), so nothing new is fetched.

    Demo rows are skipped: a seeded stock photo must not become the face of a
    real city page. Returns "" when there is nothing genuine to show, and the
    renderer then omits the tag rather than pointing at a placeholder.

    ABSOLUTE, always. Listings store `/uploads/...` paths, and a crawler
    fetching og:image by URL cannot resolve a relative one — it drops the image
    silently, which looks identical to having none.
    """
    try:
        from portfolio_seo import SITE as _SITE
    except Exception:
        _SITE = "https://majainvites.com"
    for p in (photographers or []):
        if p.get("is_demo"):
            continue
        for img in (p.get("portfolio_images") or []):
            img = str(img or "").strip()
            if img.startswith(("http://", "https://")):
                return img
            if img.startswith("/"):
                return f"{_SITE.rstrip('/')}{img}"
    return ""


async def _render_og_for_discovery(a: str, b: Optional[str], request: Request):
    import html as _html
    import json as _json
    from fastapi.responses import HTMLResponse

    disabled = str(os.environ.get("SEO_BOT_RENDER_DISABLED", "")).lower() in ("1", "true", "yes")
    ua = request.headers.get("user-agent", "")
    is_bot = (not disabled) and _is_crawler(ua)
    spa_path = f"/photographers/{a}" + (f"/{b}" if b else "")

    page = None
    try:
        from photographer_directory import resolve_discovery_page
        page = await resolve_discovery_page(db, a, b)
    except Exception:
        logger.warning("[discovery-og] resolve failed for %s/%s", a, b, exc_info=True)

    if page:
        seo = page["seo"]
        title = seo["title"]
        desc = seo["description"]
        canonical = seo["canonical"]
        indexable = bool(page["indexable"])
        json_ld = page["json_ld"]
        og_image = _first_listing_image(page.get("photographers"))
    else:
        # Unknown discovery page: don't invent a listing. Point at the directory,
        # and keep it out of the index.
        title = "Photographers | MAJA Invites"
        desc = "Browse wedding & event photographers on MAJA."
        try:
            canonical = str(request.base_url).rstrip("/") + "/photographers"
        except Exception:
            canonical = ""
        indexable = False
        json_ld = None
        og_image = ""
        spa_path = "/photographers"

    esc = lambda s: _html.escape(str(s or ""), quote=True)
    title_e, desc_e, canon_e = esc(title), esc(desc), esc(canonical)
    img_e = esc(og_image)
    image_block = (f'<meta property="og:image" content="{img_e}">'
                   f'<meta name="twitter:image" content="{img_e}">') if img_e else ""

    json_ld_block = ""
    if json_ld:
        safe = _json.dumps(json_ld, ensure_ascii=False).replace("<", "\\u003c")
        json_ld_block = f'<script type="application/ld+json">{safe}</script>'
    robots_block = "" if indexable else '<meta name="robots" content="noindex, follow">'
    redirect_block = "" if is_bot else (
        f'<meta http-equiv="refresh" content="0;url={spa_path}">'
        f'<script>window.location.replace("{spa_path}");</script>'
    )

    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title_e}</title>
<meta name="description" content="{desc_e}">
{robots_block}
{('<link rel="canonical" href="' + canon_e + '">') if canon_e else ''}
<meta property="og:type" content="website">
<meta property="og:title" content="{title_e}">
<meta property="og:description" content="{desc_e}">
{('<meta property="og:url" content="' + canon_e + '">') if canon_e else ''}
{image_block}
<meta name="twitter:card" content="{'summary_large_image' if img_e else 'summary'}">
<meta name="twitter:title" content="{title_e}">
<meta name="twitter:description" content="{desc_e}">
{json_ld_block}
{redirect_block}
</head>
<body><p>Opening photographers… <a href="{spa_path}">Tap here if it doesn't redirect.</a></p></body>
</html>"""
    return HTMLResponse(content=html_doc, status_code=200)


@app.get("/photographers/{a}", include_in_schema=False)
async def og_intercept_discovery_single(a: str, request: Request):
    return await _render_og_for_discovery(a, None, request)


@app.get("/photographers/{a}/{b}", include_in_schema=False)
async def og_intercept_discovery_combined(a: str, b: str, request: Request):
    return await _render_og_for_discovery(a, b, request)


@api_router.get("/og/photographers/{a}", include_in_schema=False)
async def og_meta_discovery_single(a: str, request: Request):
    """Always-reachable /api mirror for testing."""
    return await _render_og_for_discovery(a, None, request)


@api_router.get("/og/photographers/{a}/{b}", include_in_schema=False)
async def og_meta_discovery_combined(a: str, b: str, request: Request):
    return await _render_og_for_discovery(a, b, request)


# ─────────────────────────────────────────────────────────────────────
# Design catalogue — crawler rendering for /browse, /themes/* and
# /preview/design/*. The sitemap advertises 259 of these; without this they
# would serve the SPA shell to a crawler — one generic title, no description,
# no image — which teaches Google the site is thin. Humans fall through to the
# SPA and never see any of it. See backend/design_seo.py.
# ─────────────────────────────────────────────────────────────────────
async def _render_design_seo(meta: Dict[str, Any], request: Request):
    """Shared renderer for every design-catalogue page. `meta` comes from
    design_seo.{design,collection,browse}_meta and always carries a usable
    title/description/canonical, so a shared link never previews blank."""
    import html as _html
    import json as _json
    from fastapi.responses import HTMLResponse

    disabled = str(os.environ.get("SEO_BOT_RENDER_DISABLED", "")).lower() in ("1", "true", "yes")
    is_bot = (not disabled) and _is_crawler(request.headers.get("user-agent", ""))
    spa_path = meta.get("spa_path") or "/browse"

    e = _html.escape
    title_e, desc_e = e(meta.get("title") or ""), e(meta.get("description") or "")
    canon_e, img_e = e(meta.get("canonical") or ""), e(meta.get("og_image") or "")

    json_ld_block = ""
    if meta.get("json_ld"):
        json_ld_block = ('<script type="application/ld+json">'
                         + _json.dumps(meta["json_ld"], ensure_ascii=False)
                         + "</script>")
    # A page with no designs behind it is thin; say so rather than ask Google to
    # rank an empty grid.
    robots_block = '<meta name="robots" content="noindex,follow">' if meta.get("noindex") else ""
    image_block = (f'<meta property="og:image" content="{img_e}">'
                   f'<meta name="twitter:image" content="{img_e}">') if img_e else ""
    card = "summary_large_image" if img_e else "summary"
    # Humans only reach this when Caddy misroutes or they hit the /api mirror
    # directly — send them into the app rather than leaving them on a stub.
    redirect_block = "" if is_bot else (
        f'<meta http-equiv="refresh" content="0; url={e(spa_path)}">')

    return HTMLResponse(status_code=200, content=f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title_e}</title>
<meta name="description" content="{desc_e}">
<link rel="canonical" href="{canon_e}">
{robots_block}
<meta property="og:type" content="website">
<meta property="og:site_name" content="MAJA Invites">
<meta property="og:title" content="{title_e}">
<meta property="og:description" content="{desc_e}">
<meta property="og:url" content="{canon_e}">
{image_block}
<meta name="twitter:card" content="{card}">
<meta name="twitter:title" content="{title_e}">
<meta name="twitter:description" content="{desc_e}">
{json_ld_block}
{redirect_block}
</head>
<body><p>Opening designs… <a href="{e(spa_path)}">Tap here if it doesn't redirect.</a></p></body>
</html>""")


@app.get("/browse", include_in_schema=False)
async def og_intercept_browse(request: Request):
    import design_seo
    return await _render_design_seo(design_seo.browse_meta(), request)


@app.get("/preview/design/{code}", include_in_schema=False)
async def og_intercept_design(code: str, request: Request):
    import design_seo
    return await _render_design_seo(design_seo.design_meta(code), request)


@app.get("/themes/{theme_id}", include_in_schema=False)
async def og_intercept_collection(theme_id: str, request: Request):
    import design_seo
    return await _render_design_seo(design_seo.collection_meta(theme_id), request)


@app.get("/themes/{theme_id}/events/{ceremony}", include_in_schema=False)
async def og_intercept_collection_ceremony(theme_id: str, ceremony: str, request: Request):
    import design_seo
    return await _render_design_seo(design_seo.collection_meta(theme_id, ceremony), request)


@app.get("/themes/{theme_id}/{view}", include_in_schema=False)
async def og_intercept_collection_view(theme_id: str, view: str, request: Request):
    """`/themes/{id}/gallery` and `/themes/{id}/events` are real SPA routes, and
    Caddy hands the whole of `/themes/*` to this backend for crawler UAs — so
    both answered 404 to Googlebot while rendering fine for humans.

    They are alternate VIEWS of one collection, not separate pages, so they
    render the collection's metadata. The canonical inside it already points at
    `/themes/{id}`, which is what stops them being indexed as duplicates.
    """
    import design_seo
    return await _render_design_seo(design_seo.collection_meta(theme_id), request)


# Always-reachable /api mirrors, for share buttons and for testing the rendering
# without having to spoof a crawler user-agent through the edge.
@api_router.get("/og/browse", include_in_schema=False)
async def og_meta_browse(request: Request):
    import design_seo
    return await _render_design_seo(design_seo.browse_meta(), request)


@api_router.get("/og/design/{code}", include_in_schema=False)
async def og_meta_design(code: str, request: Request):
    import design_seo
    return await _render_design_seo(design_seo.design_meta(code), request)


@api_router.get("/og/collection/{theme_id}", include_in_schema=False)
async def og_meta_collection(theme_id: str, request: Request):
    import design_seo
    return await _render_design_seo(design_seo.collection_meta(theme_id), request)


@api_router.get("/og/collection/{theme_id}/{ceremony}", include_in_schema=False)
async def og_meta_collection_ceremony(theme_id: str, ceremony: str, request: Request):
    import design_seo
    return await _render_design_seo(design_seo.collection_meta(theme_id, ceremony), request)


async def _render_og_for_directory_index(request: Request):
    """Crawler rendering for the DIRECTORY ROOT (/photographers). The Caddy rule
    matched /photographers/* (the discovery pages) but not the bare index, so the
    index was client-rendered only for bots. Same pipeline: real <head> meta +
    CollectionPage/ItemList of the listed photographers. Always indexable."""
    import html as _html
    import json as _json
    from fastapi.responses import HTMLResponse

    disabled = str(os.environ.get("SEO_BOT_RENDER_DISABLED", "")).lower() in ("1", "true", "yes")
    ua = request.headers.get("user-agent", "")
    is_bot = (not disabled) and _is_crawler(ua)

    try:
        from portfolio_seo import SITE as _SITE
    except Exception:
        _SITE = "https://majainvites.com"
    canonical = f"{_SITE}/photographers"
    title = "Wedding & Event Photographers in India | MAJA Invites"
    desc = ("Browse verified wedding & event photographers and studios on MAJA — "
            "compare portfolios, styles, packages, availability and real client reviews.")

    json_ld = None
    og_image = ""
    try:
        from photographer_directory import query_directory
        from discovery import collection_jsonld
        res = await query_directory(db)
        photographers = [p for p in res["photographers"] if not p.get("is_demo")]
        json_ld = collection_jsonld({}, photographers,
                                    {"title": title, "description": desc, "canonical": canonical})
        og_image = _first_listing_image(photographers)
    except Exception:
        logger.warning("[directory-index-og] build failed", exc_info=True)

    esc = lambda s: _html.escape(str(s or ""), quote=True)
    title_e, desc_e, canon_e = esc(title), esc(desc), esc(canonical)
    img_e = esc(og_image)
    image_block = (f'<meta property="og:image" content="{img_e}">'
                   f'<meta name="twitter:image" content="{img_e}">') if img_e else ""
    json_ld_block = ""
    if json_ld:
        safe = _json.dumps(json_ld, ensure_ascii=False).replace("<", "\\u003c")
        json_ld_block = f'<script type="application/ld+json">{safe}</script>'
    redirect_block = "" if is_bot else (
        '<meta http-equiv="refresh" content="0;url=/photographers">'
        '<script>window.location.replace("/photographers");</script>'
    )
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title_e}</title>
<meta name="description" content="{desc_e}">
<link rel="canonical" href="{canon_e}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title_e}">
<meta property="og:description" content="{desc_e}">
<meta property="og:url" content="{canon_e}">
{image_block}
<meta name="twitter:card" content="{'summary_large_image' if img_e else 'summary'}">
<meta name="twitter:title" content="{title_e}">
<meta name="twitter:description" content="{desc_e}">
{json_ld_block}
{redirect_block}
</head>
<body><p>Opening photographers… <a href="/photographers">Tap here if it doesn't redirect.</a></p></body>
</html>"""
    return HTMLResponse(content=html_doc, status_code=200)


@app.get("/photographers", include_in_schema=False)
async def og_intercept_directory_index(request: Request):
    return await _render_og_for_directory_index(request)


@api_router.get("/og/photographers", include_in_schema=False)
async def og_meta_directory_index(request: Request):
    """Always-reachable /api mirror for testing the directory-index rendering."""
    return await _render_og_for_directory_index(request)


_DESIGN_CODES_CACHE: Optional[List[str]] = None


def _design_catalogue_entries() -> List[str]:
    """Design codes (TMPL-ENG-03) for every design that ships with real artwork.

    Reads frontend-v2/public/designs/catalogue.json — the same file the SPA
    fetches, so the sitemap can never advertise a design the app cannot render.
    Returns [] if the file is not reachable from wherever the API is running
    (a container that mounts only the backend, say); a shorter sitemap is
    strictly better than one full of 404s.
    """
    global _DESIGN_CODES_CACHE
    if _DESIGN_CODES_CACHE is not None:
        return _DESIGN_CODES_CACHE

    # Mirrors lib/designCode.js — the wire format of codes already handed to
    # customers, so these must not be regenerated with different abbreviations.
    theme_abbr = {
        "south_indian_temple": "TMPL", "royal_mughal": "MUGH",
        "bengali_traditional": "BENG", "punjabi_sangeet": "PUNJ",
        "kerala_backwaters": "KERL", "christian_elegant": "CHRS",
        "muslim_nikah": "MSLM", "beach_destination": "BEAC",
        "nature_eco_wedding": "NATR", "modern_minimal": "MNML",
    }
    event_abbr = {"Engagement": "ENG", "Haldi": "HAL", "Mehandi": "MEH",
                  "Marriage": "MRG", "Reception": "REC", "Sangeeth": "SNG"}

    codes: List[str] = []
    here = Path(__file__).resolve().parent
    for candidate in (here.parent / "frontend-v2" / "public" / "designs" / "catalogue.json",
                      Path("/app/frontend-v2/public/designs/catalogue.json"),
                      Path("/srv/designs/catalogue.json")):
        try:
            if not candidate.is_file():
                continue
            data = json.loads(candidate.read_text(encoding="utf-8"))
            for d in data.get("designs", []):
                t, e = theme_abbr.get(d.get("theme")), event_abbr.get(d.get("ceremony"))
                if t and e and isinstance(d.get("index"), int):
                    codes.append(f"{t}-{e}-{d['index'] + 1:02d}")
            break
        except Exception:
            logger.warning("sitemap: could not read %s", candidate, exc_info=True)

    _DESIGN_CODES_CACHE = codes
    return codes


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    """
    PHASE 31: Generate dynamic sitemap.xml
    - Include only public, active, non-expired profiles with SEO enabled
    - Update automatically when profiles are published/unpublished
    """
    try:
        # Canonical public origin — same host the pages' own <link rel=canonical>
        # emit, so Google accepts the sitemap (see _public_base_url).
        base_url = _public_base_url()

        # Get all active, public profiles with SEO enabled
        now = datetime.now(timezone.utc)
        profiles = await db.profiles.find({
            "is_active": True,
            "$or": [
                {"expires_at": {"$gt": now}},
                {"expires_at": None}
            ],
            "seo_settings.seo_enabled": {"$ne": False}  # Default is True
        }).to_list(length=1000)
        
        # Build sitemap XML
        xml_lines = ['<?xml version="1.0" encoding="UTF-8"?>']
        xml_lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

        # Static public marketing routes. These were missing entirely — the
        # homepage itself was never in the sitemap. (/photographers is added
        # below with the discovery pages, so it is not repeated here.)
        _today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        # These MUST match the frontend-v2 route table (frontend-v2/src/App.jsx).
        # /themes, /plans and /story were listed here but never existed in the
        # shipped SPA, so the sitemap was advertising three 404s to Google.
        for _path, _freq, _prio in [
            ('/',               'weekly',  '1.0'),
            ('/pricing',        'monthly', '0.8'),
            ('/features',       'monthly', '0.7'),
            ('/how-it-works',   'monthly', '0.7'),
            ('/community',      'weekly',  '0.6'),
            ('/community/reels', 'weekly', '0.5'),
            ('/food-donation',  'monthly', '0.5'),
            ('/faq',            'monthly', '0.5'),
            ('/contact',        'yearly',  '0.4'),
            ('/terms',          'yearly',  '0.3'),
            ('/privacy',        'yearly',  '0.3'),
            ('/refund',         'yearly',  '0.3'),
            ('/cookies',        'yearly',  '0.3'),
            ('/data-retention', 'yearly',  '0.3'),
        ]:
            xml_lines.append('  <url>')
            xml_lines.append(f'    <loc>{base_url}{_path}</loc>')
            xml_lines.append(f'    <lastmod>{_today}</lastmod>')
            xml_lines.append(f'    <changefreq>{_freq}</changefreq>')
            xml_lines.append(f'    <priority>{_prio}</priority>')
            xml_lines.append('  </url>')

        for profile in profiles:
            slug = profile.get('slug')
            updated_at = profile.get('updated_at', profile.get('created_at', datetime.now(timezone.utc)))
            
            # Format date for sitemap (YYYY-MM-DD)
            lastmod = updated_at.strftime('%Y-%m-%d') if isinstance(updated_at, datetime) else datetime.now(timezone.utc).strftime('%Y-%m-%d')
            
            # Main invitation URL
            xml_lines.append('  <url>')
            xml_lines.append(f'    <loc>{base_url}/invite/{slug}</loc>')
            xml_lines.append(f'    <lastmod>{lastmod}</lastmod>')
            xml_lines.append('    <changefreq>weekly</changefreq>')
            xml_lines.append('    <priority>0.8</priority>')
            xml_lines.append('  </url>')

        # Photographer portfolios.
        #
        # THE RULE HERE MUST MATCH THE PUBLIC READ, and it did not. This query
        # required `is_published: True`, but GET /api/public/photographer/{id}/
        # portfolio never checks that field at all — every studio that resolves
        # is served. Real rows carry no `is_published` key, so the filter matched
        # nothing and the sitemap shipped ZERO portfolios while the pages were
        # live and shareable. A photographer could buy a portfolio, publish it,
        # send the link around, and Google would never be told the page existed.
        #
        # So: list what the public endpoint would actually serve — anything with
        # a slug — and exclude only demo/sample rows, which are not real studios.
        try:
            from portfolio_service import portfolio_has_content
            portfolios = await db.portfolio_profiles.find({}, {"_id": 0}).to_list(5000)
            works_by_studio = set()
            try:
                for w in await db.portfolio_works.find({}, {"_id": 0, "studio_id": 1}).to_list(20000):
                    if w.get("studio_id"):
                        works_by_studio.add(w["studio_id"])
            except Exception:
                pass
            for pf in portfolios:
                slug = pf.get('slug')
                # Sample/showcase portfolios exist so photographers can preview
                # the product; they are not real studios, so keep them out.
                if not slug or pf.get('is_demo'):
                    continue
                # Only an EXPLICIT opt-out hides a portfolio. Absent means live,
                # because that is what the public endpoint does.
                if pf.get('is_published') is False:
                    continue
                # Must match what the crawler renderer says about the SAME page:
                # it marks an empty portfolio `noindex`, so advertising it in the
                # sitemap would ask Google to crawl a page that tells it not to
                # index — the exact contradiction that gets a sitemap distrusted.
                if not portfolio_has_content(pf, [1] if pf.get("id") in works_by_studio else None):
                    continue
                lm = pf.get('updated_at')
                lastmod = (lm[:10] if isinstance(lm, str) else datetime.now(timezone.utc).strftime('%Y-%m-%d'))
                xml_lines.append('  <url>')
                xml_lines.append(f'    <loc>{base_url}/photographer/{slug}</loc>')
                xml_lines.append(f'    <lastmod>{lastmod}</lastmod>')
                xml_lines.append('    <changefreq>weekly</changefreq>')
                xml_lines.append('    <priority>0.7</priority>')
                xml_lines.append('  </url>')
        except Exception:
            logger.warning("sitemap: portfolio section failed", exc_info=True)

        # The design catalogue: /browse, each collection, each collection x
        # ceremony, and every individual design. 188 designs with real artwork
        # ship in frontend-v2/public/designs/catalogue.json, and not one of
        # those pages was ever advertised — the whole "browse designs before you
        # order" funnel was invisible to search.
        #
        # The collection and ceremony URLs come from design_catalog.py, which
        # already owns this exact vocabulary. The per-design URLs need the
        # catalogue file; if it is not readable from wherever the API runs, they
        # are simply omitted rather than guessed, because a sitemap full of 404s
        # is worse than a short sitemap.
        try:
            from design_catalog import THEME_PREFIX_TO_ID
            # Ceremony folder -> the route slug frontend-v2 actually links to
            # (BrowseDesigns.DIR_TO_SLUG). Emitting an alias instead would
            # advertise a URL the app never links to itself.
            _CEREMONY_SLUG = {
                "Engagement": "engagement", "Haldi": "haldi", "Mehandi": "mehendi",
                "Marriage": "wedding", "Reception": "reception", "Sangeeth": "sangeet",
            }
            xml_lines.append('  <url>')
            xml_lines.append(f'    <loc>{base_url}/browse</loc>')
            xml_lines.append('    <changefreq>weekly</changefreq>')
            xml_lines.append('    <priority>0.9</priority>')
            xml_lines.append('  </url>')
            for theme_id in sorted(set(THEME_PREFIX_TO_ID.values())):
                xml_lines.append('  <url>')
                xml_lines.append(f'    <loc>{base_url}/themes/{theme_id}</loc>')
                xml_lines.append('    <changefreq>monthly</changefreq>')
                xml_lines.append('    <priority>0.7</priority>')
                xml_lines.append('  </url>')
                for _slug in _CEREMONY_SLUG.values():
                    xml_lines.append('  <url>')
                    xml_lines.append(f'    <loc>{base_url}/themes/{theme_id}/events/{_slug}</loc>')
                    xml_lines.append('    <changefreq>monthly</changefreq>')
                    xml_lines.append('    <priority>0.6</priority>')
                    xml_lines.append('  </url>')

            for _cat in _design_catalogue_entries():
                xml_lines.append('  <url>')
                xml_lines.append(f'    <loc>{base_url}/preview/design/{_cat}</loc>')
                xml_lines.append('    <changefreq>monthly</changefreq>')
                xml_lines.append('    <priority>0.5</priority>')
                xml_lines.append('  </url>')
        except Exception:
            logger.warning("sitemap: design catalogue section failed", exc_info=True)

        # Photographer directory index + SEO discovery pages (category / location
        # / combined). Only pages that clear the >= threshold are listed, so no
        # thin/noindex page ever enters the sitemap (enumerate_discovery_pages).
        try:
            xml_lines.append('  <url>')
            xml_lines.append(f'    <loc>{base_url}/photographers</loc>')
            xml_lines.append('    <changefreq>daily</changefreq>')
            xml_lines.append('    <priority>0.6</priority>')
            xml_lines.append('  </url>')
            from photographer_directory import enumerate_discovery_pages
            for path in await enumerate_discovery_pages(db):
                xml_lines.append('  <url>')
                xml_lines.append(f'    <loc>{base_url}{path}</loc>')
                xml_lines.append('    <changefreq>weekly</changefreq>')
                xml_lines.append('    <priority>0.6</priority>')
                xml_lines.append('  </url>')
        except Exception:
            logger.warning("sitemap: discovery section failed", exc_info=True)

        xml_lines.append('</urlset>')
        
        sitemap_content = '\n'.join(xml_lines)
        
        from fastapi.responses import Response
        return Response(content=sitemap_content, media_type="application/xml")
        
    except Exception as e:
        logger.error(f"Error generating sitemap: {str(e)}")
        # Return empty sitemap on error
        empty_sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
        from fastapi.responses import Response
        return Response(content=empty_sitemap, media_type="application/xml")


# ============================================================================
# PHASE 32: SECURITY & ACCESS CONTROL
# ============================================================================

@api_router.post("/captcha/generate")
async def generate_captcha():
    """
    PHASE 32: Generate a simple math CAPTCHA challenge
    Returns: {challenge_id, challenge_text}
    """
    try:
        # Generate random math challenge (addition or subtraction)
        num1 = random.randint(1, 20)
        num2 = random.randint(1, 20)
        operation = random.choice(['+', '-'])
        
        if operation == '+':
            answer = num1 + num2
            challenge_text = f"{num1} + {num2}"
        else:
            # Ensure non-negative results
            if num1 < num2:
                num1, num2 = num2, num1
            answer = num1 - num2
            challenge_text = f"{num1} - {num2}"
        
        # Hash the answer
        answer_hash = hashlib.sha256(str(answer).encode()).hexdigest()
        
        # Create challenge record
        challenge = CaptchaChallenge(
            challenge=challenge_text,
            answer=answer_hash
        )
        
        # Store in database
        doc = challenge.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['expires_at'] = doc['expires_at'].isoformat()
        await db.captcha_challenges.insert_one(doc)
        
        return {
            "challenge_id": challenge.id,
            "challenge": challenge_text
        }
    
    except Exception as e:
        logger.error(f"Error generating CAPTCHA: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate CAPTCHA")


@api_router.post("/captcha/verify")
async def verify_captcha(verify_request: CaptchaVerifyRequest):
    """
    PHASE 32: Verify CAPTCHA answer
    Returns: {valid: bool}
    """
    try:
        # Find challenge
        challenge = await db.captcha_challenges.find_one(
            {"id": verify_request.challenge_id},
            {"_id": 0}
        )
        
        if not challenge:
            return {"valid": False, "message": "Challenge not found or expired"}
        
        # Check if expired
        expires_at = datetime.fromisoformat(challenge['expires_at'])
        if expires_at < datetime.now(timezone.utc):
            await db.captcha_challenges.delete_one({"id": verify_request.challenge_id})
            return {"valid": False, "message": "Challenge expired"}
        
        # Verify answer
        provided_hash = hashlib.sha256(str(verify_request.answer).encode()).hexdigest()
        is_valid = provided_hash == challenge['answer']
        
        # Delete challenge after verification (one-time use)
        await db.captcha_challenges.delete_one({"id": verify_request.challenge_id})
        
        return {"valid": is_valid}
    
    except Exception as e:
        logger.error(f"Error verifying CAPTCHA: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify CAPTCHA")


@api_router.post("/event/{event_id}/verify-access")
async def verify_event_access(
    event_id: str,
    passcode: Optional[str] = None,
    request: Request = None
):
    """
    PHASE 32: Verify access to private event
    Returns: {allowed: bool, requires_passcode: bool, message: str}
    """
    try:
        # Get client IP
        ip_address = get_client_ip(request) if request else "unknown"
        
        # Find event
        profile = await db.profiles.find_one(
            {"events.event_id": event_id},
            {"_id": 0, "events.$": 1}
        )
        
        if not profile or not profile.get('events'):
            raise ErrorResponse.not_found("Event not found")
        
        event = profile['events'][0]
        
        # Check access
        access_result = check_event_access(event, passcode, ip_address)
        
        if access_result["allowed"]:
            return {
                "allowed": True,
                "requires_passcode": False,
                "message": "Access granted"
            }
        else:
            return {
                "allowed": False,
                "requires_passcode": access_result["requires_passcode"],
                "message": access_result["reason"],
                "remaining_attempts": access_result.get("remaining_attempts", 0),
                "blocked_until": access_result.get("blocked_until").isoformat() if access_result.get("blocked_until") else None
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying event access: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify access")


async def check_submission_attempts(ip_address: str, device_id: Optional[str], endpoint: str, slug: str) -> dict:
    """
    PHASE 32: Check if CAPTCHA is required based on failed submission attempts
    Returns: {requires_captcha: bool, failed_attempts: int}
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Check recent failed attempts (last 1 hour)
    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    
    query = {
        "ip_address": ip_address,
        "endpoint": endpoint,
        "slug": slug,
        "success": False,
        "created_at": {"$gte": hour_ago}
    }
    
    # Also check device_id if provided
    if device_id:
        query["$or"] = [
            {"ip_address": ip_address},
            {"device_id": device_id}
        ]
    
    failed_attempts = await db.submission_attempts.count_documents(query)
    
    # Require CAPTCHA after 2 failed attempts
    requires_captcha = failed_attempts >= 2
    
    return {
        "requires_captcha": requires_captcha,
        "failed_attempts": failed_attempts
    }


async def track_submission_attempt(
    ip_address: str,
    device_id: Optional[str],
    endpoint: str,
    slug: str,
    success: bool,
    requires_captcha: bool
):
    """
    PHASE 32: Track submission attempt for CAPTCHA triggering
    """
    attempt = SubmissionAttempt(
        ip_address=ip_address,
        device_id=device_id,
        endpoint=endpoint,
        slug=slug,
        success=success,
        requires_captcha=requires_captcha
    )
    
    doc = attempt.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.submission_attempts.insert_one(doc)


@api_router.get("/check-captcha-required")
async def check_captcha_required(
    endpoint: str,
    slug: str,
    device_id: Optional[str] = None,
    request: Request = None
):
    """
    PHASE 32: Check if CAPTCHA is required for this user/device
    """
    try:
        ip_address = get_client_ip(request) if request else "unknown"
        
        result = await check_submission_attempts(ip_address, device_id, endpoint, slug)
        
        return result
    
    except Exception as e:
        logger.error(f"Error checking CAPTCHA requirement: {str(e)}")
        return {"requires_captcha": False, "failed_attempts": 0}




# ============================================================================
# PHASE 33: MONETIZATION & PREMIUM PLANS
# ============================================================================

@api_router.get("/admin/profiles/{profile_id}/plan", response_model=PlanInfoResponse)
async def get_profile_plan(
    profile_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 33: Get plan information for a profile
    Admin only endpoint
    """
    try:
        # Get profile
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get plan info
        plan_type = profile.get('plan_type', 'FREE')
        plan_expires_at = profile.get('plan_expires_at')
        
        # Calculate days remaining
        days_remaining = None
        is_expired = False
        if plan_expires_at and plan_type != 'FREE':
            if isinstance(plan_expires_at, str):
                expiry_date = datetime.fromisoformat(plan_expires_at.replace('Z', '+00:00'))
            else:
                expiry_date = plan_expires_at
            
            now = datetime.now(timezone.utc)
            if expiry_date < now:
                is_expired = True
                days_remaining = 0
            else:
                days_remaining = (expiry_date - now).days
        
        # Get plan details
        plan_details = get_plan_info(plan_type if not is_expired else 'FREE')
        
        return PlanInfoResponse(
            current_plan=plan_type if not is_expired else 'FREE',
            plan_expires_at=plan_expires_at,
            days_remaining=days_remaining,
            is_expired=is_expired,
            features=plan_details.get('features', []),
            limitations=plan_details.get('limitations', []),
            upgrade_available=(plan_type != 'PLATINUM' or is_expired)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting plan info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting plan info: {str(e)}")


@api_router.post("/admin/profiles/{profile_id}/plan")
async def update_profile_plan(
    profile_id: str,
    plan_update: UpdatePlanRequest,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 33: Update profile plan (admin only)
    Mock payment - directly updates plan in database
    """
    try:
        # Get profile
        profile = await check_profile_ownership(profile_id, admin_id, db)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        # Validate plan type
        valid_plans = ['FREE', 'SILVER', 'GOLD', 'PLATINUM']
        if plan_update.plan_type not in valid_plans:
            raise HTTPException(status_code=400, detail="Invalid plan type")
        
        # Update plan
        update_data = {
            "plan_type": plan_update.plan_type,
            "plan_expires_at": plan_update.plan_expires_at.isoformat() if plan_update.plan_expires_at else None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.profiles.update_one(
            {"id": profile_id},
            {"$set": update_data}
        )
        
        # Log admin action
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "profile_id": profile_id,
            "action": "plan_update",
            "details": {
                "new_plan": plan_update.plan_type,
                "expires_at": plan_update.plan_expires_at.isoformat() if plan_update.plan_expires_at else None
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        return {
            "success": True,
            "message": f"Plan updated to {plan_update.plan_type}",
            "plan_type": plan_update.plan_type,
            "plan_expires_at": plan_update.plan_expires_at
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating plan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating plan: {str(e)}")


@api_router.get("/profiles/{profile_id}/features", response_model=FeatureFlagsResponse)
async def get_profile_features(profile_id: str):
    """
    PHASE 33: Get feature flags for a profile
    Public endpoint - used by frontend to determine feature availability
    """
    try:
        # Get profile
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        # Get feature flags
        feature_flags = get_feature_flags(profile)
        gallery_limit = get_gallery_limit(profile)
        watermark_required = requires_watermark(profile)
        
        plan_type = profile.get('plan_type', 'FREE')
        
        # Check if plan expired
        plan_expires_at = profile.get('plan_expires_at')
        if plan_expires_at and plan_type != 'FREE':
            if isinstance(plan_expires_at, str):
                expiry_date = datetime.fromisoformat(plan_expires_at.replace('Z', '+00:00'))
            else:
                expiry_date = plan_expires_at
            
            if expiry_date < datetime.now(timezone.utc):
                plan_type = 'FREE'
        
        return FeatureFlagsResponse(
            plan_type=plan_type,
            feature_flags=feature_flags,
            gallery_limit=gallery_limit,
            requires_watermark=watermark_required
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting feature flags: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting feature flags: {str(e)}")


@api_router.get("/plans/info")
async def get_all_plans_info():
    """
    PHASE 33: Get information about all available plans
    Public endpoint for displaying plan options
    """
    try:
        plans = {}
        for plan_type in ['FREE', 'SILVER', 'GOLD', 'PLATINUM']:
            plans[plan_type] = get_plan_info(plan_type)
        
        return {
            "plans": plans,
            "currency": "INR",  # Can be made configurable
            "prices": {
                "FREE": 0,
                "SILVER": 999,   # Mock prices
                "GOLD": 1999,
                "PLATINUM": 3999
            }
        }
    
    except Exception as e:
        logger.error(f"Error getting plans info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting plans info: {str(e)}")



# ============================================================================
# PHASE 35: REFERRAL, CREDITS & VIRAL GROWTH ENGINE
# ============================================================================

# Credit pricing configuration
def generate_referral_code(profile_id: str) -> str:
    """Generate unique referral code"""
    # Use first 4 chars of profile_id + 4 random chars
    random_suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{profile_id[:4].upper()}{random_suffix}"


async def check_referral_abuse(referrer_profile_id: str, user_ip: str, device_fingerprint: str) -> bool:
    """
    Check for referral abuse patterns
    Returns True if abuse detected
    """
    # Check if same IP used for referrer
    referrer_profile = await db.profiles.find_one({"id": referrer_profile_id})
    
    # Check recent referrals from same IP (within 24 hours)
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    same_ip_count = await db.referrals.count_documents({
        "referred_user_ip": user_ip,
        "created_at": {"$gte": yesterday}
    })
    
    if same_ip_count >= 3:
        logger.warning(f"Referral abuse: IP {user_ip} used {same_ip_count} times in 24h")
        return True
    
    # Check same device fingerprint
    if device_fingerprint:
        same_device_count = await db.referrals.count_documents({
            "referred_user_device_fingerprint": device_fingerprint,
            "created_at": {"$gte": yesterday}
        })
        
        if same_device_count >= 2:
            logger.warning(f"Referral abuse: Device {device_fingerprint} used {same_device_count} times")
            return True
    
    return False


async def _assert_referral_access(profile_id: str, admin_id: str) -> dict:
    """A referral belongs to a profile, so reading or minting its code needs the
    same ownership test every other /profiles/{id}/* route applies.

    Both referral routes were annotated `current_admin: dict` while
    get_current_admin returns the admin id as a STR, so neither had a usable
    identity to check against and neither checked. A second photographer could
    read any profile's referral stats by id. Super-admin still bypasses.
    """
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0})
    if not profile:
        raise ErrorResponse.not_found("Profile not found")
    if profile.get("admin_id") and profile["admin_id"] != admin_id:
        requester = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
        if not requester or requester.get("role") != AdminRole.SUPER_ADMIN.value:
            raise HTTPException(status_code=403, detail="You do not have access to this profile")
    return profile


@api_router.post("/profiles/{profile_id}/referral-code", response_model=ReferralCodeResponse)
async def create_or_get_referral_code(
    profile_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 35: Generate or get existing referral code for a profile
    """
    try:
        profile = await _assert_referral_access(profile_id, admin_id)

        # Check if referral code already exists
        existing_referral = await db.referrals.find_one({
            "referrer_profile_id": profile_id,
            "referred_profile_id": None  # Code not yet used
        })
        
        if existing_referral:
            referral_code = existing_referral["referral_code"]
        else:
            # Generate new unique code
            while True:
                referral_code = generate_referral_code(profile_id)
                # Check if code already exists
                existing = await db.referrals.find_one({"referral_code": referral_code})
                if not existing:
                    break
            
            # Create referral record
            referral_data = {
                "referral_id": f"ref_{uuid.uuid4().hex[:16]}",
                "referrer_profile_id": profile_id,
                # The profile's owner, not the caller — a super-admin minting a
                # code on someone else's profile must not become its referrer.
                "referrer_admin_id": profile.get("admin_id") or admin_id,
                "referred_profile_id": None,
                "referral_code": referral_code,
                "status": "pending",
                                "created_at": datetime.now(timezone.utc)
            }
            await db.referrals.insert_one(referral_data)
        
        # Get referral stats
        total_referrals = await db.referrals.count_documents({
            "referrer_profile_id": profile_id
        })
        
        completed_referrals = await db.referrals.count_documents({
            "referrer_profile_id": profile_id,
            "status": "completed"
        })
        
        pending_referrals = await db.referrals.count_documents({
            "referrer_profile_id": profile_id,
            "status": "pending"
        })
        
        # Build referral URL
        slug = profile.get("slug", "")
        base_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        referral_url = f"{base_url}/invite/{slug}?ref={referral_code}"
        referral_short = f"{base_url}/?ref={referral_code}"
        
        return ReferralCodeResponse(
            referral_code=referral_code,
            referral_url=referral_url,
            referral_link_short=referral_short,
            total_referrals=total_referrals,
            completed_referrals=completed_referrals,
            pending_referrals=pending_referrals,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating referral code: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error creating referral code: {str(e)}"
        )


@api_router.get("/profiles/{profile_id}/referral-code", response_model=ReferralCodeResponse)
async def get_referral_code(
    profile_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    PHASE 35: Get existing referral code
    """
    return await create_or_get_referral_code(profile_id, current_admin)


@api_router.post("/referrals/apply")
async def apply_referral_code(
    request: ApplyReferralRequest
):
    """
    PHASE 35: Apply referral code when creating new profile
    No authentication required - called during profile creation
    """
    try:
        # Find referral code
        referral = await db.referrals.find_one({
            "referral_code": request.referral_code.upper()
        })
        
        if not referral:
            raise ErrorResponse.not_found("Invalid referral code")
        
        # Check if code already used
        if referral.get("referred_profile_id"):
            raise ErrorResponse.bad_request("Referral code already used")
        
        # Prevent self-referral
        if referral["referrer_profile_id"] == request.profile_id:
            raise ErrorResponse.bad_request("Cannot use your own referral code")
        
        # Check for abuse
        if request.user_ip and request.device_fingerprint:
            is_abuse = await check_referral_abuse(
                referral["referrer_profile_id"],
                request.user_ip,
                request.device_fingerprint
            )
            
            if is_abuse:
                logger.warning(f"Referral abuse detected for code {request.referral_code}")
                raise ErrorResponse.bad_request("Referral validation failed")
        
        # Update referral record
        await db.referrals.update_one(
            {"referral_id": referral["referral_id"]},
            {
                "$set": {
                    "referred_profile_id": request.profile_id,
                    "status": "completed",
                    "referred_user_ip": request.user_ip,
                    "referred_user_device_fingerprint": request.device_fingerprint,
                    "completed_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # No reward is granted. This used to award credits on both sides and
        # tell the caller "You earned 50 credits!" — a currency that no longer
        # exists and could not be spent. The referral still RECORDS who referred
        # whom, which is the part that has value; promising a payout that will
        # never arrive is worse than promising nothing.
        logger.info(f"Referral applied: {request.referral_code} -> {request.profile_id}")

        return {
            "success": True,
            "message": "Referral recorded.",
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error applying referral: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error applying referral: {str(e)}"
        )


@api_router.get("/profiles/{profile_id}/referrals", response_model=ReferralStatsResponse)
async def get_referral_stats(
    profile_id: str,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 35: Get referral statistics for a profile
    """
    try:
        await _assert_referral_access(profile_id, admin_id)

        # Get all referrals
        referrals_cursor = db.referrals.find({
            "referrer_profile_id": profile_id
        }).sort("created_at", -1).limit(10)
        
        referrals_list = []
        async for ref in referrals_cursor:
            ref.pop("_id", None)
            # pg_adapter round-trips JSONB, so a timestamp comes back as a
            # STRING on any row that was written as one — and .isoformat() on a
            # str is an AttributeError that surfaced as a 500 on this endpoint.
            # Only convert what is actually a datetime.
            for _k in ("created_at", "completed_at"):
                _v = ref.get(_k)
                if hasattr(_v, "isoformat"):
                    ref[_k] = _v.isoformat()
            referrals_list.append(ref)
        
        # Get stats
        total = await db.referrals.count_documents({"referrer_profile_id": profile_id})
        completed = await db.referrals.count_documents({
            "referrer_profile_id": profile_id,
            "status": "completed"
        })
        pending = await db.referrals.count_documents({
            "referrer_profile_id": profile_id,
            "status": "pending"
        })
        
        return ReferralStatsResponse(
            total_referrals=total,
            completed_referrals=completed,
            pending_referrals=pending,
            recent_referrals=referrals_list
        )

    except HTTPException:
        # Without this, the 403 from the ownership check above is swallowed and
        # re-raised as "500: 403: You do not have access to this profile" — the
        # right refusal reported as a server fault.
        raise
    except Exception as e:
        logger.error(f"Error getting referral stats: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error getting referral stats: {str(e)}"
        )


@api_router.post("/admin/referrals/override")
async def admin_referral_override(
    request: AdminReferralOverrideRequest,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 35: Admin override for a referral — approve one held back by the
    abuse check, or reject one. There is no reward to grant either way.
    """
    try:
        referral = await db.referrals.find_one({"referral_id": request.referral_id})
        if not referral:
            raise ErrorResponse.not_found("Referral not found")

        # Scope it. This route took a referral_id and nothing else, so any
        # authenticated photographer could approve or reject any referral in
        # the system given its id. The referral belongs to a profile; the same
        # ownership test the other referral routes use applies here.
        await _assert_referral_access(referral.get("referrer_profile_id") or "", admin_id)

        if request.action == "approve":
            # Manually approve a pending referral
            await db.referrals.update_one(
                {"referral_id": request.referral_id},
                {"$set": {"status": "completed"}}
            )
            
        elif request.action == "reject":
            # Reject/cancel a referral
            await db.referrals.update_one(
                {"referral_id": request.referral_id},
                {"$set": {"status": "cancelled"}}
            )
            
        # grant_credits / revoke_credits are gone with the credit system; a
        # referral can still be approved or rejected, which is what the audit
        # log below actually records.
        
        # Log audit
        await db.audit_logs.insert_one({
            "admin_id": admin_id,
            "action": f"referral_override_{request.action}",
            "resource_type": "referral",
            "resource_id": request.referral_id,
            "details": request.reason,
            "timestamp": datetime.now(timezone.utc)
        })
        
        return {
            "success": True,
            "message": f"Referral {request.action} completed"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in admin override: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error in admin override: {str(e)}"
        )


@api_router.get("/public/photographer-stats")
async def get_public_photographer_stats():
    """Live read-only counters for the homepage Photographer Advantages banner.

    Returns:
      - published_total          : how many photographer-owned weddings are live
      - photographers_total      : active (non-trashed) photographer accounts

    No auth. `bonus_credits_granted` was dropped with the credit system — it
    aggregated `credit_purchases`, a collection nothing writes to any more, so
    it could only ever report 0 while looking like a measured figure.
    """
    try:
        # Photographer-owned weddings that are currently published.
        #
        # This counted `db.wedding_profiles` with `is_published: True` — a
        # collection nothing writes and a field nothing sets. It therefore
        # answered 0 for ever, and the homepage banner told every visitor the
        # platform had published zero invitations. Weddings live in `profiles`,
        # and publishing flips `status` to WeddingStatus.PUBLISHED
        # (wedding_lifecycle_service, STEP 8). Both cases are matched because
        # older rows carry the uppercase spelling.
        published_total = await db.profiles.count_documents({
            "status": {"$in": ["published", "PUBLISHED"]},
            "is_template": {"$ne": True},
            # Same soft-delete shape the dashboard uses: the key is absent on
            # rows that were never deleted, so `deleted_at: None` alone misses them.
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
        })
    except Exception:
        published_total = 0

    try:
        # Active photographer accounts (super-admin / regular admin).
        # Exclude soft-deleted / suspended rows.
        photographers_total = await db.admins.count_documents({
            "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}],
            "$and": [
                {"$or": [{"is_suspended": False}, {"is_suspended": {"$exists": False}}]},
            ],
        })
    except Exception:
        photographers_total = 0

    return {
        "published_total": published_total,
        "photographers_total": photographers_total,
    }



@api_router.get("/public/referral-code/{profile_id}")
async def get_public_referral_code(profile_id: str):
    """
    PHASE 35: Get referral code for public display (no auth required)
    Returns only the referral code for guest CTA display
    """
    try:
        # The UNUSED code only. Codes are single-use — matching any row for this
        # profile would hand a visitor one that /referrals/apply then rejects
        # with "Referral code already used".
        referral = await db.referrals.find_one({
            "referrer_profile_id": profile_id,
            "referred_profile_id": None
        })

        if referral and referral.get("referral_code"):
            return {
                "referral_code": referral["referral_code"],
                "profile_id": profile_id
            }
        
        # If no referral code exists, generate one
        # This allows guest CTAs to work even if admin hasn't accessed referrals yet
        referral_code = generate_referral_code(profile_id)
        
        # Check if code is unique
        existing = await db.referrals.find_one({"referral_code": referral_code})
        if existing:
            # Code collision, add random suffix
            referral_code = f"{referral_code}{random.randint(10, 99)}"
        
        # Get profile to find admin_id
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise ErrorResponse.not_found("Profile not found")
        
        # Create referral record
        referral_data = {
            "referral_id": f"ref_{uuid.uuid4().hex[:16]}",
            "referrer_profile_id": profile_id,
            "referrer_admin_id": profile.get("admin_id", "unknown"),
            "referred_profile_id": None,
            "referral_code": referral_code,
            "status": "pending",
                        "created_at": datetime.now(timezone.utc)
        }
        await db.referrals.insert_one(referral_data)
        
        return {
            "referral_code": referral_code,
            "profile_id": profile_id
        }
    
    # A bare `except Exception` swallowed the deliberate 404 raised above for an
    # unknown profile and re-raised it as a 500 — with the whole inner error
    # dict stringified into the public message. A missing invitation is a 404,
    # and the caller should not be told the shape of our internals.
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting public referral code: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Could not load the referral code.",
        )


# ==========================================
# PHASE 34: DESIGN SYSTEM & THEME ENGINE
# ==========================================

@api_router.get("/themes")
async def get_all_themes(
    plan_type: Optional[str] = None
):
    """
    PHASE 34: Get all available themes
    Optionally filter by plan type to show only accessible themes
    """
    from theme_constants import get_all_themes_preview, get_themes_by_plan
    
    try:
        if plan_type:
            # Filter themes by plan access
            accessible_theme_ids = get_themes_by_plan(plan_type)
            all_themes = get_all_themes_preview()
            filtered_themes = [t for t in all_themes if t['id'] in accessible_theme_ids]
            
            return {
                "themes": filtered_themes,
                "total": len(filtered_themes),
                "plan_type": plan_type
            }
        else:
            # Return all themes
            all_themes = get_all_themes_preview()
            return {
                "themes": all_themes,
                "total": len(all_themes)
            }
    
    except Exception as e:
        logger.error(f"Error getting themes: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error getting themes: {str(e)}"
        )


@api_router.get("/themes/{theme_id}")
async def get_theme_details(theme_id: str):
    """
    PHASE 34: Get detailed theme configuration
    """
    from theme_constants import get_theme_by_id
    
    try:
        theme = get_theme_by_id(theme_id)
        if not theme:
            raise ErrorResponse.not_found(f"Theme '{theme_id}' not found")
        
        return {
            "theme": theme,
            "success": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting theme details: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error getting theme details: {str(e)}"
        )


@api_router.get("/profiles/{profile_id}/theme")
async def get_profile_theme(
    profile_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    PHASE 34: Get current theme settings for a profile
    """
    from theme_constants import get_theme_by_id
    
    try:
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise ErrorResponse.not_found("Profile not found")
        
        # Get theme settings or use defaults
        theme_settings = profile.get("theme_settings", {
            "theme_id": "royal_heritage",
            "animation_level": "subtle",
            "glassmorphism_enabled": True,
            "color_overrides": {},
            "hero_type": "static"
        })
        
        # Get full theme data
        theme_data = get_theme_by_id(theme_settings.get("theme_id", "royal_heritage"))
        
        return {
            "theme_settings": theme_settings,
            "theme_data": theme_data,
            "profile_id": profile_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting profile theme: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error getting profile theme: {str(e)}"
        )


@api_router.put("/profiles/{profile_id}/theme")
async def update_profile_theme(
    profile_id: str,
    theme_update: ThemeUpdateRequest,
    admin_id: str = Depends(get_current_admin)
):
    """
    PHASE 34: Update theme settings for a profile
    Includes plan-based access control
    """
    from theme_constants import can_use_theme, is_valid_theme, get_theme_by_id
    
    try:
        # Get profile
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise ErrorResponse.not_found("Profile not found")
        
        # Validate theme exists
        if not is_valid_theme(theme_update.theme_id):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid theme ID: {theme_update.theme_id}"
            )
        
        # Check plan-based access
        user_plan = profile.get("plan_type", "FREE")
        if not can_use_theme(theme_update.theme_id, user_plan):
            theme_data = get_theme_by_id(theme_update.theme_id)
            required_plan = theme_data.get("planRequired", "PLATINUM")
            raise HTTPException(
                status_code=403,
                detail=f"This theme requires {required_plan} plan or higher"
            )
        
        # Get current theme settings or create new
        theme_settings = profile.get("theme_settings", {})
        
        # Update only provided fields
        update_data = {}
        if theme_update.theme_id:
            update_data["theme_settings.theme_id"] = theme_update.theme_id
        if theme_update.animation_level is not None:
            update_data["theme_settings.animation_level"] = theme_update.animation_level
        if theme_update.glassmorphism_enabled is not None:
            update_data["theme_settings.glassmorphism_enabled"] = theme_update.glassmorphism_enabled
        if theme_update.color_overrides is not None:
            update_data["theme_settings.color_overrides"] = theme_update.color_overrides
        if theme_update.hero_type is not None:
            update_data["theme_settings.hero_type"] = theme_update.hero_type
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        # Update profile
        result = await db.profiles.update_one(
            {"id": profile_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(
                status_code=500,
                detail="Failed to update theme settings"
            )
        
        # Get updated theme settings
        updated_profile = await db.profiles.find_one({"id": profile_id})
        updated_theme_settings = updated_profile.get("theme_settings", {})
        
        # Audit log
        await db.audit_logs.insert_one({
            "log_id": f"audit_{uuid.uuid4().hex[:16]}",
            "admin_id": admin_id,
            "profile_id": profile_id,
            "action": "update_theme",
            "details": {
                "theme_id": theme_update.theme_id,
                "animation_level": theme_update.animation_level,
                "glassmorphism_enabled": theme_update.glassmorphism_enabled
            },
            "timestamp": datetime.now(timezone.utc)
        })
        
        return {
            "success": True,
            "message": "Theme settings updated successfully",
            "theme_settings": updated_theme_settings
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating theme: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error updating theme: {str(e)}"
        )


@api_router.post("/themes/preview")
async def preview_theme(
    preview_request: ThemePreviewRequest
):
    """
    PHASE 34: Get theme preview data (no auth required)
    Used by admin for live preview before applying
    """
    from theme_constants import get_theme_by_id
    
    try:
        theme = get_theme_by_id(preview_request.theme_id)
        if not theme:
            raise ErrorResponse.not_found(f"Theme '{preview_request.theme_id}' not found")
        
        # Return theme with preview settings
        return {
            "theme": theme,
            "preview_settings": {
                "animation_level": preview_request.animation_level,
                "glassmorphism_enabled": preview_request.glassmorphism_enabled
            },
            "success": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing theme: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error previewing theme: {str(e)}"
        )


@api_router.get("/themes/accessible/{profile_id}")
async def get_accessible_themes(
    profile_id: str
):
    """
    PHASE 34: Get themes accessible to a profile based on their plan
    Public endpoint for guest view (shows locked vs unlocked)
    """
    from theme_constants import get_all_themes_preview, get_themes_by_plan
    
    try:
        # Get profile plan
        profile = await db.profiles.find_one({"id": profile_id})
        if not profile:
            raise ErrorResponse.not_found("Profile not found")
        
        user_plan = profile.get("plan_type", "FREE")
        
        # Get all themes
        all_themes = get_all_themes_preview()
        
        # Get accessible theme IDs
        accessible_ids = set(get_themes_by_plan(user_plan))
        
        # Mark themes as locked/unlocked
        for theme in all_themes:
            theme['accessible'] = theme['id'] in accessible_ids
            theme['locked'] = theme['id'] not in accessible_ids
        
        return {
            "themes": all_themes,
            "user_plan": user_plan,
            "accessible_count": len(accessible_ids),
            "total_count": len(all_themes)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting accessible themes: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error getting accessible themes: {str(e)}"
        )


# ==========================================
# PHASE 36: TEMPLATE MARKETPLACE & CREATOR ECOSYSTEM
# ==========================================

# ======================
# PUBLIC MARKETPLACE ENDPOINTS
# ======================

@api_router.get("/templates")
async def browse_templates(
    category: Optional[str] = None,
    event_type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    is_free: Optional[bool] = None,
    is_featured: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = "popular",
    page: int = 1,
    page_size: int = 20
):
    """
    PHASE 36: Browse template marketplace with filters
    Public endpoint - no auth required
    """
    try:
        # Build filter query
        query = {"status": TemplateStatus.APPROVED.value}
        
        if category:
            query["category"] = category
        
        if event_type:
            query["event_types"] = event_type
        
        if is_free is not None:
            if is_free:
                query["price"] = 0
            else:
                query["price"] = {"$gt": 0}
        
        if min_price is not None or max_price is not None:
            price_query = {}
            if min_price is not None:
                price_query["$gte"] = min_price
            if max_price is not None:
                price_query["$lte"] = max_price
            query["price"] = price_query
        
        if is_featured is not None:
            query["is_featured"] = is_featured
        
        if search:
            # Search in name, description, and tags
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"tags": {"$regex": search, "$options": "i"}}
            ]
        
        # Determine sort order
        sort_field = "view_count"  # Default popular
        sort_order = -1  # Descending
        
        if sort_by == "newest":
            sort_field = "created_at"
        elif sort_by == "price_low":
            sort_field = "price"
            sort_order = 1  # Ascending
        elif sort_by == "price_high":
            sort_field = "price"
        elif sort_by == "rating":
            sort_field = "rating_average"
        
        # Get total count
        total = await db.templates.count_documents(query)
        
        # Get paginated results
        skip = (page - 1) * page_size
        cursor = db.templates.find(query, {"_id": 0}).sort(sort_field, sort_order).skip(skip).limit(page_size)
        templates = await cursor.to_list(length=page_size)
        
        # Remove sensitive data from public view
        for template in templates:
            # Keep only public fields
            template.pop('design_config', None)  # Don't expose full config until purchase
            template.pop('theme_config', None)
            template.pop('layout_structure', None)
        
        return {
            "templates": templates,
            "total": total,
            "page": page,
            "page_size": page_size,
            "has_more": (skip + len(templates)) < total
        }
    
    except Exception as e:
        logger.error(f"Error browsing templates: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to browse templates")


@api_router.get("/templates/{template_id}")
async def get_template_details(template_id: str, profile_id: Optional[str] = None):
    """
    PHASE 36: Get detailed template information
    Public endpoint - full config only if purchased
    """
    try:
        # Get template
        template = await db.templates.find_one(
            {"template_id": template_id},
            {"_id": 0}
        )
        
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Check if template is approved (unless it's the creator viewing)
        if template.get('status') != TemplateStatus.APPROVED.value:
            raise HTTPException(status_code=404, detail="Template not available")
        
        # Increment view count
        await db.templates.update_one(
            {"template_id": template_id},
            {"$inc": {"view_count": 1}}
        )
        
        # Check if purchased
        is_purchased = False
        if profile_id:
            purchase = await db.template_purchases.find_one({
                "template_id": template_id,
                "profile_id": profile_id
            })
            is_purchased = purchase is not None
        
        # If not purchased and not free, hide full config
        if not is_purchased and template.get('price', 0) > 0:
            template.pop('design_config', None)
            template.pop('theme_config', None)
            template.pop('layout_structure', None)
        
        # Get creator info
        creator = None
        if template.get('creator_id'):
            creator_doc = await db.creator_profiles.find_one(
                {"creator_id": template['creator_id']},
                {"_id": 0, "display_name": 1, "avatar_url": 1, "is_verified": 1, "verification_badge": 1}
            )
            creator = creator_doc
        
        return {
            "template": template,
            "is_purchased": is_purchased,
            "creator": creator
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get template details")


@api_router.post("/templates/{template_id}/purchase")
async def purchase_template(
    template_id: str,
    purchase_request: TemplatePurchaseRequest
):
    """
    PHASE 36: Purchase a template
    Supports: Free templates, Credits, Razorpay, Hybrid payment
    """
    try:
        # Get template
        template = await db.templates.find_one(
            {"template_id": template_id, "status": TemplateStatus.APPROVED.value},
            {"_id": 0}
        )
        
        if not template:
            raise HTTPException(status_code=404, detail="Template not available")
        
        profile_id = purchase_request.profile_id
        
        # Check if already purchased
        existing_purchase = await db.template_purchases.find_one({
            "template_id": template_id,
            "profile_id": profile_id
        })
        
        if existing_purchase:
            return {
                "success": True,
                "message": "Template already purchased",
                "purchase": existing_purchase,
                "remaining_amount": 0,
                "payment_required": False
            }
        
        price = template.get('price', 0)
        
        # FREE TEMPLATE
        if price == 0:
            purchase = TemplatePurchase(
                template_id=template_id,
                profile_id=profile_id,
                original_price=0,
                credits_used=0,
                amount_paid=0,
                creator_id=template['creator_id'],
                creator_earnings=0,
                platform_fee=0,
                payment_method="free"
            )
            
            doc = purchase.model_dump()
            doc['purchased_at'] = doc['purchased_at'].isoformat()
            await db.template_purchases.insert_one(doc)
            
            # Update template purchase count
            await db.templates.update_one(
                {"template_id": template_id},
                {"$inc": {"purchase_count": 1}}
            )
            
            return {
                "success": True,
                "message": "Free template added to your collection",
                "purchase": doc,
                "remaining_amount": 0,
                "payment_required": False
            }
        
        # PAID TEMPLATE — Razorpay only.
        #
        # This used to accept part or all of the price in credits, deducting
        # from db.credit_wallets. Credits are retired, so that branch could only
        # ever fail with "Credit wallet not found" — and it sat in front of the
        # payment path. The price is now settled in INR, full stop.
        credits_to_use = 0
        remaining_amount = price

        # REQUIRES RAZORPAY PAYMENT (partial or full)
        # Create Razorpay order
        try:
            order = razorpay_client.order.create({
                "amount": remaining_amount * 100,  # Razorpay amount in paise
                "currency": "INR",
                "receipt": f"template_{template_id}_{profile_id}",
                "notes": {
                    "template_id": template_id,
                    "profile_id": profile_id,
                    "credits_used": credits_to_use,
                    "type": "template_purchase"
                }
            })
            
            # Store pending payment
            payment_doc = {
                "payment_id": str(uuid.uuid4()),
                "razorpay_order_id": order['id'],
                "template_id": template_id,
                "profile_id": profile_id,
                "amount": remaining_amount,
                "credits_used": credits_to_use,
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.template_payments.insert_one(payment_doc)
            
            return {
                "success": True,
                "message": "Payment required to complete purchase",
                "purchase": None,
                "remaining_amount": remaining_amount,
                "payment_required": True,
                "payment_order_id": order['id'],
                "razorpay_key_id": RAZORPAY_KEY_ID
            }
            
        except Exception as e:
            logger.error(f"Error creating Razorpay order: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to create payment order")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error purchasing template: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to purchase template")


@api_router.get("/profiles/{profile_id}/templates")
async def get_purchased_templates(profile_id: str):
    """
    PHASE 36: Get all templates purchased by a profile
    """
    try:
        # Get all purchases for this profile
        purchases = await db.template_purchases.find(
            {"profile_id": profile_id},
            {"_id": 0}
        ).to_list(length=100)
        
        if not purchases:
            return {"templates": [], "total": 0}
        
        # Get template details
        template_ids = [p['template_id'] for p in purchases]
        templates = await db.templates.find(
            {"template_id": {"$in": template_ids}},
            {"_id": 0}
        ).to_list(length=100)
        
        return {
            "templates": templates,
            "total": len(templates),
            "purchases": purchases
        }
    
    except Exception as e:
        logger.error(f"Error getting purchased templates: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get purchased templates")


# ======================
# CREATOR ENDPOINTS
# ======================

@api_router.post("/creator/register")
async def register_as_creator(
    creator_request: CreatorProfileCreate,
    admin: Admin = Depends(get_current_admin)
):
    """
    PHASE 36: Register as a template creator
    Requires admin authentication
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        # Check if already registered
        existing = await db.creator_profiles.find_one({"admin_id": admin_id})
        if existing:
            return {
                "success": False,
                "message": "Already registered as creator",
                "creator": existing
            }
        
        # Create creator profile
        creator = CreatorProfile(
            admin_id=admin_id,
            display_name=creator_request.display_name,
            bio=creator_request.bio,
            avatar_url=creator_request.avatar_url,
            website_url=creator_request.website_url,
            social_links=creator_request.social_links
        )
        
        doc = creator.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.creator_profiles.insert_one(doc)
        
        return {
            "success": True,
            "message": "Creator profile created successfully",
            "creator": doc
        }
    
    except Exception as e:
        logger.error(f"Error registering creator: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register creator")


@api_router.get("/creator/profile")
async def get_creator_profile(admin: Admin = Depends(get_current_admin)):
    """
    PHASE 36: Get current creator profile
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        creator = await db.creator_profiles.find_one(
            {"admin_id": admin_id},
            {"_id": 0}
        )
        
        if not creator:
            raise HTTPException(status_code=404, detail="Creator profile not found. Please register first.")
        
        # Get creator's templates
        templates = await db.templates.find(
            {"creator_id": creator['creator_id']},
            {"_id": 0}
        ).to_list(length=100)
        
        return {
            "creator": creator,
            "templates": templates
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting creator profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get creator profile")


@api_router.post("/creator/templates")
async def create_template(
    template_request: TemplateCreate,
    admin: Admin = Depends(get_current_admin)
):
    """
    PHASE 36: Create a new template (creator only)
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        # Get creator profile
        creator = await db.creator_profiles.find_one({"admin_id": admin_id})
        if not creator:
            raise HTTPException(status_code=403, detail="Not registered as creator. Please register first.")
        
        if creator['status'] != CreatorStatus.ACTIVE.value:
            raise HTTPException(status_code=403, detail="Creator account is not active")
        
        # Prepare template data for validation
        template_data = {
            "name": template_request.name,
            "description": template_request.description,
            "preview_images": template_request.preview_images,
            "category": template_request.category,
            "design_config": template_request.design_config,
            "theme_config": template_request.theme_config,
            "layout_structure": template_request.layout_structure
        }
        
        # Validate and sanitize template
        is_valid, issues, quality_score = validate_template(template_data)
        
        if not is_valid:
            return {
                "success": False,
                "message": "Template validation failed",
                "issues": issues,
                "quality_score": quality_score
            }
        
        # Sanitize template for storage
        sanitized_data = sanitize_template_for_storage(template_data)
        
        # Calculate performance score
        performance_score = calculate_performance_score(sanitized_data)
        
        # Create template
        template = Template(
            name=template_request.name,
            description=template_request.description,
            preview_images=template_request.preview_images,
            demo_url=template_request.demo_url,
            thumbnail=template_request.thumbnail,
            price=template_request.price,
            creator_id=creator['creator_id'],
            creator_name=creator['display_name'],
            category=template_request.category,
            event_types=template_request.event_types,
            tags=template_request.tags,
            design_config=sanitized_data['design_config'],
            theme_config=sanitized_data['theme_config'],
            layout_structure=template_request.layout_structure,
            status=TemplateStatus.DRAFT,  # Start as draft
            performance_score=performance_score,
            has_passed_security=True  # Passed our validation
        )
        
        doc = template.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.templates.insert_one(doc)
        
        # Update creator stats
        await db.creator_profiles.update_one(
            {"creator_id": creator['creator_id']},
            {"$inc": {"total_templates": 1}}
        )
        
        return {
            "success": True,
            "message": "Template created successfully",
            "template": doc,
            "quality_score": quality_score,
            "performance_score": performance_score
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating template: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create template")


@api_router.get("/creator/templates")
async def get_creator_templates(admin: Admin = Depends(get_current_admin)):
    """
    PHASE 36: Get all templates created by current creator
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        creator = await db.creator_profiles.find_one({"admin_id": admin_id})
        if not creator:
            raise HTTPException(status_code=403, detail="Not registered as creator")
        
        templates = await db.templates.find(
            {"creator_id": creator['creator_id']},
            {"_id": 0}
        ).sort("created_at", -1).to_list(length=100)
        
        return {
            "templates": templates,
            "total": len(templates)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting creator templates: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get creator templates")


@api_router.put("/creator/templates/{template_id}")
async def update_template(
    template_id: str,
    template_update: TemplateUpdate,
    admin: Admin = Depends(get_current_admin)
):
    """
    PHASE 36: Update template (creator only, must own template)
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        # Get creator profile
        creator = await db.creator_profiles.find_one({"admin_id": admin_id})
        if not creator:
            raise HTTPException(status_code=403, detail="Not registered as creator")
        
        # Get template and verify ownership
        template = await db.templates.find_one({
            "template_id": template_id,
            "creator_id": creator['creator_id']
        })
        
        if not template:
            raise HTTPException(status_code=404, detail="Template not found or access denied")
        
        # Prepare update data
        update_data = {k: v for k, v in template_update.model_dump().items() if v is not None}
        
        if not update_data:
            return {"success": False, "message": "No fields to update"}
        
        # If design/theme config is being updated, re-validate
        if any(k in update_data for k in ['design_config', 'theme_config', 'layout_structure']):
            validation_data = {
                "name": update_data.get('name', template['name']),
                "design_config": update_data.get('design_config', template['design_config']),
                "theme_config": update_data.get('theme_config', template['theme_config']),
                "layout_structure": update_data.get('layout_structure', template['layout_structure'])
            }
            
            is_valid, issues, quality_score = validate_template(validation_data)
            if not is_valid:
                return {
                    "success": False,
                    "message": "Template validation failed",
                    "issues": issues
                }
            
            # Sanitize updated data
            sanitized = sanitize_template_for_storage(validation_data)
            update_data['design_config'] = sanitized['design_config']
            update_data['theme_config'] = sanitized['theme_config']
            update_data['performance_score'] = calculate_performance_score(sanitized)
        
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        # Update template
        await db.templates.update_one(
            {"template_id": template_id},
            {"$set": update_data}
        )
        
        # Get updated template
        updated_template = await db.templates.find_one(
            {"template_id": template_id},
            {"_id": 0}
        )
        
        return {
            "success": True,
            "message": "Template updated successfully",
            "template": updated_template
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating template: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update template")


@api_router.put("/creator/templates/{template_id}/submit")
async def submit_template_for_review(
    template_id: str,
    admin: Admin = Depends(get_current_admin)
):
    """
    PHASE 36: Submit template for admin review
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        creator = await db.creator_profiles.find_one({"admin_id": admin_id})
        if not creator:
            raise HTTPException(status_code=403, detail="Not registered as creator")
        
        # Get template
        template = await db.templates.find_one({
            "template_id": template_id,
            "creator_id": creator['creator_id']
        })
        
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        if template['status'] == TemplateStatus.PENDING_REVIEW.value:
            return {"success": False, "message": "Template is already pending review"}
        
        if template['status'] == TemplateStatus.APPROVED.value:
            return {"success": False, "message": "Template is already approved"}
        
        # Update status to pending review
        await db.templates.update_one(
            {"template_id": template_id},
            {
                "$set": {
                    "status": TemplateStatus.PENDING_REVIEW.value,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {
            "success": True,
            "message": "Template submitted for review"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting template: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to submit template")


@api_router.get("/creator/earnings")
async def get_creator_earnings(admin: Admin = Depends(get_current_admin)):
    """
    PHASE 36: Get creator earnings analytics
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        
        creator = await db.creator_profiles.find_one({"admin_id": admin_id})
        if not creator:
            raise HTTPException(status_code=403, detail="Not registered as creator")
        
        creator_id = creator['creator_id']
        
        # Get earnings by template
        pipeline = [
            {"$match": {"creator_id": creator_id}},
            {"$group": {
                "_id": "$template_id",
                "total_earnings": {"$sum": "$creator_earnings"},
                "sales_count": {"$count": {}}
            }},
            {"$sort": {"total_earnings": -1}}
        ]
        
        earnings_by_template = await db.template_purchases.aggregate(pipeline).to_list(length=100)
        
        # Enhance with template names
        for item in earnings_by_template:
            template = await db.templates.find_one(
                {"template_id": item['_id']},
                {"_id": 0, "name": 1}
            )
            item['template_name'] = template['name'] if template else "Unknown"
        
        # Calculate monthly earnings
        now = datetime.now(timezone.utc)
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
        
        this_month_purchases = await db.template_purchases.find({
            "creator_id": creator_id,
            "purchased_at": {"$gte": this_month_start.isoformat()}
        }).to_list(length=1000)
        
        last_month_purchases = await db.template_purchases.find({
            "creator_id": creator_id,
            "purchased_at": {
                "$gte": last_month_start.isoformat(),
                "$lt": this_month_start.isoformat()
            }
        }).to_list(length=1000)
        
        this_month_earnings = sum(p.get('creator_earnings', 0) for p in this_month_purchases)
        last_month_earnings = sum(p.get('creator_earnings', 0) for p in last_month_purchases)
        
        return {
            "total_earnings": creator.get('total_earnings', 0),
            "pending_payout": creator.get('pending_payout', 0),
            "this_month_earnings": this_month_earnings,
            "last_month_earnings": last_month_earnings,
            "total_sales": creator.get('total_sales', 0),
            "earnings_by_template": earnings_by_template
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting creator earnings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get creator earnings")


# ======================
# ADMIN ENDPOINTS
# ======================

@api_router.get("/admin/templates")
async def admin_list_all_templates(
    status: Optional[str] = None,
    admin: Admin = Depends(get_current_admin)
):
    """
    PHASE 36: Admin - List all templates with filters
    """
    try:
        query = {}
        if status:
            query["status"] = status
        
        templates = await db.templates.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=200)
        
        return {
            "templates": templates,
            "total": len(templates)
        }
    
    except Exception as e:
        logger.error(f"Error listing templates (admin): {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list templates")


@api_router.put("/admin/templates/{template_id}/review")
async def admin_review_template(
    template_id: str,
    review_request: AdminTemplateReviewRequest,
    admin: str = Depends(require_super_admin)
):
    """
    PHASE 36: Admin - Approve/reject/suspend template
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        action = review_request.action
        
        # Get template
        template = await db.templates.find_one({"template_id": template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        update_data = {
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if action == "approve":
            update_data["status"] = TemplateStatus.APPROVED.value
            update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
            update_data["approved_by"] = admin_id
            update_data["rejection_reason"] = None
            
            # Update creator stats
            await db.creator_profiles.update_one(
                {"creator_id": template['creator_id']},
                {"$inc": {"approved_templates": 1}}
            )
        
        elif action == "reject":
            update_data["status"] = TemplateStatus.REJECTED.value
            update_data["rejection_reason"] = review_request.rejection_reason
        
        elif action == "suspend":
            update_data["status"] = TemplateStatus.SUSPENDED.value
            update_data["rejection_reason"] = review_request.rejection_reason
        
        # Update template
        await db.templates.update_one(
            {"template_id": template_id},
            {"$set": update_data}
        )
        
        # Log audit trail
        audit_log = {
            "log_id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "action": f"template_{action}",
            "details": {
                "template_id": template_id,
                "template_name": template['name'],
                "reason": review_request.rejection_reason
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.audit_logs.insert_one(audit_log)
        
        return {
            "success": True,
            "message": f"Template {action}d successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reviewing template: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to review template")


@api_router.put("/admin/templates/{template_id}/featured")
async def admin_set_featured_template(
    template_id: str,
    is_featured: bool,
    featured_order: int = 0,
    admin: str = Depends(require_super_admin)
):
    """
    PHASE 36: Admin - Set template as featured
    """
    try:
        # Update template
        await db.templates.update_one(
            {"template_id": template_id},
            {
                "$set": {
                    "is_featured": is_featured,
                    "featured_order": featured_order,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        return {
            "success": True,
            "message": f"Template {'featured' if is_featured else 'unfeatured'} successfully"
        }
    
    except Exception as e:
        logger.error(f"Error setting featured template: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to set featured template")


@api_router.put("/admin/creators/{creator_id}/status")
async def admin_manage_creator(
    creator_id: str,
    action_request: AdminCreatorActionRequest,
    admin: str = Depends(require_super_admin)
):
    """
    PHASE 36: Admin - Suspend/ban/activate/verify creator
    """
    try:
        # get_current_admin returns the admins.id STRING (see auth.py), not a
        # dict - indexing it raised "string indices must be integers" on every
        # call, so this whole creator-marketplace feature 500'd.
        admin_id = admin
        action = action_request.action
        
        creator = await db.creator_profiles.find_one({"creator_id": creator_id})
        if not creator:
            raise HTTPException(status_code=404, detail="Creator not found")
        
        update_data = {
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        if action == "suspend":
            update_data["status"] = CreatorStatus.SUSPENDED.value
            update_data["suspension_reason"] = action_request.reason
        
        elif action == "ban":
            update_data["status"] = CreatorStatus.BANNED.value
            update_data["suspension_reason"] = action_request.reason
            
            # Also suspend all their templates
            await db.templates.update_many(
                {"creator_id": creator_id},
                {"$set": {"status": TemplateStatus.SUSPENDED.value}}
            )
        
        elif action == "activate":
            update_data["status"] = CreatorStatus.ACTIVE.value
            update_data["suspension_reason"] = None
        
        elif action == "verify":
            update_data["is_verified"] = True
            update_data["verification_badge"] = "verified"
        
        # Update creator
        await db.creator_profiles.update_one(
            {"creator_id": creator_id},
            {"$set": update_data}
        )
        
        # Log audit trail
        audit_log = {
            "log_id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "action": f"creator_{action}",
            "details": {
                "creator_id": creator_id,
                "creator_name": creator['display_name'],
                "reason": action_request.reason
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.audit_logs.insert_one(audit_log)
        
        return {
            "success": True,
            "message": f"Creator {action}d successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error managing creator: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to manage creator")


@api_router.get("/admin/marketplace/stats")
async def admin_marketplace_stats(admin: Admin = Depends(get_current_admin)):
    """
    PHASE 36: Admin - Get marketplace statistics
    """
    try:
        # Template stats
        total_templates = await db.templates.count_documents({})
        approved_templates = await db.templates.count_documents({"status": TemplateStatus.APPROVED.value})
        pending_templates = await db.templates.count_documents({"status": TemplateStatus.PENDING_REVIEW.value})
        
        # Creator stats
        total_creators = await db.creator_profiles.count_documents({})
        active_creators = await db.creator_profiles.count_documents({"status": CreatorStatus.ACTIVE.value})
        
        # Sales stats
        total_purchases = await db.template_purchases.count_documents({})
        total_revenue = await db.template_purchases.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$amount_paid"}}}
        ]).to_list(length=1)
        
        total_revenue_value = total_revenue[0]['total'] if total_revenue else 0
        
        # Top templates
        top_templates = await db.templates.find(
            {"status": TemplateStatus.APPROVED.value},
            {"_id": 0, "template_id": 1, "name": 1, "purchase_count": 1, "view_count": 1, "rating_average": 1}
        ).sort("purchase_count", -1).limit(10).to_list(length=10)
        
        return {
            "templates": {
                "total": total_templates,
                "approved": approved_templates,
                "pending_review": pending_templates
            },
            "creators": {
                "total": total_creators,
                "active": active_creators
            },
            "sales": {
                "total_purchases": total_purchases,
                "total_revenue": total_revenue_value
            },
            "top_templates": top_templates
        }
    
    except Exception as e:
        logger.error(f"Error getting marketplace stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get marketplace stats")


# ==========================================
# PHASE 37: WEDDING OWNERSHIP, DRAFT SYSTEM & PUBLISH WORKFLOW
# ==========================================

@api_router.post("/weddings")
async def create_wedding(
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """
    Create a new wedding in DRAFT status
    """
    try:
        admin_id = current_admin
        title = request.get('title')
        slug = request.get('slug')
        description = request.get('description')
        wedding_date = request.get('wedding_date')
        
        if not title or not slug:
            raise HTTPException(status_code=400, detail="Title and slug are required")
        
        # Convert wedding_date string to datetime if provided
        if wedding_date and isinstance(wedding_date, str):
            from dateutil import parser
            wedding_date = parser.parse(wedding_date)
        
        result = await wedding_lifecycle_service.create_wedding(
            admin_id=admin_id,
            title=title,
            slug=slug,
            description=description,
            wedding_date=wedding_date
        )
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating wedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/weddings/{wedding_id}")
async def update_wedding(
    wedding_id: str,
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """
    Update wedding details
    Allowed in DRAFT, READY, or PUBLISHED status
    """
    try:
        admin_id = current_admin
        
        # Extract fields from request
        title = request.get('title')
        description = request.get('description')
        wedding_date = request.get('wedding_date')
        selected_design_key = request.get('selected_design_key')
        selected_features = request.get('selected_features')
        groom_name = request.get('groom_name')
        bride_name = request.get('bride_name')
        event_date = request.get('event_date')
        venue = request.get('venue')
        
        # Convert date strings to datetime if provided
        if wedding_date and isinstance(wedding_date, str):
            from dateutil import parser
            wedding_date = parser.parse(wedding_date)
        if event_date and isinstance(event_date, str):
            from dateutil import parser
            event_date = parser.parse(event_date)
        
        result = await wedding_lifecycle_service.update_wedding(
            wedding_id=wedding_id,
            admin_id=admin_id,
            title=title,
            description=description,
            wedding_date=wedding_date,
            selected_design_key=selected_design_key,
            selected_features=selected_features,
            groom_name=groom_name,
            bride_name=bride_name,
            event_date=event_date,
            venue=venue
        )
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating wedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/weddings/estimate-cost")
async def estimate_wedding_cost(
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """
    Estimate credit cost for a wedding configuration
    Does not deduct credits - preview only
    """
    try:
        design_key = request.get('design_key', '')
        selected_features = request.get('selected_features', [])
        # 2026-09 — Optional invitation_category so non-wedding estimates
        # (baby_birthday / half_saree / puberty / dhoti) use the right
        # pricing source. Defaults to "wedding" for backwards compat.
        invitation_category = (request.get('invitation_category') or 'wedding').lower()
        # Optional explicit expiry tier id — resolves credits server-side
        tier_id = request.get('expiry_tier') or ''
        tier_credits = 0
        if tier_id:
            tier_doc = await db['expiry_tiers'].find_one({'id': tier_id})
            if tier_doc and isinstance(tier_doc.get('credits'), (int, float)):
                tier_credits = int(tier_doc['credits'])
        cost_breakdown = await wedding_lifecycle_service.calculate_cost_for_wedding(
            {
                'invitation_category': invitation_category,
                'selected_design_key': design_key,
                'selected_features': selected_features,
            },
            expiry_tier_credits=tier_credits,
            user_type="photographer",
        )

        return {
            'success': True,
            'cost_breakdown': cost_breakdown
        }
    except Exception as e:
        logger.error(f"Error estimating cost: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/weddings")
async def get_admin_weddings(
    status: Optional[str] = None,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Get all weddings owned by current admin
    Optional filtering by status
    """
    try:
        admin_id = current_admin
        
        query = {'admin_id': admin_id}
        if status:
            query['status'] = status
        
        weddings_cursor = db['profiles'].find(query, {'_id': 0}).sort('created_at', -1)
        weddings = await weddings_cursor.to_list(length=2000)
        
        # Get admin credits for UI display
        admin = await db['admins'].find_one({'id': admin_id})
        total_credits = admin.get('total_credits', 0)
        used_credits = admin.get('used_credits', 0)
        available_credits = total_credits - used_credits
        
        # Enrich weddings with credit estimates for drafts (category-aware)
        for wedding in weddings:
            if wedding.get('status') in ['draft', 'ready']:
                cost_breakdown = await wedding_lifecycle_service.calculate_cost_for_wedding(
                    wedding,
                    expiry_tier_credits=0,
                    user_type="photographer",
                )
                wedding['estimated_cost'] = cost_breakdown['total']
                wedding['cost_breakdown'] = cost_breakdown
        
        return {
            'success': True,
            'weddings': weddings,
            'total_count': len(weddings),
            'admin_credits': {
                'total': total_credits,
                'used': used_credits,
                'available': available_credits
            }
        }
    except Exception as e:
        logger.error(f"Error getting weddings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/weddings/{wedding_id}")
async def get_wedding_details(
    wedding_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Get detailed wedding information
    Includes credit estimation and ready status
    """
    try:
        admin_id = current_admin
        admin_doc = await db['admins'].find_one({'id': admin_id})
        role = admin_doc.get('role', 'admin') if admin_doc else 'admin'
        
        # Super admin can access all, regular admin only own
        query = {'id': wedding_id}
        if role != 'super_admin':
            query['admin_id'] = admin_id
        
        wedding = await db['profiles'].find_one(query, {'_id': 0})
        if not wedding:
            raise HTTPException(status_code=404, detail="Wedding not found")
        
        # Calculate credit cost (category-aware)
        cost_breakdown = await wedding_lifecycle_service.calculate_cost_for_wedding(
            wedding,
            expiry_tier_credits=0,
            user_type="photographer",
        )
        
        # Check ready status
        is_ready, missing_fields = await wedding_lifecycle_service.check_ready_status(wedding)
        
        # Get admin credits
        admin = await db['admins'].find_one({'id': wedding.get('admin_id')})
        total_credits = admin.get('total_credits', 0) if admin else 0
        used_credits = admin.get('used_credits', 0) if admin else 0
        available_credits = total_credits - used_credits
        
        return {
            'success': True,
            'wedding': wedding,
            'cost_breakdown': cost_breakdown,
            'is_ready': is_ready,
            'missing_fields': missing_fields,
            'can_publish': is_ready and available_credits >= cost_breakdown['total'],
            'admin_credits': {
                'total': total_credits,
                'used': used_credits,
                'available': available_credits
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting wedding details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/weddings/{wedding_id}/status")
async def update_wedding_status(
    wedding_id: str,
    request: Dict[str, str],
    current_admin: dict = Depends(get_current_admin)
):
    """
    Update wedding status (DRAFT -> READY -> PUBLISHED -> ARCHIVED)
    """
    try:
        admin_id = current_admin
        new_status = request.get('status')
        
        if new_status not in ['draft', 'ready', 'published', 'archived']:
            raise HTTPException(status_code=400, detail="Invalid status")
        
        wedding = await db['profiles'].find_one({
            'id': wedding_id,
            'admin_id': admin_id
        })
        
        if not wedding:
            raise HTTPException(status_code=404, detail="Wedding not found")
        
        current_status = wedding.get('status', 'draft')
        
        # Validate status transition
        valid_transitions = {
            'draft': ['ready'],
            'ready': ['draft', 'published'],
            'published': ['archived'],
            'archived': []
        }
        
        if new_status not in valid_transitions.get(current_status, []):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from {current_status} to {new_status}"
            )
        
        # For READY status, validate required fields
        if new_status == 'ready':
            is_ready, missing_fields = await wedding_lifecycle_service.check_ready_status(wedding)
            if not is_ready:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot mark as ready. Missing: {', '.join(missing_fields)}"
                )
        
        # Update status
        await db['profiles'].update_one(
            {'id': wedding_id},
            {
                '$set': {
                    'status': new_status,
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            'success': True,
            'wedding_id': wedding_id,
            'old_status': current_status,
            'new_status': new_status,
            'message': f'Wedding status updated to {new_status}'
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating wedding status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/weddings/{wedding_id}/publish")
async def publish_wedding(
    wedding_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Publish a wedding - deducts credits atomically
    This is the main publish endpoint
    """
    try:
        admin_id = current_admin
        
        result = await wedding_lifecycle_service.publish_wedding(
            wedding_id,
            admin_id
        )

        # Feb 2026 — Auto-archive to studio's connected Google Drive.
        # No-op if the studio hasn't connected.  Runs in background; the
        # publish response is returned immediately.
        try:
            from drive_archive import enqueue_archive as _drive_enqueue
            await _drive_enqueue(db, wedding_id)
        except Exception as _e:
            logger.warning("drive-archive enqueue failed for %s: %s", wedding_id, _e)

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error publishing wedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/weddings/{wedding_id}/upgrade")
async def upgrade_wedding_features(
    wedding_id: str,
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """
    Upgrade published wedding with new design or features
    Deducts only the difference in credits
    """
    try:
        admin_id = current_admin
        new_design_key = request.get('design_key')
        new_features = request.get('selected_features')
        
        result = await wedding_lifecycle_service.upgrade_wedding_features(
            wedding_id,
            admin_id,
            new_design_key,
            new_features
        )
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error upgrading wedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/weddings/{wedding_id}/archive")
async def archive_wedding(
    wedding_id: str,
    current_admin: dict = Depends(get_current_admin)
):
    """
    Archive a wedding - no credit refund
    """
    try:
        admin_id = current_admin
        
        result = await wedding_lifecycle_service.archive_wedding(
            wedding_id,
            admin_id
        )
        
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error archiving wedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/weddings/{wedding_id}/slug/validate")
async def validate_slug(
    wedding_id: str,
    request: Dict[str, str],
    current_admin: dict = Depends(get_current_admin)
):
    """
    Validate slug uniqueness
    """
    try:
        slug = request.get('slug', '')
        
        if not slug:
            return {'valid': False, 'message': 'Slug is required'}
        
        is_unique, error_message = await wedding_lifecycle_service.validate_slug_uniqueness(
            slug,
            exclude_wedding_id=wedding_id
        )
        
        return {
            'valid': is_unique,
            'message': error_message if not is_unique else 'Slug is available'
        }
    except Exception as e:
        logger.error(f"Error validating slug: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/features/registry")
async def get_feature_registry(
    category: Optional[str] = None,
    tier: Optional[str] = None
):
    """
    Get available features with credit costs
    Public endpoint for feature discovery
    """
    try:
        from feature_registry import FeatureRegistry
        registry = FeatureRegistry()
        
        features = registry.get_enabled_features()
        
        # Filter by category if provided
        if category:
            features = [f for f in features if f.category.value == category]
        
        # Filter by tier if provided
        if tier:
            features = [f for f in features if f.tier.value == tier]
        
        # Convert to dict for JSON response
        features_list = [f.model_dump() for f in features]
        
        return {
            'success': True,
            'features': features_list,
            'total_count': len(features_list)
        }
    except Exception as e:
        logger.error(f"Error getting feature registry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SPRINT 4: AI STORY COMPOSER ====================
# Google Gemini via the direct google-generativeai SDK (GEMINI_API_KEY)

from pydantic import BaseModel as _AIBaseModel
import uuid as _ai_uuid

class AIStoryRequest(_AIBaseModel):
    kind: str = "invitation"  # invitation | love_story | event_intro | thank_you | vows
    bride: str
    groom: str
    theme: str = "royal_mughal"
    tone: str = "cinematic_royal"
    language: str = "English"
    event_name: str = ""
    notes: str = ""
    # 2026-07 — Model picker. "claude" (default) or "gemini".
    model: str = "claude"


def _build_ai_prompt(req: AIStoryRequest) -> str:
    kind_briefs = {
        "invitation":  "Write a short premium invitation paragraph (4-6 sentences) that warmly requests the recipient's presence at the wedding.",
        "love_story":  "Write a heartfelt 'how we met' love story (6-8 sentences) for an Indian wedding invitation.",
        "event_intro": "Write a 2-3 sentence elegant introduction for the event named below.",
        "thank_you":   "Write a tender thank-you note to wedding guests (3-5 sentences).",
        "vows":        "Write personal wedding vows (4-6 sentences) the groom might say to the bride.",
    }
    brief = kind_briefs.get(req.kind, kind_briefs["invitation"])
    tone_hints = {
        "cinematic_royal":    "Tone: cinematic, royal, slow, emotionally rich. Think Sanjay Leela Bhansali film. Use 'thou-shalt-not-be-cheesy' restraint.",
        "modern_minimal":     "Tone: modern, minimal, dignified. Short sentences. No purple prose.",
        "poetic_traditional": "Tone: poetic, traditional, gentle metaphor. May include one Sanskrit/Urdu phrase if natural (with English meaning).",
        "playful_punjabi":    "Tone: warm and playful with Punjabi cultural warmth. Still elegant. Avoid clichés.",
    }
    tone_hint = tone_hints.get(req.tone, tone_hints["cinematic_royal"])
    return (
        f"You are an award-winning Indian wedding copywriter. "
        f"{brief}\n\n"
        f"Couple: {req.bride} (bride) & {req.groom} (groom).\n"
        f"Theme: {req.theme.replace('_', ' ').title()}.\n"
        f"Event: {req.event_name or 'Wedding'}.\n"
        f"Language: write the output in {req.language}.\n"
        f"{tone_hint}\n"
        f"Additional context from the photographer: {req.notes or 'none'}.\n\n"
        f"Rules:\n"
        f"- Do NOT include any greeting like 'Dear guests' unless asked.\n"
        f"- Do NOT use emojis or hashtags.\n"
        f"- Do NOT mention you are an AI.\n"
        f"- Output ONLY the final prose, no headings, no quotes around it.\n"
        f"- Keep cinematic restraint — luxurious, never tacky."
    )


@api_router.post("/admin/ai/story")
async def ai_generate_story(req: AIStoryRequest, admin_id: str = Depends(get_current_admin)):
    """Generate cinematic Indian wedding copy via Google Gemini."""
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="AI service is not configured.")
    if not req.bride or not req.groom:
        raise HTTPException(status_code=400, detail="Bride and groom names are required.")
    try:
        # All generation routes through Gemini now. The legacy `model` field is
        # accepted for API compatibility but ignored — there is a single provider.
        provider, model_name = "gemini", DEFAULT_GEMINI_MODEL
        system_message = (
            "You are MAJA, a refined Indian wedding copywriter. "
            "You write cinematic, emotional, restrained prose. "
            "You never write cheesy, generic, or template-style copy."
        )
        prompt = _build_ai_prompt(req)
        story_text = await gemini_generate(system_message, prompt, model=model_name)

        # Persist a short audit record (best-effort, never blocks response)
        try:
            await db.ai_story_logs.insert_one({
                "id": str(_ai_uuid.uuid4()),
                "admin_id": admin_id,
                "kind": req.kind,
                "bride": req.bride,
                "groom": req.groom,
                "theme": req.theme,
                "tone": req.tone,
                "language": req.language,
                "model": f"{provider}:{model_name}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as _e:
            logger.warning(f"ai_story_logs insert failed: {_e}")

        return {"story": str(story_text).strip(), "model": f"{provider}:{model_name}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI story generation failed: {e}")
        err_msg = str(e).lower()
        if "budget" in err_msg or "exceeded" in err_msg or "quota" in err_msg or "rate" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="The AI muse is resting briefly. Please try again in a moment, or top up your Universal Key balance in Profile → Universal Key."
            )
        raise HTTPException(status_code=502, detail=f"AI service is temporarily unavailable. Please try again. ({str(e)[:120]})")


# ── AI predefined note suggestions ────────────────────────────────────────
# Generates a few short, selectable "about the bride/groom/couple" notes so the
# person building the invite can pick one instead of writing from scratch.
# Public + IP-rate-limited so it serves both the photographer wizard and the
# normal-user form. Degrades to curated templates when AI is unavailable.
class NoteSuggestRequest(_AIBaseModel):
    subject: str = "couple"     # bride | groom | couple
    bride: str = ""
    groom: str = ""
    tone: str = "warm"          # warm | poetic | playful | formal
    language: str = "English"


def _fallback_note_templates(req: "NoteSuggestRequest") -> List[str]:
    subj = (req.subject or "couple").lower()
    b = (req.bride or "the bride").strip()
    g = (req.groom or "the groom").strip()
    if subj == "bride":
        return [
            f"{b} lights up every room with her warmth and grace.",
            f"Gentle, radiant and endlessly kind — that is {b}.",
            f"{b} carries a quiet strength and a heart full of love.",
            f"With a smile that feels like home, {b} begins a new chapter.",
            f"Graceful, spirited and full of dreams — meet {b}.",
        ]
    if subj == "groom":
        return [
            f"{g} leads with a calm heart and a generous spirit.",
            f"Steady, kind and quick to laugh — that is {g}.",
            f"{g} brings warmth and quiet confidence to every moment.",
            f"A gentle soul with a brave heart — meet {g}.",
            f"Loyal, loving and full of purpose — that is {g}.",
        ]
    return [
        f"Two hearts, one beautiful beginning — {b} & {g}.",
        f"{b} and {g} found in each other a home for a lifetime.",
        f"A love written in the stars — {b} & {g} begin forever.",
        f"Where two stories become one — {b} & {g}.",
        f"Hand in hand, {b} and {g} step into their happily ever after.",
    ]


@api_router.post("/ai/note-suggestions")
async def ai_note_suggestions(req: NoteSuggestRequest, request: Request):
    """Return ~5 short selectable notes about the bride/groom/couple."""
    # Graceful fallback when AI isn't configured — never block the form.
    if not os.environ.get("GEMINI_API_KEY"):
        return {"suggestions": _fallback_note_templates(req), "ai": False}

    ip = request.client.host if request.client else "anon"
    if not check_translation_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many requests — please wait a moment.")

    subj = (req.subject or "couple").lower()
    who = {
        "bride": f"the bride{(' ' + req.bride) if req.bride else ''}",
        "groom": f"the groom{(' ' + req.groom) if req.groom else ''}",
    }.get(subj, f"the couple{(' ' + req.bride + ' & ' + req.groom) if (req.bride or req.groom) else ''}")

    system_message = (
        "You are a refined Indian wedding copywriter. Write short, heartfelt notes "
        "for a wedding invitation. No emojis, no hashtags, no quotes, never mention AI."
    )
    prompt = (
        f"Write 5 distinct short notes (each 1 sentence, max 22 words) about {who}. "
        f"Tone: {req.tone}. Language: {req.language}. "
        f"Return ONLY the 5 notes, one per line, no numbering, no extra text."
    )
    try:
        raw = await gemini_generate(system_message, prompt)
        lines = [ln.strip(" -•\t").strip() for ln in str(raw).split("\n")]
        suggestions = [ln for ln in lines if ln][:5]
        if len(suggestions) < 3:
            suggestions = _fallback_note_templates(req)
        return {"suggestions": suggestions, "ai": True}
    except Exception as e:
        logger.warning(f"note-suggestions failed, using templates: {e}")
        return {"suggestions": _fallback_note_templates(req), "ai": False}


# ──────────────────────────────────────────────────────────────────────
# AUTO-TRANSLATE — Gemini-powered translation of an invitation's text
# fields into every language the photographer enabled in Features.
# Stored on the profile under translations: {language: {field: value}}
# ──────────────────────────────────────────────────────────────────────
TRANSLATABLE_FIELDS = [
    "bride_name", "groom_name", "venue", "venue_address", "story",
    "wedding_invitation_text", "welcome_message",
]


@api_router.post("/admin/profiles/{profile_id}/translate")
async def auto_translate_profile(
    profile_id: str,
    admin_id: str = Depends(get_current_admin),
):
    """Translate this wedding's main text fields into every additional
    language the photographer enabled (couple.languages list).
    Uses Google Gemini via the direct google-generativeai SDK."""
    profile = await db.profiles.find_one({"id": profile_id})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.get("admin_id") != admin_id:
        # super_admin override
        admin_doc = await db.admins.find_one({"id": admin_id})
        if not admin_doc or admin_doc.get("role") not in ("super_admin", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Not your profile")

    ts_maja = (profile.get("theme_settings") or {}).get("maja") or {}
    additional_languages = ts_maja.get("languages") or profile.get("languages") or []
    main_language = (profile.get("language") or ["english"])
    if isinstance(main_language, list):
        main_language = main_language[0] if main_language else "english"
    languages = [l for l in additional_languages if str(l).lower() != str(main_language).lower()]
    if not languages:
        return {"translations": {}, "skipped": True, "reason": "No additional languages to translate."}

    # Gather payload
    payload = {f: profile.get(f) for f in TRANSLATABLE_FIELDS if profile.get(f)}
    if not payload:
        return {"translations": {}, "skipped": True, "reason": "No translatable fields populated."}

    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="LLM key not configured")

    translations: Dict[str, Dict[str, str]] = {}
    for lang in languages:
        try:
            system_message = (
                f"You are a professional translator. Translate the following Indian wedding invitation "
                f"fields from {main_language} into {lang}. Preserve names of people exactly. "
                f"Keep tone respectful and elegant. Return ONLY a valid JSON object with the same keys."
            )
            raw = await gemini_generate(system_message, json.dumps(payload, ensure_ascii=False))
            text = str(raw).strip()
            # Strip markdown fences if any
            if text.startswith("```"):
                text = text.strip("`").lstrip("json").strip()
                # remove any remaining backticks line
                if text.endswith("```"):
                    text = text[:-3].strip()
            try:
                obj = json.loads(text)
            except Exception:
                # crude fallback: keep raw under a single key
                obj = {"_raw": text}
            translations[str(lang).lower()] = obj
        except Exception as e:
            logger.warning(f"Translate {lang} failed: {e}")
            translations[str(lang).lower()] = {"_error": str(e)[:200]}

    await db.profiles.update_one(
        {"id": profile_id},
        {"$set": {"translations": translations, "translations_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"translations": translations, "languages": list(translations.keys()), "skipped": False}


@api_router.get("/admin/profiles/{profile_id}/translations")
async def get_profile_translations(
    profile_id: str,
    admin_id: str = Depends(get_current_admin),
):
    profile = await db.profiles.find_one({"id": profile_id}, {"_id": 0, "translations": 1, "translations_updated_at": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {
        "translations": profile.get("translations", {}),
        "updated_at": profile.get("translations_updated_at"),
    }


# ──────────────────────────────────────────────────────────────────────
# EXPIRY TIERS — link-lifetime tiers exposed to the publish step
# Admin-configurable via /api/admin/expiry-tiers (PUT)
# ──────────────────────────────────────────────────────────────────────
@api_router.get("/admin/expiry-tiers")
async def list_expiry_tiers(admin_id: str = Depends(get_current_admin)):
    """List all expiry tiers. Photographers see these in the publish step."""
    if await db.expiry_tiers.count_documents({}) == 0:
        defaults = [
            {"id": "1_month",  "label": "1 Month",  "days": 30,  "credits": 1, "order": 1},
            {"id": "3_months", "label": "3 Months", "days": 90,  "credits": 2, "order": 2},
            {"id": "6_months", "label": "6 Months", "days": 180, "credits": 3, "order": 3},
            {"id": "1_year",   "label": "1 Year",   "days": 365, "credits": 5, "order": 4},
        ]
        await db.expiry_tiers.insert_many(defaults)
    docs = await db.expiry_tiers.find({}, {"_id": 0}).sort("order", 1).to_list(50)
    return {"tiers": docs}


class ExpiryTierIn(_AIBaseModel):
    id: str
    label: str
    days: int
    credits: int
    order: int = 0


@api_router.put("/admin/expiry-tiers")
async def update_expiry_tiers(payload: List[ExpiryTierIn], admin_id: str = Depends(require_super_admin)):
    """Replace the full list of expiry tiers (super-admin only)."""
    docs = [t.model_dump() for t in payload]
    await db.expiry_tiers.delete_many({})
    if docs:
        await db.expiry_tiers.insert_many(docs)
    out = await db.expiry_tiers.find({}, {"_id": 0}).sort("order", 1).to_list(50)
    return {"tiers": out, "count": len(out)}






# ──────────────────────────────────────────────────────────────────────
# PHOTOS — super-admin view of every guest / face-match / gallery photo a
# user uploads to their invitation. Photos live in db.live_gallery_photos
# on disk under /app/uploads/weddings/{wedding_id}/{folder}/ where folder
# is "gallery" (photographer/user uploads) or "guest_uploads" (guests /
# face-match selfies). Grouped per event profile for the admin console.
# ──────────────────────────────────────────────────────────────────────
async def _gallery_profile_label(wid: str) -> dict:
    prof = await db.profiles.find_one({"$or": [{"id": wid}, {"slug": wid}]}, {"_id": 0})
    if not prof:
        return {"name": wid, "owner_kind": "unknown", "slug": None}
    bride = prof.get("bride_name") or (prof.get("couple") or {}).get("bride")
    groom = prof.get("groom_name") or (prof.get("couple") or {}).get("groom")
    name = " & ".join([n for n in [bride, groom] if n]) or prof.get("couple_name") or prof.get("title") or prof.get("event_name") or wid
    owner_kind = "user" if str(prof.get("admin_id", "")).startswith("user:") else "photographer"
    return {"name": name, "owner_kind": owner_kind, "slug": prof.get("slug")}


@api_router.get("/super-admin/gallery-uploads")
async def super_admin_gallery_uploads(admin_id: str = Depends(require_super_admin)):
    """One row per event profile that has uploaded photos: counts per folder
    (gallery / guest_uploads = face-match selfies) + on-disk folder paths."""
    photos = await db.live_gallery_photos.find({}, {"_id": 0}).to_list(100000)
    groups: Dict[str, dict] = {}
    for p in photos:
        wid = p.get("wedding_id") or p.get("profile_id")
        if not wid:
            continue
        g = groups.setdefault(wid, {"wedding_id": wid, "total": 0, "gallery": 0, "guest_uploads": 0, "last_at": None})
        folder = "guest_uploads" if p.get("source") == "guest" else "gallery"
        g[folder] += 1
        g["total"] += 1
        ca = p.get("created_at")
        if ca and (g["last_at"] is None or ca > g["last_at"]):
            g["last_at"] = ca
    out = []
    for wid, g in groups.items():
        label = await _gallery_profile_label(wid)
        g.update({
            "profile_name": label["name"],
            "owner_kind": label["owner_kind"],
            "slug": label["slug"],
            "disk_paths": {
                "gallery": f"/app/uploads/weddings/{wid}/gallery/",
                "guest_uploads": f"/app/uploads/weddings/{wid}/guest_uploads/",
            },
        })
        out.append(g)
    out.sort(key=lambda x: x.get("last_at") or "", reverse=True)
    return {"uploads": out, "count": len(out)}


@api_router.get("/super-admin/gallery-uploads/{wedding_id}")
async def super_admin_gallery_photos(wedding_id: str, admin_id: str = Depends(require_super_admin)):
    """Every photo for one event profile, tagged with its storage folder."""
    photos = await db.live_gallery_photos.find(
        {"$or": [{"wedding_id": wedding_id}, {"profile_id": wedding_id}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(5000)
    for p in photos:
        p["folder"] = "guest_uploads" if p.get("source") == "guest" else "gallery"
    label = await _gallery_profile_label(wedding_id)
    return {
        "wedding_id": wedding_id,
        "profile_name": label["name"],
        "owner_kind": label["owner_kind"],
        "disk_paths": {
            "gallery": f"/app/uploads/weddings/{wedding_id}/gallery/",
            "guest_uploads": f"/app/uploads/weddings/{wedding_id}/guest_uploads/",
        },
        "photos": photos,
        "count": len(photos),
    }


# Alias for legacy reference: maps (slug, ip, device_id, endpoint) → (ip, device_id, endpoint, slug)
async def check_submission_captcha_required(slug, ip_address, device_id, endpoint):
    return await check_submission_attempts(ip_address, device_id, endpoint, slug)

# =====================================================================
# Phase 38 — Premium features (Live Photo Wall, AI Suite, WhatsApp,
# Digital Shagun, Travel deep links, Smart RSVP, Analytics v2)
# =====================================================================
from premium_features import build_premium_router


async def _premium_ai_chat(system_msg: str, session_id: str, user_text: str) -> str:
    # session_id kept in the signature for call-site compatibility; Gemini is
    # stateless per request so it is unused.
    return await gemini_generate(system_msg, user_text)


premium_router = build_premium_router(
    db=db,
    get_current_admin=get_current_admin,
    require_admin=require_admin,
    ai_chat_factory=_premium_ai_chat,
)
app.include_router(premium_router)

# =====================================================================
# Bucket 1 — Admin Dashboard v2 (pagination, bulk actions, trash, tags,
# quick-edit, quick-stats, CSV export, notifications)
# =====================================================================
from admin_dashboard_v2 import build_admin_dashboard_v2_router
import aws_service
app.include_router(build_admin_dashboard_v2_router(
    db=db,
    require_admin=require_admin,
    log_audit_action=log_audit_action,
    wedding_lifecycle_service=wedding_lifecycle_service,
    aws_service=aws_service,
))

# Bucket 2 — Super Admin v2 (revenue/leaderboard/coupons/broadcast/settings/CMS/
# theme-rollout/impersonate/refund/login-history) + public CMS read endpoints.
from super_admin_v2 import build_super_admin_v2_router
_sa_v2_router, _public_cms_router = build_super_admin_v2_router(
    db=db,
    require_super_admin=require_super_admin,
    require_admin=require_admin,
    create_access_token=create_access_token,
    log_audit_action=log_audit_action,
)
app.include_router(_sa_v2_router)
app.include_router(_public_cms_router)

# =====================================================================
# Prompt 14 — Personalized Guest Experience
# =====================================================================
from guest_features import build_guest_router
guest_router = build_guest_router(db=db, require_admin=require_admin)
app.include_router(guest_router, prefix="/api")

# =====================================================================
# Prompt 05 + 13 — Live Photo Gallery with WebSocket
# =====================================================================
from live_gallery_features import build_live_gallery_router
# Built later, after user_auth defines get_current_public_user so the host-side
# (user) live-gallery routes can be auth'd. See block below.

# =====================================================================
# Prompt 07 — Guest Wishes Wall + Moderation
# =====================================================================
from wishes_features import build_wishes_router
wishes_router = build_wishes_router(db=db, require_admin=require_admin)
app.include_router(wishes_router)

# =====================================================================
# Photographer's Client portal — per-invitation scoped login giving the
# couple/family read-mostly access to RSVP, wishes, analytics & gallery.
# =====================================================================
from photographer_clients import build_photographer_clients_router
app.include_router(build_photographer_clients_router(
    db=db, get_current_admin=get_current_admin,
    get_current_event_client=get_current_event_client))

# =====================================================================
# Client budget — the studio's private ledger for one invitation:
# agreed total, payments received, what's left, and the promised date.
# =====================================================================
from client_budget import build_client_budget_router
# NOTE: client_budget's handlers read admin.get("admin_id")/("role"), so they need
# the DICT-returning dep (require_admin → {admin_id, role}), NOT get_current_admin
# which returns a bare id string (str.get(...) → AttributeError → 500).
app.include_router(build_client_budget_router(db=db, get_current_admin=require_admin))

# =====================================================================
# Prompt 16 — Analytics deep-dive (heatmap, funnel, geography, AI insights)
# =====================================================================
from analytics_extras import build_analytics_extras_router
analytics_extras_router = build_analytics_extras_router(
    db=db, require_admin=require_admin, ai_chat_factory=_premium_ai_chat
)
app.include_router(analytics_extras_router)

# =====================================================================
# Music — 20 curated CC0 background music presets
# =====================================================================
from music_library import build_music_library_router
app.include_router(build_music_library_router(), prefix="/api")

# =====================================================================
# Monetization — credit packs, Razorpay top-up, super-admin photographer detail
# =====================================================================
from monetization_features import build_monetization_router
monetization_router = build_monetization_router(
    db=db,
    require_admin=require_admin,
    require_super_admin=require_super_admin,
    razorpay_client=razorpay_client,
)
app.include_router(monetization_router)

# Pay-per-day reactivation of an EXPIRED invitation link (₹50/day default).
from link_reactivation import build_link_reactivation_router
app.include_router(build_link_reactivation_router(db, require_admin, razorpay_client))

# =====================================================================
# Studio Backup Storage — June 2026 feature
# Lets photographers store studio backups (10 GB / 100 GB / 1 TB plans
# defined and edited by super admin). See /app/backend/studio_storage.py
# for full flow + grace-window logic.
# =====================================================================
try:
    import logging as _logging
    _studio_log = _logging.getLogger("studio_storage_mount")
    import studio_storage as _studio_storage
    _studio_storage.init(database=db, razorpay_client=razorpay_client)
    app.include_router(_studio_storage.router, prefix="/api")
    _studio_log.info("[startup] studio_storage router mounted under /api")
except Exception as e:
    import logging as _logging
    _logging.getLogger("studio_storage_mount").exception(
        "[startup] studio_storage router failed to mount: %s", e
    )

# =====================================================================
# Public-user Auth — normal end-users (wedding guests) signup/login + Google
# =====================================================================
from user_auth import build_user_auth_router
user_auth_router, get_current_public_user = build_user_auth_router(
    db=db,
    password_hasher=get_password_hash,
    password_verifier=verify_password,
    # Same OTP store + helpers the photographer signup uses, so a normal user's
    # email is verified before the account exists. Passed in (not imported) to
    # keep user_auth free of a circular dependency on server.
    is_contact_verified=_is_verified,
    clear_otp=lambda key: _kv_del(_otp_key(key)),
)
app.include_router(user_auth_router)

# DPDP data tools (export + delete) for the normal-user identity.
from account_data import build_account_data_router
app.include_router(build_account_data_router(db, get_current_public_user))

# Now that get_current_public_user exists, build the live-gallery router so
# user-facing (host) live-photo endpoints can authenticate the calling user.
live_gallery_router = build_live_gallery_router(
    db=db, require_admin=require_admin, get_current_user=get_current_public_user,
)
app.include_router(live_gallery_router)

# =====================================================================
# User Features — design-pricing, user credit purchase, user-created invitations
# =====================================================================
from user_features import build_user_features_router
user_features_router = build_user_features_router(
    db=db,
    require_super_admin=require_super_admin,
    get_current_public_user=get_current_public_user,
    razorpay_client=razorpay_client,
    sanitize_html=sanitize_html,
    generate_slug=generate_slug,
    calculate_expiry_date=calculate_expiry_date,
    calculate_invitation_expires_at=calculate_invitation_expires_at,
)
app.include_router(user_features_router)

# Store / direct-purchase flow (no credits) — additive, runs alongside legacy.
from store_features import build_store_router, build_store_admin_router

# Buyer = a normal user (session cookie/bearer) OR a photographer (admin JWT).
# Both can browse designs, pay, and submit details; orders key on user_id so the
# same id is used for either kind. Fixes "checkout logs me out" for photographers.
async def get_current_buyer(authorization: Optional[str] = Header(default=None)):
    # Normal-user accounts are retired (Lane D): a couple-session cookie no
    # longer authenticates a buyer -- the ONLY accepted identity is a studio's
    # own Bearer JWT (same decode + event_client rejection as get_current_admin
    # in auth.py, so a Couple Access link can never pass as a buyer either).
    from auth import decode_access_token as _decode_buyer_jwt
    if authorization and authorization.lower().startswith("bearer "):
        payload = _decode_buyer_jwt(authorization.split(" ", 1)[1].strip())
        if payload and payload.get("typ") != "event_client":
            aid = payload.get("admin_id") or payload.get("sub")
            if aid:
                return {"user_id": aid, "kind": "photographer"}
    raise HTTPException(
        status_code=401,
        detail={"code": "NORMAL_USERS_RETIRED",
                "message": "Ordering is for partner photographers. Sign in as a studio."},
    )

store_router = build_store_router(
    db=db,
    razorpay_client=razorpay_client,
    get_current_public_user=get_current_buyer,
    require_super_admin=require_super_admin,
)
app.include_router(store_router)
# Build-queue spans ALL studios' orders — super-admin only (was require_admin,
# which let any photographer view/deliver other studios' orders).
app.include_router(build_store_admin_router(db=db, require_admin=require_super_admin))

# "I want a feature you don't sell yet" — buyer leaves the request + their phone
# number, the owner gets a highlighted notification and calls them back.
from feature_wishes import build_feature_wish_router
app.include_router(build_feature_wish_router(db=db, require_super_admin=require_super_admin))

# Support Desk (Phase 3) — receive/track/resolve support requests from couples
# and photographers, with an admin queue, assignment, SLA + audit trail.
from support_tickets import build_support_router
# ADMIN-side routes (queue/reply/patch/merge/stats) are platform-wide with no
# per-studio scoping — super-admin only (was require_admin, which let any
# photographer read/reply to every studio's AND every couple's support tickets,
# including refund/dispute conversations). Requester-side routes are separate
# (get_current_buyer) and unaffected.
app.include_router(build_support_router(db, get_current_buyer, require_super_admin))

# System-Health dashboard (Phase 2) — real API/DB/S3/Rekognition/email/SMS/Drive/
# job-heartbeat status for the super-admin ops console.
from system_health import build_system_health_router
# Platform-wide infra recon (DB/S3/Rekognition/Redis/queue depth) — super-admin only.
app.include_router(build_system_health_router(db, require_super_admin))

# User Investigation Center (Phase 5) — read-only 360° account view for
# support/abuse review, over device/login/payment/report data + failed attempts.
from user_investigation import build_investigation_router
# Full cross-account dossiers (any photographer or user) — super-admin only.
app.include_router(build_investigation_router(db, require_super_admin))

# Business Intelligence (Phase 11) — MRR/ARR/churn/growth/conversion/referral/
# coupon metrics computed over the real subscription + revenue collections.
from business_intelligence import build_bi_router
# Platform-wide MRR/ARR/churn/revenue — super-admin only (was require_admin,
# which exposed platform business metrics to any photographer).
app.include_router(build_bi_router(db, require_super_admin))

# Auto-moderation (Phase 9) — heuristic text screening (+ optional Rekognition
# image moderation) that feeds the existing pixora_reports queue.
from auto_moderation import build_auto_moderation_router
# Triggers a platform-wide Rekognition rescan of ALL studios' content — super-admin only.
app.include_router(build_auto_moderation_router(db, require_super_admin))

# Delivery tracking (Phase 12) — email/SMS send log + provider webhook receiver.
from delivery_tracking import build_delivery_router
# Platform-wide email/SMS delivery log across ALL studios — super-admin only.
app.include_router(build_delivery_router(db, require_super_admin))

# Storage Command Center (Phase 6) — real usage/growth/top-consumers/pool health
# + a labelled cost estimate.
from storage_analytics import build_storage_analytics_router
# Platform-wide storage overview (per-studio top-consumers, pool capacity) — must
# be super-admin. It also shadows a super-admin-gated duplicate of the same path
# in pixora_service (registered later); gating this one closes the weaker door.
app.include_router(build_storage_analytics_router(db, require_super_admin))

# Profitability (Phase 14) — real revenue minus labelled cost estimates (P&L).
from profitability import build_profitability_router
# Platform-wide P&L / margins — super-admin only (was require_admin, which
# exposed platform cost/profit estimates to any photographer).
app.include_router(build_profitability_router(db, require_super_admin))

# Face Search Operations (Phase 7) — indexed faces/collections/searches + Rekognition status.
from face_ops import build_face_ops_router
app.include_router(build_face_ops_router(db, require_admin))

# Provider management (Phase 15) — read-only env-presence + health (no secret values).
from providers_admin import build_providers_router
app.include_router(build_providers_router(db, require_admin))

# Photographer account security — self-service password/email/phone change +
# session revoke (reuses auth_sessions + the MFA engine). Audit report: gap #1.
from account_security import build_account_security_router
app.include_router(build_account_security_router(db, get_current_admin))

# Photographer consolidated earnings — dedicated view over the finance ledger.
from studio_earnings import build_studio_earnings_router
app.include_router(build_studio_earnings_router(db, get_current_admin))

from studio_insights import build_studio_insights_router
app.include_router(build_studio_insights_router(db, get_current_admin))

from portfolio_leads import build_portfolio_leads_router
app.include_router(build_portfolio_leads_router(db))

from studio_staff import build_studio_staff_router
app.include_router(build_studio_staff_router(db, get_current_admin))

from client_studio_service import build_client_studio_router
app.include_router(build_client_studio_router(db, get_current_admin, get_current_event_client))

# Disputes & chargebacks (Phase 4) — admin review/evidence/resolve workflow.
from disputes import build_disputes_router
# Refund disputes / chargebacks span ALL studios — super-admin only.
app.include_router(build_disputes_router(db, require_super_admin))

# Mass moderation (Phase 10) — bulk delete/resolve/suspend/restore + report queue.
from moderation_bulk import build_moderation_bulk_router
# Bulk delete/resolve/suspend acts across ALL studios' content and accounts — super-admin only.
app.include_router(build_moderation_bulk_router(db, require_super_admin))

# QR photo-sharing analytics (Phase 8) — scans/uploads/failed/storage + scan counter.
from qr_analytics import build_qr_analytics_router
# Platform-wide QR scan/upload analytics with zero per-studio scoping — super-admin only.
app.include_router(build_qr_analytics_router(db, require_super_admin))

# Admin MFA + granular RBAC (Phase 1) + audited impersonation (Phase 13).
from admin_security import build_admin_security_router
app.include_router(build_admin_security_router(
    db, require_admin, require_super_admin, create_access_token=create_access_token))

# Admin fulfillment console (manual done-for-you build: requests, deliver link,
# Drive folders, Events view). See INVITATION_FULFILLMENT.md.
from fulfillment_service import build_fulfillment_router
app.include_router(build_fulfillment_router(db=db, require_super_admin=require_super_admin))

@app.on_event("startup")
async def _seed_store_pricing():
    try:
        from store_features import seed_store_pricing
        await seed_store_pricing(db)
    except Exception as e:
        logger.warning("[startup] store pricing seed failed: %s", e)

# Subscription engine (Photographer Studio SaaS — replaces credits).
from subscription_service import build_subscription_router, seed_subscription_plans
app.include_router(build_subscription_router(
    db=db,
    razorpay_client=razorpay_client,
    require_admin=require_admin,
    require_super_admin=require_super_admin,
))

@app.on_event("startup")
async def _seed_subscription_plans():
    try:
        await seed_subscription_plans(db)
    except Exception as e:  # pragma: no cover - seed is best-effort
        logger.warning("[startup] subscription plan seed failed: %s", e)


@app.on_event("startup")
async def _backfill_studio_folders():
    # One-time (idempotent) reservation of portfolio / cloud-storage folders for
    # photographers who bought BEFORE the reserve-on-purchase hooks existed, so
    # their admin cards are populated without waiting for a renewal. Safe on every
    # boot: it only touches studios that hold the matching subscription and never
    # re-stamps a folder that already exists.
    try:
        from studio_folders import backfill_studio_folders
        made = await backfill_studio_folders(db)
        if made.get("portfolio") or made.get("cloud_storage"):
            logger.info("[startup] studio folder backfill: %s portfolio, %s cloud-storage",
                        made["portfolio"], made["cloud_storage"])
    except Exception as e:  # pragma: no cover - best-effort
        logger.warning("[startup] studio folder backfill failed: %s", e)


@app.on_event("startup")
async def _seed_pricing_engine():
    """Unified pricing engine, Phase 1: idempotent, additive, FLAG OFF.
    Seeds the new pricing collections + grandfathers existing links. Changes
    nothing a customer sees until `new_pricing_enabled` is switched on."""
    try:
        from pricing_migration import run_migration
        await run_migration(db)
    except Exception as e:  # pragma: no cover - seed is best-effort, never blocks boot
        logger.warning("[startup] pricing engine migration failed: %s", e)


@app.on_event("startup")
async def _seed_event_registry():
    """Dynamic Event Engine registry (Ganesh + future types) + module flag OFF.
    Idempotent, additive; changes nothing user-facing until the flag is on."""
    try:
        from event_schema import ensure_schema
        from event_registry import seed_event_registry
        await ensure_schema(db)           # collections + real indexes (Spec 04)
        await seed_event_registry(db)     # registry rows + module flag OFF
    except Exception as e:  # pragma: no cover - best-effort, never blocks boot
        logger.warning("[startup] event schema/registry seed failed: %s", e)


@app.on_event("startup")
async def _seed_test_accounts():
    # TEST-only comped accounts for owner dogfooding (runs after plan seed).
    try:
        from seed_test_accounts import seed_test_accounts
        await seed_test_accounts(db)
    except Exception as e:  # pragma: no cover - seed is best-effort
        logger.warning("[startup] test accounts seed failed: %s", e)

# Phase 1c: refresh-token rotation + device sessions (HttpOnly cookies).
from auth_sessions import build_auth_sessions_router
app.include_router(build_auth_sessions_router(db, get_current_admin_with_role))

# Phase 2: Design Marketplace config engine (module catalog + live config quote).
from marketplace_service import build_marketplace_router
app.include_router(build_marketplace_router(db, require_admin))

# Phase 4: universal autosave / draft persistence (resume-later, version history).
from drafts_service import build_drafts_router
app.include_router(build_drafts_router(db, require_admin))

# Browser -> S3 direct uploads. Every legacy upload endpoint does
# `data = await file.read()`, holding the whole file in this process's memory;
# a 200 MB film is 200 MB resident per concurrent upload, and a photographer
# pushing a 5,000-photo event competes with every guest opening an invitation.
# These two endpoints move the bytes out of the app tier entirely.
from storage_upload import build_storage_upload_router
app.include_router(build_storage_upload_router(db, require_admin))

# Direct-to-S3 media upload sessions (canonical 4-bucket layout, multipart for
# large files, resumable, server-verified completion). Control plane only — a
# 2 TB event shoot goes browser -> S3 without transiting this process.
from upload_sessions_service import (
    build_upload_sessions_router,
    cleanup_expired_upload_sessions as _cleanup_upload_sessions,
    ensure_media_indexes as _ensure_media_indexes,
)
app.include_router(build_upload_sessions_router(db, require_admin))


@app.on_event("startup")
async def _media_upload_indexes():
    try:
        await _ensure_media_indexes(db)
    except Exception as e:
        logger.warning("[media-upload] index ensure failed: %s", e)
    try:
        import face_quota
        await face_quota.ensure_indexes(db)
    except Exception as e:
        logger.warning("[face-quota] index ensure failed: %s", e)

# Photographer Portfolio module (albums / works / testimonials + public profile).
from portfolio_service import build_portfolio_router
app.include_router(build_portfolio_router(db, require_admin, require_super_admin))

# Occupancy Calendar (bookings, blocked dates, public availability).
from calendar_service import build_calendar_router
app.include_router(build_calendar_router(db, require_admin))

# Cloud Backup (folders, files, storage meter, recycle bin, history).
from cloud_backup_service import build_cloud_backup_router
app.include_router(build_cloud_backup_router(db, require_admin, uploads_root=UPLOADS_DIR.parent))

# "Your Weddings" — studio's published invitations + aggregated RSVP/wishes/
# gallery/donation stats (read-only surface over existing collections).
from studio_weddings import build_studio_weddings_router
app.include_router(build_studio_weddings_router(db, require_admin))

# Phase 10 — enterprise white-labeling (studio branding + entitlement)
from white_label_service import build_white_label_router
app.include_router(build_white_label_router(db, require_admin, require_super_admin))

# Pixora — photographer community (feed, reputation, achievements, challenges,
# leaderboard, hiring board).
from pixora_service import build_pixora_router, seed_pixora
app.include_router(build_pixora_router(db, require_admin, require_super_admin))

from pixora_dm import build_pixora_dm_router
app.include_router(build_pixora_dm_router(db, get_current_admin))

@app.on_event("startup")
async def _seed_pixora():
    try:
        await seed_pixora(db)
    except Exception as e:
        logger.warning("[startup] pixora seed failed: %s", e)

# Phase 2 — community plan gating: ONE-TIME grandfather backfill (stamps every
# existing studio so nobody loses access at rollout) + seeds the kill-switch flag.
# Idempotent and guarded by a marker, so it is safe to run on every boot.
@app.on_event("startup")
async def _community_gating_backfill():
    try:
        from community_gating import run_gating_backfill
        result = await run_gating_backfill(db)
        logger.info("[startup] community gating backfill: %s", result)
    except Exception as e:
        logger.warning("[startup] community gating backfill failed: %s", e)


# Every studio holding an ACTIVE portfolio plan gets its public slug, so it is
# in the sitemap and its directory card links to a name rather than a UUID.
# New purchases mint the slug at activation (subscription_service
# ._activate_portfolio_presence); this covers everyone who bought BEFORE that
# existed and was therefore invisible to search until somebody opened the page.
# Idempotent — it skips any studio that already has one.
@app.on_event("startup")
async def _portfolio_slug_backfill():
    try:
        from portfolio_service import backfill_portfolio_slugs
        result = await backfill_portfolio_slugs(db)
        logger.info("[startup] portfolio slug backfill: %s", result)
    except Exception as e:
        logger.warning("[startup] portfolio slug backfill failed: %s", e)

# Reclaim any stories that lapsed while the server was down (frees quota + files).
# Runtime expiry is handled opportunistically on each stories list + excluded from usage.
@app.on_event("startup")
async def _storage_maintenance():
    try:
        import storage_accounting
        n = await storage_accounting.purge_expired_stories(db)
        orphans = await storage_accounting.purge_orphan_uploads(db)
        logger.info("[startup] storage maintenance: %s expired stories, %s orphan uploads purged", n, orphans)
    except Exception as e:
        logger.warning("[startup] storage maintenance failed: %s", e)

# Lane A7 -- usage metering (per-event counters -> COGS estimate).
from usage_metering import build_usage_router, usage_flush_loop
app.include_router(build_usage_router(db, require_admin, require_super_admin))

@app.on_event("startup")
async def _start_usage_flush():
    try:
        asyncio.create_task(usage_flush_loop(db))
        logger.info("[startup] usage-metering flush loop started (leader-locked, every 300s)")
    except Exception as e:
        logger.warning("[startup] usage flush loop failed to start: %s", e)

# Phase 9 — monetization SKUs (storage add-ons, featured, verification, featured listing)
from monetization_service import build_monetization_router
app.include_router(build_monetization_router(db, require_admin, require_super_admin))

# Phase 11 — feature flags (future-feature switchboard)
from feature_flags_service import build_feature_flags_router, seed_feature_flags
app.include_router(build_feature_flags_router(db, require_super_admin))

@app.on_event("startup")
async def _seed_feature_flags():
    try:
        await seed_feature_flags(db)
    except Exception as e:
        logger.warning("[startup] feature flags seed failed: %s", e)

# Food-donation feature (leftover food -> nearby orphanages/childcare).
from food_features import build_food_router, seed_food_centers
app.include_router(build_food_router(db=db, require_super_admin=require_super_admin))

# Photographer directory (browse by city + real-time availability + reviews).
from photographer_directory import build_photographer_directory_router, seed_demo_photographers
app.include_router(build_photographer_directory_router(db=db, get_current_admin=get_current_admin))


@app.on_event("startup")
async def _seed_food_centers():
    await seed_food_centers(db)


@app.on_event("startup")
async def _seed_demo_photographers():
    await seed_demo_photographers(db)

# =====================================================================
# Celebration Translation — Gemini-backed translation (credit-gated)
# =====================================================================
from celebration_translation import build_celebration_translation_router
celebration_translation_router = build_celebration_translation_router(
    db=db,
    get_current_admin=require_admin,
    get_current_user=get_current_public_user,
)
app.include_router(celebration_translation_router, prefix="/api")

# =====================================================================
# Pricing & Discounts — theme bundle pricing + coupon codes
# =====================================================================
from pricing_features import build_pricing_router
pricing_router = build_pricing_router(
    db=db,
    require_super_admin=require_super_admin,
    get_current_public_user=get_current_public_user,
)
app.include_router(pricing_router)

# =====================================================================
# Sprint 8 — Smart Venue / Per-event maps / What3Words / Live ETA
# =====================================================================
from map_features import build_map_router
map_router = build_map_router(db=db, get_current_admin=get_current_admin)
app.include_router(map_router)

# =====================================================================
# Sprint 9 — Gift Registry (couple-controlled, optional)
# =====================================================================
from gift_registry import build_gift_router
gift_router = build_gift_router(db=db, get_current_admin=get_current_admin)
app.include_router(gift_router)

# =====================================================================
# Sprint 10 — Live AI Photo Gallery (S3 + Rekognition + CloudFront)
# =====================================================================
from gallery_features import (build_gallery_router, cleanup_expired_galleries,
                                cleanup_expired_selfies)


async def _gallery_archive_fn(*, studio_id, data, filename,
                              mime="image/jpeg", kind="image", folder_name=None):
    """Bridge used by the gallery bulk-upload "also keep a copy in storage"
    consent: durably mirror a photo into the studio's Cloud Backup. Reuses the
    shared cloud_backup helper; never raises (returns a status dict)."""
    from cloud_backup_service import store_studio_backup_bytes
    return await store_studio_backup_bytes(
        db, str(UPLOADS_DIR.parent), studio_id,
        data=data, filename=filename, mime=mime, kind=kind,
        folder_name=folder_name, source="live_gallery")


gallery_router = build_gallery_router(db=db, get_current_admin=get_current_admin,
                                       archive_fn=_gallery_archive_fn)
app.include_router(gallery_router)

# Camera SFTP transfer lane — auth/config/status/revocation only (image bytes go
# camera -> SFTP -> S3, never through here). Studio routes are owner-scoped;
# fleet lifecycle/monitoring is super-admin. The SFTP daemon itself runs as a
# separate process (backend/camera_sftp_server.py), not inside the web app.
from camera_router import build_camera_router
app.include_router(build_camera_router(db=db, get_current_admin=get_current_admin,
                                        require_super_admin=require_super_admin))

# Wedding Gallery Privacy — access codes, trusted-device tokens, rate-limited unlock
from gallery_privacy import build_privacy_router
gallery_privacy_router = build_privacy_router(
    db=db,
    get_current_admin=get_current_admin,
    get_password_hash=get_password_hash,
    verify_password=verify_password,
)
app.include_router(gallery_privacy_router)

# Face-recognition consent (DPDP) — guest opt-in recorded before face matching.
from face_consent import build_face_consent_router
app.include_router(build_face_consent_router(db))

# Cookie / tracking consent (DPDP + ePrivacy proof-of-consent). The frontend
# cookie banner posts the visitor's choice here for an auditable record.
from consent_routes import build_consent_router
app.include_router(build_consent_router(db))

# GST tax-invoice download (capability-token protected).
from invoice_service import build_invoice_router
app.include_router(build_invoice_router(db))

# =====================================================================
# Google Drive Auto-Archive — per-studio OAuth + background photo sync
# =====================================================================
from aws_service import s3 as _s3_client_fn, bucket as _bucket_fn
from drive_archive import build_drive_router, start_worker as _drive_start_worker
from auth import require_admin as _require_admin_for_drive
drive_router = build_drive_router(
    db=db,
    s3_client_fn=_s3_client_fn,
    bucket_fn=_bucket_fn,
    require_admin=_require_admin_for_drive,
)
app.include_router(drive_router)

@app.on_event("startup")
async def _drive_archive_startup():
    _drive_start_worker(db, _s3_client_fn, _bucket_fn)

# =====================================================================
# Storage Pool — V1 multi-drive storage (platform-owned drive pool).
# Super-admin account management + OAuth connect. Additive: no existing
# upload path is touched until the Phase-5 hooks land behind the
# storage_pool_enabled flag. See MULTI_DRIVE_STORAGE_DESIGN.md.
# =====================================================================
try:
    from storage_pool_service import build_storage_pool_router
    app.include_router(build_storage_pool_router(db, require_super_admin))
    logging.getLogger("storage_pool_mount").info(
        "[startup] storage pool router mounted")
except Exception as _sp_err:
    logging.getLogger("storage_pool_mount").exception(
        "[startup] storage pool router failed to mount: %s", _sp_err)

@app.on_event("startup")
async def _storage_pool_jobs_startup():
    # Hourly health/quota, daily reconcile, weekly forecast (Phase 6).
    # Harmless when the pool is empty; guarded so it can never block boot.
    try:
        from storage_pool_jobs import start_jobs
        start_jobs(db)
    except Exception as e:
        logging.getLogger("storage_pool_jobs").exception(
            "[startup] storage pool jobs failed to start: %s", e)

# =====================================================================
# Music Library — Enhanced 60-song music library with categories
# =====================================================================
from music_library import build_music_library_router
music_library_router = build_music_library_router()
app.include_router(music_library_router, prefix="/api")

# =====================================================================
# Story Service — AI-powered story generation using Gemini
# =====================================================================
from story_service import story_service

@api_router.post("/generate-love-story")
async def generate_love_story_endpoint(
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """Generate personalized love story using Gemini AI"""
    try:
        bride_name = request.get("bride_name", "")
        groom_name = request.get("groom_name", "")
        story_prompt = request.get("story_prompt")
        tone = request.get("tone", "romantic")
        
        if not bride_name or not groom_name:
            raise HTTPException(status_code=400, detail="Bride and groom names are required")
        
        story = await story_service.generate_love_story(
            bride_name=bride_name,
            groom_name=groom_name,
            story_prompt=story_prompt,
            tone=tone
        )
        
        return {
            "success": True,
            "story": story
        }
    except Exception as e:
        logger.error(f"Error generating love story: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/generate-event-description")
async def generate_event_description_endpoint(
    request: Dict[str, Any],
    current_admin: dict = Depends(get_current_admin)
):
    """Generate event description using Gemini AI"""
    try:
        event_type = request.get("event_type", "")
        bride_name = request.get("bride_name", "")
        groom_name = request.get("groom_name", "")
        date = request.get("date")
        venue = request.get("venue")
        
        if not event_type or not bride_name or not groom_name:
            raise HTTPException(status_code=400, detail="Event type and couple names are required")
        
        description = await story_service.generate_event_description(
            event_type=event_type,
            bride_name=bride_name,
            groom_name=groom_name,
            date=date,
            venue=venue
        )
        
        return {
            "success": True,
            "description": description
        }
    except Exception as e:
        logger.error(f"Error generating event description: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================================
# Super Admin Management — Credit packages, design pricing, user management
# =====================================================================
from super_admin_service import build_super_admin_router
super_admin_router = build_super_admin_router(
    db=db,
    get_current_admin=get_current_admin,
    require_super_admin=require_super_admin,
)
app.include_router(super_admin_router)

# =====================================================================
# Enhanced Admin Pricing — Features, Durations, Themes, Monthly Packs
# =====================================================================
from enhanced_admin_service import build_enhanced_admin_router
enhanced_admin_router = build_enhanced_admin_router(
    db=db,
    require_super_admin=require_super_admin
)
app.include_router(enhanced_admin_router)

# =====================================================================
# Restructured Admin Panel — Hierarchical pricing (User/Photographer)
# =====================================================================
from restructured_admin_service import build_restructured_admin_router
restructured_admin_router = build_restructured_admin_router(
    db=db,
    require_super_admin=require_super_admin
)
app.include_router(restructured_admin_router)

# =====================================================================
# User Purchase Flow — Browse, calculate, and purchase designs
# =====================================================================
from user_purchase_service import build_user_purchase_router
user_purchase_router = build_user_purchase_router(
    db=db,
    get_current_admin=get_current_admin,
)
app.include_router(user_purchase_router)

# =====================================================================
# Canonical Credit System endpoints (spec-compliant)
#   /api/super-admin/credits/{add,deduct,adjust,gift,refund}
#   /api/super-admin/admins/{admin_id}/{balance,ledger}
#   /api/account/{credits,ledger}
# =====================================================================
# Phase 1d: credits removed — subscription model replaces them. Credit system
# router intentionally NOT mounted (all /api/account/credits|ledger APIs retired).

# Gift-code redemption (sits on top of /credits/gift):
from gift_code_routes import build_gift_code_router
gift_code_router = build_gift_code_router(
    db=db,
    require_super_admin=require_super_admin,
    get_current_admin=get_current_admin,
)
app.include_router(gift_code_router)

# Real-money refunds (super-admin). Until this existed every refund had to be
# issued by hand in the Razorpay dashboard, outside the product, with nothing
# recorded against the order it belonged to.
from refunds_service import build_refunds_router
app.include_router(build_refunds_router(db, require_super_admin, razorpay_client))

# Photographer referral codes (viral growth on top of gift-code infra):
from photographer_referrals import build_photographer_referral_router
photographer_referral_router = build_photographer_referral_router(
    db=db,
    require_super_admin=require_super_admin,
    get_current_admin=get_current_admin,
)
app.include_router(photographer_referral_router)

# Boot-time seed: idempotently insert default durations + features + mixed-theme
# so a fresh DB exposes a working purchase flow before the super-admin opens
# the pricing editor. Existing rows are NOT overwritten (the seed only inserts
# when its target collections are empty).
@app.on_event("startup")
async def _seed_credit_system_defaults():
    try:
        # Seed the user-facing purchase catalogue (expiry tiers + addons) ONCE
        # at boot so the public endpoints never race on a cold first request.
        from user_features import seed_user_purchase_catalog
        await seed_user_purchase_catalog(db)
    except Exception as e:
        logger.warning("[credit-system] user-catalog seed failed: %s", e)
    try:
        from enhanced_pricing_models import DurationOption, MixedThemePricing
        if await db.duration_options.count_documents({}) == 0:
            defaults = [
                DurationOption(duration_id="1day",       label="1 Day",     days=1,
                               user_credits=2,  photographer_credits=1).dict(),
                DurationOption(duration_id="7days",      label="7 Days",    days=7,
                               user_credits=8,  photographer_credits=4).dict(),
                DurationOption(duration_id="30days",     label="30 Days",   days=30,
                               user_credits=20, photographer_credits=10).dict(),
                DurationOption(duration_id="unlimited",  label="Unlimited", days=None,
                               user_credits=50, photographer_credits=25).dict(),
            ]
            await db.duration_options.insert_many(defaults)
            logger.info("[credit-system] seeded %d default duration options", len(defaults))
        if await db.mixed_theme_pricing.count_documents({}) == 0:
            await db.mixed_theme_pricing.insert_one(
                MixedThemePricing(user_additional_credits=50,
                                  photographer_additional_credits=30).dict()
            )
            logger.info("[credit-system] seeded default mixed-theme pricing")
    except Exception as e:
        logger.warning("[credit-system] default seed failed: %s", e)


@app.on_event("startup")
async def _ensure_financial_safety_indexes():
    """
    Create unique indexes that backstop the atomic financial fixes
    (Razorpay verify-payment, gift-code redeem). Idempotent.
    """
    try:
        # Razorpay: prevent the same payment_id from being credited twice
        # under any code path. Sparse so historical rows without the field
        # don't all collide.
        await db.payment_records.create_index(
            [("razorpay_payment_id", 1)],
            unique=True,
            sparse=True,
            name="uniq_razorpay_payment_id",
        )
        logger.info("[indexes] payment_records.razorpay_payment_id unique index ready")
    except Exception as e:
        logger.warning("[indexes] payment_records index failed: %s", e)

    try:
        # Gift codes: per-account redemption uniqueness (atomic per_account_limit=1).
        await db.gift_code_redemptions.create_index(
            [("code", 1), ("admin_id", 1)],
            unique=True,
            name="uniq_gift_redemption_per_account",
        )
        logger.info("[indexes] gift_code_redemptions.(code,admin_id) unique index ready")
    except Exception as e:
        logger.warning("[indexes] gift_code_redemptions index failed: %s", e)

    try:
        # Active-subscription uniqueness: at most one ACTIVE subscription per
        # (studio, product, coverage-start). Legitimate sequential stacking always
        # produces DISTINCT current_period_start values, so only a concurrent
        # verify/webhook race — two rows computing the same start — collides, and
        # the app catches the violation and recomputes (subscription_service). The
        # predicate is data->> form so it builds regardless of column promotion.
        # If historical active-duplicates already exist the build fails and is
        # logged (protection deferred until they're cleaned), same as any unique idx.
        await db.subscriptions.create_index(
            [("studio_id", 1), ("product", 1), ("current_period_start", 1)],
            unique=True,
            partial="(data->>'status') = 'active'",
            name="uniq_active_sub_per_studio_product",
        )
        logger.info("[indexes] subscriptions active-uniqueness index ready")
    except Exception as e:
        logger.warning("[indexes] subscriptions active-uniqueness index failed (existing active dupes?): %s", e)

    try:
        # Pending-subscription uniqueness: at most one PENDING subscription per
        # (studio, product, tier, cycle). This is what actually closes the
        # concurrent-create race in subscription_service.create_subscription --
        # its own read-then-insert reuse check is a fast-path optimisation, not
        # a guarantee, so N simultaneous POST /api/subscriptions/create for the
        # same purchase intent could each pass the check and each insert their
        # own pending row (+ Razorpay order) before this existed. A loser's
        # insert now raises a UniqueViolationError, which the handler catches
        # and turns into the same reused-pending response the sequential
        # double-click path returns. If historical pending-duplicates already
        # exist the build fails and is logged, same as any unique index here.
        await db.subscriptions.create_index(
            [("studio_id", 1), ("product", 1), ("tier", 1), ("cycle", 1)],
            unique=True,
            partial="(data->>'status') = 'pending'",
            name="uniq_pending_sub_per_studio_product_tier_cycle",
        )
        logger.info("[indexes] subscriptions pending-uniqueness index ready")
    except Exception as e:
        logger.warning("[indexes] subscriptions pending-uniqueness index failed (existing pending dupes?): %s", e)

    # ── PHOTOGRAPHER DASHBOARD PERFORMANCE INDEXES ───────────────────
    # The dashboard query is:
    #   profiles.find({admin_id, is_template:{$ne:true}, deleted_at:None|missing})
    #         .sort(created_at: -1).skip(N).limit(12)
    # plus per-card quick-stats counts on rsvps/wishes/gallery_events/
    # credit_ledger by `profile_id`.  Without these indexes the dashboard
    # slows down quadratically once a studio grows past a few hundred
    # weddings — exactly the "loading too lazy" symptom reported.
    try:
        await db.profiles.create_index(
            [("admin_id", 1), ("created_at", -1)],
            name="profiles_admin_created_desc",
        )
        await db.profiles.create_index(
            [("admin_id", 1), ("status", 1), ("created_at", -1)],
            name="profiles_admin_status_created",
        )
        await db.profiles.create_index(
            [("admin_id", 1), ("deleted_at", 1)],
            name="profiles_admin_deleted",
            sparse=True,
        )
        await db.profiles.create_index(
            [("admin_id", 1), ("archived_at", 1)],
            name="profiles_admin_archived",
            sparse=True,
        )
        await db.profiles.create_index(
            [("admin_id", 1), ("event_date", 1)],
            name="profiles_admin_event_date",
        )
        await db.profiles.create_index("slug", name="profiles_slug")
        await db.profiles.create_index("id", name="profiles_uuid")
        logger.info("[indexes] profiles dashboard indexes ready")
    except Exception as e:
        logger.warning("[indexes] profiles dashboard indexes failed: %s", e)

    try:
        await db.rsvps.create_index("profile_id", name="rsvps_profile_id")
    except Exception as e:
        logger.warning("[indexes] rsvps.profile_id failed: %s", e)
    # `wishes` and `gallery_events` used to be indexed here. Neither collection
    # is written by anything: guest wishes live in `guest_wishes` (indexed below
    # as guest_wishes_profile_status, whose leading column is profile_id), and
    # nothing in the codebase reads or writes gallery_events at all. While
    # create_index was a no-op these lines were merely untrue; now that it
    # builds real indexes they would also CREATE the empty tables.
    try:
        await db.credit_ledger.create_index(
            [("profile_id", 1), ("type", 1)],
            name="credit_ledger_profile_type",
        )
    except Exception as e:
        logger.warning("[indexes] credit_ledger index failed: %s", e)

    # ── PUBLIC INVITATION READ-PATH INDEXES ──────────────────────────
    # GET /api/invite/{slug} and /full fan out to these collections on every
    # page open. Without these they were full collection scans — the main
    # lag/crash risk when a shared link is opened by many guests at once.
    # All idempotent + best-effort (a failed index never blocks startup).
    _read_path_indexes = [
        ("profile_media", [("profile_id", 1), ("order", 1)], "media_profile_order", {}),
        ("greetings", [("profile_id", 1), ("approval_status", 1), ("created_at", -1)], "greetings_profile_status", {}),
        ("guest_wishes", [("profile_id", 1), ("status", 1), ("approved_at", -1)], "guest_wishes_profile_status", {}),
        ("gift_registry", [("profile_id", 1)], "gift_registry_profile", {}),
        ("shagun_records", [("profile_id", 1), ("created_at", -1)], "shagun_profile_created", {}),
        # Referrals live in `referrals`, keyed by referrer_profile_id. The
        # `referral_codes` collection this line used to index was never written
        # to by anything — the index was the only evidence it existed.
        ("referrals", [("referrer_profile_id", 1)], "referrals_referrer_profile", {}),
        ("referrals", [("referral_code", 1)], "referrals_code", {}),
        ("invitation_visitors", [("visitor_key", 1)], "invitation_visitors_key", {}),
        ("view_sessions", [("session_id", 1), ("profile_id", 1)], "view_sessions_session_profile", {}),
        ("view_analytics", [("profile_id", 1)], "view_analytics_profile", {}),
        ("engagement_analytics", [("profile_id", 1)], "engagement_analytics_profile", {}),
        ("analytics", [("profile_id", 1)], "analytics_profile", {}),
        ("ip_location_cache", [("ip_address", 1)], "ip_location_cache_ip", {}),
        ("rate_limits", [("ip_address", 1), ("endpoint", 1), ("date", 1)], "rate_limits_ip_endpoint_date", {}),
        # ── 2026-08-17 forensic gap-list (query sites cited in
        # docs/FORENSIC_DISCOVERY_2026-08-17.md §4). gallery_photos.profile_id
        # was the single most-queried unindexed field in the schema (9+ sites).
        ("gallery_photos", [("profile_id", 1)], "gallery_photos_profile", {}),
        ("face_search_sessions", [("profile_id", 1)], "face_sessions_profile", {}),
        ("face_search_sessions", [("created_at", 1)], "face_sessions_created", {}),  # hourly TTL sweep
        ("guests", [("profile_id", 1), ("created_at", -1)], "guests_profile_created", {}),
        ("rsvps", [("profile_id", 1), ("guest_phone", 1)], "rsvps_profile_phone", {}),
        ("audit_logs", [("timestamp", -1)], "audit_logs_timestamp", {}),
        ("admins", [("role", 1)], "admins_role", {}),
        ("subscriptions", [("studio_id", 1), ("product", 1), ("status", 1)], "subs_studio_product_status", {}),
        ("orders", [("studio_id", 1), ("status", 1)], "orders_studio_status", {}),
        ("payments", [("studio_id", 1), ("status", 1)], "payments_studio_status", {}),
        ("invitation_orders", [("user_id", 1), ("created_at", -1)], "inv_orders_user_created", {}),
        ("invitation_orders", [("razorpay_order_id", 1)], "inv_orders_rzp_order", {}),
        ("portfolio_works", [("studio_id", 1)], "portfolio_works_studio", {}),
        ("portfolio_albums", [("studio_id", 1)], "portfolio_albums_studio", {}),
        ("pixora_posts", [("studio_id", 1)], "pixora_posts_studio", {}),
        ("pixora_follows", [("followee", 1)], "pixora_follows_followee", {}),
        ("live_gallery_photos", [("wedding_id", 1)], "live_gallery_wedding", {}),
        ("live_photos", [("profile_id", 1)], "live_photos_profile", {}),
    ]
    for coll, keys, name, opts in _read_path_indexes:
        try:
            await db[coll].create_index(keys, name=name, **opts)
        except Exception as e:
            logger.warning("[indexes] %s.%s failed: %s", coll, name, e)


@app.on_event("startup")
async def _production_readiness_warnings():
    """Enforce secure production config. Only fires when ENVIRONMENT=production
    (so local/dev stays quiet). CRITICAL items REFUSE TO BOOT in production;
    the escape hatch ALLOW_INSECURE_PROD=1 downgrades them to warnings for an
    emergency deploy. Non-critical items always warn. (MAJA_V2 Phase 0 / S13.)"""
    if os.environ.get("ENVIRONMENT", "").lower() not in ("production", "prod"):
        return

    critical = []
    if not os.environ.get("JWT_SECRET_KEY"):
        critical.append("JWT_SECRET_KEY is not set — legacy admin tokens are forgeable")
    if os.environ.get("CORS_ORIGINS", "*").strip() in ("", "*"):
        critical.append("CORS_ORIGINS is wildcard — set explicit frontend origin(s)")
    _whs = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    if not _whs or "PLACEHOLDER" in _whs:
        critical.append("RAZORPAY_WEBHOOK_SECRET unset — webhook accepts but will NOT credit")
    # DEV_MODE_OTP default is "0" (matches server.py OTP path); "1" leaks OTPs.
    if os.environ.get("DEV_MODE_OTP", "0") == "1":
        critical.append("DEV_MODE_OTP=1 — OTP is returned in API responses; set 0 in prod")

    warnings = []
    if not os.environ.get("REDIS_URL"):
        warnings.append("REDIS_URL unset — rate limiter is per-process (needed for multi-worker)")

    # AWS media storage. Warn-only, never critical: every AWS-dependent feature
    # already degrades gracefully (503 / "not configured"), and refusing to boot
    # over media config would take the whole site down for a photo-upload
    # outage. But a silently misconfigured bucket looks like "uploads are
    # broken" with nothing in the logs, so name it at boot.
    try:
        import aws_service as _aws
        if not _aws.credentials_available():
            warnings.append(
                "no AWS credentials resolved (env, profile, or instance role) — "
                "uploads, face search and CDN pushes are disabled")
        _unset = [c for c, b in _aws.bucket_config().items() if not b]
        if _unset:
            warnings.append(
                f"AWS bucket(s) not configured: {', '.join(sorted(_unset))} — set "
                f"AWS_S3_<CATEGORY>_BUCKET for each")
        if _aws.region() != "us-east-2":
            warnings.append(
                f"AWS_REGION is {_aws.region()!r}; the media buckets live in us-east-2 "
                f"— a region mismatch fails every S3 call with PermanentRedirect")
    except Exception as _e:                     # never let a check break boot
        warnings.append(f"AWS config check failed: {type(_e).__name__}")

    for i in warnings:
        logger.warning("[prod-readiness] %s", i)
    for i in critical:
        logger.error("[prod-readiness] CRITICAL: %s", i)

    if critical:
        allow = os.environ.get("ALLOW_INSECURE_PROD", "").lower() in ("1", "true", "yes")
        if allow:
            logger.error(
                "[prod-readiness] %d CRITICAL item(s) above; ALLOW_INSECURE_PROD is set — "
                "booting anyway. FIX THESE.", len(critical),
            )
        else:
            raise RuntimeError(
                f"[prod-readiness] refusing to boot: {len(critical)} critical hardening "
                f"item(s): {'; '.join(critical)}. Fix them, or set ALLOW_INSECURE_PROD=1 "
                f"to override for an emergency deploy."
            )


@app.on_event("startup")
async def _seed_super_admin_pricing_defaults():
    """Seed the Super-Admin Pricing Hub collections with sensible defaults so
    every consumer surface (LandingPage, photographer panel, design picker, …)
    has values to read from on day one.  Idempotent — only inserts when empty.
    """
    try:
        now = datetime.now(timezone.utc)

        # ---- Theme prices (audience-aware, credits) ----------------
        THEMES = [
            ("royal_mughal", 5, 3),
            ("south_indian_temple", 4, 2),
            ("modern_minimal", 3, 2),
            ("beach_destination", 4, 2),
            ("punjabi_sangeet", 5, 3),
            ("bengali_traditional", 4, 2),
            ("christian_elegant", 4, 2),
            ("muslim_nikah", 4, 2),
            # Align with the canonical super_admin_pricing.THEMES ids so seeded
            # prices actually map to real themes (was kerala_heritage/rajputana_royal).
            ("kerala_backwaters", 5, 3),
            ("nature_eco_wedding", 6, 4),
        ]
        if await db.pricing_theme_prices.count_documents({}) == 0:
            rows = []
            for tid, user_c, photog_c in THEMES:
                rows.append({"id": str(uuid.uuid4()), "audience": "normal_user",
                             "theme_id": tid, "base_price": user_c,
                             "discount_enabled": False, "updated_at": now})
                rows.append({"id": str(uuid.uuid4()), "audience": "photographer",
                             "theme_id": tid, "base_price": photog_c,
                             "discount_enabled": False, "updated_at": now})
            await db.pricing_theme_prices.insert_many(rows)
            logger.info("[pricing-hub] seeded %d theme price rows", len(rows))

        # ---- Option prices (audience-aware, credits) ---------------
        OPTIONS = [
            # (option_key, user_credits, photographer_credits, free_for_photog)
            ("rsvp_basic", 0, 0, True),
            ("ai_story", 1, 1, False),
            ("live_gallery", 3, 2, False),
            ("ai_selfie_guests", 2, 1, False),
            ("background_music", 1, 0, True),
            ("multi_track_music", 2, 1, False),
            ("guest_messages", 1, 0, True),
            ("gift_registry", 1, 1, False),
            ("live_streaming", 5, 3, False),
            ("transport_help", 1, 1, False),
            ("guest_accommodation", 1, 1, False),
            ("dress_code", 0, 0, True),
            ("event_timeline", 0, 0, True),
            ("countdown_timer", 1, 0, True),
        ]
        if await db.pricing_option_prices.count_documents({}) == 0:
            rows = []
            for okey, user_c, photog_c, photog_free in OPTIONS:
                rows.append({"id": str(uuid.uuid4()), "audience": "normal_user",
                             "option_key": okey, "base_price": user_c,
                             "discount_enabled": False, "is_free": (user_c == 0),
                             "updated_at": now})
                rows.append({"id": str(uuid.uuid4()), "audience": "photographer",
                             "option_key": okey, "base_price": photog_c,
                             "discount_enabled": False,
                             "is_free": photog_free or (photog_c == 0),
                             "updated_at": now})
            await db.pricing_option_prices.insert_many(rows)
            logger.info("[pricing-hub] seeded %d option price rows", len(rows))

        # ---- Credit packs (audience-aware, rupees) -----------------
        if await db.pricing_credit_packs.count_documents({"audience": "normal_user"}) == 0:
            packs = [
                {"label": "Free",     "credits": 5,   "base_price": 0},
                {"label": "Silver",   "credits": 25,  "base_price": 99},
                {"label": "Gold",     "credits": 75,  "base_price": 249},
                {"label": "Platinum", "credits": 200, "base_price": 599},
            ]
            for p in packs:
                p.update({"id": str(uuid.uuid4()), "audience": "normal_user",
                          "discount_enabled": False, "is_active": True,
                          "created_at": now, "updated_at": now})
            await db.pricing_credit_packs.insert_many(packs)
            logger.info("[pricing-hub] seeded %d normal_user credit packs", len(packs))

        if await db.pricing_credit_packs.count_documents({"audience": "photographer"}) == 0:
            packs = [
                {"label": "Starter",  "credits": 25,  "base_price": 79},
                {"label": "Studio",   "credits": 100, "base_price": 299},
                {"label": "Atelier",  "credits": 300, "base_price": 799},
                {"label": "Maestro",  "credits": 750, "base_price": 1799},
            ]
            for p in packs:
                p.update({"id": str(uuid.uuid4()), "audience": "photographer",
                          "discount_enabled": False, "is_active": True,
                          "created_at": now, "updated_at": now})
            await db.pricing_credit_packs.insert_many(packs)
            logger.info("[pricing-hub] seeded %d photographer credit packs", len(packs))

        # ---- Photographer subscription plans -----------------------
        if await db.pricing_subscription_plans.count_documents({}) == 0:
            plans = [
                {"name": "Boutique",  "credits_per_month": 100, "duration_days": 30, "base_price": 499},
                {"name": "Studio",    "credits_per_month": 300, "duration_days": 30, "base_price": 1199},
                {"name": "Atelier",   "credits_per_month": 800, "duration_days": 30, "base_price": 2499},
            ]
            for p in plans:
                p.update({"id": str(uuid.uuid4()), "is_active": True,
                          "discount_enabled": False, "updated_at": now})
            await db.pricing_subscription_plans.insert_many(plans)
            logger.info("[pricing-hub] seeded %d subscription plans", len(plans))

    except Exception as e:
        logger.warning("[pricing-hub] default seed failed: %s", e)



# =====================================================================
# Razorpay Payment Integration — Credit purchases
# =====================================================================
# Phase 1d: credit-purchase Razorpay router retired (subscriptions replace credits).

# Daily cleanup jobs (3am IST + hourly selfie purge)
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger
    import pytz as _pytz
    _ist = _pytz.timezone("Asia/Kolkata")
    _gallery_scheduler = AsyncIOScheduler(timezone=_ist)

    async def _daily_gallery_cleanup():
        await cleanup_expired_galleries(db)

    async def _hourly_selfie_cleanup():
        await cleanup_expired_selfies(db)

    async def _daily_trash_purge():
        """Hard-delete trashed profiles older than the 5-day retention window
        (aligned with the storage-pool 5-day recycle so the app trash and the
        Drive-pool copies expire together). Refunds are NOT issued here (the
        refund happens on the explicit user purge action); this job just sweeps
        the storage so the trash collection doesn't grow unbounded."""
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
            docs = await db.profiles.find(
                {"deleted_at": {"$lt": cutoff, "$ne": None}},
                {"id": 1, "gallery_config": 1, "_id": 0},
            ).to_list(5000)
            cleaned_s3 = 0
            # Cascade children + external artifacts via the shared helper (also
            # used by the super-admin bulk-purge path, so the child-table list
            # stays in one place). See backend/profile_purge.py.
            from profile_purge import purge_profile_children
            for d in docs:
                pid = d.get("id")
                if not pid:
                    continue
                await purge_profile_children(
                    db, pid, d.get("gallery_config"), aws_service=aws_service)
                cleaned_s3 += 1
            res = await db.profiles.delete_many(
                {"deleted_at": {"$lt": cutoff, "$ne": None}}
            )
            logger.info(
                "[trash-purge] swept %d profiles older than 5d (S3 prefixes cleaned: %d)",
                res.deleted_count, cleaned_s3,
            )
        except Exception as e:
            logger.warning("[trash-purge] sweep failed: %s", e)

    async def _daily_storage_lifecycle():
        """Storage-subscription lifecycle: warn ~1 week before expiry, mark
        expired at period end, and purge backup files 1 day after expiry."""
        try:
            from subscription_service import run_storage_lifecycle
            from email_service import send_email as _se
            await run_storage_lifecycle(db, send_email=_se)
        except Exception as e:
            logger.warning("[storage-lifecycle] sweep failed: %s", e)

    async def _nightly_media_reconcile():
        """A5 -- reconciliation for the direct-S3 gallery path (the drive-pool
        storage backend already has its own in storage_pool_jobs.py). See
        media_reconcile.py: stale queued face searches, unindexed photos,
        missing-object sampling."""
        try:
            from media_reconcile import run_media_reconcile
            await run_media_reconcile(db)
        except Exception as e:
            logger.warning("[media-reconcile] sweep failed: %s", e)

    _gallery_scheduler.add_job(_daily_gallery_cleanup,
        CronTrigger(hour=3, minute=0, timezone=_ist), id="gallery_daily")
    _gallery_scheduler.add_job(_hourly_selfie_cleanup,
        CronTrigger(minute=15, timezone=_ist), id="selfie_hourly")
    _gallery_scheduler.add_job(_daily_trash_purge,
        CronTrigger(hour=4, minute=0, timezone=_ist), id="trash_purge_daily")
    _gallery_scheduler.add_job(_daily_storage_lifecycle,
        CronTrigger(hour=5, minute=0, timezone=_ist), id="storage_lifecycle_daily")
    _gallery_scheduler.add_job(_nightly_media_reconcile,
        CronTrigger(hour=3, minute=30, timezone=_ist), id="media_reconcile")

    async def _daily_storage_maintenance():
        # purge_orphan_uploads had no periodic caller — it ran once at boot only,
        # so orphaned /media/upload files (billed storage) accumulated unbounded
        # between restarts. Now swept daily (leader-gated with the rest).
        await _storage_maintenance()
    _gallery_scheduler.add_job(_daily_storage_maintenance,
        CronTrigger(hour=4, minute=30, timezone=_ist), id="storage_maintenance_daily")

    async def _hourly_upload_session_cleanup():
        # Abandoned direct-to-S3 upload sessions: abort the multipart upload /
        # delete the uncommitted object, mark the session expired. CAS-claimed
        # per row, bounded per tick; the bucket lifecycle rule (abort MPU @2d)
        # is the belt-and-braces behind this sweep.
        try:
            from upload_sessions_service import cleanup_expired_upload_sessions
            n = await cleanup_expired_upload_sessions(db)
            if n:
                logger.info("[media-upload] expired %d abandoned upload sessions", n)
        except Exception as e:
            logger.warning("[media-upload] session cleanup failed: %s", e)
        # Face-match quota holds time out for the same reason. Reads already
        # ignore an expired hold, so this only keeps the ledger tidy.
        try:
            import face_quota
            n = await face_quota.sweep_expired(db)
            if n:
                logger.info("[face-quota] expired %d abandoned reservations", n)
        except Exception as e:
            logger.warning("[face-quota] reservation sweep failed: %s", e)

    async def _daily_auth_session_cleanup():
        # refresh_tokens / device_sessions / jwt_blacklist rows previously
        # accumulated forever (nothing deleted them). Bounded daily sweep.
        try:
            from auth_sessions import cleanup_auth_sessions
            counts = await cleanup_auth_sessions(db)
            logger.info("[auth-sessions] cleanup: %s", counts)
        except Exception as e:
            logger.warning("[auth-sessions] cleanup failed: %s", e)

    async def _shagun_settlement_sweep():
        # Shagun uses each photographer's OWN Razorpay keys, so a platform-wide
        # webhook can't authenticate the callback. Instead we poll: any shagun
        # order that was created but never verified (guest's browser died after
        # paying) is checked against Razorpay with that photographer's keys and
        # settled. Without this the gift is captured but never recorded.
        try:
            from premium_features import reconcile_shagun_intents
            res = await reconcile_shagun_intents(db)
            if res and res.get("settled"):
                logger.info("[shagun] reconcile settled %s stranded gift(s)", res["settled"])
        except Exception as e:
            logger.warning("[shagun] reconcile sweep failed: %s", e)

    _gallery_scheduler.add_job(_shagun_settlement_sweep,
        IntervalTrigger(minutes=15), id="shagun_reconcile",
        max_instances=1, coalesce=True)

    _gallery_scheduler.add_job(_hourly_upload_session_cleanup,
        CronTrigger(minute=45, timezone=_ist), id="upload_session_hourly")
    _gallery_scheduler.add_job(_daily_auth_session_cleanup,
        CronTrigger(hour=5, minute=30, timezone=_ist), id="auth_session_daily")
    # Flush buffered invitation view counts Redis -> Postgres every 30s. Leader
    # only (the scheduler runs on one worker), so it batches all workers' views.
    _gallery_scheduler.add_job(_flush_view_counts,
        IntervalTrigger(seconds=30), id="view_count_flush",
        max_instances=1, coalesce=True)

    @app.on_event("startup")
    async def _start_gallery_scheduler():
        # With --workers > 1 every worker runs this startup, so the cleanup jobs
        # would fire N times a day. Gate on a Redis lock: exactly one worker wins
        # leadership and runs the scheduler; the leader heartbeats to hold it, and
        # if it dies another worker takes over after the lock's TTL. With no Redis
        # (single worker) acquire_lock returns True, so behaviour is unchanged.
        from cache_backend import acquire_lock as _acquire, renew_lock as _renew
        _LOCK = "scheduler:gallery:leader"
        _LOCK_TTL = 120
        try:
            if not await _acquire(_LOCK, _LOCK_TTL):
                logger.info("[gallery] another worker holds the scheduler lock — not starting here")
                return
            _gallery_scheduler.start()
            logger.info("[gallery] scheduler started (leader; daily 3am IST + hourly selfie)")

            async def _heartbeat():
                while True:
                    await asyncio.sleep(_LOCK_TTL // 2)
                    if not await _renew(_LOCK, _LOCK_TTL):
                        # Leadership lost (Redis down, or the lock lapsed and another
                        # worker could take it) — stop the local scheduler so the
                        # cron jobs never run in two workers at once.
                        logger.error("[gallery] lost scheduler leadership — stopping local scheduler")
                        try:
                            _gallery_scheduler.shutdown(wait=False)
                        except Exception:
                            pass
                        return

            asyncio.create_task(_heartbeat())
        except Exception as e:
            logger.warning("[gallery] scheduler start failed: %s", e)

    @app.on_event("shutdown")
    async def _stop_gallery_scheduler():
        try:
            _gallery_scheduler.shutdown(wait=False)
        except Exception:
            pass
except Exception as _e:
    # logger defined later at module scope; use logging directly here
    logging.getLogger(__name__).warning("APScheduler init failed: %s", _e)

# Include the router in the main app
app.include_router(api_router)

# Super Admin Pricing Hub (audience-aware, unified)
import super_admin_pricing as _sap
_sap.attach(db)
app.include_router(_sap.router)
app.include_router(_sap.public_router)
app.include_router(_sap.photographer_tier_router)

# Unified Pricing Engine (Phase 3-6): admin CRUD for designs/categories/feature-
# packs/link-durations/campaigns/plans/community + simulator, and the public
# resolver (catalog + quote). Inert for customers until `new_pricing_enabled` is
# switched on; the admin hub is usable immediately for configuration.
from pricing_hub_service import build_pricing_hub_router
app.include_router(build_pricing_hub_router(db, require_super_admin))

# Public, read-only founding-vs-regular pricing for the marketing pages (portfolio
# plans + storage add-ons). Honest anchoring (real regular price is the only
# strike-through). Serves regular pricing until the owner enables founding + applies
# the catalogue, so mounting it changes nothing on the live site.
from pricing_public import build_public_pricing_router
app.include_router(build_public_pricing_router(db))

# Super-admin controls for the Founding-100 pricing: toggle founding on/off, set the
# seat limit + auto-switch, apply the approved catalogue, and edit any plan's regular
# / founding per-cycle prices. Super-admin gated; the public pages stay on regular
# pricing until founding is switched on here.
from founding_admin import build_founding_admin_router
app.include_router(build_founding_admin_router(db, require_super_admin))

# Dynamic Event Engine (Ganesh Chaturthi = first configuration). Foundation
# lifecycle API — draft/autosave/validate/publish for any registered event type.
# Gated by `ganesh_module_enabled` (OFF by default): every endpoint 404s until
# cutover, so weddings and all existing flows are completely unaffected.
from event_lifecycle_service import build_event_router
app.include_router(build_event_router(db, get_current_buyer))
# Media pipeline (upload → validate → WebP/variants → quota → metadata) — Spec 07,
# reusing storage_accounting for quota + the `gallery` child collection for records.
from event_media_service import build_event_media_router
app.include_router(build_event_media_router(db, get_current_buyer))
# Finance & donations (budget, receipts, expense approval, dashboard, reports,
# public donation) — Spec 08, over the donation/sponsor/expense collections.
from event_finance_service import build_event_finance_router
app.include_router(build_event_finance_router(db, get_current_buyer))
# Platform administration (dashboard, search, moderation, config incl. the module
# flag toggle) — Spec 09. Super-admin only; NOT behind the module flag (control plane).
from event_admin_service import build_event_admin_router
app.include_router(build_event_admin_router(db, require_super_admin))
# RBAC members & invitations (invite/accept/role/remove/transfer) — Spec 10.
# Per-operation authorization for the whole module lives in event_rbac.
from event_members_service import build_event_members_router
app.include_router(build_event_members_router(db, get_current_buyer))
# Notifications (email via existing email_service; WhatsApp/SMS/push pluggable) + translation.
from event_notifications_service import build_event_notifications_router
app.include_router(build_event_notifications_router(db, get_current_buyer))
from event_translation_service import build_event_translation_router
app.include_router(build_event_translation_router(db, get_current_buyer))
# v2 — money portal (≤8 scoped member logins), donor leaderboard, blessings, CSV report.
from event_money_service import build_event_money_router
app.include_router(build_event_money_router(db, get_current_buyer))
# v2 — owner-set prices for event designs / plans / feature add-ons (the Ganesh
# analogue of the wedding Pricing Hub). Public reads + super-admin writes.
from event_pricing import build_event_pricing_router
from pricing_activation import _audit as _pricing_audit
app.include_router(build_event_pricing_router(db, require_super_admin, _pricing_audit))
# v2 — self-serve buy → auto-create (plan pick + Razorpay + apply plan features).
from event_purchase_service import build_event_purchase_router
app.include_router(build_event_purchase_router(db, get_current_buyer))
# v2 — MAJA-drafted starter copy (en/te/hi × devotional/traditional) for the builder.
from event_starter_content import build_event_starter_router
app.include_router(build_event_starter_router(db))
# v2 — "I need an extra feature on my link": host raises a request from the builder,
# the owner reviews it and can grant the feature onto that one event.
from event_feature_requests import build_event_feature_request_router
app.include_router(build_event_feature_request_router(db, get_current_buyer, require_super_admin))
# Child-collection CRUD (committee/schedule/gallery/albums/donations/sponsors/
# expenses/rsvp) — Spec 05. One generic router, same flag gate, same ownership.
#
# ORDER MATTERS — this router MUST be included LAST of the event routers. Its
# catch-all patterns (/api/events/{event_id}/{collection}[/{child_id}[/{action}]])
# otherwise swallow every specific event path with the same shape, e.g.
# /api/events/plans/{event_type}, /api/events/purchase/verify,
# /api/events/{id}/gallery/upload, /api/events/{id}/money-members and
# /api/events/starter-content/{type}. FastAPI matches in registration order, so
# the specific routes above must be registered first.
from event_children_service import build_event_children_router
app.include_router(build_event_children_router(db, get_current_buyer))

# PHASE 32: Add security middleware (order matters - apply in reverse order of execution)
app.add_middleware(OriginCheckMiddleware)     # closest to the app, runs after CORS/abuse/bot checks
app.add_middleware(BodySizeLimitMiddleware)   # closest to the app, runs after CORS/abuse/bot checks
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BotDetectionMiddleware)
app.add_middleware(AbusePreventionMiddleware)

# CORS: a wildcard origin ('*') cannot be combined with credentials — browsers
# reject it and Starlette would otherwise reflect every origin back with
# Access-Control-Allow-Credentials: true. This API authenticates via the
# Authorization: Bearer header (not cookies), so when origins are wildcarded we
# disable credentials (still works for bearer tokens). Set CORS_ORIGINS to the
# explicit frontend origin(s) to re-enable credentialed CORS.
# Default is now the explicit local dev origins (NOT '*'). Set CORS_ORIGINS to
# your production frontend origin(s), comma-separated. '*' is still honoured if
# explicitly requested, but then credentials are disabled (browser requirement).
_cors_origins = [o.strip() for o in os.environ.get(
    'CORS_ORIGINS', 'http://localhost:3100,http://localhost:3000').split(',') if o.strip()]
_cors_allow_all = (not _cors_origins) or ('*' in _cors_origins)
if _cors_allow_all and _IS_PROD:
    logger_cors = logging.getLogger("cors")
    logger_cors.warning("CORS is wildcarded ('*') in production — set CORS_ORIGINS to explicit origins.")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not _cors_allow_all,
    allow_origins=["*"] if _cors_allow_all else _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    # Login-lockout responses carry Retry-After; without exposing it,
    # cross-origin axios cannot read the countdown. (MAJA_V2 P4 nit.)
    expose_headers=["Retry-After", "X-Request-Id"],
)

# Lane A9: request metrics + request-id. Added LAST (outermost user
# middleware, right under Starlette's own ServerErrorMiddleware) so its timer
# covers the full stack above -- CORS, bot/abuse/origin checks -- not just
# the route.
from request_metrics import RequestMetricsMiddleware, build_request_metrics_router
app.add_middleware(RequestMetricsMiddleware)
app.include_router(build_request_metrics_router(db, require_super_admin))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for uncaught exceptions: log the full traceback server-side and
    return a generic 500 so internal details / stack traces never leak to clients.
    FastAPI's own HTTPException and request-validation handlers are unaffected."""
    error_id = uuid.uuid4().hex[:12]
    logger.exception("[unhandled %s] %s %s", error_id, request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_id": error_id},
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


# Background task: per-hour expiry sweep for event invitation links
import asyncio as _asyncio_for_sweep

@app.on_event("startup")
async def _start_invitation_expiry_sweep():
    try:
        _asyncio_for_sweep.create_task(_expiry_sweep_loop())
        logger.info("Event invitation expiry sweeper started (hourly).")
    except Exception as e:
        logger.warning(f"Could not start expiry sweeper: {e}")