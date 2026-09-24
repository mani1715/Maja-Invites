# Cart Page

Route: `/cart`
Source: `frontend-v2/src/pages/Cart.jsx`, `Cart.css`, `buyer-shared.css`
Auth: public (no RouteGuard) — but the cart is functionally useless to a signed-out visitor since Checkout requires a session

## Overview

Lets a buyer tune the single design sitting in their cart — optional paid features, main invitation language, extra language versions — and see a server-computed running total before proceeding to Checkout. The cart holds **exactly one design at a time** (single-item cart, not a multi-item basket): choosing a new design elsewhere in the app (Pricing/design browser) overwrites whatever was here. Money is never computed client-side; every price shown comes from a fresh `POST /api/store/quote` call.

## Layout

1. **Nav** (`mjGlass mj-buyer-nav`) — MAJA Invites brand mark (→ `/`), "Continue browsing" link (→ `/pricing`).
2. **Empty state** (no cart item) — "Your cart is empty." card with "Browse designs" CTA (→ `/pricing`).
3. **Cart body** (two-column, item present):
   - **Left: design card** — design name/id, "Remove" button; then, once the catalog loads:
     - "Included with this design" chip grid (features bundled free, read-only, `✓ {label}`)
     - "Add the features you want" — checkbox list of paid optional features, each showing `{label} — ₹{price}`
     - "Main language" — select dropdown
     - "Other languages (optional)" — toggle-pill grid, each showing `{label} +₹{price}`, excludes whichever key is currently the main language
   - **Right: order summary** (`mjGlass cart-summary`, sticky-style card) — line items (design + main language label, each selected feature, each selected extra language), a bold Total row, "Proceed to checkout" primary button, "Clear" secondary button, and a Terms/Refund Policy hint line.

## Fields

| Field | Type | Required | Options / Notes |
|---|---|---|---|
| Optional feature checkboxes | checkbox list | No | Options come from `catalog.paid_features[]`; toggling re-triggers the quote |
| Main language | `<select>` | Yes (auto-defaulted) | Options from `catalog.languages[]`; defaults to `catalog.default_main_language` on first load if the cart item has none set yet |
| Extra languages | toggle-pill multi-select | No | Same `catalog.languages[]` list minus the current main language; picking a language as "main" silently drops it from this set if it was already selected as an extra |

## Interactions

### Page load
- Reads the current cart item via `getCartItem()` (`lib/cart.js`). If none exists, tries to hydrate from a one-shot sessionStorage handoff (`maja_selected_design`, written by the design-browsing lane) and persists it into the cart; if still nothing, renders the empty state.
- Fetches `GET /api/store/catalog?design_id&theme_id` for the item's design (`catState`: `loading` → `ready`/`error`). On first successful load, if the item has no `main_language` yet, it's set to the catalog's `default_main_language`.
- Fetches a quote (`quoteState`: `idle` → `loading` → `ready`/`error`) once `main_language` is set; re-fetches whenever design/theme/features/main_language/extra_languages change.

### Toggle a paid feature
- **Trigger:** check/uncheck a feature checkbox.
- **Behavior:** updates `item.features` in the cart (`updateCartItem`), which re-triggers the quote fetch.

### Pick main language
- **Trigger:** select a new option in "Main language".
- **Behavior:** sets `main_language` and removes that key from `extra_languages` if present (so the buyer is never billed for a language now included as the main one), then re-quotes.

### Toggle an extra language
- **Trigger:** click a language pill under "Other languages".
- **Behavior:** no-ops if the key equals the current main language; otherwise adds/removes it from `extra_languages`, then re-quotes.

### Remove / Clear design
- **Trigger:** "Remove" (design card) or "Clear" (summary card) — both call the same handler.
- **Behavior:** `clearCart()` wipes localStorage `maja_cart_v1`; page falls back to the empty state.

### Catalog load failure
- **Behavior:** shows "Couldn't load features for this design." with a **Retry** button that re-triggers the catalog effect (forces a new object reference on `item` to defeat the effect's memoization).

### Quote failure
- **Behavior:** shows "Couldn't calculate your total." with a **Try again** button that calls `refreshQuote()` directly.

### Proceed to checkout
- **Trigger:** click "Proceed to checkout" (disabled unless `quoteState === 'ready'`).
- **Behavior:** navigates to `/checkout` — no order is created yet; Checkout re-quotes independently.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Catalog | GET | `/api/store/catalog` | Mount, whenever `design_id`/`theme_id` change | Params: `design_id`, `theme_id`. Returns `included_features[]`, `paid_features[]`, `languages[]`, `default_main_language`, `design_price_inr` |
| Quote | POST | `/api/store/quote` | Mount + any feature/language change | Body: `{ design_id, theme_id, features, main_language, extra_languages, esign_agreed: true }`. Server recomputes `design_price_inr`, per-feature/-language line items, and `total_inr`; the à-la-carte resolver (`quote_alacarte`) silently drops any feature/language key it doesn't recognize rather than guessing at a price |

Both calls are unauthenticated (no login required to price a cart) — `store.js`'s `quote()`/`catalog()` wrap `client`, which attaches a Bearer token only if one exists in localStorage; the couple/cookie identity is never required here.

## Page Relationships

- **From:** design/theme browsing screens hand off via `sessionStorage['maja_selected_design']` then navigate here (not one of the reviewed pages — `lib/cart.js` documents the contract). Also reachable directly by URL/bookmark.
- **To:** `/pricing` ("Continue browsing" nav link, empty-state CTA), `/checkout` ("Proceed to checkout"), `/soon?f=Terms` / `/soon?f=Refund` (footnote links, unbuilt).
- **Data coupling:** shares the single `maja_cart_v1` localStorage item with Checkout — Checkout reads the same item on mount and re-quotes it fresh rather than trusting Cart's last-known total (prices may have moved between the two page views).

## Business Rules

- The cart is single-design: `lib/cart.js` stores a 1-item array purely for wire-format compatibility with the legacy contract, but only index 0 is ever read/written. Adding a second design (not exposed anywhere in this page) would silently replace the first.
- All prices are server-quoted, always. The client never adds up `price` fields itself to render the total — every total shown comes straight from the `/api/store/quote` response.
- Picking a language as "main" is mutually exclusive with having it as a paid "extra" — the UI enforces this locally (Cart) and the backend enforces it again independently (`quote_alacarte` seeds its dedupe set with the main language key before processing extras).
- An unknown/stale `features` or `extra_languages` key (e.g. a feature retired after being added to the cart) is dropped by the backend quote resolver, not billed and not surfaced as an error — the cart total simply reflects only the keys still valid.
- "Continue browsing" / empty-cart CTA both point at `/pricing`, not a dedicated design catalogue — there is no separate `/designs` route in this build.
