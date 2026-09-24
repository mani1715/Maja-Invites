# Contact Page

Route: `/contact`
Source: `frontend-v2/src/pages/Contact.jsx`, `Contact.css`
Auth: public, no session required

## Overview

A support "contact us" page for anonymous visitors. Rather than filing a real support ticket (the backend's `POST /api/support/tickets` requires an authenticated buyer session, which an anonymous marketing visitor doesn't have, and there is no public "my tickets" listing endpoint to show either), the form composes and opens a `mailto:` link pre-filled with the visitor's message. No ticket is created server-side and no ticket history is shown.

## Layout

1. **Shared marketing nav** (`MarketingNav`) — links: "Read the FAQ"; no CTA.
2. **Hero** — eyebrow "Support", H1 "A real person reads every message.", lead noting a one-working-day reply SLA and a WhatsApp escalation path for events inside 48 hours.
3. **Form card** (left column):
   - Not-yet-sent state: category picker, Subject, Message, Your email, Order/invite ID (optional), Send button, validation hint text.
   - Sent state: confirmation panel ("Your email app should be open.") + "Raise another" button to reset the form.
4. **Side column:**
   - "Reach us directly" card: Email, WhatsApp, Hours (Mon–Sat, 10am–7pm IST).
   - "Faster than a ticket" card: quick links to FAQ, Refunds & cancellations, How MAJA works.
   - Dark "Event in 48 hours?" card: WhatsApp escalation CTA.

## Fields

| Field | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|
| Category | button group (single-select) | Implicitly yes (always has a value) | — | `'Invitation'` | Enum: `Community`, `Invitation`, `Portfolio`, `Something broken` |
| Subject | text input | Yes | non-empty after trim | `''` | |
| Message | textarea (7 rows) | Yes | non-empty after trim | `''` | |
| Your email | text input | Yes | non-empty after trim (no email-format regex check) | `''` | |
| Order or invite ID | text input | No | — | `''` | Optional, included in the email body only if non-empty |

Form is "ready" to submit only when Subject, Message, and Email are all non-empty after trimming (`ready = subject.trim() && message.trim() && email.trim()`).

## Interactions

| Trigger | Behavior |
|---|---|
| Click a category pill | Sets `cat` to that category (single-select, always exactly one active) |
| Edit Subject / Message / Email / Order ID | Updates local field state live |
| Click "Send to support" (enabled only when `ready`) | Builds a plain-text body: `Category: {cat}`, optional `Order / invite ID: {orderId}`, `From: {email}`, blank line, `{message}`; sets `window.location.href` to a `mailto:support@majacreations.com?subject=[{cat}] {subject}&body={body}` URL (both subject and body URL-encoded); immediately shows the "sent" confirmation state (does not wait for/confirm the mail client actually opened) |
| Send button disabled | Validation hint shows "Subject, message and email are needed." in error-tinted text |
| Send button enabled (not yet clicked) | Validation hint shows "This opens your email app with the message ready to send." |
| Click "Raise another" (sent state) | Resets `sent`, `subject`, `message` (category, email, and order ID are **not** reset) |

## API Dependencies

None. The "Send to support" action never calls the backend — it only constructs and navigates to a `mailto:` URL. There is no `POST /api/support/tickets` call from this page (deliberately, per the code comment — that endpoint requires an authenticated buyer session this anonymous page doesn't have).

## Page Relationships

**Links out to:** `mailto:support@majacreations.com` (multiple placements), `https://wa.me/919999999999` (multiple placements), `/faq`, `LINK.refund`, `/how-it-works`.

**Linked from:** Landing footer ("Contact & support"), general site nav is not present here beyond the FAQ link, Home page not directly.

## Business Rules

- Support SLA: reply within one working day; events happening within 48 hours should escalate via WhatsApp instead of the ticket form.
- Support hours: Monday–Saturday, 10am–7pm IST.
- The four support categories route the message by subject-line tag (`[Category] Subject`) but there is no backend routing logic involved — categorization is purely a labeling convenience inside the composed email.
- No server-side record of the contact attempt is created; if the visitor's email client doesn't open (e.g., no default mail handler configured), the page still shows "sent" — the copy hedges this with "If nothing opened, write to us directly at that address."
- Email address format is not validated with a regex on this page (unlike Sign Up / Reset Password, which do validate email shape) — only non-emptiness is checked. [TBC — likely an intentional lighter-touch validation since the field only builds a mailto link rather than hitting the backend.]
