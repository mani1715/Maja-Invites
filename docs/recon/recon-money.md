# MONEY SUBSYSTEM — legacy MAJA inventory

Repo root: `.../scratchpad/legacy/logic`. Paths below relative to it.

## 0. Shape: FOUR parallel money systems, not one

| # | System | Entry | Engine | Status |
|---|---|---|---|---|
| A | **Store à-la-carte** (wedding invitation, done-for-you) | `frontend/src/pages/CartPage.jsx` → `/api/store/*` | `backend/store_features.py::quote_alacarte` | **LIVE — the only wedding revenue path** |
| B | **Unified Pricing Engine v2** | `frontend/src/pages/WeddingCheckout.jsx` → `/api/pricing/*` | `backend/pricing_engine.py` | **BUILT, FLAG-OFF, UI DEAD-ENDED** |
| C | **Studio subscriptions** (invitation/portfolio/storage/backup) | `frontend/src/pages/StudioPlansPage.jsx` → `/api/subscriptions/*` | `backend/subscription_service.py` | LIVE |
| D | **Event (Ganesh) purchase** | `/api/events/purchase` | `backend/event_pricing.py` + `event_payments.py` | LIVE, cleanest of the four |
| E | legacy `/api/payments/*` PLAN_PRICING (SILVER/GOLD/PLATINUM) | `backend/server.py:11817-12150` | hardcoded dict | LIVE + **VULNERABLE** (see §11) |

A, B, C, D, E each have their own Razorpay call and their own signature verifier. No shared payment module across A/C/E; D is the only one with a purpose-built one (`event_payments.py`).

---

## 1. Route inventory

**Store (A)** — `backend/store_features.py`, `build_store_router(db, razorpay_client, get_current_public_user, require_super_admin)`
```
GET  /api/store/catalog?design_id&theme_id        public
GET  /api/store/design-offer/{design_id}          public
GET  /api/store/design/{design_id}/price          public
GET  /api/store/packages                          public
POST /api/store/quote                             PUBLIC, NO AUTH
POST /api/store/order/create                      get_current_public_user
POST /api/store/order/verify                      get_current_public_user
GET  /api/store/order/{order_id}                  get_current_public_user (+edit_state)
GET  /api/store/order/{order_id}/edit-state       get_current_public_user
POST /api/store/order/{order_id}/info             get_current_public_user
PUT  /api/store/order/{order_id}/info-draft       get_current_public_user
GET  /api/store/my-orders                         get_current_public_user
GET/POST /api/admin/store-packages|store-addons|store-features|store-languages|store-alacarte   require_super_admin
GET/PUT  /api/admin/fulfillment/settings          require_super_admin
POST     /api/admin/fulfillment/requests/{code}/edit-lock  require_super_admin
```
`build_store_admin_router(db, require_admin)`: `GET /api/admin/build-queue`, `POST /api/admin/build-queue/{order_id}/deliver`, `.../edit-applied`.

**Pricing Hub (B)** — `backend/pricing_hub_service.py`
```
public:  GET /api/pricing/catalog · POST /api/pricing/quote · POST /api/pricing/plan-quote · GET /api/campaigns/active
admin:   /api/admin/pricing/{designs,categories,feature-packs,link-durations,campaigns,plans,community,simulate}  require_super_admin
```
`/api/admin/pricing/designs` + `/durations` + `/features` + `/themes` + `/mixed-theme` + `/monthly-packs` are ALSO served by `enhanced_admin_service.py` — **duplicate `GET /api/admin/pricing/designs` registered from two modules** (API_SURFACE.md:657-658).

**Subscriptions (C)** — `backend/subscription_service.py`
```
GET  /api/subscriptions/plans        public
POST /api/subscriptions/quote        NO AUTH (doc claims require_admin)
POST /api/subscriptions/create       require_admin
POST /api/subscriptions/verify       require_admin
POST /api/subscriptions/{id}/cancel  require_admin
POST /api/subscriptions/{id}/change  require_admin   ← writes pending_*, NEVER READ
GET  /api/subscriptions/mine         require_admin
GET  /api/subscription-center        require_admin
GET/POST /api/admin/subscription-plans · GET/PUT /api/admin/billing-cycles  require_super_admin
```

