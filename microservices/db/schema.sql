-- ============================================================================
-- MAJA — Postgres (Supabase) schema. Hybrid model:
--   * Every collection -> a table with: id TEXT PK + data JSONB (the document).
--   * Hot query fields are PROMOTED as GENERATED columns derived from `data`,
--     then indexed. The app/data-layer only ever writes `id` + `data`; Postgres
--     keeps the generated columns in sync automatically.
--   * This keeps the document shapes flexible (JSONB) while giving relational
--     indexing + constraints where they matter. Adding a field = just JSONB
--     (no migration). Promoting a new field later = one non-breaking ALTER.
--
-- Apply: psql "$SUPABASE_DB_URL" -f schema.sql   (idempotent — safe to re-run)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()

-- Shared trigger: bump updated_at on any row update.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- AUTH domain
-- ----------------------------------------------------------------------------

-- Normal users (couples/families). Mongo collection: users
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,                                  -- = user_id
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  email         TEXT GENERATED ALWAYS AS (lower(data->>'email')) STORED,
  auth_provider TEXT GENERATED ALWAYS AS (data->>'auth_provider') STORED,
  status        TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','active')) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_data_gin ON users USING gin(data);

-- Photographers + super-admins. Mongo collection: admins
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  email         TEXT GENERATED ALWAYS AS (lower(data->>'email')) STORED,
  username      TEXT GENERATED ALWAYS AS (lower(data->>'username')) STORED,
  phone         TEXT GENERATED ALWAYS AS (data->>'phone') STORED,
  role          TEXT GENERATED ALWAYS AS (COALESCE(data->>'role','admin')) STORED,
  status        TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','active')) STORED,
  referral_code TEXT GENERATED ALWAYS AS (data->>'referral_code') STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_uq    ON admins(email)    WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admins_username_uq ON admins(username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admins_phone_uq    ON admins(phone)    WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS admins_referral_idx ON admins(referral_code);
CREATE INDEX IF NOT EXISTS admins_data_gin ON admins USING gin(data);

-- Cookie sessions for normal users. Mongo: user_sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_token TEXT GENERATED ALWAYS AS (data->>'session_token') STORED,
  user_id       TEXT GENERATED ALWAYS AS (data->>'user_id') STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_token_uq ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);

