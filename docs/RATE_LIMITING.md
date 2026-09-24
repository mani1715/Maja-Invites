# Rate limiting — inventory and migration

Five independent rate-limit mechanisms exist in this backend. The goal is one.
This is the inventory that has to come before any removal, and the record of
what has actually moved.

**Canonical mechanism: `cache_backend.rate_limit_allow(key, limit, window_seconds)`.**
Fixed window. Redis-backed when `REDIS_URL` is set (one global counter across
every uvicorn worker and container), in-process memory otherwise. Fail-open on
a backend error — it guards abuse, not authorization, so a Redis outage must
not lock users out.

**Do not add a sixth.** New code calls `rate_limit_allow`.

---

## 1. The five mechanisms

| # | Mechanism | Where | Storage | Window | Scope |
|---|---|---|---|---|---|
| 1 | `cache_backend.rate_limit_allow` | `cache_backend.py:55` | Redis, else in-process | fixed, caller-set | global with Redis; per-worker without |
| 2 | `server.check_rate_limit` | `server.py:712` | Postgres `db.rate_limits` | **UTC calendar day** | global, durable |
| 3 | `ai_service.check_translation_rate_limit` / `check_admin_generation_rate_limit` | `ai_service.py:332,361` | module dict | rolling | per-worker |
| 4 | `gallery_privacy._check_rate_limit` | `gallery_privacy.py:222` | module dict | rolling + lockout | per-worker |
| 5 | `security_middleware.track_request` | `security_middleware.py:421` | module dict | rolling + soft block | per-worker |

## 2. Migration table

| Legacy | Module | Endpoint | Current behaviour | Canonical replacement | Tests | Status |
|---|---|---|---|---|---|---|
| 2 | `server.py:5090` | `GET /api/invite/{slug}` | 500 / UTC day / IP, durable row | `rate_limit_allow("invite_view:{ip}", 500, 86400)` | 10 public-invite tests in `test_universal_invitations`, `test_photo_toggles`, `test_room_and_video`, `test_pricing_and_opening`, `test_phase3_studio_watermark` exercise the path | **MIGRATED** |
| 2 | `server.py:5721`, `8950` | wishes submit | 3–5 / day / IP, durable | `rate_limit_allow` | `test_wishes_visibility` | **NOT migrated** — see §3 |
| 2 | `server.py:5936`, `6119`, `6192` | RSVP submit / check / update | 5–30 / day / IP, durable | `rate_limit_allow` | `test_rsvp_status_vocab` | **NOT migrated** — see §3 |
| 3 | `ai_service.py` | guest translation, admin generation | per-worker dict | `rate_limit_allow` | none specific | **NOT migrated** — needs a test first |
| 4 | `gallery_privacy.py` | gallery unlock attempts | dict + lockout window | `rate_limit_allow` cannot express the lockout | `test_gallery_privacy` | **NOT migrated** — see §4 |
| 5 | `security_middleware.py` | global abuse middleware | dict + soft block | not a per-endpoint limiter | `test_phase2_audit_fixes` | **NOT a migration target** — see §5 |

## 3. Why the guest-write limiters have not moved

RSVP and wishes are **write** paths with tiny budgets (3–5 per day per IP). The
Postgres limiter is durable and global; `rate_limit_allow` is global **only when
Redis is up**, and fail-open otherwise. Moving them means:

* a Redis outage silently raises the effective limit from 5/day to 5/day
  *per worker per outage window* — four workers, no durability;
* the anti-spam guarantee that currently survives a full stack restart stops
  surviving one.

That is a downgrade for a spam-sensitive write path, so it does not qualify as
"equivalent or intentionally improved". Migrating them properly requires making
Redis a hard dependency of the stack (it is currently optional — `worker.py`
and `face_queue.py` both degrade gracefully without it). That is a deployment
decision, not a refactor.

`invite_view` was migrated because the trade-off runs the other way: it is a
**read** path, and the calendar-day bucket is actively harmful — an exhausted
counter stays exhausted until UTC midnight, which on a dev box turns one heavy
test run into a day of 429s that read exactly like a regression. It cost three
separate debugging detours in a single session. The migration also switched it
from `request.client.host` to `get_client_ip()`, which stops a client minting a
fresh budget with a forged `X-Forwarded-For`.

## 4. Why the gallery-unlock limiter has not moved

`gallery_privacy._check_rate_limit` returns *how many seconds the caller is
blocked for* after too many wrong access codes — a lockout, not a plain
allow/deny. `rate_limit_allow` returns a boolean and cannot express it.
Migrating means either extending the canonical helper with a lockout variant or
composing two counters. Both are real work with a real regression surface on a
credential-guessing control; neither is a mechanical swap.

## 5. Why the abuse middleware is not a migration target

`security_middleware.track_request` is a **global request-shaping** middleware
(soft-blocking abusive IPs across all paths), not a per-endpoint limiter. It
sits at a different layer and should stay. It is listed here only so the count
of "five mechanisms" is not mistaken for "five things to delete".

## 6. What already uses the canonical limiter

Login (per-IP **and** per-identifier), password reset (per-IP and per-email),
OTP send (per-IP and per-recipient), face search (per-IP and per-event), face
consent, QR scan lookup, guest gallery upload (per-IP and per-slug), portfolio
enquiry, directory reviews, upload-session creation, **face-match quota
reservation**, **gallery presign**, and now **public invitation views**.

## 7. Rule for new code

```python
from cache_backend import rate_limit_allow
if not await rate_limit_allow(f"<feature>:{scope}", limit, window_seconds):
    raise HTTPException(429, "…")
```

Key format is `feature:scope`. Use `get_client_ip(request)` for the IP scope —
never `request.client.host`, which is spoofable through `X-Forwarded-For`.
