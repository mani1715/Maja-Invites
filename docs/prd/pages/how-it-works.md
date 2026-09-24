# How It Works Page

Route: `/how-it-works`
Source: `frontend-v2/src/pages/HowItWorks.jsx`, `HowItWorks.css`
Auth: public, no session required

## Overview

A fully editorial explainer page walking a prospective couple through the end-to-end process (browse → order → share details → build → deliver → share), what guests can do on a live invitation, what happens after the ceremony (live gallery, face search, passcode protection), what studios get, and an explicit "what we will not do" trust section. No backend calls; all copy is static.

## Layout

1. **Shared marketing nav** (`MarketingNav`) — links: "Browse designs" (→ `LINK.browseThemes`), "Pricing", "Photographers" (→ `LINK.photographerDirectory`), "For studios" (→ `LINK.forPhotographers`); CTA: "Browse designs".
2. **Hero** — eyebrow "How it works", H1 "You send the details. We build the invitation.", lead, two CTAs ("Browse designs", "See pricing").
3. **"Six steps, start to share"** — 6-step numbered list: Browse designs → Place your order → Share your details → We build it → We deliver a live link → You share it.
4. **"What your guests can do"** — 4-card grid: RSVP in one tap, Leave a blessing, Add their photos, Send shagun.
5. **Dark "Beyond the invitation" section** — copy + a 4-card grid of live-event features: Live gallery, QR at the venue, Face search, Passcode protection.
6. **"For studios" section** — copy + a 6-card grid of studio platform features: Portfolio, Calendar, Contracts, Proofing, Cloud backup, Earnings; link "See what studios get →".
7. **"What we will not do"** trust section — 4 items: No ads ever, No resale of guest data, Payments you recognise (Razorpay), Photos under your account.
8. **Final CTA** — "Find the design first. The rest is a conversation." + note that prices show at checkout, per design and link duration + "Browse designs" button.
9. **Footer** — copyright + Story / FAQ / Legal links.

## Fields

None — no form fields or user-entered data anywhere on this page.

## Interactions

| Trigger | Behavior |
|---|---|
| Click "Browse designs" (nav CTA, hero, final CTA) | Routes to `LINK.browseThemes`, which resolves to `/pricing` |
| Click "See pricing" | Routes to `/pricing` |
| Click "Photographers" (nav) | Routes to `LINK.photographerDirectory` — **undefined** in `marketingLinks.js`'s `LINK` export today [TBC, same gap noted on Landing] |
| Click "For studios" (nav) | Routes to `LINK.forPhotographers` = `/#photographers` |
| Click "See what studios get →" | Routes to `/#photographers` |
| Click footer links | Routes to `/#story`, `/faq`, `LINK.terms` |

## API Dependencies

None.

## Page Relationships

**Links out to:** `/pricing` (as browseThemes stand-in and directly), `LINK.photographerDirectory` (undefined — [TBC]), `/#photographers`, `/faq`, `LINK.terms`.

**Linked from:** Landing footer ("How it works"), general marketing nav on Pricing/Features/FAQ.

## Business Rules

- Explicit process order: Browse → Order (Razorpay payment: cards, UPI, net-banking, wallets) → Share details form (names, events, venues, timings, blessing) → MAJA designer builds it → Delivery as a live link + QR code, with "one round of corrections" included → Couple shares via WhatsApp/SMS/email/printed card.
- Guest-facing features require no app or account: RSVP, blessings/wishes, photo upload via QR, shagun via UPI — all work in a normal mobile browser.
- Live gallery: photos appear as guests upload, with no moderation queue unless the couple opts into one.
- Passcode protection can be turned on at any time; once turned on, old (unprotected) links stop working immediately.
- Trust commitments stated as product policy: no advertising is ever sold on an invitation; guest RSVP/contact data is never sold or shared; Razorpay handles all payment methods and MAJA never sees card details; guest photos are stored under the couple's/studio's own account and governed by their plan.
- Prices are not shown on this page — the copy explicitly defers pricing detail to checkout ("Prices are shown at checkout, per design and per link duration").
