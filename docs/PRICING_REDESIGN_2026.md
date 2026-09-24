# Pricing Redesign 2026 — master plan and approved price book

Owner-approved redesign of the four customer-facing price surfaces: Portfolio,
Storage, Wave Face Match + QR, Invitations. This document is the single
reference for the approved numbers, the rounding rule, the architecture
decisions, and the items still awaiting owner confirmation.

**Source of truth in code: `backend/pricing_catalog.py`.** Every displayed and
charged amount for these products must trace back to it. Frontend never
computes prices; it renders what the API returns.

---

## 1. Psychological pricing rule (verified against all 21 owner examples)

All money in integer paise. For a post-discount amount over ₹100:

```
prev99 = floor(amount/100)·100 − ₹1      # e.g. 4854.60 → 4799
same99 = floor(amount/100)·100 + ₹99     # e.g. 2694.60 → 2699
bump UP to same99 only when (same99 − amount) ≤ ₹10
  AND prev99 is in the same ₹1000 block as the amount
otherwise round DOWN to prev99
```

The thousand-block guard is what makes ₹5,089.80 → **₹4,999** (dropping below
the ₹5,000 boundary beats ₹5,099) while ₹20,389.80 → **₹20,399**.

Applied **only to multi-month totals after the cycle discount** (and after the
Custom setup fee is added). Monthly prices pass through untouched — the rule
would otherwise turn ₹499 into ₹399.

Not applied to Invitations or Face Match — those owner prices are exact.

## 2. Cycle discounts (changed: yearly was 20%, now 15%)

| Cycle | Months | Discount |
|---|---|---|
| Monthly | 1 | 0% |
| 3 Months | 3 | **5%** |
| 6 Months | 6 | **10%** |
| 1 Year | 12 | **15%** |

Migration must also overwrite any stale `db.pricing_settings{id:"billing_cycles"}`
override still carrying the old 20% yearly discount.

## 3. Portfolio — five plans (was two)

Feature gating: Basic keeps `portfolio_tier: "basic"`; Pro/Advanced/Premium/
Custom map to `portfolio_tier: "premium"` (full sections). Storage is the
plan-differentiator the owner defined; a finer feature matrix is flagged for
the owner (§9). Custom carries a **₹5,000 one-time setup fee**, charged only on
first purchase (any prior paid Custom portfolio subscription ⇒ setup skipped),
added before psychological rounding, never discounted.

Approved customer-facing finals (INR, **GST-inclusive** — see §7):

| Plan | Storage | Monthly | 3 Months | 6 Months | 1 Year |
|---|---|---|---|---|---|
| Basic | **512 MB** (display exactly this) | 499 | 1,399 | 2,699 | 4,999 |
| Pro | 2 GB | 899 | 2,499 | 4,799 | 9,099 |
| Advanced | 10 GB | 1,399 | 3,899 | 7,499 | 14,199 |
| Premium | 20 GB | 1,999 | 5,699 | 10,799 | 20,399 |
| Custom (first purchase, incl. setup) | 20 GB | 6,999 | 10,699 | 15,799 | 25,399 |
| Custom (renewal, no setup) | 20 GB | 1,999 | 5,699 | 10,799 | 20,399 |

Badges: `SAVE 5%/10%/15%`; when the psychological round-down saves more than
the advertised percentage, display `X% OFF + Special Pricing`. "You Save ₹N" is
always computed as `list − final` (list = base_monthly × months), so it is
honest in both directions. Note: in 4 cells (Basic 6M, Premium 3M/6M/1Y and the
Custom cells that inherit them) the bump-up rule prices ₹2–10 *above* the exact
percentage value — owner-approved numbers win; the badge shows the percentage,
"You Save" shows the true rupee figure.