**Events (D)** — `backend/event_purchase_service.py`, `event_pricing.py`
```
GET  /api/events/plans/{event_type}                get_current_buyer
POST /api/events/purchase                          get_current_buyer
POST /api/events/purchase/verify                   get_current_buyer
POST /api/events/purchase/webhook                  HMAC-authed, no session
GET  /api/events/design-offer/{type}/{template} · /api/events/pricing/{type} · POST /api/events/pricing/quote   public
/api/admin/event-pricing/{type}[/design|/design/bulk|/plan|/feature]   require_super_admin
```

**Fulfillment** — `backend/fulfillment_service.py`, all `require_super_admin` except the last
```
GET  /api/admin/fulfillment/requests[?buyer_kind&status]
GET  /api/admin/fulfillment/requests/{code}
POST /api/admin/fulfillment/requests/{code}/deliver
POST /api/admin/fulfillment/requests/{code}/build-invitation
POST /api/admin/fulfillment/requests/{code}/drive
GET  /api/admin/fulfillment/events · /links · /{code}/face-match
POST /api/fulfillment/{code}/face-match/selfie     PUBLIC (IP-hash rate-limited 25/event/day)
```

**Other money**: `POST /api/payments/razorpay-webhook` (`monetization_features.py`, credits-era); `/api/payments/create-order|verify|history|{id}` (`server.py`); `/api/invoices/{id}/download?t=` (`invoice_service.py`, capability token, `hmac.compare_digest`); `/api/monetization/*` (`monetization_service.py`); `/api/admin/profiles/{id}/reactivate/checkout|verify` (`link_reactivation.py`); `/api/public/events/{slug}/donate/order|verify` (`event_finance_service.py`); `/api/invite/{slug}/shagun/razorpay/order|verify` (`premium_features.py`).

⚠ **`API_SURFACE.md` auth column is UNRELIABLE for `store_features.py` / `subscription_service.py`** — it reports `require_super_admin` on `/api/store/quote`, `/api/store/order/{id}`, `/api/store/order/{id}/info-draft`, and `require_admin` on `/api/store/my-orders`, `/api/subscriptions/quote`. Source says otherwise (public / `get_current_public_user`). Generator appears to bind the nearest preceding `Depends` in file order. **Read the source for every guard; do not port from the doc.**

---

## 2. Price resolution chains

**A — store à-la-carte** (`store_features.py:224-306`), the live one:
```
total = design_price + Σ(paid feature prices) + Σ(extra language prices)
design_price:  pricing_design_prices{audience:"normal_user", design_id}
                  → discount_price  (iff discount_enabled AND isinstance int AND >0)  source="design"
                  → base_price      (iff isinstance int AND >0)                       source="design"
               → theme_bundle_pricing{theme_id}.inr_price (iff >0)                    source="theme"
               → DEFAULT_DESIGN_PRICE_INR = 2999                                      source="default"
features:  db.store_features (fallback FEATURES dict); `included:true ⇒ price forced 0` on both read and admin write
languages: db.store_languages (fallback LANGUAGE_CATALOG, all ₹499); main language free, extras charged
```
Unknown feature/language keys are **dropped silently**, never guessed. Dedup via `seen`/`lseen` sets. Main language auto-removed from extras client-side (`CartPage.pickMain`) AND server-side (`lseen = {main}`).

**BUG — two divergent design-price resolvers in the same file.** `_effective_price_inr()` (:37) is used by `GET /api/store/design/{id}/price` and accepts `discount_price` **without a `>0` check** and with no theme fallback; `design_price_inr()` (:224) requires `>0` and falls back to theme. A row with `discount_enabled:true, discount_price:0` quotes **₹0** on the price endpoint and **₹2999** in the cart.

