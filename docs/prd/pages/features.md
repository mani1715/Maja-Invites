# Features Page

Route: `/features`
Source: `frontend-v2/src/pages/Features.jsx`, `Features.css`
Auth: public, no session required

## Overview

A detailed, audience-switchable feature catalogue (couples vs. studios) plus a plan-comparison table for each audience. All content — feature blocks, items, and the comparison matrices — is static editorial marketing copy hardcoded in the component; there is no backend endpoint behind this page.

## Layout

1. **Shared marketing nav** (`MarketingNav`) — links: "How it works", "Pricing", "FAQ"; CTA: "Begin" (→ Sign Up).
2. **Hero** — eyebrow "Features", H1 "Everything an Indian wedding actually needs, and nothing it doesn't.", lead paragraph.
3. **Audience tab row** — "For couples" / "For studios".
4. **Feature blocks** (4 per audience) — each block has a title, a tag chip (e.g. "Every plan", "Royal and up"), a blurb, and a card grid of items. Each item card shows a name, a body description, and a plan-availability label (e.g. "All plans", "Royal and up", "Bespoke only", "Add-on", "Studio and up").
   - **Couple blocks:** "The invitation", "Guests and replies", "On the day", "Gifts and afterwards".
   - **Studio blocks:** "Your shopfront", "Running the work", "Storage and delivery", "Pixora".
5. **Comparison table** ("What comes with which plan") — scrollable table (min-width 560px) with a header row of 3 plan-tier column names and one row per capability, cells showing ✓ / — / a literal value (e.g. guest counts, storage sizes).
   - **Couple tiers:** Classic, Royal, Bespoke (11 comparison rows).
   - **Studio tiers:** Solo, Studio, Atelier (11 comparison rows).
6. **CTA section** — "Not sure which you need?" + "Begin your invitation" and "See pricing" buttons.
7. **Footer** — copyright + Our story / Terms / Privacy / Refunds links.

## Fields

No form fields. Sole stateful control:

| Control | Type | Options |
|---|---|---|
| Audience tab | button group (single-select) | `couple` (default) \| `studio` |

## Data Model (static constants, not backend-sourced)

**Feature item shape:** `{ name, body, plan }` — `plan` is a free-text availability label, not an enum enforced anywhere; observed values: `All plans`, `Royal and up`, `Add-on`, `Bespoke only`, `Studio and up`.

**Comparison row shape:** `[label, ...cellValues]` where each cell value is `1` (renders ✓, styled "yes"), `0` (renders —, styled "no"), or a string/number literal (rendered as-is, e.g. `'150'`, `'Unlimited'`, `'100 GB'`).

## Interactions

| Trigger | Behavior |
|---|---|
| Click "For couples" / "For studios" tab | Swaps `blocks` and `comp` (comparison table) to the selected audience's static dataset; no network call |
| Click "Begin your invitation" (CTA section) | Routes to Sign Up |
| Click "See pricing" | Routes to `/pricing` |
| Click footer links | Routes to `/#story`, `/terms`, `/privacy`, `/refund` |

## API Dependencies

None. Entirely static content.

## Page Relationships

**Links out to:** `/auth/signup`, `/pricing`, `/#story`, `LINK.terms`, `LINK.privacy`, `LINK.refund`.

**Linked from:** Landing page ("Themes"/features references), Pricing/HowItWorks/FAQ nav bars, general site nav.

## Business Rules

- Feature-to-plan mapping shown here is descriptive/marketing content and is **not** read from or validated against the backend's actual `granted_features` gating (see `lib/inviteFormat.js`'s `hasFeature`) — it is purely illustrative of what each tier is meant to include.
- Couple plans are one-time, per-wedding (no renewal) — reflected in the comparison sub-copy "One payment per wedding. Nothing here renews."
- Studio plans are recurring, per-cycle — reflected in "Per studio, per cycle."
- The tier names shown on this page (Classic/Royal/Bespoke for couples; Solo/Studio/Atelier for studios) do not necessarily match the full tier list shown elsewhere (Landing shows Classic/Premium/Royal/Bespoke) — Features' comparison table omits Premium. [TBC — intentional simplification for the comparison view, or a content drift between pages.]
