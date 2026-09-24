# User Wedding Edit Page

Route: `/user/profile/:profileId/edit`
Source: `frontend-v2/src/pages/UserWeddingEdit.jsx`, `UserWeddingEdit.css`
Auth: `RequireUser` — couple/buyer cookie identity only; also has its own redirect (`/auth?return={pathname}`) if `user` is null after auth resolves, which is redundant with the route guard but preserves the specific return path

## Overview

A focused, 4-tab editor for one specific self-service invitation (identified by `:profileId`), trimmed down from the richer "MAJA User Wedding Edit" DC mock to only the fields `PATCH /api/users/profiles/{id}` actually persists. Autosave is not used here (unlike Order Details) — changes are staged locally and written on an explicit "Save changes" click.

## Layout

1. **Nav** (`mjwe-nav`) — brand "My invitation" (→ `/user/dashboard`), a save-state note ("Unsaved changes" / "All changes saved"), "Save changes" button (disabled unless dirty or currently saving).
2. **Header** — eyebrow line (`{bride} & {groom} · {formatted date}`), H1 "Edit your details", subhead ("Layout and artwork stay with the studio — ask them for those.").
3. **Tab row** — Names / Events / Story / Guests.
4. **Names tab:** two-column card (Bride, Groom inputs) + a second card ("Opening line") with a 3-row textarea for `invitation_message`.
5. **Events tab:** single card, 3-column grid (Date & time, Venue, City) + a hint that multi-event setups (Mehendi, Sangeet, Reception) require messaging the studio.
6. **Story tab:** single card, 5-row textarea for `love_story`.
7. **Guests tab:** a stats card (Replied yes / Awaiting / Cannot come, skeleton while loading, or an inline error) + a static note card explaining the studio manages RSVP list imports.
8. **Toast** — bottom-fixed, appears/disappears via a CSS class toggle rather than conditional render.

## Fields

Whitelisted against `PATCH /api/users/profiles/{id}`'s exact accepted key set (only the subset shown in the DC mock is exposed here — parents' names and the mock's repeatable multi-event/multi-story-moment lists have no backing fields and are omitted entirely):

| Field | Tab | Type | Maps to |
|---|---|---|---|
| Bride | Names | text | `bride_name` |
| Groom | Names | text | `groom_name` |
| Opening line | Names | textarea (3 rows) | `invitation_message` |
| Date & time | Events | `datetime-local` | `event_date` (local-time getters, same UTC-shift avoidance as User Dashboard) |
| Venue | Events | text | `venue` |
| City | Events | text | `city` |
| Your story | Story | textarea (5 rows) | `love_story` |

Guests tab shows read-only stats, no inputs.

## Interactions

### Page load
- If not signed in (post auth-load), redirects to `/auth?return={current path}`.
- `GET /api/users/profiles/{profileId}` (per-load; the id is server-scoped to the caller — a stranger's id 404s). Seeds the form from the response's 7 fields; failures show an inline error + "Back to dashboard" link, no retry button.
- Once the profile loads, separately fetches `GET /api/users/profiles/{profileId}/insights` for the Guests-tab stats (independent error state from the profile load itself).

### Edit a field
- **Trigger:** any input/textarea change.
- **Behavior:** updates local `form` state and sets `dirty = true`. No autosave, no debounce — purely local until Save is clicked.

### Save changes
- **Trigger:** nav "Save changes" (disabled while `saving` or `!dirty`).
- **Behavior:** builds a body from non-empty/non-null fields only (`event_date` → ISO string), `PATCH`es, replaces `profile` with the server's returned object on success, clears `dirty`, flashes a "Saved." toast (2.6s). Failure shows the backend's `detail` or a generic message as an error toast — form state is left as-is (not reverted) so the buyer can retry.

### Tab switch
- Purely local `useState` index — no data refetch on tab change; Guests-tab insights were already fetched on profile load.

## API Dependencies

| API | Method | Path | Trigger | Notes |
|---|---|---|---|---|
| Get profile | GET | `/api/users/profiles/{profileId}` | Mount | 404s for a profile the caller doesn't own |
| Update profile | PATCH | `/api/users/profiles/{profileId}` | Save changes | Same whitelist as User Dashboard's profile PATCH |
| Profile insights | GET | `/api/users/profiles/{profileId}/insights` | Once profile loads | `{ rsvp: { total, coming, not_coming, awaiting }, wishes, gallery }` |

## Page Relationships

- **From:** User Dashboard's hero "Enter details" link and Orders-tab "Edit" button (both pass the hero/self-service invitation's id).
- **To:** `/user/dashboard` (brand link, and the "Back to dashboard" link on the load-error screen).
- **Data coupling:** edits made here are visible on User Dashboard's next load (both read the same `profiles` collection), but User Dashboard's own Profile tab is a *separate*, simpler form scoped only to the hero invitation — the two forms don't share component state, just the same backend record.

## Business Rules

- Field set is intentionally smaller than the DC design mock across every tab — see per-tab notes in the source file header: Names drops parents' names (no backing field), Events collapses a repeatable event list to the single `event_date`/`venue`/`city` triple the whitelist supports, Story collapses a multi-"moment" repeater to the one `love_story` textarea, and Guests drops an "add names" CTA (its DC target route doesn't exist in this build) in favor of static explanatory copy.
- No autosave/draft mechanism on this page (unlike Order Details) — an in-progress edit is lost on navigation away without an explicit Save.
- "Layout and artwork stay with the studio" is a hard product boundary reflected directly in the whitelist: nothing on this page can change the invitation's design/theme, only its textual content.