**B — unified engine** (`pricing_engine.py`), flag-gated:
```
WEDDING   total = effective_design_price(design) + feature_pack.price + link_duration.price − best_campaign
PORTFOLIO/STORAGE total = plan.durations[cycle] − best_campaign      (cycle keys "1","3","6","12")
effective_design_price:  sale_price if not None  →  else base − base*pct/100 − amt, floored at 0
best_campaign:  single winner, NEVER stacked; clamped to subtotal (total can hit 0, never negative);
                tie-break (priority, start_at) both DESC; scope modes: all|designs|categories|feature_packs|portfolio|storage
unpriced cycle → {"available": false, "reason": "no price set for this billing cycle"}  — never silently ₹0
```
Pure core (`compute_wedding_total` / `compute_plan_total`) takes plain dicts, no DB. `quote_wedding` raises `PricingError` on missing OR `active is False` design/pack/duration → 422.

Founding-vs-regular anchoring (`pricing_engine.py:262-355`, consumed by `founding_pricing.py` + `pricing_public.py`): `founding_state()` → mode; `price_display()` shows a strike-through **only when the buyer genuinely pays less** (`strikethrough = reg if effective < reg else None`). Honest anchoring is an explicit design invariant.

**C — subscriptions** (`subscription_service.py`, paise throughout):
```
subtotal = base_monthly*100 * months_equiv(cycle) * (1 − cycle.discount)
         + Σ storage_addons(price_monthly*100*months)
after    = subtotal − coupon (percent or flat-INR*100, clamped to subtotal)
total    = after + round(after * 0.18 GST)
```
`_cycle_months_equiv`: days→count/30, years→count*12. Cycles = `CYCLES` dict merged with `pricing_settings{id:"billing_cycles"}.cycles` (super-admin custom periods, unit days|months|years, discount 0–0.95).

**D — events** (`event_pricing.py:213`): `total = design_price + plan.price + Σ addon prices`, addons already in `plan.features` are dropped (no double-charge). `granted_features = plan.features + chosen addons`.

**E — legacy** (`server.py:11817`): hardcoded `PLAN_PRICING` SILVER 99900 / GOLD 199900 / PLATINUM 399900 paise, 30 days each.

---

## 3. Razorpay create/verify

| Path | Create | Verify | Order-id binding |
|---|---|---|---|
| A store | `razorpay_client.order.create` (`store_features.py:726`), amount = `price_inr*100`, notes{user_id,design_id,kind} | `razorpay_client.utility.verify_payment_signature` (SDK) | **NONE — uses `payload.razorpay_order_id`** ❌ |
| C subs | 3-tier: recurring `subscription.create` (needs `RAZORPAY_RECURRING_ENABLED=1`) → real one-time `order.create` → MOCK | `verify_gateway_payment()` module-level, dispatches on `sub["provider"]`; `razorpay_order` path = local HMAC(`order\|payment`) | **YES — `sub["razorpay_subscription_id"]`** ✅ |
| D events | `event_payments.create_order` (`PaymentUnavailable` if SDK/keys missing) | `event_payments.verify_signature` local HMAC + `verify_webhook` | **YES — `ev["pending_order_id"] != razorpay_order_id → 422`** ✅ |
| E legacy | `server.py:11875` | inline HMAC, `hmac.compare_digest` | **NONE — client-supplied order_id** ❌ |
| link_reactivation | real order or `rzp_mock_*` | reuses `subscription_service.verify_gateway_payment` ✅ | — |

`event_payments.py` is the reference implementation and the only one that separates **forged signature (False)** from **gateway unavailable (raise `PaymentUnavailable`)**. Its docstring names the exact bug this fixed: a bare `except` telling a paying customer their payment failed. `verify_signature` raises when there is no secret — callers must not read that as forgery. `webhook_secret()` falls back to `RAZORPAY_KEY_SECRET`.

Key gating: `"PLACEHOLDER" in key ⇒ unset` everywhere (`store_features._razorpay_configured`, `event_payments._clean`, `subscription_service._razorpay_keys_ready` which additionally requires `kid.startswith("rzp_")`, `monetization_service._payments_configured`).

Idempotency: A `update_one({"id":..., "status":{"$ne":"paid"}})`; C same on `status != "active"` + early-return `already:true`; D `plan_status=="ready"` early-return, webhook and browser callback share `_complete()`, first wins.

