"""
PHASE 32: Security Middleware
Handles security headers, bot detection, and abuse prevention
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timezone, timedelta
import os
import re
from typing import Optional
from urllib.parse import urlsplit
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# SECURITY HEADERS MIDDLEWARE
# ============================================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    PHASE 32: Add security headers to all responses
    - Content-Security-Policy
    - X-Frame-Options: DENY
    - X-Content-Type-Options: nosniff
    - Referrer-Policy: strict-origin
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Content Security Policy
        # Allow same-origin and specific external resources needed for the app
        csp_directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  # React needs unsafe-inline/eval
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: https: blob:",  # Allow images from various sources
            "media-src 'self' blob: data:",
            "connect-src 'self' https://ipapi.co",  # Allow analytics IP lookup
            "frame-src 'none'",  # Prevent embedding in iframes
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Additional security headers
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        # HSTS — force HTTPS for a year incl. subdomains. Browsers only honour
        # this over an https connection (ignored on plain http, so it is safe in
        # local dev). Sent only when the request reached us over TLS. `preload`
        # is intentionally omitted (it is a hard, hard-to-reverse commitment).
        try:
            _proto = request.headers.get("x-forwarded-proto", request.url.scheme)
            if _proto == "https":
                response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        except Exception:
            pass

        # Cache-Control for high-traffic public paths (preventive scaling).
        # Uploaded images are content-addressed (uuid hex filenames) so they are
        # safe to cache aggressively. Public read endpoints get a short TTL.
        try:
            path = request.url.path
            if path.startswith("/api/uploads/"):
                response.headers["Cache-Control"] = "public, max-age=86400, immutable"
            elif path.startswith("/api/public/") or path.startswith("/api/invite/"):
                if request.method == "GET":
                    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=60"
        except Exception:
            pass

        return response


# ============================================================================
# ORIGIN CHECK (CSRF defense for cookie-authed state changes) — S7
# ============================================================================

def _origin_of(url: str) -> Optional[str]:
    """Extract scheme://host[:port] from a URL string (e.g. a Referer header). None if unparseable."""
    if not url:
        return None
    try:
        parsed = urlsplit(url)
        if not parsed.scheme or not parsed.netloc:
            return None
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return None


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """
    CSRF defense: `user_session_token` is a cookie, so any browser will attach
    it to a cross-site form/fetch POST automatically. Since that cookie is the
    only auth on those requests, we reject state-changing requests whose
    Origin (or Referer, as fallback) isn't one of ours. Non-browser clients
    that send neither header are allowed through — they aren't riding a
    stolen cookie jar, they'd have to know the token value itself.
    """

    EXEMPT_PREFIXES = (
        "/api/payments/razorpay-webhook",
        "/api/payments/store-webhook",
        "/api/events/purchase/webhook",
        "/api/webhooks/",
    )

    def __init__(self, app):
        super().__init__(app)
        # Read once at startup, same as the CORS_ORIGINS parsing in server.py.
        self._configured_origins = {
            o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",")
            if o.strip() and o.strip() != "*"
        }

    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            path = request.url.path
            if not any(path.startswith(p) for p in self.EXEMPT_PREFIXES) and request.cookies.get("user_session_token"):
                origin = request.headers.get("origin") or _origin_of(request.headers.get("referer", ""))
                if origin:
                    own_scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
                    own_host = request.headers.get("host", request.url.netloc)
                    allowed = self._configured_origins | {f"{own_scheme}://{own_host}"}
                    if origin not in allowed:
                        return JSONResponse(status_code=403, content={"detail": "cross-origin request rejected"})
        return await call_next(request)


# ============================================================================
# BODY SIZE CAP — S8
# ============================================================================

MAX_JSON_BODY_BYTES = int(os.environ.get("MAX_JSON_BODY_BYTES", str(2 * 1024 * 1024)))


