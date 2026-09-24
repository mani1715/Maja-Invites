# Landing Page

Route: `/` (also anchors `/#story`, `/#photographers`, `/#top`, `/#how`, `/#showcase`, `/#features`, `/#faq`, `/#start`)
Source: `frontend-v2/src/pages/Landing.jsx`, `Landing.css`
Auth: public, no session required

## Overview

The public homepage for MAJA Invites. It is the primary sales page for two audiences at once — couples planning a wedding/celebration who want a done-for-you digital invitation, and wedding photographers/studios who want a business platform (portfolio, CRM, community) built around those invitations. The page is a single long-scroll marketing page (hero, philosophy statement, "how it works", theme showcase, feature list, company story, pricing-tier summary, FAQ accordion, photographer pitch, final call-to-action, footer) with its own bespoke sticky nav (not the shared `MarketingNav` used by the five secondary marketing pages). All content on this page — themes, features, tiers, FAQ copy — is hardcoded editorial content; there is no backend call anywhere on this page.

## Layout

1. **Sticky nav** — brand mark ("M" + "MAJA Invites"), desktop link row, a "Begin your invitation" CTA button, and a hamburger button that reveals a full-screen mobile drawer. The nav gains an `is-scrolled` style once the page has scrolled past 40px.
2. **Hero** (`#top`) — eyebrow "MAJA Invites", H1 ("Your wedding, remembered exactly as it felt."), lead paragraph, two CTAs ("Begin your invitation", "See a live invitation ↓" scrolling to `#showcase`), and a trust bar ("Trusted by wedding photographers across India").
3. **Philosophy section** — a media placeholder block ("couple portrait, warm film tone" — no real image asset is wired) beside copy explaining the done-for-you model.
4. **"How it works"** (`#how`) — 3-step numbered grid (Tell us your story / We design it, together / Share, and watch it come alive).
5. **Showcase** (`#showcase`) — grid of 6 theme name cards (Royal Heritage, Kerala Backwaters, Floral Garden, Mughal Court, Modern Minimal, Temple Classic), each a placeholder media block with a name label, plus a "Browse all themes →" link.
6. **Craft section** — 4-item feature list (RSVPs, live gallery, gifting, travel info) beside a placeholder media block.
7. **Features grid** (`#features`) — 14 feature cards covering the full breadth of the platform (invitations, live gallery, occasions, wax-seal opening, RSVP/wishes, music, check-in, shagun/UPI, multi-language, photo delivery, photographer platform, Pixora community, vendor marketplace, privacy/security).
8. **Story section** (`#story`) — mission statement plus a "What we stand for" quote card listing 3 checkmarked commitments (done-for-you, one-time pricing, real reviews only).
9. **Tier summary** — 4 pricing tier cards (Classic ₹1,499, Premium ₹2,999, Royal ₹5,999, Bespoke ₹9,999), each showing a blurb and 1–3 example included features. Purely illustrative; the live per-tier price comes from the backend on the Pricing page, not here.
10. **FAQ accordion** (`#faq`) — 12 hardcoded Q&A pairs, single-open accordion, plus an "Email us" / "WhatsApp" CTA pair.
11. **Photographers section** (`#photographers`) — pitch copy + "Set up your studio →" link + a placeholder media block ("studio dashboard preview").
12. **Final CTA** (`#start`) — "Start with a conversation, not a form." + "Begin your invitation" button.
13. **Footer** — 4-column link grid (Explore / Company / Legal) + brand tagline + copyright line ("© 2026 MAJA Invites").

## Fields

This page has no form fields. The only stateful UI inputs are interaction controls, not data-entry fields:

| Control | Type | Notes |
|---|---|---|
| Hamburger menu | button (toggle) | Opens/closes the mobile drawer |
| FAQ question row | button (toggle, single-select) | Expands one FAQ answer at a time; default open index is 0 |

## Interactions

| Trigger | Behavior |
|---|---|
| Page scroll past 40px | Nav gains `is-scrolled` styling (backdrop/shadow treatment) |
| Click hamburger button | Toggles the full-screen mobile drawer open/closed |
| Click a drawer link | Navigates and closes the drawer |
| Click "Begin your invitation" (nav, drawer, hero, final CTA) | Routes to Sign Up (`LINK.signUp` = `/auth/signup`) |
| Click "See a live invitation →" | Smooth-scrolls to `#showcase` (in-page anchor, no navigation) |
| Click "Browse all themes →" | Routes to `LINK.browseThemes`, which resolves to `/pricing` (there is no dedicated theme browser yet) |
| Click a FAQ question | Opens that answer and collapses any other open answer (single-open accordion) |
| Click "Email us" (FAQ CTA) | Opens `mailto:support@majacreations.com` |
| Click "WhatsApp" (FAQ CTA, footer contact) | Opens `https://wa.me/919999999999` in a new context |
| Click "Sign in" (nav/drawer) | Routes to `LINK.signIn` = `/auth` |
| Click "Set up your studio →" | Routes to Sign Up |
| Click footer links (How it works, Pricing, FAQ, Contact, Terms, Privacy, Refund, etc.) | Client-side route to the respective page |

## API Dependencies

None. This page makes no network calls — every list (themes, features, tiers, FAQ) is a hardcoded constant in the component.

## Page Relationships

**Links out to:**
- `/auth/signup` (Sign Up) — primary CTA, multiple placements
- `/auth` (Sign In) — nav
- `/pricing` (used both as the real Pricing page and as the `browseThemes` stand-in, since there's no theme browser)
- `/features`, `/how-it-works`, `/faq`, `/contact` — footer + nav
- `/terms`, `/privacy`, `/refund` — footer legal links
- In-page anchors: `#top`, `#how`, `#showcase`, `#features`, `#story`, `#photographers`, `#start`, `#faq`
- `LINK.photographerDirectory`, `LINK.vendorMarketplace`, `LINK.aboutCommunity` — referenced in the drawer links and footer, but **not defined** in `src/lib/marketingLinks.js`'s exported `LINK` object today; these resolve to `undefined` at render time. [TBC — likely a missing entries in `marketingLinks.js`, or these links are intentionally inert placeholders pending a real destination.]

**Linked from:** effectively every other public page (nav/footer "MAJA Invites" brand link, "Sign in"/"Begin" CTAs elsewhere all point back to `/`).

## Business Rules

- Previewing designs/themes is always free; a couple only pays once they choose a design (stated directly in the FAQ copy).
- Invitation pricing is one-time per invitation, not a subscription — Classic ₹1,499 → Premium ₹2,999 → Royal ₹5,999 → Bespoke ₹9,999, each tier including everything in the tiers below it plus its own additions ("Each plan includes everything in the tiers below it").
- Supported occasions: weddings, baby & birthday, half-saree, ritu kala samskaram (puberty), dhoti/upanayanam.
- Supported invitation languages: Hindi, Tamil, Telugu, English.
- Digital shagun (gifting) runs via UPI and Razorpay.
- Pixora (the photographer community) is free to browse/follow/engage; publishing reels/stories is a Premium photographer-plan feature.
- The company positions itself on "honest pricing" — any discount shown is against a real price, never a fabricated one — and "real reviews only."
- All copy, theme names, feature descriptions, and FAQ content are static marketing content owned by the frontend, not sourced from any backend or CMS. [TBC whether this is intended to eventually move to a CMS/admin-editable surface.]