-- Short-lived Google OAuth CSRF states. Mongo: oauth_states
CREATE TABLE IF NOT EXISTS oauth_states (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  state      TEXT GENERATED ALWAYS AS (data->>'state') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_states_state_uq ON oauth_states(state);

-- JWT revocation blacklist. Mongo: token_blacklist
CREATE TABLE IF NOT EXISTS token_blacklist (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  jti        TEXT GENERATED ALWAYS AS (data->>'jti') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS token_blacklist_jti_uq ON token_blacklist(jti);

-- JWT revocation blacklist (v2, T6). Mongo/pg_adapter collection: jwt_blacklist
-- (legacy token_blacklist above is kept untouched; this is the collection
-- `auth._is_jwt_blacklisted` actually reads).
CREATE TABLE IF NOT EXISTS jwt_blacklist (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  jti        TEXT GENERATED ALWAYS AS (data->>'jti') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jwt_blacklist_jti_idx ON jwt_blacklist(jti);
CREATE INDEX IF NOT EXISTS jwt_blacklist_exp_idx ON jwt_blacklist((data->>'exp'));

-- ----------------------------------------------------------------------------
-- INVITATION domain
-- ----------------------------------------------------------------------------

-- Wedding/event invitations. Mongo: profiles
CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  slug        TEXT GENERATED ALWAYS AS (data->>'slug') STORED,
  admin_id    TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  owner_user_id TEXT GENERATED ALWAYS AS (data->>'owner_user_id') STORED,
  status      TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','draft')) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_uq ON profiles(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_admin_idx ON profiles(admin_id);
CREATE INDEX IF NOT EXISTS profiles_owner_idx ON profiles(owner_user_id);
CREATE INDEX IF NOT EXISTS profiles_status_idx ON profiles(status);
CREATE INDEX IF NOT EXISTS profiles_data_gin ON profiles USING gin(data);

-- Guest wishes wall (moderated). Mongo: guest_wishes
CREATE TABLE IF NOT EXISTS guest_wishes (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id  TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED,
  status      TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','pending')) STORED,
  is_featured BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'is_featured')::boolean,false)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_wishes_profile_idx ON guest_wishes(profile_id, status);

-- RSVPs. Mongo: rsvps
CREATE TABLE IF NOT EXISTS rsvps (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id  TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rsvps_profile_idx ON rsvps(profile_id);

-- Expiry tiers (link lifetime). Mongo: expiry_tiers
CREATE TABLE IF NOT EXISTS expiry_tiers (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- MEDIA domain
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS live_gallery_photos (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id  TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_gallery_profile_idx ON live_gallery_photos(profile_id);

CREATE TABLE IF NOT EXISTS studio_storage_plans (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studio_storage_subscriptions (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_id TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_sub_admin_idx ON studio_storage_subscriptions(admin_id);
CREATE TABLE IF NOT EXISTS studio_storage_files (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_id TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_files_admin_idx ON studio_storage_files(admin_id);

-- ----------------------------------------------------------------------------
-- PAYMENTS domain
-- ----------------------------------------------------------------------------

-- Immutable credit ledger. Mongo: credit_ledger
CREATE TABLE IF NOT EXISTS credit_ledger (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_id    TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  user_id     TEXT GENERATED ALWAYS AS (data->>'user_id') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_admin_idx ON credit_ledger(admin_id);
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx  ON credit_ledger(user_id);

-- Audience-aware design/theme pricing. Mongo: pricing_design_prices
CREATE TABLE IF NOT EXISTS pricing_design_prices (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience    TEXT GENERATED ALWAYS AS (data->>'audience') STORED,
  design_id   TEXT GENERATED ALWAYS AS (data->>'design_id') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_design_idx ON pricing_design_prices(audience, design_id);

-- Razorpay credit purchases. Mongo: credit_purchases
CREATE TABLE IF NOT EXISTS credit_purchases (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_id    TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  order_id    TEXT GENERATED ALWAYS AS (data->>'order_id') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_purchases_admin_idx ON credit_purchases(admin_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_order_uq ON credit_purchases(order_id) WHERE order_id IS NOT NULL;

-- Gift-code redemptions (atomic once-per-admin guard via unique index).
CREATE TABLE IF NOT EXISTS gift_code_redemptions (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  code        TEXT GENERATED ALWAYS AS (upper(data->>'code')) STORED,
  admin_id    TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gift_redemption_uq ON gift_code_redemptions(code, admin_id)
  WHERE code IS NOT NULL AND admin_id IS NOT NULL;

-- Gift / promo codes. Mongo: gift_codes
CREATE TABLE IF NOT EXISTS gift_codes (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  code        TEXT GENERATED ALWAYS AS (upper(data->>'code')) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gift_codes_code_uq ON gift_codes(code) WHERE code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- AI / COMMS / ANALYTICS domain
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_story_logs (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_id TEXT GENERATED ALWAYS AS (data->>'admin_id') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-view analytics events. Mongo: analytics_events
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_id TEXT GENERATED ALWAYS AS (data->>'profile_id') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_profile_idx ON analytics_events(profile_id, created_at);

-- ============================================================================
-- SUBSCRIPTION / BILLING domain  (Photographer Studio SaaS — replaces credits)
-- Relationships are expressed via indexed generated id columns (studio_id,
-- plan_id, order_id) rather than hard FKs, matching this codebase's loosely-
-- coupled id+data adapter (which upserts id+data and auto-creates tables). This
-- keeps referential lookups fast/indexed without constraining adapter write order.
-- ============================================================================

-- Plan catalog: one row per purchasable plan across products.
-- product ∈ invitation|portfolio|storage|backup ; cycle prices in paise (INR).
CREATE TABLE IF NOT EXISTS subscription_plans (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  product     TEXT GENERATED ALWAYS AS (data->>'product') STORED,
  tier        TEXT GENERATED ALWAYS AS (data->>'tier') STORED,
  is_active   BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'is_active')::boolean, true)) STORED,
  sort_order  INT GENERATED ALWAYS AS (COALESCE((data->>'sort_order')::int, 0)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_plans_product_idx ON subscription_plans(product, is_active, sort_order);
CREATE INDEX IF NOT EXISTS subscription_plans_gin ON subscription_plans USING gin(data);

-- Active subscriptions per studio. One row per (studio, product) active line.
-- cycle ∈ monthly|quarterly|half_yearly|yearly ; status ∈ pending|active|past_due|paused|cancelled|expired.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     TEXT PRIMARY KEY,
  data                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  studio_id              TEXT GENERATED ALWAYS AS (data->>'studio_id') STORED,
  product                TEXT GENERATED ALWAYS AS (data->>'product') STORED,
  plan_id                TEXT GENERATED ALWAYS AS (data->>'plan_id') STORED,
  cycle                  TEXT GENERATED ALWAYS AS (data->>'cycle') STORED,
  status                 TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','pending')) STORED,
  auto_renew             BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'auto_renew')::boolean, true)) STORED,
  razorpay_subscription_id TEXT GENERATED ALWAYS AS (data->>'razorpay_subscription_id') STORED,
  -- ISO-8601 UTC string (text cast is immutable; ISO strings sort chronologically).
  current_period_end     TEXT GENERATED ALWAYS AS (data->>'current_period_end') STORED,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_studio_idx  ON subscriptions(studio_id, product, status);
CREATE INDEX IF NOT EXISTS subscriptions_renew_idx   ON subscriptions(current_period_end) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_rzp_uq ON subscriptions(razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_gin ON subscriptions USING gin(data);

-- Checkout orders (one per checkout attempt). kind ∈ subscription|storage_addon|one_time.
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  data             JSONB NOT NULL DEFAULT '{}'::jsonb,
  studio_id        TEXT GENERATED ALWAYS AS (data->>'studio_id') STORED,
  kind             TEXT GENERATED ALWAYS AS (data->>'kind') STORED,
  status           TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','created')) STORED,
  amount_paise     BIGINT GENERATED ALWAYS AS ((data->>'amount_paise')::bigint) STORED,
  razorpay_order_id TEXT GENERATED ALWAYS AS (data->>'razorpay_order_id') STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_studio_idx ON orders(studio_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS orders_rzp_uq ON orders(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_gin ON orders USING gin(data);

-- Payments (one per gateway capture). status ∈ created|authorized|captured|failed|refunded.
CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  data               JSONB NOT NULL DEFAULT '{}'::jsonb,
  studio_id          TEXT GENERATED ALWAYS AS (data->>'studio_id') STORED,
  order_id           TEXT GENERATED ALWAYS AS (data->>'order_id') STORED,
  status             TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','created')) STORED,
  amount_paise       BIGINT GENERATED ALWAYS AS ((data->>'amount_paise')::bigint) STORED,
  razorpay_payment_id TEXT GENERATED ALWAYS AS (data->>'razorpay_payment_id') STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_studio_idx ON payments(studio_id, status, created_at);
CREATE INDEX IF NOT EXISTS payments_order_idx  ON payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_rzp_uq ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_gin ON payments USING gin(data);

-- Invoices (GST). number is human-facing sequential id assigned at issue time.
CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  studio_id    TEXT GENERATED ALWAYS AS (data->>'studio_id') STORED,
  order_id     TEXT GENERATED ALWAYS AS (data->>'order_id') STORED,
  number       TEXT GENERATED ALWAYS AS (data->>'number') STORED,
  amount_paise BIGINT GENERATED ALWAYS AS ((data->>'amount_paise')::bigint) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_uq ON invoices(number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_studio_idx ON invoices(studio_id, created_at);
CREATE INDEX IF NOT EXISTS invoices_gin ON invoices USING gin(data);

-- Coupons. type ∈ percent|flat ; value in percent or paise.
CREATE TABLE IF NOT EXISTS coupons (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  code       TEXT GENERATED ALWAYS AS (upper(data->>'code')) STORED,
  is_active  BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'is_active')::boolean, true)) STORED,
  expires_at TEXT GENERATED ALWAYS AS (data->>'expires_at') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_uq ON coupons(code);
CREATE INDEX IF NOT EXISTS coupons_gin ON coupons USING gin(data);

-- ============================================================================
-- AUTH HARDENING domain  (refresh-token rotation + device sessions + audit)
-- ============================================================================

-- Refresh tokens with rotation-family reuse detection. Only the SHA-256 hash is
-- stored (never the raw token). A reused (already-rotated) token revokes the family.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_hash   TEXT GENERATED ALWAYS AS (data->>'token_hash') STORED,
  family_id    TEXT GENERATED ALWAYS AS (data->>'family_id') STORED,
  subject_id   TEXT GENERATED ALWAYS AS (data->>'subject_id') STORED,   -- admin_id or user_id
  subject_kind TEXT GENERATED ALWAYS AS (data->>'subject_kind') STORED, -- admin|user
  device_id    TEXT GENERATED ALWAYS AS (data->>'device_id') STORED,
  revoked      BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'revoked')::boolean, false)) STORED,
  expires_at   TEXT GENERATED ALWAYS AS (data->>'expires_at') STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_uq ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS refresh_tokens_subject_idx ON refresh_tokens(subject_id, subject_kind, revoked);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx  ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx  ON refresh_tokens(expires_at);

-- One row per active device/browser session (for "log out all devices" + activity).
CREATE TABLE IF NOT EXISTS device_sessions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  subject_id   TEXT GENERATED ALWAYS AS (data->>'subject_id') STORED,
  subject_kind TEXT GENERATED ALWAYS AS (data->>'subject_kind') STORED,
  device_id    TEXT GENERATED ALWAYS AS (data->>'device_id') STORED,
  revoked      BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'revoked')::boolean, false)) STORED,
  last_active  TEXT GENERATED ALWAYS AS (data->>'last_active') STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_sessions_subject_idx ON device_sessions(subject_id, subject_kind, revoked);
CREATE UNIQUE INDEX IF NOT EXISTS device_sessions_device_uq ON device_sessions(subject_id, device_id);

-- Security/authentication audit trail.
CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id   TEXT GENERATED ALWAYS AS (data->>'actor_id') STORED,
  action     TEXT GENERATED ALWAYS AS (data->>'action') STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx  ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action, created_at);

-- ============================================================================
-- AUTOSAVE / DRAFTS domain  (universal draft persistence for every form)
-- One row per (owner, form_key). Latest snapshot in data.payload; version bumps.
-- ============================================================================
CREATE TABLE IF NOT EXISTS drafts (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id    TEXT GENERATED ALWAYS AS (data->>'owner_id') STORED,
  owner_kind  TEXT GENERATED ALWAYS AS (data->>'owner_kind') STORED,   -- admin|user|anon
  form_key    TEXT GENERATED ALWAYS AS (data->>'form_key') STORED,     -- e.g. onboarding, design_config:<id>
  version     INT GENERATED ALWAYS AS (COALESCE((data->>'version')::int, 1)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drafts_owner_form_uq ON drafts(owner_id, form_key);
CREATE INDEX IF NOT EXISTS drafts_updated_idx ON drafts(owner_id, updated_at);

-- Append-only version history for drafts (undo / restore points).
CREATE TABLE IF NOT EXISTS draft_versions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_id   TEXT GENERATED ALWAYS AS (data->>'draft_id') STORED,
  version    INT GENERATED ALWAYS AS ((data->>'version')::int) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS draft_versions_draft_idx ON draft_versions(draft_id, version);

-- Notifications + support tickets (subscription center / help center use these).
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_id TEXT GENERATED ALWAYS AS (data->>'recipient_id') STORED,
  is_read     BOOLEAN GENERATED ALWAYS AS (COALESCE((data->>'is_read')::boolean, false)) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  studio_id  TEXT GENERATED ALWAYS AS (data->>'studio_id') STORED,
  status     TEXT GENERATED ALWAYS AS (COALESCE(data->>'status','open')) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_studio_idx ON support_tickets(studio_id, status, created_at);

-- ----------------------------------------------------------------------------
-- NOTE on the long tail of collections
-- ----------------------------------------------------------------------------
-- Any collection not modelled above is created on first use by the data layer
-- (shared/db.py -> ensure_table) with the same shape: id TEXT PK + data JSONB +
-- created_at/updated_at + a GIN index on data. Promote hot fields here later as
-- non-breaking ALTERs when a query needs an index. This keeps the schema
-- complete-by-construction with zero code changes when a new collection appears.