class BodySizeLimitMiddleware:
    """
    Reject oversized non-multipart request bodies BEFORE a route handler reads
    them. Pure-ASGI (not BaseHTTPMiddleware) on purpose: the old header-only
    check trusted Content-Length, so a chunked / Transfer-Encoding body — which
    carries NO Content-Length — skipped the cap entirely. That was an
    unbounded-body bypass on every JSON route, including the webhook handlers
    that json.loads()/HMAC the whole body before rejecting anything.

      * Content-Length present -> O(1) header check, body never buffered.
      * Content-Length absent   -> buffer up to the cap, reject on overflow,
                                    then replay the buffered body to the app so
                                    downstream `await request.body()` still works.
      * multipart/form-data      -> exempt (large by design, streamed; per-endpoint
                                    byte caps live in the upload handlers).
      * GET/HEAD/OPTIONS         -> no body by spec, passed straight through.
    """

    def __init__(self, app):
        self.app = app

    async def _reject(self, scope, receive, send):
        await JSONResponse(status_code=413, content={"detail": "request body too large"})(scope, receive, send)

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        headers = {k.lower(): v for k, v in (scope.get("headers") or [])}
        content_type = headers.get(b"content-type", b"").decode("latin-1").lower()
        if "multipart/form-data" in content_type:
            return await self.app(scope, receive, send)
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_JSON_BODY_BYTES:
                    return await self._reject(scope, receive, send)
            except ValueError:
                pass
            return await self.app(scope, receive, send)
        # No Content-Length (chunked / streamed): buffer up to the cap to detect
        # overflow, then replay to the app so its own body reads still work.
        body = b""
        overflow = False
        trailing = None
        while True:
            message = await receive()
            if message["type"] != "http.request":
                trailing = message  # e.g. http.disconnect — stop buffering
                break
            body += message.get("body", b"")
            if len(body) > MAX_JSON_BODY_BYTES:
                overflow = True
                break
            if not message.get("more_body", False):
                break
        if overflow:
            return await self._reject(scope, receive, send)
        replayed = False

        async def replay_receive():
            nonlocal replayed, trailing
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            if trailing is not None:
                msg, trailing = trailing, None
                return msg
            return await receive()

        return await self.app(scope, replay_receive, send)


# ============================================================================
# BOT DETECTION
# ============================================================================

# Whitelist of legitimate crawlers for SEO and social sharing (PHASE 31)
ALLOWED_BOTS = [
    r"googlebot",
    r"bingbot",
    r"slurp",  # Yahoo
    r"duckduckbot",
    r"baiduspider",
    r"yandexbot",
    r"facebookexternalhit",  # Facebook preview
    r"whatsapp",  # WhatsApp preview
    r"twitterbot",  # Twitter preview
    r"linkedinbot",  # LinkedIn preview
    r"slackbot",  # Slack preview
    r"telegrambot",  # Telegram preview
    r"discordbot",  # Discord preview
    r"pinterest",  # Pinterest preview
]

# Known malicious/aggressive bots to block
BLOCKED_BOTS = [
    r"scrapy",
    r"curl",
    r"wget",
    r"python-requests",
    r"axios",
    r"okhttp",
    r"go-http-client",
    r"ahrefsbot",
    r"semrushbot",
    r"mj12bot",
    r"dotbot",
    r"rogerbot",
    r"exabot",
    r"megaindex",
    r"blexbot",
]


def is_allowed_bot(user_agent: str) -> bool:
    """Check if user agent is a whitelisted bot"""
    if not user_agent:
        return False
    
    user_agent_lower = user_agent.lower()
    
    for bot_pattern in ALLOWED_BOTS:
        if re.search(bot_pattern, user_agent_lower):
            return True
    
    return False


def is_blocked_bot(user_agent: str) -> bool:
    """Check if user agent is a known malicious bot"""
    if not user_agent:
        return False
    
    user_agent_lower = user_agent.lower()
    
    for bot_pattern in BLOCKED_BOTS:
        if re.search(bot_pattern, user_agent_lower):
            return True
    
    return False


def is_suspicious_user_agent(user_agent: str) -> bool:
    """
    Detect suspicious user agents that might be bots
    Rules:
    - Empty user agent
    - Very short user agent (< 20 chars)
    - Missing browser identifiers
    """
    if not user_agent or len(user_agent) < 20:
        return True
    
    # Check for common browser identifiers
    browser_indicators = ["mozilla", "chrome", "safari", "firefox", "edge", "opera"]
    has_browser_indicator = any(indicator in user_agent.lower() for indicator in browser_indicators)
    
    if not has_browser_indicator:
        return True
    
    return False


