# Spec — Business Launch-Blocker Gaps (credits-only v1)

Date: 2026-06-13 · Status: approved (design) · Repo: wedding-36 (MAJA Creations)

## Context
MAJA = wedding/occasion invitation SaaS + photographer→guest photo sharing.
Money model decided: **Hybrid** — launch credits-only now, marketplace/payout
(RazorpayX/KYC) deferred to phase 2. This spec covers the 5 credits-only launch
blockers from `DEPLOYMENT_GAPS.md`. Marketplace (M2/M3/M4) is OUT of scope.

Guardrails: additive only, no existing feature/behavior changed, each unit is a
self-contained file/service following existing patterns, backend syntax-checked,
nothing pushed.

External inputs the OWNER must supply later (code uses placeholders + env, each
clearly marked): lawyer-reviewed legal text, business GSTIN/name/address, email
provider key, Supabase email-template config, Razorpay live keys.

---

## Sub-project 1 — Legal pages + face-recognition consent
**Goal:** unblock Razorpay live activation + DPDP consent.

- `frontend/src/config/legalContent.js` — single source of editable business
  facts (`COMPANY`, `EMAIL`, `GSTIN`, `ADDRESS`, `JURISDICTION`, `EFFECTIVE_DATE`)
  + the section text for each policy. Boilerplate, banner-marked "Draft — review
  with a lawyer."
- Pages: `TermsPage.jsx`, `PrivacyPage.jsx`, `RefundPage.jsx`, `ContactPage.jsx`
  in `src/pages/`. Shared simple layout (reuse existing styling). Routes
  `/terms /privacy /refund /contact` in `App.js` (public).
- Footer links: add to LandingPage footer (locate existing footer; if none, add a
  minimal one). Keep style consistent.
- **Consent (backend):** new `face_consent` collection + endpoints to record &
  check consent, keyed by (profile_id/slug, device or guest token). Add to a
  small router or existing gallery router. Face indexing call sites must require
  a recorded consent (or surface the checkbox first).
- **Consent (frontend):** consent checkbox + short notice on the guest face-match
  / selfie entry (FindMyPhotosModal / gallery lock screen) before any face
  upload. Block submit until checked; POST consent.

Acceptance: 4 pages render; footer links work; face-match flow shows consent and
won't index without it; content editable from one file.

---

## Sub-project 2 — Email layer
**Goal:** foundation for receipts, password reset, gallery-ready notices.

- `backend/email_service.py` mirroring `sms_service.py`: provider-agnostic.
  - Providers via `EMAIL_PROVIDER`: `smtp` (uses `SMTP_HOST/PORT/USER/PASS/TLS`),
    `resend` (`RESEND_API_KEY`), else **`dev`** fallback = log + insert into
    `email_outbox` collection. Never crashes when unconfigured.
  - `EMAIL_FROM`, `EMAIL_FROM_NAME`.
  - API: `async send_email(to, subject, html, text=None, tags=None)` +
    template helpers `receipt_email(...)`, `password_reset_email(...)`,
    `gallery_ready_email(...)`.
- Wire ONE initial trigger now: on payment success (credit purchase verified),
  send a receipt email (best-effort, never blocks the payment path).
- Env added to `.env.example`.

Acceptance: `send_email` works in dev mode (logs + outbox) with zero keys;
payment success sends a receipt via the layer; provider swap is env-only.

---

## Sub-project 3 — GST invoice + Razorpay refund
**Goal:** compliant receipts + real money refunds.

- `backend/invoice_service.py` (reportlab): GST tax-invoice PDF — seller
  (GSTIN/name/address from `invoice_config`), buyer, **sequential invoice number**
  (atomic counter doc), date, line items (credits/pack), HSN/SAC, taxable value,
  CGST+SGST (intra-state) or IGST (inter-state) at configurable rate (default
  18%), rounding, total in words. Store an `invoices` record; expose
  `GET /api/.../invoices/{id}/download`. Generate on payment success; attach link
  to the receipt email. Replaces `server.py` `invoice_url=None # TODO`.
- **Refund:** `POST /api/super-admin/payments/{payment_id}/refund` (require_super_admin):
  call Razorpay refund API, update payment record (`refunded`/partial), reverse
  the credited credits via `credit_service`, send refund email, write audit log.
  Idempotent (don't double-refund). Refund-policy constants in config.

Acceptance: payment produces a downloadable GST PDF with correct tax split;
super-admin can refund once; credits reversed; refund emailed.

---

## Sub-project 4 — Password reset
**Goal:** account recovery for both identities.

- **Users (Supabase):** `ForgotPasswordPage.jsx` (calls
  `supabase.auth.resetPasswordForEmail(email, {redirectTo})`) + `ResetPasswordPage.jsx`
  (consumes Supabase recovery session → `supabase.auth.updateUser({password})`).
  Routes `/forgot-password`, `/reset-password`. Link from login pages.
- **Legacy admins (bcrypt):** backend `POST /api/auth/forgot-password`
  (generate single-use token, store hashed w/ expiry in `password_resets`, email
  link via email layer) + `POST /api/auth/reset-password` (verify token → set new
  bcrypt hash, invalidate token). No user enumeration (always 200).

Acceptance: user can request + complete reset via Supabase; legacy admin via
token flow; tokens single-use + expiring; no email enumeration leak.

---

## Sub-project 5 — DPDP data tools
**Goal:** data export + deletion (DPDP Act).

- Backend (auth-gated, works for admin + user identities):
  - `GET /api/account/export` — JSON of the caller's own data (profile(s),
    rsvps, wishes, payments, credits ledger). Streamed/downloadable.
  - `POST /api/account/delete-request` — purge/anonymize PII, remove the
    caller's faces from Rekognition collections, soft-delete account, revoke
    tokens. Confirmation required (typed phrase or explicit flag).
- Frontend: "Download my data" + "Delete my account" in UserProfile (and admin
  settings if trivial), with a confirm dialog.

Acceptance: caller can export own data as JSON; deletion purges PII + faces +
soft-deletes; both require auth + confirmation.

---

## Build order & verification
Build 1→5 in order. After each: `python -m py_compile` changed backend files;
grep-verify routes registered + imports resolve; confirm no existing route/
behavior changed. Full app not run (no local deps/Mongo) — static verification.

## Out of scope (phase 2)
Marketplace payouts, RazorpayX Route, photographer KYC, photographer discovery/
booking, subscription billing, edge rate-limiting (infra), JWT revocation rework.