**Webhooks**: only D (`/api/events/purchase/webhook`) and the credits-era `/api/payments/razorpay-webhook`. **Store orders (A) have NO webhook** — buyer closes the tab after paying → `invitation_orders.status` stuck at `"created"`, money taken, no order. D's docstring calls this out as the reason its webhook exists; A never got one.

---

## 4. Test-buyer / free bypass

**Store** (`store_features.py:685-718`): `seed_test_accounts.is_test_buyer(db, current)` → `users.is_test` or (kind=="photographer") `admins.is_test`. On true: skip Razorpay entirely, insert order with `status:"paid"`, `build_status:"pending_info"`, `amount_inr:0`, `amount_paise:0`, `is_test:True`, razorpay fields `None`, `paid_at=now`. Response `{"order_id":…, "free": true, "amount_inr": 0}`. `CartPage.jsx` branches on `order.free` → straight to `/order/{id}/details`.

**Subscriptions** (`subscription_service.py:662-689`): `admins.find_one({"id": studio_id}).is_test` → insert sub `status:"active"`, `provider:"test-free"`, `auto_renew:False`, `is_test:True` + a paid `orders` row at `amount_paise:0`.

**Events** (`event_purchase_service.py:98`): free grant when `total <= 0` **OR `not pay.configured()`** — i.e. an unkeyed deployment gives every event plan away. Deliberate ("a buyer is never stuck behind unconfigured billing"), audited as `purchase_ready_free`, surfaced via `payments_live`.

Bypass is **flag-on-the-account only**, never a request field. Amounts are always recomputed server-side (`store_features.py:679-683`, comment: "the client sends selections, never amounts"). `price_inr <= 0 → 422` on the paid path.

---

## 5. Subscription lifecycle

`created → pending → active → (past_due | cancelled | expired)`; `orders` row mirrors `created → paid`; `payments` ledger row on verify; `audit_logs` `subscription.activated` / `.cancelled`.

- **Stacking invariant** (`_stacked_period_start`, :163): re-buying a product you already hold starts the new period at the **latest future `current_period_end`**, not now. "Subscribe twice → it goes onto next month." Activation/money timestamps stay `now`; only the coverage window moves.
- **Cancel**: sets `auto_renew:False` + `status:"cancelled"`, returns `access_until = current_period_end`. But every entitlement reader filters `status=="active"` → **cancel revokes access immediately**, contradicting the returned `access_until`.
- **Plan deactivation rule** (`seed_subscription_plans`, :363-415): portfolio product is exactly Basic+Premium; any other `plan_portfolio_*` row is set `is_active:False` on every boot. Deactivating does NOT break existing subs (tier read from the plan doc by id). `_quote` 404s on `is_active:false` → cannot buy/renew/switch to a retired plan. Also backfills `portfolio_tier` on portfolio plans seeded before that field existed (without it PREMIUM was unreachable forever).
- **Seeder is insert-only** for new plans (`if existing: continue`) — admin price edits survive restart. Same rule in `store_features.seed_alacarte_catalog` ("only ever populate an EMPTY collection") and `event_pricing.ensure_seeded`.
- **Storage lifecycle** (`run_storage_lifecycle`, called from `server.py:16169`): 7-day expiry email → `status:"expired"` at period end → **purge `backup_files` + `backup_folders` 1 day after expiry** unless another storage sub is active. Every step flag-guarded (`expiry_notified`, `storage_purged`) and idempotent.

---

## 6. Entitlements — a server-side object EXISTS

Not frontend-only. Three layers:

1. **Write** — `backend/pricing_activation.py::apply_order_entitlements(db, order, profile_id, actor)`. Called from `store_features.build_store_admin_router` deliver (`:1074-1079`), wrapped in try/except: **entitlement failure never blocks delivery**. Writes onto `profiles`: `link_duration_id`, `link_duration_policy:"purchased"`, `link_lifetime`, `link_expiry_date` (None = lifetime), `feature_pack_key`, `granted_features[]`. Audits to `pricing_audit_log`.
2. **Runtime gate** — `pricing_activation.has_feature(db, profile, key)`; public payload field via `pricing_activation.granted_features(profile)` → `server.py:4739 _public_granted_features` → `InvitationPublicView.granted_features` (used at server.py:4859, 5447, 5595).
3. **Client mirror** — `frontend/src/utils/featureAccess.js`, `hasFeature(granted, key)`, 1:1 with `has_feature`. `PACKABLE_FEATURES` set must stay in sync with `pricing_migration.DEFAULT_FEATURE_PACKS`.