`subscription_plans` rows store `base_monthly` (authoritative input) **and**
`durations{1,3,6,12}` = the computed finals above, kept in sync by one helper so
the public cards (`durations` readers) and checkout (`base_monthly` reader)
can never diverge again. All **three** admin writers route through it — the
Pricing Hub plan editor, the subscription-plans editor, and the founding
console (whose regular-price edits anchor on the monthly value and re-derive
the ladder; the independent audit caught it writing free-form per-cycle
regular prices, which diverged the marketing page from checkout). Founding
prices are the one deliberate absolute overlay: `durations_founding`, merged
per cycle, and — post-audit — actually read by checkout (`_quote` charges the
founding rate whenever founding mode is live and the rate is genuinely below
regular). This settles the long-standing plan-price divergence.

## 4. Storage — canonical flow is `studio_storage`, anchors re-priced

Today two disagreeing sale paths exist. Decision:
- **`studio_storage.py` is canonical** (public page already reads it; it owns
  entitlement + purge lifecycle). Catalog version bumps 2 → 3.
- `subscription_plans[product=storage]` rows (Starter/Professional/Studio/
  Enterprise) are **deactivated** — the StudioPlans storage tab goes away and
  `StudioStorage.jsx` gains the real buy flow via the existing
  `/admin/studio-storage/subscribe` → Razorpay → `/verify-payment` endpoints.
- `pricing_migration.unify_storage_plans` dead data: stop writing it.

Approved anchors (regular price; founding column = regular until the owner
re-prices founding):

| Tier | Monthly | 3 Months | 6 Months | 1 Year | Status |
|---|---|---|---|---|---|
| 50 GB | **299** | 799 | 1,599 | 2,999 | ✅ owner anchor, computed cycles |
| 100 GB | 299 | 799 | 1,499 | 2,999 | ⚠️ carried from live catalog v2 — **awaiting owner re-price** |
| 250 GB | 599 | 1,599 | 2,999 | 5,499 | ⚠️ carried — awaiting owner re-price |
| 500 GB | 999 | 2,799 | 5,299 | 8,999 | ⚠️ carried — awaiting owner re-price |
| 750 GB | — | — | — | — | ❌ **does not exist anywhere; not invented; not offered** |
| 1 TB | **2,999** | 8,499 | 16,199 | 30,599 | ✅ owner anchor (floor ₹2,399 respected), computed cycles |

The carried middle tiers keep selling at their live prices (nothing breaks,
nothing invented), but the ladder is incoherent — 50 GB now costs the same as
100 GB — and §9 asks the owner for the four middle prices. Existing
subscribers renew on their existing terms regardless (§8).

## 5. Wave Face Match + QR — new product (photo-count tiers did not exist)

One-time SKUs sold through the store; the purchased photo limit is stored on
the order (`face_photo_limit`) and surfaced in the fulfillment console.

| SKU | Photos | Price |
|---|---|---|
| face_match_2000 | 2,000 | ₹5,000 |
| face_match_3000 | 3,000 | ₹7,000 |
| face_match_5000 | 5,000 | ₹10,000 |
| Custom | any | WhatsApp quote |

Custom CTA: `GET CUSTOM QUOTE ON WHATSAPP` → `wa.me` link built from the single
central config `VITE_SUPPORT_WHATSAPP` (the existing Landing.jsx precedent; no
number is ever hardcoded), prefilled:
"Hello, I am interested in Wave Face Match + QR Code custom pricing. I need
approximately ____ photos. Please share the quotation."

The old flat SKUs (`ai_face_match` ₹1,499, `selfie_search` ₹999) stop being
displayed on public pricing; keys stay valid for historical orders. The event
engine's Royal feature pack is a separate product line, untouched (§9).

## 6. Invitations — three tiers × three independent add-ons (pure addition)

New `invitation_suite` order type; totals are exact (no GST on top, no
psychological rounding — additive owner prices):

| Component | Basic | Premium | Custom |
|---|---|---|---|
| Digital Invitation | 5,000 | 8,000 | 10,000 |
| Video Invitation | 2,000 | 4,000 | 5,000 |
| Physical Design | 2,000 | 4,000 | 5,000 |
| All three | 9,000 | 16,000 | 20,000 |

Any combination is valid; total = sum of selected components; UI updates
instantly; backend recomputes from the catalog at order-create (client sends
selections, never amounts). Fulfillment mapping: basic→SILVER, premium→GOLD,
custom→PLATINUM (and the previously unmapped legacy `royal` gets an explicit
→GOLD). Legacy à-la-carte and package paths keep working for existing orders;
the public pricing surface shows only the new model.

