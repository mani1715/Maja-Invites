# FAQ Page

Route: `/faq`
Source: `frontend-v2/src/pages/Faq.jsx`, `Faq.css`
Auth: public, no session required

## Overview

A searchable, filterable, categorized FAQ page. Content (6 categories, 25 Q&A pairs total) is static editorial copy hardcoded in the component — there is no backend endpoint for FAQ content. Pricing figures quoted in the answers (₹1,499 / ₹5,999 / ₹9,999) intentionally match the store's default package prices rather than any live admin-editable price, since this is static text.

## Layout

1. **Shared marketing nav** (`MarketingNav`) — links: "Features", "How it works", "Pricing"; CTA: "Begin" (→ Sign Up).
2. **Hero** — eyebrow "Questions", H1 "Everything people ask before they begin.", lead, and a search input ("Search the questions…").
3. **Category filter row** — pill buttons: "All" + one per category (Before you order / The invitation itself / RSVPs and guests / Photographs and gifts / For photographers / Not a wedding).
4. **FAQ groups** — one section per visible category, each with a title, blurb, and an accordion of Q&A items (multi-open; first item `q0` open by default).
5. **Empty state** (shown when a search yields zero results) — "Nothing matches "{query}"." + "Write to us" mailto CTA.
6. **Bottom CTA** — "Still not sure?" + WhatsApp / Email buttons.
7. **Footer** — copyright + Our story / Terms / Privacy / Refunds links.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| Search query | text input | No | `''` | Live-filters across question + answer text (case-insensitive substring match on `question + ' ' + answer`) |
| Category filter | button group (single-select) | No | `'All'` | One of: `All`, `Before you order`, `The invitation itself`, `RSVPs and guests`, `Photographs and gifts`, `For photographers`, `Not a wedding` |

## Interactions

| Trigger | Behavior |
|---|---|
| Type in search box | Live-filters all groups/items to those whose combined question+answer text contains the (lowercased, trimmed) query; matching groups auto-expand every matching item (search results are always shown open) |
| Search box has a non-empty query | Category filter buttons are visually deselected (`on = label === filter && !q`), though `filter` state is unchanged underneath |
| Click a category filter pill | Sets `filter` to that category and clears the search query; shows only that category's group (or all groups if "All") |
| Click a FAQ question (no active search) | Toggles that item's open/closed state independently (multi-open accordion — unlike Landing's single-open FAQ) |
| Search yields zero groups with items | Renders the "Nothing matches" empty state with a mailto CTA instead of the group list |
| Click "Write to us" (empty state) | Opens `mailto:support@majacreations.com` |
| Click "WhatsApp us" (bottom CTA) | Opens `https://wa.me/919999999999` |
| Click "Email" (bottom CTA) | Opens `mailto:support@majacreations.com` |

## API Dependencies

None. All FAQ content, filtering, and search are client-side only against a hardcoded dataset.

## Page Relationships

**Links out to:** `/auth/signup`, `/#story`, `LINK.terms`, `LINK.privacy`, `LINK.refund`, `mailto:support@majacreations.com`, WhatsApp deep link.

**Linked from:** Landing footer, HowItWorks footer, Contact page ("Frequently asked questions" quick link), Features nav.

## Business Rules

- Pricing quoted in FAQ answers: Classic ₹1,499, Royal ₹5,999, Bespoke ₹9,999 — each a one-time payment per wedding, no subscription, nothing renews for couples.
- A couple can see a first draft before paying; cancelling before build starts means "nothing to refund" (i.e., no payment was taken yet at that stage).
- Languages: Hindi, Tamil, Telugu, English, "and more"; Royal includes 3 languages, Bespoke is unlimited.
- WhatsApp reminders to non-responding guests are available on Royal and above.
- Guest list import from an existing spreadsheet is supported (no self-serve importer implied — "send it across and we will import it").
- Live gallery requires guest QR scan; couple approves what goes up (implies a moderation step exists on some plans, though HowItWorks says gallery has "no moderation queue unless you want one" — [TBC, possible inconsistency between FAQ's "You approve what goes up" and HowItWorks' "no moderation queue unless you want one"]).
- Digital shagun settles to the couple's own account, not the studio's; the total collected is never shown publicly.
- Studio subscriptions are credit-based, shown on the Pricing page; MAJA takes no cut of what a studio charges its own clients.
- Non-wedding occasions explicitly supported: first birthdays, half-sarees, naming ceremonies, housewarmings, engagements, anniversaries, retirements. Corporate/ticketed events are explicitly **not** self-serve yet.