Permissive ladder (all three layers agree): flag OFF → ungated · `granted_features is None` → ungated (legacy/grandfathered) · key not packable → ungated · else membership test. `_public_granted_features` returns `None` whenever the flag is OFF **even if a list was written during a prior ON window** — that is the rollback mechanism.

Guards: `apply_order_entitlements` no-ops unless `flag_on(db)` AND `_order_pricing(order).is_v2` (`quote.pricing_model=="v2"` or `order.feature_pack_key`). Grandfathered profiles (`pricing_grandfathered`) **never get an expiry written**. Only server-authoritative gate found: `POST /invite/{slug}/live-gallery/guest-upload` enforces `guest_uploads` (per PRICING_PRODUCTION_READINESS.md §Task 1); everything else is render-time hiding.

**Events have a parallel, unflagged entitlement system**: `event_plan_gating.apply_event_entitlements` writes `events.plan_key` / `events.granted_features` / `events.link_active_days`, intersected against `packable_keys()`. Deliberately **not** tied to `new_pricing_enabled` (new product, no legacy buyers). Readers: `event_has_feature`, `public_event_features`.

**Gap**: à-la-carte orders (system A, the live one) produce **no entitlement object at all**. `feature_pack_key` is never set, `pricing_model` is `"alacarte"`, so `apply_order_entitlements` returns `{"applied": false, "reason": "legacy_order"}`. What the buyer paid for is expressed only as `order_to_invitation._FEATURE_SECTIONS → profile.sections_enabled` and `profile.selected_features`, and `link_expiry_type` is hardcoded `"permanent"`. **Every à-la-carte purchase yields a permanent, ungated link regardless of price paid.**

---

## 7. Order → invitation pipeline

```
CartPage → POST /api/store/order/create        invitation_orders{status:"created", build_status:"awaiting_payment"}
Razorpay modal → POST /api/store/order/verify  → status:"paid", build_status:"pending_info"
buyer form → POST /api/store/order/{id}/info   → build_status:"building"
                 · hash_qr_password(info) — bcrypt any extra.qr_gallery.password, plaintext NEVER persisted
                 · event_folders.ensure_order_folders(db, order) → drive_folder_qr / drive_folder_selfies / storage_account
                 · admin_notifications{type:"order_details_submitted"} carrying folders + storage mail
admin → POST /api/admin/fulfillment/requests/{code}/build-invitation
                 · order_to_invitation.build_invitation_payload(order, admin_id) → profiles doc (DRAFT)
                 · idempotent: existing profile_id, else lookup by deterministic build_slug(order); rebuild=true refreshes
                 · slug clash with a DIFFERENT order → append uuid4[:4]
                 · sets invitation_orders.profile_id + build_status:"building" + invitation_built_at
admin → POST .../deliver (live_url required)   → build_status:"delivered", delivered_at
   OR → POST /api/admin/build-queue/{id}/deliver → same + apply_order_entitlements
```