class BotDetectionMiddleware(BaseHTTPMiddleware):
    """
    PHASE 32: Bot detection and blocking middleware
    - Allow legitimate SEO crawlers (Google, Bing)
    - Allow social media preview bots (Facebook, WhatsApp, Twitter, LinkedIn)
    - Block known malicious/scraper bots
    - Apply to public invitation endpoints only
    """
    
    async def dispatch(self, request: Request, call_next):
        # Only apply bot detection to public invitation endpoints
        path = request.url.path
        
        # Skip bot detection for admin, API, static, and health-probe endpoints
        # (uptime monitors / load balancers don't send browser user-agents).
        if any(path.startswith(prefix) for prefix in ["/api/admin", "/api/auth", "/api/health", "/docs", "/openapi.json", "/robots.txt", "/sitemap.xml"]):
            return await call_next(request)

        # High-traffic public read paths — bypass bot detection so a viral
        # invitation link can be opened by thousands of guests / link previewers
        # without ever being soft-blocked.
        if any(path.startswith(prefix) for prefix in [
            "/api/invite",                       # invitation fetch
            "/api/public",                       # public read endpoints
            "/api/uploads/",                     # served image/audio files
            "/api/ws/",                          # WebSocket connects
            "/api/rsvp",                         # guest RSVP
            "/api/payments/razorpay-webhook",    # razorpay webhook
            "/api/payments/store-webhook",       # razorpay store webhook (T3)
        ]):
            return await call_next(request)

        # PHASE 38: Whitelist programmatic upload endpoint when authenticated via X-Uploader-Token
        if path == "/api/live-gallery/desktop-upload" and request.headers.get("x-uploader-token"):
            return await call_next(request)
        
        # Get user agent
        user_agent = request.headers.get("user-agent", "")
        
        # Allow whitelisted bots (SEO crawlers and social media preview bots)
        if is_allowed_bot(user_agent):
            logger.info(f"Allowed bot detected: {user_agent[:100]}")
            return await call_next(request)
        
        # Block known malicious bots
        if is_blocked_bot(user_agent):
            logger.warning(f"Blocked bot detected: {user_agent[:100]} from IP: {request.client.host if request.client else 'unknown'}")
            return JSONResponse(
                status_code=403,
                content={"error": "Access denied", "message": "Automated access not allowed"}
            )
        
        # Check for suspicious user agents (but don't block, just log)
        if is_suspicious_user_agent(user_agent) and path.startswith("/invite"):
            logger.warning(f"Suspicious user agent: {user_agent[:100]} from IP: {request.client.host if request.client else 'unknown'}")
            # Don't block, just log for monitoring
        
        return await call_next(request)


# ============================================================================
# ABUSE PREVENTION - Request Tracking
# ============================================================================

# In-memory request tracking (for rapid request detection)
# Format: {ip_address: [(timestamp1, path1), (timestamp2, path2), ...]}
request_tracking = {}

# Soft block tracking
# Format: {ip_address: block_until_timestamp}
soft_blocks = {}


def clean_old_tracking():
    """Clean up old tracking data (older than 1 hour)"""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=1)
    
    # Clean request tracking
    for ip in list(request_tracking.keys()):
        request_tracking[ip] = [
            (ts, path) for ts, path in request_tracking[ip]
            if ts > cutoff
        ]
        if not request_tracking[ip]:
            del request_tracking[ip]
    
    # Clean soft blocks
    for ip in list(soft_blocks.keys()):
        if soft_blocks[ip] < now:
            del soft_blocks[ip]


def is_soft_blocked(ip_address: str) -> Optional[datetime]:
    """Check if IP is currently soft blocked"""
    if ip_address in soft_blocks:
        block_until = soft_blocks[ip_address]
        if block_until > datetime.now(timezone.utc):
            return block_until
        else:
            del soft_blocks[ip_address]
    return None


