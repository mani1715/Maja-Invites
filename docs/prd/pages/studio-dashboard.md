# Studio Dashboard Page

Route: `/studio/dashboard`
Source: `frontend-v2/src/pages/StudioDashboard.jsx`, `StudioDashboard.css`
Auth: `RequireStudio` — admin Bearer identity only

## Overview

The photographer/studio's landing page: 3 lifetime KPI tiles, a status-filtered, paginated grid of their weddings, and a disabled "New wedding" CTA (creation flow isn't wired into this dashboard yet — full editor only). Each wedding card links into Studio Wedding Detail. Ported from the "MAJA Studio Dashboard" DC mock.

## Layout

Responsive shell: `MobileNav` (mobile only) + `StudioNav` rail (desktop/tablet, hidden under 900px viewport width) + main content area.

1. **Header row** — H1 "Your weddings" with a highlighted "weddings" span, a count line (`{total} invitation(s){ · {status label}}`), and a disabled "+ New wedding" button (tooltip explains it's coming soon).
2. **KPI row** (3 tiles, `KpiTile`) — "Active invitations", "QR gallery scans (90d)", "Gallery photos" — each with a skeleton while loading and an "Unavailable" fallback on error.
3. **Status filter row** — 4 pill buttons: All / Published / Draft / Archived.
4. **Wedding grid** — one of: skeleton grid (6 placeholder cards), error card + Try again, empty card (status-specific message), or a responsive card grid. Each card: aspect-ratio placeholder patterned by `event_type`, couple names, status pill (Published/Draft — Archived isn't distinguished visually from Draft's pill styling, only via the filter tab), formatted date + city, view count.
5. **Pager** (only if `total_pages > 1`) — Prev / Page X of Y / Next.

## Fields

No form fields — this is a pure list/filter/paginate surface.

| Control | Type | Options |
|---|---|---|
| Status filter | pill button group (single-select) | `all` (default) \| `published` \| `draft` \| `archived` — switching resets to page 1 |
| Pager | Prev/Next buttons | Disabled at page bounds |

## Interactions

### Page load
- Fetches the wedding list (`listState`: implicit via `listLoading`/`listError`) for `page=1, status='all'`.
- Independently (in parallel, once, not re-triggered by filter/page changes) fetches KPIs: `listProfiles({page:1, page_size:1, status:'all'})` for the total count, plus `insights(90)` for 90-day QR scans and gallery photo totals. A KPI fetch failure sets a page-wide `kpiError` that greys out all 3 tiles ("Unavailable") rather than failing individually.

### Change status filter
- **Trigger:** click a filter pill.
- **Behavior:** sets `status`, which resets `page` to 1 (separate effect) and re-fetches the list.

### Paginate
- **Trigger:** Prev/Next.
- **Behavior:** clamps `page` within `[1, total_pages]`, re-fetches.

### List load failure
- **Behavior:** error card with the backend's `detail` (or a generic message) and a "Try again" button that re-calls the load function.

### Open a wedding
- **Trigger:** click a wedding card.
- **Behavior:** navigates to `/studio/wedding/{w.id}`.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| List weddings | GET | `/api/admin/profiles/paginated` | Mount, filter change, page change | Params: `page`, `page_size=12`, `status`, `sort='newest'`. `status` values map to server-side filters: `all` = everything active minus archived; `draft`/`published` further split by a published-detection rule (`status==PUBLISHED` OR `is_published==true`); `archived` = has `archived_at` set. Trashed/soft-deleted items never appear here regardless of filter |
| Active count | GET | `/api/admin/profiles/paginated` | Mount only | `{page:1, page_size:1, status:'all'}` — used only for its `total`, a cheap way to get a count without a dedicated count endpoint |
| Insights | GET | `/api/studio/insights?days=90` | Mount only | Supplies `qr.total_scans` and `face.total_photos` for the other two KPI tiles |

Both `listProfiles` and `insights` requests are scoped server-side to the calling admin's own weddings unless the caller is `super_admin`.

## Page Relationships

- **From:** `RequireStudio` redirect target after sign-in (studio persona), `StudioNav`'s "Dashboard" item (only built nav item in the rail — every other item routes to `/soon`), `WeddingToolbar`'s "← All weddings" back-link on every per-wedding studio page.
- **To:** `/studio/wedding/{id}` (card click — Studio Wedding Detail).
- **Data coupling:** the KPI "Active invitations" count and the list's own pagination/filtering are independent queries against the same `profiles.paginated` endpoint — they can transiently disagree (e.g. right after a card's status changes elsewhere) since neither refetches the other.

## Business Rules

- **Status taxonomy** (`statusOf()`, client-side derivation for card display): `archived_at` set → "Archived"; else `status === 'PUBLISHED'` or `is_published` → "Published"; else "Draft". This mirrors, but is computed independently from, the server's own published-detection logic used for filtering — both must agree for a card's displayed pill to match the tab it's filed under.
- "+ New wedding" is a disabled placeholder — wedding creation isn't wired into this build's studio dashboard; the tooltip states it's "coming to this dashboard soon."
- KPI tiles are lifetime-ish (active invitations = live total; QR scans / gallery photos are `days=90` windowed) — the 90-day window is hardcoded, not user-adjustable from this page.
- Page size is fixed at 12 and not user-configurable.