`order_to_invitation.py` is a **pure function over the order dict** (no db/network), output shaped exactly like `LuxuryProfileForm`'s POST body incl. the `custom_text._maja` bag. Validated through `models.Profile(**profile).model_dump(mode="json")` so mapping errors surface at build, not render. Notable behaviours:
- `build_slug` = `{groom}-{bride}-{last6 of fulfillment_code}` — deterministic, so rebuild ≠ orphan link.
- `normalise_phone` → India-first E.164; unconvertible → `None` + warning, never a malformed string that would 500 the whole profile.
- `normalise_languages` forces `english` in as fallback, keeps primary FIRST. `RENDERABLE_LANGUAGES` (11) is **narrower than the cart's `LANGUAGE_CATALOG` (12)** — `odia` and `urdu` are **sold but unrenderable**; dropped with warning `"Refund or add support before delivering."` **Live revenue leak into an unfulfillable SKU.**
- `parse_latlng` prefers `!3d/!4d` (resolved place) over `@lat,lng` (camera).
- Ceremony type is authoritative over traditions: `traditions_of(order)` strips stale gotram/nakshatram/muhurtam when the buyer switched to a Christian/Muslim ceremony.
- Always `status:"draft"`, `is_published:False`, `is_enabled:False` — building is explicitly NOT delivering.
- `_PLAN_BY_PACKAGE`: bespoke/platinum→PLATINUM, premium/gold→GOLD, classic/silver→SILVER, default GOLD. À-la-carte `package=="alacarte"` → **falls to GOLD**.

Two `deliver` endpoints exist with different behaviour: `fulfillment_service` `/requests/{code}/deliver` (requires `live_url`, **no entitlement application**) vs `store_features` `/api/admin/build-queue/{order_id}/deliver` (takes `profile_id`, **applies entitlements**). Different guards (`require_super_admin` vs `require_admin`).

---

## 8. Edit-lock rule (`store_features.py:813-876`)

`POST_DELIVERY_MAX_EDITS = 3`. Settings: `app_settings{id:"fulfillment_settings"}` → `{whatsapp_number, edit_enabled}` (default True). `_edit_state(order)` evaluates **in this exact order** — order matters:

```
status != "paid"        → can_edit=False  "Payment required before adding details."
not order.info          → can_edit=True   (first fill ALWAYS allowed, beats every switch below)
order.edit_locked       → False           "studio has locked editing while finalising"
not settings.edit_enabled → False         "Editing is currently turned off."
not delivered_at        → True            (pending_info / building, unlocked)
remaining <= 0          → False           "used all 3 edits … WhatsApp"
else                    → True
```
`_require_editable` raises 403. Enforced on `POST /info` and `PUT /info-draft`; `GET /edit-state` exposes the state; `GET /api/store/order/{id}` embeds it.

Post-delivery edit semantics: **does NOT rebuild.** Increments `post_delivery_edits`, sets `edit_requested/edit_requested_at`, keeps `build_status:"delivered"`, inserts `admin_notifications{type:"order_edit_request"}` — studio applies to the live link **manually, no auto-sync**. `POST /api/admin/build-queue/{id}/edit-applied` clears the flag. Lock toggled by `POST /api/admin/fulfillment/requests/{code}/edit-lock` (per order) or `PUT /api/admin/fulfillment/settings` `edit_enabled` (global). WhatsApp number sanitised to digits only (`re.sub(r"\D","")`) for `wa.me`.

Build queue = `status=="paid"` AND (`build_status in ("pending_info","building")` OR `edit_requested`), filtered in Python — comment says compound `$or` is not adapter-safe.

---

## 9. Collections

**Orders/payments**: `invitation_orders` (A, canonical), `event_orders` (D), `orders` + `payments` + `invoices` + `counters` (C), `monetization_orders`, `link_reactivations`, `razorpay_events` (webhook audit), `credit_purchases`/`credit_wallets`/`credit_ledger` (dead).

**Pricing catalogs**: `pricing_design_prices` (v2 canonical, `audience` field), `store_features`, `store_languages`, `store_packages`, `store_addons`, `theme_bundle_pricing`, `feature_packs`, `link_duration_tiers`, `design_categories`, `pricing_campaigns`, `subscription_plans` (+`durations`/`durations_founding` maps), `pricing_settings{id:"billing_cycles"}`, `coupons`, `community_settings`, `event_design_prices`, `event_plan_prices`, `event_feature_prices`.

**Legacy pricing still read** (per PRICING_PRODUCTION_READINESS.md Task 4, nothing deleted): `design_pricing`, `design_pricing_enhanced` (3 readers incl. `pricing_calculation_service`), `design_pricing_by_user_type`, `pricing_theme_prices`, `expiry_tiers`, `duration_options`, `feature_pricing_enhanced`, `theme_pricing_enhanced`, `mixed_theme_pricing`.