## 7. Tax and money rules

- The approved finals are **the amounts payable** — Razorpay is charged exactly
  these. For the portfolio subscription flow (which previously added 18% GST on
  top) prices become GST-inclusive: `gst = total − round(total/1.18)` recorded
  on the quote/invoice for auditability. Store and studio-storage flows already
  charge the catalog price as-is.
- All arithmetic in integer paise. Quotes persist `base/list`, `discount`,
  `psych_adjustment`, `final` so invoices reconcile.
- Historical orders/subscriptions are never re-priced: every existing order row
  already stores its own paid amount; migrations only deactivate/insert plan
  rows going forward.

## 8. What deliberately does not change

- Existing storage subscribers' renewal terms and the studio_storage grace/
  purge lifecycle.
- Wedding-link pricing (`link_duration_tiers` → `compute_wedding_total`),
  link reactivation (₹50/day), design prices, theme bundles, coupons.
- Invitation *subscription* product and backup product in `subscription_plans`
  (legacy, still GST-on-top; not part of the four redesigned categories).
- Event engine feature packs (Celebration/Signature/Royal).

## 9. Owner decisions — remaining vs resolved

**Still needs the owner (cannot be inferred from any approved source):**

1. **Storage 100/250/500 GB re-prices + whether 750 GB exists at all** — the
   four missing numbers under the new anchor ladder. Until supplied, the
   middle tiers keep selling at their carried v2 prices (flagged
   `approved:false`); 750 GB is not offered anywhere.
2. **Founding discount VALUES** for the 5-plan portfolio and the re-priced
   storage anchors. The mechanism is complete end-to-end — set a founding
   rate in the founding console and checkout charges it the moment founding
   mode is live (verified display == charge by test_founding_checkout_2026) —
   but every rate is deliberately founding == regular until the owner supplies
   real numbers. The apply-catalogue button is safe to click (derives from
   pricing_catalog by canonical id — the old version would have rolled
   prices back).
3. **Pro vs Advanced capability split**, if wanted beyond storage. Verified
   truth: every real gate (portfolio sections, directory ranking, design
   unlocks, community caps) treats Pro/Advanced/Premium/Custom identically
   (`portfolio_tier="premium"`); a "pro" gate level exists only as write-only
   config nothing reads. Differentiating further means building capability,
   not relabeling.

**Resolved in the completion wave (no longer open):**

- Storage renewal grandfathering — existing subscribers renew their
  deactivated plan at the contractual price (founding rate preserved);
  renewal-only access enforced server-side; upgrades are a deliberate new
  purchase at current prices.
- Legacy invitation subscription product — retired from sale (v2 marker
  migration); existing subscribers keep renewal-only access to their tier.
- Face-match photo-limit — enforced at the single indexing choke point
  (`gallery_features.index_photo_job`); limit = max across the wedding's paid
  orders; legacy flat `ai_face_match` orders stay unlimited.
- Invitation-suite video component now enables `sections_enabled.video`;
  `physical` lands in a `deliverables` list for fulfillment.
- The pricing-page selection is fully wired into the sign-up funnel:
  Pricing → stash → auth → dashboard banner → `/studio/order/invitation-suite`
  checkout (server re-priced, stash never trusted for money).

## 10. Verification gates

`backend/pricing_catalog.py` self-check (`python backend/pricing_catalog.py`)
asserts the full §32/§33/§34 matrices. `backend/tests/test_pricing_catalog.py`,
`test_subscription_pricing_2026.py`, `test_store_pricing_2026.py`,
`test_storage_pricing_2026.py` cover: every portfolio plan × cycle final,
setup-fee first-vs-renewal, monthly passthrough, all 21 rounding examples, all
21 invitation combos, face-match SKUs, storage anchors, GST-inclusive
breakdown summing exactly to the final, and route-level (FastAPI DI) checks
that checkout amounts equal the approved finals and ignore client-sent prices.