def track_request(ip_address: str, path: str) -> dict:
    """
    Track request and detect abuse patterns
    Returns: {
        "is_abuse": bool,
        "reason": str,
        "block_duration": int (seconds)
    }
    """
    now = datetime.now(timezone.utc)
    
    # Initialize tracking for this IP
    if ip_address not in request_tracking:
        request_tracking[ip_address] = []
    
    # Add current request
    request_tracking[ip_address].append((now, path))
    
    # Get requests in last hour
    hour_ago = now - timedelta(hours=1)
    recent_requests = [
        (ts, p) for ts, p in request_tracking[ip_address]
        if ts > hour_ago
    ]
    
    # Get requests in last minute
    minute_ago = now - timedelta(minutes=1)
    recent_minute_requests = [
        (ts, p) for ts, p in request_tracking[ip_address]
        if ts > minute_ago
    ]
    
    # Abuse detection rules
    
    # NOTE: these thresholds only apply to non-exempt paths (see dispatch). The
    # authenticated SPA is chatty (one page = many parallel calls), so the caps
    # are generous; sensitive endpoints have their own per-endpoint limiters.
    # Rule 1: excessive requests per hour from same IP
    if len(recent_requests) > 1000:
        return {
            "is_abuse": True,
            "reason": "Excessive requests (>1000/hour)",
            "block_duration": 1800  # 30 min block
        }

    # Rule 2: rapid-fire requests per minute
    if len(recent_minute_requests) > 200:
        return {
            "is_abuse": True,
            "reason": "Rapid fire requests (>200/minute)",
            "block_duration": 600  # 10 minute block
        }

    # Rule 3: More than 300 requests to same invitation in 1 hour
    invitation_requests = [p for ts, p in recent_requests if p.startswith("/invite/")]
    if len(invitation_requests) > 300:
        return {
            "is_abuse": True,
            "reason": "Excessive invitation views (>300/hour)",
            "block_duration": 1800  # 30 minute block
        }
    
    # Clean old tracking data periodically
    if len(request_tracking) > 1000:  # Cleanup trigger
        clean_old_tracking()
    
    return {"is_abuse": False, "reason": None, "block_duration": 0}


class AbusePreventionMiddleware(BaseHTTPMiddleware):
    """
    PHASE 32: Abuse prevention middleware
    - Track request patterns per IP
    - Detect excessive requests
    - Apply soft blocks (429 with retry-after)
    """
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        ip_address = request.client.host if request.client else "unknown"
        
        # Skip abuse detection for admin + health endpoints
        path = request.url.path
        if any(path.startswith(prefix) for prefix in ["/api/admin", "/api/auth", "/api/health", "/docs", "/openapi.json"]):
            return await call_next(request)

        # High-traffic public read paths + authenticated app namespaces are
        # exempt from the per-IP throttle. The SPA fires many parallel calls per
        # page (portfolio, store, community, etc.), so a blanket per-IP counter
        # false-positives real users. Sensitive endpoints keep their own
        # per-endpoint limiters (login, OTP, forgot-password, reviews). Face
        # search is limited in gallery_features.py's face-search route itself
        # (not here — this middleware doesn't see it, /api/public/* is exempt
        # above); DDoS protection belongs at the ingress / Cloudflare layer.
        if any(path.startswith(prefix) for prefix in [
            "/api/invite",
            "/api/public",
            "/api/uploads/",
            "/api/ws/",
            "/api/rsvp",
            "/api/payments/razorpay-webhook",
            "/api/payments/store-webhook",
            # authenticated app API (behind auth; chatty SPA bursts)
            "/api/portfolio",
            "/api/store",
            "/api/pixora",
            "/api/subscription",
            "/api/photographer",
            "/api/currency",
            "/api/push",
            "/api/track",
            "/api/account",
            "/api/cloud",
            "/api/backup",
            "/api/studio",
            "/api/gallery",
            "/api/live-gallery",
            "/api/wishes",
            "/api/design",
            "/api/themes",
            "/api/plan-purchase-details",
            "/api/portfolio-build-requests",
            "/api/users",
        ]):
            return await call_next(request)
        
        # Check if IP is soft blocked
        block_until = is_soft_blocked(ip_address)
        if block_until:
            retry_after = int((block_until - datetime.now(timezone.utc)).total_seconds())
            logger.warning(f"Soft blocked IP {ip_address} attempted access to {path}")
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too many requests",
                    "message": "You have been temporarily blocked due to excessive requests. Please try again later.",
                    "retry_after": retry_after
                },
                headers={"Retry-After": str(retry_after)}
            )
        
        # Track this request and check for abuse
        abuse_check = track_request(ip_address, path)
        
        if abuse_check["is_abuse"]:
            # Apply soft block
            block_until = datetime.now(timezone.utc) + timedelta(seconds=abuse_check["block_duration"])
            soft_blocks[ip_address] = block_until
            
            logger.warning(f"Abuse detected from IP {ip_address}: {abuse_check['reason']}. Soft blocking for {abuse_check['block_duration']} seconds.")
            
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too many requests",
                    "message": "You have been temporarily blocked due to excessive requests. Please try again later.",
                    "retry_after": abuse_check["block_duration"]
                },
                headers={"Retry-After": str(abuse_check["block_duration"])}
            )
        
        return await call_next(request)