**Entitlement/state**: `profiles` (`granted_features`, `feature_pack_key`, `link_expiry_date`, `link_lifetime`, `pricing_grandfathered`, `plan_type`, `plan_expires_at`), `events` (`granted_features`, `plan_key`, `plan_status`, `plan_price_paid`, `plan_quote`, `pending_order_id`, `link_active_days`), `subscriptions`, `storage_addons`.

**Audit/ops**: `pricing_audit_log`, `audit_logs`, `admin_notifications`, `face_match_records`, `face_match_rate_limits`, `backup_files`/`backup_folders`.

---

## 10. Invariants that must not drift

1. **Server always re-prices.** Client sends selections, never amounts (`store_features.py:679`). Every quote endpoint recomputes from owner-set rows.
2. **Included ⇒ free, unconditionally.** Enforced on read (`_feature_map`: `0 if included`) AND admin write (`upsert_store_feature`). Never honour a stray price on an `included` row.
3. **Unknown key → dropped, never guessed.** À-la-carte features/languages, event addons.
4. **Main language free; extras charged.** `lseen = {main}` server-side, plus client `pickMain`.
5. **One campaign, never stacked; clamped to subtotal.** Total floors at 0, never negative.
6. **Unpriced cycle = "unavailable", never ₹0** (`compute_plan_total`).
7. **₹0 must be explicit.** `validate_price(allow_zero=False)` blocks accidental free.
8. **Honest strike-through.** Never a reverse-computed anchor; `strikethrough=None` unless the buyer genuinely pays less.
9. **Provider dispatch is a security boundary** (`verify_gateway_payment`): a `mock_token` must never activate a subscription created with real keys.
10. **Gateway-unavailable ≠ forged signature.** `PaymentUnavailable` → 409/502 (retryable); mismatch → 400. Never silently mock-activate when keys exist — that gave paid plans away for free once already.
11. **Payment mark-paid is a conditional update** (`status:{"$ne":"paid"}` / `{"$ne":"active"}`), not read-then-write.
12. **Seeders only fill EMPTY collections.** An owner's price edit must never be reverted by a restart.
13. **Grandfathered profiles never get an expiry written.**
14. **Entitlement failure never blocks delivery** (try/except around `apply_order_entitlements`).
15. **Plaintext QR passwords never persist** (`hash_qr_password` sanitises the free-form `extra` bag; `info` is echoed to the buyer and rendered in the console).
16. **Rollback = flip `new_pricing_enabled` to False.** Resolver, activation, `has_feature`, `_public_granted_features` all revert; written `granted_features`/`link_expiry_date` are simply ignored. No data migration to undo.
17. **`featureAccess.js` PACKABLE_FEATURES ≡ union of `pricing_migration.DEFAULT_FEATURE_PACKS`.** Drift silently un-gates or over-gates.
18. **Re-buying stacks, never truncates** (`_stacked_period_start`).

---

## 11. BROKEN / STUBBED / DOCUMENTED-BUT-NOT-IMPLEMENTED

**BROKEN — money/security**

- **`store_features.py:792` — verify accepts a client-supplied `razorpay_order_id`.** The order is fetched by internal `id`, but the signature is checked against `payload.razorpay_order_id`, never `order["razorpay_order_id"]`. Any valid (order_id, payment_id, signature) triple from a cheap order on the same merchant account marks an expensive order paid. `subscription_service` and `event_purchase_service` both explicitly guard this; store does not.
- **`server.py:11977` — same flaw in `/api/payments/verify`**, plus no check that `payment["admin_id"] == current_admin`. HMAC is computed over `request.razorpay_order_id`, not `payment["razorpay_order_id"]`.
- **Portfolio subscriptions never expire.** `portfolio_service._active_portfolio_plan` (:418) filters `status=="active"` only, with **no `current_period_end` comparison**, and `run_storage_lifecycle` sweeps `product=="storage"` exclusively. One payment for `portfolio` / `invitation` / `backup` = permanent entitlement. Only storage is ever expired.
- **No webhook for store orders.** Paid + tab closed → `invitation_orders` stuck `status:"created"`. Money captured, order invisible to the build queue.
- **Two divergent design-price resolvers** in `store_features.py` (`_effective_price_inr` :37 vs `design_price_inr` :224) — a `discount_enabled` row with `discount_price:0` quotes ₹0 on `/api/store/design/{id}/price` and ₹2999 in the cart.
- **`odia` + `urdu` are sold and cannot be rendered.** `store_features.LANGUAGE_CATALOG` (12) vs `order_to_invitation.RENDERABLE_LANGUAGES` (11 — no odia/urdu). Dropped at build with a "Refund or add support" warning.
- **Cancel revokes immediately** while the response promises `access_until = current_period_end`.

