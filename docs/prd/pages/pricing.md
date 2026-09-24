# Pricing Page

Route: `/pricing`
Source: `frontend-v2/src/pages/Pricing.jsx`, `Pricing.css`
Auth: public, no session required

## Overview

Shows live, backend-priced plans for the two audiences MAJA serves: couples (one-time, per-wedding invitation packages) and studios (photographer subscription plans, priced in credits per billing cycle). The couple's ceremony-tier "packages" and add-ons are informational only — the real store checkout is à la carte per design (a specific `design_id` plus selected features), not a bare package purchase — so choosing a package here does not add anything to a cart; it hands the shopper to Sign Up with the chosen tier stashed as a hint.

## Layout

1. **Shared marketing nav** (`MarketingNav`) — links: "Themes" (→ `/pricing`, i.e. self), "Plans & pricing" (→ `/pricing`); CTA: "Sign in" (→ `/auth`).
2. **Hero** — eyebrow "Plans & pricing", H1 "Priced for how far you want to take it.", and a subhead whose copy switches depending on the selected audience tab.
3. **Audience tab row** — two buttons: "For couples" / "For studios".
4. **Couple body** (audience = `couple`):
   - Loading / error / empty states for the packages fetch.
   - A card grid of packages, each showing: label, price (`₹english price / wedding`), an "events covered" line (`N ceremonies covered` or `Unlimited ceremonies`), a static blurb keyed by package key, and a "Choose {label}" button. A `featured` package shows a "Most chosen" badge.
   - An "Add to any plan" add-on list (label + `+₹price` per row), shown only if add-ons exist.
5. **Studio body** (audience = `studio`):
   - Loading / error / empty states for the studio pricing fetch.
   - A card grid of studio plans, each showing: plan name, price (`₹price / N-day cycle`), `N credits per month`, and a "Start on {name}" link.
6. **Footer** — copyright line only.

## Fields

This page has no user-entered form fields. State is driven entirely by tab selection and server responses.

| Control | Type | Options / Notes |
|---|---|---|
| Audience tab | button group (single-select) | `couple` (default) \| `studio` |
| "Choose {label}" (per package card) | button | Triggers `choosePackage` |
| "Start on {name}" (per studio plan card) | link (styled as button) | Navigates to Sign Up |

## Data Displayed (per package, from `GET /api/store/packages`)

| Field | Notes |
|---|---|
| `key` | Package identifier (e.g. `classic`, `premium`, `royal`, `bespoke`); used to look up the static blurb via `PACKAGE_BLURB` |
| `label` | Display name |
| `price.english` | INR price shown; formatted via `en-IN` locale, defaults to 0 if absent |
| `events` | Number of ceremonies covered; if falsy, page shows "Unlimited ceremonies" |
| `featured` | Boolean — shows "Most chosen" badge |
| `addons[].key`, `addons[].label`, `addons[].price` | Add-on rows shown under "Add to any plan" |

## Data Displayed (per studio plan, from `GET /api/feature-flags`... actually `GET /api/public/pricing/effective?audience=photographer`)

| Field | Notes |
|---|---|
| `plans[].id` | React key |
| `plans[].name` | Display name |
| `plans[].price` | INR price |
| `plans[].duration_days` | Cycle length shown as "/ N-day cycle" |
| `plans[].credits_per_month` | Shown as "N credits per month" |

## Interactions

| Trigger | Behavior |
|---|---|
| Page mount | Fetches `store.packages()` once, regardless of tab, setting `pkgState` to `loading` → `ready`/`error` |
| Click "For couples" tab | Sets `audience = 'couple'`; couple body renders from already-fetched `pkgState` |
| Click "For studios" tab (first time) | Sets `audience = 'studio'`; since `studioState.status === 'idle'`, triggers `pricingApi.effective('photographer')`, setting `studioState` to `loading` → `ready`/`error`. Subsequent tab switches back to studio do **not** re-fetch (status is no longer `idle`) |
| Packages fetch fails | Shows "Couldn't load plans right now. Please refresh." |
| Packages fetch succeeds but empty | Shows "No plans are published yet." |
| Studio pricing fetch fails | Shows "Couldn't load studio plans right now. Please refresh." |
| Studio pricing fetch succeeds but empty | Shows "Studio plans aren't published yet — sign up and we'll get you set up." |
| Click "Choose {package label}" | Stashes `{ type: 'package', key, label, price_inr: price.english ?? 0 }` into `sessionStorage['maja_pricing_selection']` (best-effort — silently no-ops in private-mode browsers where `sessionStorage` throws), then navigates to Sign Up (`/auth/signup`) |
| Click "Start on {studio plan name}" | Prevents default anchor navigation, routes to Sign Up |

## API Dependencies

| Action | Method & Endpoint | Module | Notes |
|---|---|---|---|
| Load couple packages | `GET /api/store/packages` | `api/store.js` → `packages()` | Fired once on mount regardless of active tab |
| Load studio plans | `GET /api/public/pricing/effective?audience=photographer` | `api/pricing.js` → `effective('photographer')` | Fired lazily, only the first time the "For studios" tab is opened |

## Page Relationships

**Links out to:**
- `/auth/signup` (Sign Up) — both "Choose {package}" and "Start on {plan}" CTAs, and the nav CTA fallback isn't present here (nav CTA is "Sign in")
- `/auth` (Sign In) — nav CTA
- `/pricing` — self-referential "Themes" and "Plans & pricing" nav links (there is no separate theme browser)

**Linked from:** Landing page (`LINK.browseThemes`, footer "Plans & pricing"), Features page ("See pricing" CTA), How It Works ("See pricing" CTA), FAQ pricing copy, SignIn's couple-persona footer link ("Browse themes").

## Business Rules

- The backend sells à la carte per design (a specific `design_id` + selected features) — "the owner does not sell ceremony packages" per the store's own domain model. This page's package cards are informational/marketing only; choosing one does not add anything to a real cart.
- Because a package has no `design_id`, it cannot use the real cart handoff (`lib/cart.js`'s `maja_selected_design` key requires one) — routing to `/cart` from here would land on an empty cart, so the page intentionally routes to Sign Up instead with the tier stashed as a hint.
- Studio subscriptions are credit-based plans billed per cycle (`duration_days`), not a monthly/quarterly/yearly discount ladder — any such ladder was an invented artifact of the original design mock and does not exist server-side.
- All money values are server-quoted (`price.english`, plan `price`) — the page never computes a price client-side.
- `sessionStorage` write on package selection is best-effort; a private-mode browser where the write throws still allows sign-up to proceed, just without the pre-fill hint. [TBC — where/whether Sign Up actually consumes `maja_pricing_selection`; not observed in `SignUp.jsx`.]
