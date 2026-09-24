# Studio Profile QR Codes Page

Route: `/studio/profile/:profileId/qr-codes`
Source: `frontend-v2/src/pages/StudioProfileQrCodes.jsx`, `StudioProfileQrCodes.css`
Auth: `RequireStudio` — admin Bearer identity only

## Overview

Lists every per-ceremony (`event_invitations`) QR code for one wedding, each rendering the backend-generated branded QR image, with PNG download, link copy, single-code regenerate, and a bulk "regenerate all" action (used after the couple photo or QR background settings change). Ported from "MAJA Wedding QR Codes.dc.html" — the DC mock's placeholder checker-pattern art is replaced with real branded `qr_image` data-URI PNGs.

## Layout

Responsive shell: `MobileNav` + `StudioNav` rail (hidden on mobile, `display:none` rather than unmounted) + main content.

1. **`WeddingToolbar`** — active tab "QR codes", couple line `{groom} & {bride}`.
2. **Inline error banner** (conditional) — shown above everything else if the load failed.
3. **KPI wash band** — 3 tiles: "QR codes" (total count), "Active links" (`enabled && !expired`), "Disabled / expired" (the remainder). Shows "—" while `codes` is still `null`.
4. **Controls row** — a 3-way plate-color style switch (Ivory / Brass / Midnight — cosmetic only, changes the QR plate background), and a right-aligned "Regenerate all QR codes" button (disabled while `codes` is empty/null or any regenerate is in flight).
5. **QR card grid** — one card per event invitation: a square plate (styled by the selected color) containing the `qr_image` (or "QR pending" if not yet generated), event label (e.g. "Marriage", "Reception"), the invitation link (truncated, word-break), an Active/Disabled/Expired status line (red if expired), and 4 actions: PNG (download), Copy link, Regenerate, Open (external link, new tab). Skeleton (3 placeholder cards) while loading; an empty-state card ("No event invitations yet.") if the wedding has none.
6. **"Scan activity" card** — static note: "Per-code scan history isn't tracked yet — only a lifetime total per wedding. Coming soon."
7. **Toast** — bottom-fixed, 2.4s auto-dismiss.

## Fields

No form fields.

| Control | Type | Notes |
|---|---|---|
| Plate style | 3-way button group (Ivory/Brass/Midnight) | Purely visual — changes only the QR plate's background color, not persisted server-side |

## Interactions

### Page load
- `Promise.all([getProfile(profileId), listEventInvitations(profileId)])`. Failure sets `codes = []` and shows the inline error banner (rather than blocking the whole page).

### Download PNG
- **Trigger:** "PNG" button (disabled if the code has no `qr_image` yet).
- **Behavior:** synthesizes and clicks a hidden `<a download>` pointed at the `qr_image` data URI, named `{slug}-{event_type}-qr.png`. Toasts confirmation.

### Copy link
- **Trigger:** "Copy link".
- **Behavior:** `navigator.clipboard.writeText({origin}{invitation_link})`; toasts the copied absolute URL on success, or falls back to toasting the plain URL text (for the user to copy manually) if the clipboard API throws.

### Regenerate one code
- **Trigger:** "Regenerate" on a specific card (per-card busy state via `busy === c.id`).
- **Behavior:** `POST /api/admin/event-invitations/{invitationId}/regenerate-qr`, then reloads the full list, toasts "QR code regenerated." Failure toasts the backend's `detail` or a generic message.

### Regenerate all
- **Trigger:** "Regenerate all QR codes" (disabled if `codes` is empty/null, or any regenerate — single or bulk — is already running, via a shared `busy` state of `'all'`).
- **Behavior:** `POST /api/admin/profiles/{profileId}/regenerate-all-qrs`, reloads, toasts `Regenerated {n} QR code(s).`.

### Open
- **Trigger:** "Open" link.
- **Behavior:** plain `<a target="_blank">` to `invitation_link` (relative path — resolves against the current app origin, not necessarily the public invitation's own domain if different).

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Get profile | GET | `/api/admin/profiles/{profileId}` | Mount | For the couple-name toolbar line |
| List event invitations | GET | `/api/admin/profiles/{profileId}/event-invitations` | Mount, after any regenerate | Each item: `id, event_type, design_id, deity_id, enabled, invitation_link, qr_url, qr_image, expires_at, expired, media_purged`. Server lazy-generates a missing `qr_image` on this same call (not a separate step) for invitations created before the QR feature existed |
| Regenerate one | POST | `/api/admin/event-invitations/{invitationId}/regenerate-qr` | Per-card "Regenerate" | Rebuilds using current couple-photo/background settings; returns the new `qr_url`/`qr_image` directly, but the page reloads the full list rather than patching just that card |
| Regenerate all | POST | `/api/admin/profiles/{profileId}/regenerate-all-qrs` | "Regenerate all QR codes" | Iterates every `event_invitations` row for the profile; per-item failures are logged server-side and skipped, not surfaced individually to the caller — only the aggregate `regenerated` count comes back |

All three admin endpoints re-verify the calling admin owns the profile (or is `super_admin`) before acting.

## Page Relationships

- **From:** `WeddingToolbar`'s "QR codes" tab (from Studio Wedding Detail / Live Gallery).
- **To:** other `WeddingToolbar` tabs; external `invitation_link` per card (Open button) — these are the actual public per-ceremony invitation URLs that guests reach by scanning the QR.
- **Data coupling:** each card's `invitation_link` is the exact URL the corresponding public route (`/invite/:slug/:eventType`, `CeremonyInvitation.jsx` — not covered in this document) resolves — regenerating a QR changes only the encoded image, never the link/slug itself.

## Business Rules

- **QR generation is per-ceremony** (`event_invitations`), not per-wedding — a wedding with multiple ceremonies (Haldi, Sangeet, Reception, …) gets one independent QR/link/expiry per ceremony, each toggleable and expirable on its own.
- Regenerating a QR **only rebuilds the branded image** (using the current couple monogram, theme color, and QR background photo) — it does not rotate the underlying link/slug, so previously-printed/shared QR codes for that ceremony still resolve, they just no longer visually match if the couple's photo changed. "Regenerate all" exists specifically for the case where a shared asset (couple photo, background) changed and every ceremony's QR needs to pick it up.
- "Active" vs "Disabled" vs "Expired" are three independent, non-exclusive-looking-but-actually-are dimensions the card collapses to one status line: `expired` (red) takes priority in display over `enabled`; a code can be `enabled=true` but still show "Expired" once past its `expires_at`.
- Per-code scan analytics are explicitly not implemented — only a lifetime total scan count exists at the wedding level (surfaced elsewhere, e.g. Studio Dashboard's "QR gallery scans (90d)" KPI), not per-QR-code here.
- The plate color switch (Ivory/Brass/Midnight) is purely cosmetic client-side state — it is not saved, associated with the wedding, or reflected in the downloaded PNG (the downloaded file is the raw `qr_image` from the server, independent of the on-screen plate styling).