**STUBBED**

- **`WeddingCheckout.jsx:214` — the v2 "Pay ₹N & continue" button is a no-op comment.** System B has no live buyer path from the UI. Contradicts PRICING_PRODUCTION_READINESS.md, which reports Task 2 as ✅ COMPLETE.
- `credit_service.py` — explicit null-object: every method returns success and changes nothing. `use_credits` never raises "insufficient". Call sites across monetization/translation/admin-dashboard/user-purchase are all no-ops.
- `monetization_service.py` — SKUs record `monetization_orders{status:"payment_pending"}` and grant nothing; **entitlement is only ever granted by a super-admin clicking `/api/admin/monetization/orders/{id}/activate`**. `purchase()` returns `"payment_ready"` when keys exist but never creates a Razorpay order.
- `pricing_calculation_service.py` — credits-denominated (`base_user_credits`, `duration_credits`, hardcoded `pack_discount = 0.8`) against dead collections `design_pricing_enhanced`/`feature_pricing_enhanced`/`duration_options`/`mixed_theme_pricing`. Orphaned by the credits retirement.
- `fulfillment_service.py:20` — Google Drive auto-upload not wired; `face_match_records` + the two `drive_folder_*` fields are plumbing only. AI face matching unimplemented, but `ai_face_match` sells at ₹1499.
- `server.py:12075` — `invoice_url=None  # TODO: Generate invoice PDF` on the legacy verify path, even though `invoice_service.create_invoice` exists.

**DOCUMENTED-BUT-NOT-IMPLEMENTED**

- **`POST /api/subscriptions/{id}/change`** writes `pending_plan_id` / `pending_tier` / `pending_cycle` / `pending_quote` and returns `effective:"next_renewal"`. **Nothing in the repo ever reads `pending_plan_id`** (grep: `subscription_service.py` only). There is no renewal job for any product. Plan change is a permanent no-op.
- **Recurring subscriptions**: `_gateway_create_subscription`'s razorpay path needs a per-(product,tier,cycle) `razorpay_plan_id` on the plan row, "created/looked-up out of band" — no such provisioning code exists. Real billing always lands on the one-time-order path with `auto_renew:False`.
- **`new_pricing_enabled` is OFF and was never flipped** (PRICING_PRODUCTION_READINESS.md line 3). Everything in `pricing_engine` / `pricing_activation` / `pricing_hub_service` quote endpoints is inert for customers. Readiness score 90%, blocker = one human UI click-through; the actual blocker is the dead checkout button.
- PRICING_PRODUCTION_READINESS.md Task 4 lists 7 legacy collections as coexisting safely with dual-read planned — **no dual-read or write-redirect was implemented**; legacy readers still read legacy collections directly.
- `subscription_service.py:858` "real gateway prorates" — no proration code on either path.

**Structural noise to resolve before porting**

- Two `deliver` endpoints with different guards and different side effects (§7).
- Duplicate `GET /api/admin/pricing/designs` from `pricing_hub_service.py` and `enhanced_admin_service.py`.
- Four independent Razorpay integrations; only `event_payments.py` is worth carrying forward as the shared surface.
- Five overlapping credit-pack admin surfaces (`super_admin_pricing`, `super_admin_service`, `monetization_features`, `restructured_admin_service`, `credit_packages`) all serving a decommissioned system.
- `event_purchase_service` grants plans free whenever `not pay.configured()` — correct for dev, a total giveaway if a production deploy loses its keys.