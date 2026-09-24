# MAJA Invites — frontend-v2

Vite + React 18 SPA. Visual source of truth: `../../../M 12 New ui/*.dc.html`
(106 DesignCode prototypes). Functional source of truth: `../backend`
(FastAPI, run elsewhere — this app never starts it) and `../frontend/src`
(legacy React app, reference for API usage only).

## Run / build

```
yarn install
yarn dev        # vite dev server, proxies /api -> http://127.0.0.1:8001
yarn build      # -> dist/
yarn preview    # serve the production build locally
```

`VITE_BACKEND_URL` env var overrides the API base (default: same-origin via
the dev proxy / production reverse proxy). No `.env` is checked in.

## Architecture map

```
src/
  main.jsx            entry — mounts <App/>, imports styles/global.css
  App.jsx              BrowserRouter + full P0 route table, lazy() per page,
                        Suspense fallback = styled loader, wraps in
                        AuthProvider (admin) + UserAuthProvider (couple)
  pages/                one file per route — see pages/MANIFEST.md for the
                        route <-> file <-> export-name table. Currently all
                        render the shared pages/_Placeholder.jsx; lane agents
                        overwrite their file in place.
  components/nav/       the 5 shared M12 navs, ported 1:1 from their .dc.html:
                          MobileNav.jsx      <- "MAJA Mobile Nav.dc.html"
                          StudioNav.jsx      <- "MAJA Studio Nav.dc.html"
                          AdminNav.jsx       <- "MAJA Admin Nav.dc.html"
                          PixoraNav.jsx      <- "MAJA Pixora Nav.dc.html"
                          WeddingToolbar.jsx <- "MAJA Wedding Toolbar.dc.html"
                          RailNav.jsx         shared internal mechanics behind
                                              Studio/Admin/Pixora (not a route
                                              nav itself — DC prototypes for
                                              those three share one collapse/
                                              rail/wide breakpoint ladder)
                          nav.css             static classes + keyframes from
                                              the nav helmets (glass surfaces,
                                              dark admin chrome, aurora rail)
  api/
    client.js           the ONE axios instance. Bearer admin_token attached
                        per-request when present; withCredentials:true always
                        (couple's httpOnly cookie); timeout 10000; single-
                        flight 401 refresh w/ hadBearer guard + _majaRetried,
                        dispatches a `maja:logout` window event on refresh
                        failure (AuthContext listens for it)
    auth.js users.js invitations.js store.js gallery.js facematch.js
    studio.js qr.js pricing.js
                        thin per-namespace call files. auth/users/invitations
                        (full fetch)/store (quote+order+verify)/pricing
                        (effective+feature-flags) have the real, confirmed
                        legacy endpoints wired. gallery/facematch/qr/studio
                        are scaffolded with what's confirmed; facematch.js
                        and qr.js are explicit stubs (ponytail: no legacy
                        endpoint was ever wired for face-match or QR in the
                        old frontend — lanes fill these in per their brief)
  lib/
    mediaUrl.js          resolveMediaUrl() — verbatim port + data: URI guard
    designCode.js         encode/decodeDesignCode() — verbatim port (wire
                        format already distributed to customers)
    galleryAccess.js      useGalleryAccess(slug) hook — verbatim port,
                        already fail-CLOSED on a privacy-fetch error
  context/
    AuthContext.jsx        admin/photographer session (Bearer + refresh
                        cookie). Ported: 15s loading watchdog, 401/403-only
                        clears token, 3x boot retry w/ 400ms*attempt backoff,
                        loading never renders null. Supabase bridge SKIPPED
                        entirely (legacy-only path) — plain FastAPI login.
    UserAuthContext.jsx    couple/buyer session (httpOnly cookie only).
                        Ported: maja_user_session_active perf flag (skips
                        the /me probe for anonymous visitors), /auth/callback
                        boot skip, open-redirect guard on loginWithGoogle.
  styles/global.css     design tokens (colors/radius/shadows/typography from
                        M12 design-system/*.ts) + px-aurora/px-glass/px-petal/
                        px-ripple + mj* keyframes + scroll-reveal helpers +
                        reduced-motion kill-switch, ported verbatim from the
                        shared helmet CSS in the .dc.html prototypes
```

## What each lane owns

Screen lanes overwrite files in `src/pages/` per `src/pages/MANIFEST.md` —
same path, same default export name (App.jsx's `lazy()` imports are path-
bound). Use the nav components from `src/components/nav/`, the API
namespaces from `src/api/`, and the contexts from `src/context/` rather than
hand-rolling auth/axios/media-url logic — every one of those carries a
shipped-bug fix ported from the legacy app.

## Deferred / notes for lane agents

- `api/facematch.js` and `api/qr.js` are stubs — no legacy endpoint was found
  wired to the old frontend for either surface. Add real calls per your
  screen's backend contract.
- `api/gallery.js` only has privacy/unlock (mirrors `lib/galleryAccess.js`);
  live-gallery list/upload/favorite calls are for the live-gallery lane to add.
- `api/studio.js` has only the 3 confirmed "obviously shared" calls
  (my-weddings/earnings/insights) — the studio lane's other ~15 endpoints
  (contracts, staff, proofing, print-orders, white-label — see
  `../docs/recon/recon-frontend-logic.md` and `../frontend/src/services/`)
  are unadded.
- Only `MAJA Wedding Toolbar.dc.html`'s tool list is hardcoded in
  `WeddingToolbar.jsx` (the DC source hardcodes it too) — wire `weddingId`
  routes once the wedding-detail lane's URL shape is final.
