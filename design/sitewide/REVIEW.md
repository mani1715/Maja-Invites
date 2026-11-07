# Pixora site-wide UI/UX review

Local implementation and review pass, 15 October 2026. Nothing deployed.

## What changed

- Public pages share restrained lavender/pearl tokens, editorial headings and the homepage artwork. Authentication has a photographic split layout, clearer hierarchy and an honest introduction instead of an unsupported testimonial and image placeholder.
- Community images use contain behavior to preserve portrait and landscape compositions. Shared working screens have quieter panels, clearer statistics, consistent borders, stronger keyboard focus and reduced-motion behavior.
- Studio navigation exposes the existing workspace, creative, business and settings tools. Desktop and mobile use one configuration; navigation is searchable. Admin navigation includes Cameras on both surfaces. The admin dashboard now has mobile navigation.
- Mobile navigation uses a modal dialog with focus containment, Escape handling and focus restoration. It preserves the previous scroll-lock state. Marketing navigation also returns focus on Escape.
- Removed the duplicate gallery route. Anchor scrolling is cancellable and respects reduced motion. Skip-to-content finds and focuses the actual content. A route error boundary provides reload/support recovery instead of a blank screen.
- Unverified sessions no longer render protected pages. Retry preserves the sign-in token; a verified ordinary studio account remains excluded from admin routes.
- Clients no longer reports failed saves as successful or discards the form on failure. Numeric phone values are searchable. Removed unsubstantiated “Synced”, pending-link and “Normal” status values.
- Clients, notifications, messages, face operations, BI and several primary admin/backup requests now expose errors instead of pretending unavailable data is empty. Settings/CMS fetch failures no longer remain on “Loading…” indefinitely. Shared async loading also handles synchronous fetch failures and structured error payloads safely.
- Feature plan comparisons no longer publish a separate outdated entitlement matrix. Readers are directed to current pricing; no backend prices or gates changed.
- Replaced 404/coming-soon prototype placeholders with recovery pages. Added a dashboard return link to portfolio workspace recovery and fixed intrinsic-width overflow in the ten-design preview grid.

## Evidence and coverage

- `routes.json`: 185 explicit route declarations; aliases and dynamic parameters are recorded.
- `audit-results.json`: 111 representative page entrypoints at 1440px and 390px, 222 captures. Each unique page component is represented once per viewport. Alternate parameter combinations, tabs and alias paths are not an exhaustive browser matrix. Auth callback without a callback payload legitimately redirects to sign-in.
- The route sweep returns HTTP 503 from business APIs deliberately. It checks runtime rendering and recovery layout without touching production data. Built-in sample invitations and portfolio designs render their own local sample content. Screenshots must not be interpreted as populated-account acceptance.
- `interaction-results.json`: nine navigation, keyboard, session retry and role-guard checks.
- `recovery-results.json`: six service-error screens, failed-save preservation, successful retry payload and numeric-phone search. Mutations are intercepted local test responses.
- Homepage regression: sixteen width/content cases plus motion, pause persistence, reduced motion, catalogue preview, FAQ and navigation. See `../homepage/verification.json`.
- Production Vite build passes. No backend source was changed in this pass.

## Design choices

The atmospheric motion belongs to the homepage. Business tools use stable surfaces so tables, controls and status messages remain easy to read. Published customer invitations and portfolios retain their own themes. Existing ten-template preview/publication work remains intact; there are no new prices, subscriptions, claims or automatic publications.

## What is not complete or proven

This is a shared-system refinement and recovery audit, not a bespoke redesign of every individual workflow or a guarantee of zero defects. A full release still needs populated staging accounts and acceptance of payment, email/OTP delivery, uploads/downloads, camera transfers, permissions across roles, every nested tab, and real device/browser coverage. Several optional endpoint fallbacks still deserve endpoint-specific acceptance so partial failures are clearly distinguished from empty results.

Legal pages contain pre-existing business placeholders (including legal entity details). These were not invented or silently filled in. Supply approved business/legal content before public release. Existing data, ownership and backend enforcement were preserved, but broad service-backed integration was not revalidated by this UI-only sweep.

## Review

Open `review.html` for searchable desktop/mobile screenshots. The homepage motion review and ten photographer design previews are linked there. Screenshot service-error text is intentionally generated by the local audit fixture. No design selection or deployment is implied.
