# Checkout Page

Route: `/checkout`
Source: `frontend-v2/src/pages/Checkout.jsx`, `Checkout.css`, `buyer-shared.css`
Auth: requires a signed-in identity (couple **or** studio/admin) — enforced in-component, not via `RequireUser`/`RequireStudio` (see Business Rules)

## Overview

The only place in the app that ever calls `POST /api/store/order/create`. Re-quotes the cart item fresh (prices may have moved since the Cart page was viewed), collects e-sign agreement, and either bypasses payment entirely (comped/test-buyer accounts) or opens the Razorpay checkout modal. On successful payment it verifies the transaction server-side and routes the buyer to Order Details to fill in their wedding info.

## Layout

1. **Nav** — MAJA Invites brand mark (→ `/`), "← Back to cart" link (→ `/cart`).
2. **Empty-cart state** — same copy/CTA as Cart's empty state.
3. **Redirecting state** — shown while an unauthenticated visitor is being bounced to `/auth`.
4. **Checkout body** (two-column, signed-in with an item):
   - **Left: order summary card** — design name + main-language label + price, then one row per selected feature and per extra language (quote in `loading`/`error`/`ready` states, with a **Try again** retry on error).
   - **Right: payment card** — Subtotal row, bold Total row, inline error banner (payment/verification failures), e-sign checkbox ("I agree to MAJA's Terms & Refund Policy…"), "Pay & confirm order" primary button (spinner + "Processing…" while paying), and a "Secure checkout via Razorpay — cards, UPI, net-banking & wallets" hint.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| E-sign agreement | checkbox | Yes | Gates the Pay button (`disabled={isPaying \|\| quoteState !== 'ready' \|\| !agreed}`); sent to the backend as `esign_agreed` |

No other buyer-entered fields on this page — everything else (design, features, languages) was fixed on the Cart page and is only re-displayed/re-priced here.

## Interactions

### Page load
- Reads the cart item once via `getCartItem()` (not re-read on re-render).
- Once auth state resolves (`admin`/`user` from `AuthContext`/`UserAuthContext`), if the visitor is signed into neither identity and a cart item exists, stashes `sessionStorage['post_login_redirect'] = '/checkout'` and redirects to `/auth`.
- Fetches `POST /api/store/quote` with the same payload shape as Cart (`quoteState`: `loading` → `ready`/`error`).

### Pay & confirm order
- **Trigger:** click "Pay & confirm order" (guarded: no-op if no item or `!agreed`).
- **Behavior:**
  1. `POST /api/store/order/create` with `{ design_id, theme_id, event_type, features, main_language, extra_languages, esign_agreed }`.
  2. **Free/comped path** — if the response has `free: true` (test-buyer account, see Business Rules), the cart is cleared and the buyer is routed straight to `/order/{order_id}/details`. Razorpay is never loaded.
  3. **Paid path** — loads the Razorpay checkout script on demand (`loadRazorpay()`), then opens `new window.Razorpay({...})` pre-filled with the buyer's name/email/phone from the order-create response, themed `#6D28D9`.
  4. On Razorpay's `handler` callback: `POST /api/store/order/verify` with `{ order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }`. On success, clears the cart and routes to `/order/{order_id}/details`. On failure, shows "Payment verification failed. Please contact support if you were charged." and stops the spinner — **the cart is deliberately not cleared** on this path, since the buyer may need to retry.
  5. On modal dismiss (`ondismiss`) without completing payment: just stops the spinner, no error shown.
- **Errors:** any thrown error (order-create failure, Razorpay script load failure, network) surfaces via `e.response?.data?.detail || e.message || 'Checkout failed.'` in the inline error banner.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Quote | POST | `/api/store/quote` | Mount | Same contract as Cart's quote — re-verifies the price hasn't moved |
| Create order | POST | `/api/store/order/create` | "Pay & confirm order" click | Body includes `esign_agreed`; server recomputes the price server-side from selections (never trusts a client-sent amount) and rejects with 400 if `esign_agreed` is falsy, or 422 if the design has no price configured |
| Verify payment | POST | `/api/store/order/verify` | Razorpay success callback | Body: `{ order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }`. Server re-verifies the signature against the `razorpay_order_id` **it stored at create time**, never the client-supplied one |

## Page Relationships

- **From:** Cart's "Proceed to checkout" button; also reachable directly by URL (redirects to `/auth` if signed out, preserving the destination via `sessionStorage['post_login_redirect']`).
- **To:** `/cart` (back link), `/auth` (signed-out redirect), `/order/{orderId}/details` (both the free-order and paid-and-verified success paths), `/soon?f=Terms` / `/soon?f=Refund` (footer links).
- **Data coupling:** consumes the same `maja_cart_v1` cart item as Cart; calls `clearCart()` on success so a page-back to `/cart` afterward shows the empty state.

## Business Rules

- **Both admin/studio and couple identities can buy.** `signedIn = !!(admin || user)` — the order-create payload's `buyer_kind` mirrors whichever identity was active (`photographer` vs `user`), which is how the backend splits premium vs normal-user pricing. This is why Checkout does not use the shared `RequireUser`/`RequireStudio` route guards (either identity is acceptable) and instead implements its own signed-out redirect.
- **Free/comped orders exist only for allow-listed test-buyer accounts** (`seed_test_accounts.is_test_buyer`) — the backend skips Razorpay entirely, marks the order `status: "paid"` / `build_status: "pending_info"` at zero cost, and returns `free: true`. This is a deliberate internal dogfooding bypass, not a discount/coupon mechanism exposed to real buyers.
- Money is always server-computed at order-create time from the buyer's own selections — the client never sends, and the server never trusts, a pre-computed amount.
- Razorpay signature verification is keyed off the `razorpay_order_id` the **server** generated and stored, not whatever the client callback reports — this closes a class of exploit where a valid signature from a cheap order gets replayed against an expensive one.
- If the browser tab is closed mid-payment (after Razorpay captures the charge but before the `handler` callback fires and `/order/verify` runs), the order can be stuck `status: "created"` even though money was taken. A server-side webhook (`POST /api/payments/store-webhook`, not called from this page) exists as a fallback reconciliation path — it only *acts* on the order (flips it to paid) when `RAZORPAY_WEBHOOK_SECRET` is configured and the signature verifies; otherwise it stores the event for audit only. This page has no visibility into or interaction with that fallback.
- The e-sign checkbox text and the `esign_agreed` flag are the buyer's acceptance record for Terms/Refund Policy — required by the backend (`esign_agreed` must be truthy or order-create 400s) and stored on the order (`esign_at` timestamp).
