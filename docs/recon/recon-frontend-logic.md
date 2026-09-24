# FRONTEND-RESIDENT BUSINESS LOGIC — inventory

Root: `legacy/logic/frontend/src/`. All paths below relative to that unless prefixed.

---

## 0. Cross-cutting findings (read first)

| # | Finding | Severity |
|---|---|---|
| F1 | **THREE divergent media-URL resolvers**: `utils/mediaUrl.js::resolveMediaUrl`, `invitations/kit.js::mediaUrl`, `pages/LuxuryPublicInvitation.jsx:352 resolveUrl` (local). Behaviour differs — see §2. | BROKEN-BY-DRIFT |
| F2 | `utils/analyticsTracker.js`, `utils/languageLoader.js`, `config/languageTemplates.js`, `utils/deviceFingerprint.js` have **ZERO importers** in `src/`. Dead code, shipped-but-unwired. | DOCUMENTED-NOT-WIRED |
| F3 | `MIGRATION_LOGIC_SPEC.md` §4.10 claims `constants/testIds/` = 1,659 testids. Actual: 3 files, **52 lines total** (`auth.js` 33, `home.js` 4, `index.js` 15). Real testids are **2,477 inline `data-testid`** attributes in JSX. The "QA contract" file does not exist. | SPEC WRONG |
| F4 | Spec §4.7 claims `CartContext.js` holds "add-ons, languages, test-buyer free-order branch". It holds **none of those** — all live in `pages/CartPage.jsx`. | SPEC WRONG |
| F5 | `API_SURFACE.md` **omits `GET /api/public/pricing/effective`** (defined `backend/super_admin_pricing.py:788`, `public_router` prefix `/api/public/pricing`, no auth). Doc lists only designs/founding-status/invitations/portfolio/storage. | DOC GAP |
| F6 | `API_SURFACE.md:1951` labels `GET /api/feature-flags` guard `require_super_admin`. Actual `backend/feature_flags_service.py:58` — **no dependency, fully public**. Guard column mis-attributes the router-factory arg. Do not trust that column for factory-built routers. | DOC WRONG |
| F7 | Frontend `hasFeature` is **more permissive than backend `has_feature`** (`backend/pricing_activation.py:150`). Backend: once `granted_features` is set, `feature_key in granted` — no base-feature carve-out. Frontend: non-PACKABLE keys always true. A base feature missing from a pack renders in UI, 403s on the API. | INVARIANT MISMATCH |
| F8 | `@/` → `src/*` alias via `frontend/jsconfig.json` + `craco.config.js:67`. Any port must reproduce it or every `kit.js` re-export breaks. | PORT BLOCKER |

---

## 1. `utils/featureAccess.js` (51 lines, fan-in 2)

**Exports:** `PACKABLE_FEATURES` (Set, 13 keys) · `hasFeature(grantedFeatures, key)` · `featureGate(payload)` → `(key)=>bool` · default = `featureGate`.

**Importers (only 2):** `components/luxury/CelebrationPublicView.jsx:31`, `pages/LuxuryPublicInvitation.jsx:39` — both `import { featureGate }`.

**Behavior / invariants**
- `grantedFeatures == null` → `true` (legacy link / grandfathered buyer / `new_pricing_enabled` OFF).
- non-array → `true` (defensive ungate).
- key not in `PACKABLE_FEATURES` → `true` (base features never gated).
- else `granted.includes(key)`.
- `featureGate(payload)` reads `payload.granted_features`; treats `undefined` and `null` identically.

**PACKABLE_FEATURES contents** (verified exact match to backend `pricing_migration.DEFAULT_FEATURE_PACKS:75` Royal superset):
`rsvp, timeline, family_details, countdown, maps, music` (Celebration ₹0) · `qr_live_gallery, guest_uploads, enhanced_gallery` (Signature +₹999) · `ai_face_match, selfie_search, premium_support, premium_delivery` (Royal +₹1999).

**Gotchas**
- Hardcoded set vs **admin-editable** `pricing_feature_packs` collection. Admin adds a paid feature key → not in `PACKABLE_FEATURES` → silently ungated for everyone. Drift is one admin click away.
- `/api/public/pricing/effective` already returns `feature_packs[].feature_keys` — the set is derivable at runtime; nobody does it.
- Three-way permissiveness stack (null / non-array / non-packable) means **any payload shape error fails OPEN**, granting every paid feature.
- Client-side only. Devtools unlocks everything.

**Port: MOVE_TO_BACKEND** — a gate that fails open in three ways and drifts from an admin-editable table must be a server-computed `entitlements` object.

---

## 2. `utils/mediaUrl.js` (38 lines, fan-in 3)

**Exports:** `resolveMediaUrl(value)` · default same.

**Importers:** `components/luxury/MultiPhotoUploader.jsx:4`, `components/luxury/PhotoUploadField.jsx:4`, `portfolioLayouts/premiumEditorial.jsx:37`. *(Only 3 — the whole public invitation surface uses its own copy.)*

**Behavior**
1. falsy → `''`
2. `/^https?:\/\//i` → return with `(https?://host)/uploads/` → `$1/api/uploads/` (case-insensitive)
3. `/uploads/…` → `/api/uploads/…`
4. no leading `/` → prepend `/`
5. return `${REACT_APP_BACKEND_URL}${path}`

**Why it exists:** ingress routes only `/api/*` to FastAPI; bare `/uploads/x.jpg` hits the SPA and returns `index.html` → broken-image icon. Spec §4.2 says this has bitten 4× (page backdrop, user uploads, portfolio uploads, invitation kit).

**Gotchas — the three copies diverge**

| | `utils/mediaUrl.js` | `kit.js::mediaUrl` | `LuxuryPublicInvitation:352 resolveUrl` |
|---|---|---|---|
| `data:` URI | **BROKEN** → returns `${BACKEND}/data:image/…` | guarded, returns as-is | guarded, returns as-is |
| absolute detect | `/^https?:\/\//i` | `u.startsWith('http')` (case-sensitive; `HTTP://` falls through) | `u.startsWith('http')` |
| leading-slash normalise | yes | no | no |

- 3 literal `/uploads/…` strings still hardcoded in `invitations/riya-aarav/reception/data.js:23,29,35` — sample data, bypasses every resolver.

**Port: VERBATIM_PORT (one copy) + delete the other two** — behaviour is right, duplication is the actual defect; add the `data:` guard and a lint rule banning raw `/uploads` string literals.

---

## 3. `hooks/usePricing.js` (117 lines, fan-in 6)

**Exports:** `usePricing(audience='normal_user')` · default same.

**Endpoint:** `GET ${API}/api/public/pricing/effective?audience=` — **not in API_SURFACE.md** (F5). Defined `backend/super_admin_pricing.py:788`, no auth. `audience` ∈ `normal_user | photographer`.

**Returns:** `{...data, postSub, featurePacks, loading, error, refresh, themeCost, designCost, optionCredits, optionIsFree}`.

**Server payload keys** (verified): `audience, themes{theme_id:credits}, designs{`\``${theme}__${design}`\``:credits}, options{key:{credits,is_free}}, packs[], plans[], post_sub, photographer_tiers, feature_packs[]`. `plans`/`post_sub`/`photographer_tiers` populated **only** when `audience==='photographer'`.

**Behavior / invariants**
- Module-level `_cache: Map<audience,{data,fetchedAt}>`, `TTL_MS = 30_000`. Shared across all mounts; survives navigation, not reload.
- `themeCost(id, fallback=1)`, `designCost(themeId, designKey, fallback=null)`, `optionCredits(key, fallback=0)` (**`is_free` short-circuits to 0 before reading `credits`**), `optionIsFree(key, fallback=false)`.
- `EMPTY` initial shape **lacks `feature_packs`** → `featurePacks` is `[]` pre-fetch (harmless but shape-inconsistent).

**Gotchas**
- `refresh()` never checks the effect's `cancelled` flag → setState after unmount.
- Cache-hit path skips `setError(null)` → a stale error persists across a successful cached read.
- `...data` spread would let a server key named `loading`/`error`/`refresh` shadow the hook's own.
- Fallback args (`fallback=1` credit) let a missing row silently render a **wrong price**. Spec §4.3: a prior build hardcoded ₹2999 and charged wrong.
- **Invariant (§4.3): frontend displays `price_inr` and posts back an id, never an amount.** `CartPage.jsx:62` honours it (`/api/store/quote` takes selections only; `total = quote?.total_inr ?? 0`).

**Port: ADAPT** — keep the hook shape, drop every numeric fallback (render "—" not a guessed price); backend stays authoritative.

---

## 4. `data/portfolioDesigns.js` (177 lines, fan-in 3)

**Exports:** `PORTFOLIO_DESIGNS` (**10 entries, not 9** — spec says 9) · `TIER_UNLOCKS` · `designsForTier(tier)` · `getDesign(id)` · `DEFAULT_DESIGN_BY_TIER` · `resolveDesign(designId, tier)` · `FREE_PORTFOLIO_FEATURES` (14 strings).

**Design ids by tier:** free — `free_studio_neutral`. basic — `basic_golden_hour, basic_darkroom, basic_nordic`. premium — `premium_gallery_wall, premium_film_strip, premium_liquid_glass, premium_contact_sheet, premium_aurora, premium_editorial`.

**Token set per design (renderer requires ALL):** `id tier name vibe bg surface ink inkSoft line accent accentInk heading body depth dark signature preview`; optional `mono`, optional `layout`.

**Invariants**
- `TIER_UNLOCKS = {normal:['free'], free:['free'], basic:['free','basic'], premium:['free','basic','premium']}` — `normal` and `free` are aliases; unknown tier → `['free']`.
- `resolveDesign` **always returns a complete design**: `getDesign(id)` → `DEFAULT_DESIGN_BY_TIER[tier]` → `PORTFOLIO_DESIGNS[0]`. Root fix for the "portfolio background stays black" bug (old catalogue had only `{bg,accent}`).
- `signature` names a background motif consumed by `<PortfolioSignature>`: `none|sunlight|grain|horizon|gallery|filmstrip|glass|contactsheet|aurora|editorial`.
- `depth:true` → 3D scroll motion (premium only). `dark:true` → dark ground/light ink.
- `layout:'premiumEditorial'` on `premium_editorial` — names a component in `portfolioLayouts/` that renders the **whole page and ignores the tokens**; tokens still filled so picker swatch/plan cards work. Only `portfolioLayouts/` entries: `index.js`, `premiumEditorial.jsx`.

**Gotchas**
- Tier count in spec ("Free 1 / Basic 3 / Premium all 9") is off by one — premium unlocks **10**.
- `designsForTier` filters by exact tier string in the allow-list; a design with an unknown `tier` value disappears silently.
- No backend validation that `portfolio_profiles.design_id` is in this list — `resolveDesign` is the only thing preventing a broken page.

**Port: VERBATIM_PORT** — pure data + a fallback chain already paid for in production bugs.

---

## 5. `themes/` — lazy catalogue mechanism (49 files; `allDesigns` fan-in 20, `themeDesignResolver` fan-in 10)

**Structure:** `configs/{temple,mughal,muslim,christian,bengali,punjabi,beach,nature,minimal}.designs.js` + `configs/_shared.js` · `kerala_backwaters/kerala.designs.js` (differently shaped) · per-theme `{theme}.colors.js` + `{Theme}Background.jsx` · `masterThemes.js` · `allDesigns.js` · `themeDesignResolver.js` · `designOverlays.js` · `UniversalDesignRenderer.jsx` · `KeralaDesignRenderer.jsx` · `textContrast.js` · `themeMotion.js` · `shared/{ThemeAnimationOrchestrator,ThemeBackgroundAmbient,ZoomInOpening,CinematicClosing}.jsx` · `Reveal.jsx` · `image-manifest.json` · `sampleData.js` · `samplePhotos.js`.

### `allDesigns.js`
**Exports:** `ALL_DESIGNS` (mutable cache, starts `{}`) · `EVENTS = ['Engagement','Haldi','Mehandi','Marriage','Reception','Sangeeth']` · `preloadAllDesigns()` · `hasThemeLoader(id)` · `useAllDesigns(enabled=true)` · `useAllDesignsReady()` · `useThemeDesigns(themeId)` · `getThemeDesigns` · `getEventDesigns` · `getThemeDesignsAsync` · `getDedupedEventDesigns(themeId,event)`.

**Mechanism:** `LOADERS` map of 10 `import()` with `webpackChunkName: "theme-<x>"`. Kerala's loader **adapts** `{KERALA_DESIGNS}` → `{events}`. `themePromises` de-dupes in-flight; failure `delete`s the promise so retry works. `listeners: Set` bus + `notify()` on chunk land.

**Invariants**
- Module-level `requestIdleCallback(preloadAllDesigns)` was **removed 2026-07-30** — it was the biggest homepage JS cost AND masked a race where the public invitation resolved `null` with nothing subscribed to re-render.
- `getDedupedEventDesigns`: each unique `d.image` is claimed by the FIRST event in `EVENTS` order; preserves `_eventIndex` = original index so `/design/:index` still opens the right design after filtering. Deterministic, navigation-order independent.

### `themeDesignResolver.js`
**Exports:** `pageBgForDesign(design,theme)` · `normaliseEvent(event)` · `resolveThemeId(themeId)` · `useResolvedThemeDesigns(themeId)` · `resolveDesign(themeId,event,designIndex=0)` · `resolveHeroDesign(themeId,designSelections={})` · `findDesignById(themeId,designId)`.

**Invariants**
- **`useResolvedThemeDesigns(themeId)` is MANDATORY for any component calling `resolveDesign`/`resolveHeroDesign`/`findDesignById`** — those read `ALL_DESIGNS` **synchronously** and return `null` on a miss. Without it: blank page on a slow link. Was a latent bug on the *guest-facing invitation page*.
- **Any `useMemo` over a resolver must depend on the loaded designs, not just `[themeId]`** — a stale memo renders every ceremony permanently `locked`.
- `useResolvedThemeDesigns` picks the chunk that will actually be read: `null` for kerala (statically imported) and for unknown ids maps to `royal_mughal` (the resolver's fallback) so it doesn't load a chunk that can never resolve.
- Event normalisation: backend `mehendi` ↔ catalogue `Mehandi`; `wedding`→`Marriage`; `sangeet`→`Sangeeth`. Default `Marriage`.
- `resolveThemeId`: `THEME_ID_ALIASES` (`masterThemes.js:131`) — `royal_heritage→royal_mughal`, `temple_gold→south_indian_temple`, `modern_pastel→modern_minimal`, `peacock_dream→beach_destination`, `midnight_sangeet→punjabi_sangeet`, `modern_lotus→bengali_traditional`, `ivory_elegance→christian_elegant`, `dark_royal→kerala_backwaters`, `bollywood_luxury→kerala_backwaters`. Default `royal_mughal`. **Legacy ids are in the DB — aliases are load-bearing.**
- `pageBgForDesign`: dark-image inference from `design.textColor` ∈ `#F5ECD7|#FFF8DC|#FFF8E8` → page bg `#0E0905`; explicit `design.bg` matching `/^#[0-2]/` wins first. Fixes cream border around night photos.
- `bollywood/` theme dir still exists (`bollywood.colors.js`, `BollywoodBackground.jsx`) but has **no `configs/bollywood.designs.js` and no LOADER entry** — alias redirects it to kerala. Dead assets.
- `getThemesByPlan(_planType)` returns **all** themes — legacy FREE/SILVER/GOLD/PLATINUM gating removed Feb 2026; `planRequired` kept on records for backward-compat, not used for filtering.

**Port: VERBATIM_PORT the mechanism** (lazy per-theme chunk + subscription bus + mandatory loader hook) — every deviation here has already produced a shipped bug.

---

## 6. `lib/designCode.js` (54 lines, fan-in 1)

**Exports:** `THEME_ABBR` (10) · `EVENT_ABBR` (6) · `encodeDesignCode(themeId,event,index)` · `decodeDesignCode(code)` · `_selfTest()`.

**Format:** `<THEME4>-<EVENT3>-<NN>`, e.g. `MUGH-ENG-01`. Index is **1-based in the code, 0-based in the API**.

`THEME_ABBR`: `south_indian_temple:TMPL, royal_mughal:MUGH, bengali_traditional:BENG, punjabi_sangeet:PUNJ, kerala_backwaters:KERL, christian_elegant:CHRS, muslim_nikah:MSLM, beach_destination:BEAC, nature_eco_wedding:NATR, modern_minimal:MNML`.
`EVENT_ABBR`: `Engagement:ENG, Haldi:HAL, Mehandi:MEH, Marriage:MRG, Reception:REC, Sangeeth:SNG`.

**Behavior:** encode returns `null` on unknown theme/event. decode uppercases + trims, requires exactly 3 dash-parts, returns `null` on unknown abbr / `NaN` / `index<0`. `_selfTest()` asserts round-trip `MUGH-ENG-01`.

**Gotchas**
- Reverse maps built at module load from the forward maps — **renaming any abbreviation breaks codes already shared with customers.** Codes are in the wild.
- Does **not** accept legacy theme ids (`royal_heritage` etc.) — encode returns `null` for aliased profiles.
- `parseInt('1x',10)` → 1, so `MUGH-ENG-1x` decodes successfully.

**Port: VERBATIM_PORT** — wire-format compatibility with codes already distributed.

---

## 7. `context/CartContext.js` (54 lines, fan-in 4)

**Exports:** `CartProvider` · `useCart()` (throws outside provider).
**Consumers:** `App.js`, `pages/CartPage.jsx`, `pages/DesignFullPreview.jsx`, `pages/EventDesignPicker.jsx`, `pages/StudioDesigns.jsx`.

**Value:** `{items, add, remove, clear, total, count}`.

**Behavior**
- localStorage key **`maja_cart_v1`**; read in lazy `useState` init (try/catch → `[]`), written on every `items` change (try/catch swallows quota errors).
- `add(item)`: if `item.price_inr == null`, fetches `GET /api/store/design/{design_id}/price` (`API_SURFACE.md:1058`, `store_features.py`, no auth) → `data.price_inr`; on error `price = null`. **De-dupes by `design_id`** — re-adding is a no-op and returns the *newly fetched* price while leaving the old item untouched.
- `total = Σ Number(price_inr)||0`, `count = items.length`. No quantities.

**Gotchas**
- `total` is client arithmetic over cached prices. **It is display-only** — the authoritative number is `quote.total_inr` from `POST /api/store/quote`. Spec §4.3: "any component doing arithmetic on money is a bug."
- Cart persists indefinitely with a **stale `price_inr`** across admin price changes.
- Effectively single-item: `CartPage.jsx` operates on one `design` and calls `remove(design.design_id)` after checkout.

**The logic the spec attributes here actually lives in `pages/CartPage.jsx`:**
- `refreshQuote()` → `POST /api/store/quote` with `{design_id, theme_id, features, main_language, extra_languages, esign_agreed:true}` — **selections only, never amounts** (:57-69).
- `pickMain(key)` **drops the chosen main language from `extraLanguages`** — otherwise the buyer is charged for an included language (:75-80). `toggleExtraLanguage` refuses the main language.
- Checkout (:86): bounce to `/?signin=1` with `sessionStorage.post_login_redirect='/cart'` only when **neither** `user` nor `admin` session exists (buyer may be a photographer). `esign` required.
- `POST /api/store/order/create` → **`if (order.free) { remove(); navigate('/order/:id/details'); return; }`** — test/comped accounts skip Razorpay entirely (:100-105). Missing this branch shows comped users a real payment modal.
- Razorpay handler → `POST /api/store/order/verify` → same details route; verify failure message must say "contact support if charged".

**Port: ADAPT** — keep the cart as a thin `{design_id}` list + server quote; delete client `total`.

---

## 8. `hooks/useGalleryAccess.js` (114 lines, fan-in 1)

**Exports:** `useGalleryAccess(slug)` · `authHeader(deviceToken)`.
**Consumer (only one):** `components/luxury/FindMyPhotosModal.jsx:5`.

**Returns:** `{loading, privacy, deviceToken, isProtected, isUnlocked, unlock, logout, error, refresh}`.

**Storage keys:** `gallery_device_token_${slug}`, `gallery_device_exp_${slug}` (localStorage).

**Endpoints:** `GET /api/public/gallery/{slug}/privacy` · `POST /api/public/gallery/{slug}/unlock` — both `gallery_privacy.py`, **no auth** (`API_SURFACE.md:606-607`).

**Behavior / invariants**
- `loadStored()` restores the token only if `Date.parse(exp) > Date.now()`; expired → removes both keys.
- **Privacy fetch failure FAILS OPEN** to `{enabled:false, is_protected:false, ai_face_match_enabled:true, allow_downloads:true, allow_share:true, public_highlights_enabled:true, private_full_gallery_enabled:true}` — a backend blip renders a protected gallery unlocked client-side. Server must still enforce.
- `unlock(code, remember=true)` → `{device_token, expires_at}`; persists **only when `remember && exp`** (so `remember:false` keeps the token in memory for the session).
- Error path: string-coerces `detail`, re-throws an `Error` carrying `.status`.
- `isProtected = !!privacy?.is_protected`; `isUnlocked = !isProtected || !!deviceToken`.
- `authHeader(t)` → `{'X-Gallery-Device-Token': t}` or `{}`. **This exact header name is the contract.**
- Access model (§6): guest galleries are protected by **unguessable expiring links, not sessions**.

**Gotchas**
- Fail-open default (above) is the single biggest one.
- Per-slug keys accumulate in localStorage with no sweep.
- No cross-tab sync; `logout()` in one tab leaves the other holding the token in state.

**Port: ADAPT** — port verbatim except the fail-open default; make the privacy-fetch failure render a locked state, not an open one.

---

## 9. `services/eventApi.js` (155 lines, fan-in 15)

**Exports:** `EventService` (default) · `childService(collection)` factory · 8 singletons: `CommitteeService('committee_members')`, `ScheduleService('festival_schedule')`, `GalleryService('gallery')`, `AlbumService('albums')`, `DonationService('donations')`, `SponsorService('sponsors')`, `ExpenseService('expenses')`, `RsvpService('event_rsvp')`.

**Axios instance `evax`:** `axios.create({withCredentials:true})` + request interceptor that adds `Authorization: Bearer ${localStorage.admin_token}` **only when `config.headers.Authorization` is absent** — so the money-member portal's scoped token wins. Dual-persona by design: photographer Bearer OR family/host httpOnly cookie, both accepted by `get_current_buyer`.

**`childService(collection)` surface:** `{collection, list(eventId,params), get(eventId,childId), create(eventId,payload), update(eventId,childId,payload) [PATCH], remove(eventId,childId), reorder(eventId,orderedIds) [POST …/reorder {ordered_ids}], action(eventId,childId,name) [POST …/{childId}/{name}]}` over `/api/events/{eventId}/{collection}`. **A new child collection needs zero new code.**

**`EventService` route inventory** (base `/api/events`, 60 routes in that prefix):
registry — `GET /registry`, `GET /registry/{type}`, `GET /api/event-meta/child-collections`, `GET /templates/{type}`
lifecycle — `GET /`, `POST /` `{event_type}`, `GET /{id}`, `PATCH /{id}/autosave {patch}`, `POST /{id}/validate`, `POST /{id}/publish {edit_paid}`, `POST /{id}/archive`, `POST /{id}/restore`, `DELETE /{id}`
public — `GET /api/public/events/{slug}`, `POST …/rsvp`, `POST …/donate`, `POST …/donate/order`, `POST /api/public/events/donate/verify`, `GET …/leaderboard`, `GET …/blessings`, `POST …/blessings`
money portal — `POST /api/event-money/login`, `moneyHeaders()` reads **`localStorage.event_money_token`**, `GET /overview`, `GET|POST /donations`, `POST /expenses`, `moneyReportUrl()` → `/api/event-money/report.csv`; owner side `GET|POST /{eventId}/money-members`, `DELETE …/{memberId}`
media — `POST /{id}/gallery/upload` (FormData: `file`, optional `album_id|caption|festival_day`, `on_duplicate` defaults `'keep'`), `GET /{id}/days/{day}/photo-status`
pricing/purchase — `GET /design-offer/{type}/{templateId}`, `GET /pricing/{type}`, `POST /pricing/quote`, `GET /plans/{type}?template_id=`, `POST /purchase`, `POST /purchase/verify`, `GET /starter-content/{type}?lang&option`
feature requests — `GET /api/event-requests/catalog/{type}`, `GET|POST /api/event-requests/{eventId}`

**BROKEN — guard mismatches (frontend calls as buyer, backend requires super-admin):**

| eventApi method | Route | Guard in `API_SURFACE.md` | Frontend caller |
|---|---|---|---|
| `eventDesignOffer` | `GET /api/events/design-offer/{type}/{tpl}` (:519) | `require_super_admin` | `pages/EventDesignPreview.jsx:49` (buyer-facing preview) |
| `requestCatalog` | `GET /api/event-requests/catalog/{type}` (:1492) | `require_super_admin` | `components/builder/FeatureRequestPanel.jsx:41` (owner panel) |
| `eventPricing` | `GET /api/events/pricing/{type}` (:524) | `require_super_admin` | — |
| `eventQuote` | `POST /api/events/pricing/quote` (:523) | `require_super_admin` | — |
| `publicBlessings` / `publicSubmitBlessing` | `GET|POST /api/public/events/{slug}/blessings` (:591-592) | `get_current_buyer` | commented "no auth" — **anonymous wedding guests cannot read or post blessings** |

Both callers swallow the failure (`.catch(() => {})`), so this presents as an empty panel, not an error.

**Other gotchas**
- Whole surface is gated by feature flag **`ganesh_module_enabled`**; when OFF every call 404s and callers must read 404 as "module unavailable", not "not found".
- `moneyHeaders()` is called as `EventService.moneyHeaders()` from inside the object literal — breaks if the object is ever destructured.
- `data = (p) => p.then(r => r.data)` — errors propagate raw; no shared error envelope.
- Spec §4.9: **157 files import `REACT_APP_BACKEND_URL` directly**. This module is the only typed client layer.

**Port: VERBATIM_PORT the pattern, ADAPT the calls** — extend `childService`-style typed clients to the whole app; fix the five guard mismatches server-side first.

---

## 10. `hooks/useFeatureFlags.js` (18 lines, fan-in 1)

**Export:** default `useFeatureFlags()` → `{flags, ready, flag(k)}`.
**Endpoint:** `GET /api/feature-flags` → `{flags:{key:bool}}`. **Public** (`feature_flags_service.py:58`), despite `API_SURFACE.md:1951` (F6).

**Behavior:** module-level `let _cache` — fetched **once per page session**, never invalidated. On any error `_cache = {}` → every flag false for the rest of the session, permanently, with no retry. `ready = flags !== null`. `flag(k)` → `!!flags[k]`.

**Known flag keys:** `ganesh_module_enabled`, `storage_pool_enabled`, `new_pricing_enabled`, `experience_3d`. Admin CRUD at `GET|POST /api/admin/feature-flags`, `DELETE /api/admin/feature-flags/{key}` (`require_super_admin`).

**Gotchas:** fail-closed + no retry means one blip disables a paid module until reload; `_cache = {}` is indistinguishable from "no flags configured"; `flags` state is per-hook-instance so late mounts get the cache immediately but never re-render on a change.

**Port: ADAPT** — fold flags into the same session/entitlements payload as `featureAccess`; one fetch, one source, retry on failure.

---

## 11. `utils/analyticsTracker.js` (230 lines, **fan-in 0 — DEAD**)

**Exports:** `trackPageView(profileId, eventId=null)` · `trackGalleryOpened` · `trackVideoPlayed(profileId, eventId, videoType='hero')` · `trackMusicUnmuted` · `trackMapOpened` · `trackRSVPSubmitted` · `initScrollTracking(profileId, eventId)` → cleanup fn · `initTimeTracking(profileId, eventId)` → cleanup fn.

**Endpoint:** `POST /api/analytics/track` (`API_SURFACE.md:1638`, `server.py`, no auth), raw `fetch`, errors swallowed to `console.debug`.

**Event contract:** `{profile_id, event_id, session_id, event_type, device_type, user_agent?, event_metadata?, time_spent_seconds?}`.
`event_type` ∈ `page_view | gallery_opened | video_played | music_unmuted | map_opened | rsvp_submitted | scroll_25 | scroll_50 | scroll_75 | scroll_100`.
`device_type` ∈ `tablet | mobile | desktop` (UA regex; tablet tested first, `android(?!.*mobi)`).

**Behavior:** `session_id = session_${Date.now()}_${rand36}` in **sessionStorage** (`analytics_session_id`), cleared on browser close. No cookies, no PII by design.

**Gotchas**
- **Never imported anywhere.** Either analytics is silently dead or it moved server-side; verify before porting.
- `isAdmin()` suppression checks `localStorage.admin_token` only — **couples use an httpOnly cookie, so couple/owner page views ARE tracked** as guest traffic.
- `scrollDepthTracked` is a **module-level singleton**; two trackers on one page share it, and `initScrollTracking` resets it globally.
- `initTimeTracking` uses `beforeunload` — unreliable on mobile Safari (use `visibilitychange` + `sendBeacon`).
- `scrollPercent` divides by `scrollHeight - innerHeight` → `Infinity`/`NaN` on a non-scrolling page.
- `String.prototype.substr` (deprecated).
- Sends full `navigator.userAgent` on `page_view` despite the "NO personal data" header comment.

**Port: ADAPT** — keep the event-type/payload contract as the wire format; rewrite transport (`sendBeacon`, `visibilitychange`, per-instance scroll state). Confirm it is meant to be live at all.

---

## 12. `utils/languageLoader.js` (146 lines, **fan-in 0 — DEAD**)

**Exports:** `LANGUAGES` (6) · `getLanguageMetadata(code)` · `loadLanguage(code)` · `getText(code, section, key, customText={})` **async** · `getSectionText(code, section, customText={})` **async** · `preloadLanguages(codes)` · `clearLanguageCache()`.

**Mechanism:** `fetch('/lang/${file}')` from the SPA origin (not `/api/`), in-memory `languageCache` object. Files **exist**: `frontend/public/lang/{en,te,hi,ta,kn,ml}.json`.

**Languages:** `english/en.json, telugu/te.json, hindi/hi.json, tamil/ta.json, kannada/kn.json, malayalam/ml.json`.

**Fallback chain:** custom text → requested language → English → the key string itself. Unknown code → recurse to English. English fetch failure → `{}`.

**Custom-text key format: `` `${section}.${key}` `` — DOT separator.**

**Gotchas**
- Zero importers.
- **Key-format conflict with `config/languageTemplates.js`, which uses `` `${section}_${key}` `` (UNDERSCORE).** Two incompatible custom-text schemas for the same feature. Whichever one production data uses, the other silently returns defaults.
- Async `getText` per string — unusable in render without a wrapper; none exists.
- Failed fetch is **not** cached, so a broken language re-fetches on every call.
- `getSectionText` merges every `customText[lang]` key with the section prefix, including keys not in the template (`languageTemplates.getSectionText` only overrides existing keys) — second behavioural divergence.

**Port: MOVE_TO_BACKEND** (or delete) — two dead, mutually incompatible i18n implementations; pick the format matching stored `custom_text` and serve translations with the invitation payload.

---

## 13. `config/languageTemplates.js` (352 lines, **fan-in 0 — DEAD**)

**Exports:** `LANGUAGE_TEMPLATES` (6 languages × 9 sections, inline) · `LANGUAGES` (6, each `{code,name,nativeName,rtl:false}`) · `getText(language, section, key, customText={})` **sync** · `getSectionText(language, section, customText={})` **sync** · `getLanguage(code)`.

**Sections:** `opening{title,subtitle}` · `welcome{message}` · `couple{groomLabel,brideLabel}` · `events{title,dateLabel,venueLabel}` · `photos{title}` · `video{title}` · `greetings{title,nameLabel,messagePlaceholder,submitButton}` · `whatsapp{groomButton,brideButton,defaultMessage}` · `footer{thankyou}`.

**Fallback:** custom (`${section}_${key}`) → language template → English template → `''`.

**Gotchas**
- Zero importers; duplicate-and-divergent with `languageLoader.js` (dot vs underscore, async vs sync, `''` vs key-string fallback).
- Every language ships **`rtl:false`** — no RTL support despite Urdu/Arabic being plausible for `muslim_nikah`.
- Translations are hardcoded in JS, not the JSON in `public/lang/` — **two copies of the same strings** with no sync mechanism.
- `LANGUAGES` is exported from **both** this file and `languageLoader.js` with different shapes (`file` vs `rtl`).

**Port: MOVE_TO_BACKEND** — merge with §12 into one server-served translation payload; delete both files.

---

## 14. `config/legalContent.js` (215 lines, fan-in 1)

**Exports:** `BUSINESS` · `LEGAL_DOCS` (default).
**Consumer:** `pages/LegalPage.jsx:12` (routes `/terms /privacy /refund /contact`; `App.js:169` notes it is required for Razorpay live + DPDP).

**`LEGAL_DOCS` keys: `terms, privacy, refund, contact, cookies, retention`** — 6 docs, but only 4 have routes. `cookies` and `retention` are **written but unrouted**.

**Doc shape:** `{key, title, intro?, sections:[{heading, body:[string]}]}`. Plain text only, no HTML. Interpolates `BUSINESS` fields via template literals.

**BLOCKERS — `BUSINESS` is unfilled placeholder data:**
```js
legalName: 'MAJA Invites',            // TODO: registered legal entity
email:     'support@majacreations.com', // TODO: real support email
phone:     '',   gstin: '',            // TODO — GSTIN required for GST invoices
address:   'India',                    // TODO: registered business address
jurisdiction: 'India',                 // TODO: city/state for disputes
effectiveDate: '13 June 2026',
```
File header: **"⚠️ DRAFT BOILERPLATE … Have a lawyer review and finalise before public launch."** `contact.phone` renders the literal string `'Add a support phone number in legalContent.js'` on the public page when `phone` is empty.

**Substantive commitments encoded** (must match reality): Razorpay processor · Supabase auth · AWS storage · optional Google Drive · India DPDP 2023 · liability capped at 3 months' fees · refunds 5-7 business days · support response 3 business days · face-match is guest-initiated and opt-in · cookie categories strictly-necessary/analytics/marketing with analytics+marketing **off until consented**.

**Port: VERBATIM_PORT the structure, BLOCK the content** — fill `BUSINESS`, route `/cookies` and `/retention`, legal review before launch. Do not ship the placeholder phone string.

---

## 15. `invitations/kit.js` (83 lines, fan-in 2) — **the only supported import surface**

**Consumers:** `invitations/meera-kabir/wedding/index.jsx:5`, `invitations/riya-aarav/reception/index.jsx:2`.

### Full public API surface

**Interactive (talk to the API — must never be hand-rolled)** — re-exported from `@/pages/LuxuryPublicInvitation` (all verified present):
| Export | Signature / usage | Def line |
|---|---|---|
| `RSVPForm` | `<RSVPForm slug={data.slug} rsvpSettings={data.rsvp_settings} onSuccess? />` | :1717 |
| `WishForm` | `<WishForm slug={data.slug} onSuccess? />` | :1866 |
| `Countdown` | `<Countdown date={new Date(data.event_date)} />` | :1694 |
| `PhotoMarquee` | `<PhotoMarquee photos={[{url,caption}]} title eyebrow />` | :1321 |
| `TiltCard` | `<TiltCard max={9} className style testId>` | :1242 |
| `HeroCover` | `<HeroCover bride groom date theme mealTime experience3d />` | :1495 |
| `BrideGroomCoupleShowcase` | — | :1349 |

**Platform sections** (default exports from `@/components/luxury/`, self-contained + responsive):
`GiftRegistrySection` · `DigitalShagunSection` · `VenuesSection` · `DressCodeSection` · `FaqSection` · `GuestUploadButton` · `WhatsAppShare` · `AmbientMusicPlayer` · `AddToCalendarButton` · `LivePhotoWallTeaser` · `ScrollSection`

**Motion (so a generated page needs no extra deps):** `motion`, `AnimatePresence`, `useReducedMotion` — re-exported from `framer-motion`.

**Shell:** `InvitationShell` (default from `./InvitationShell`) — `<InvitationShell testId='generated-invitation'>`. Adds body classes `luxe luxe-grain luxe-vignette` on mount, removes on unmount (a generated route may be entered directly). Renders `.lux-aurora` (3 spans) + `.lux-jaali`, both `position:fixed` + `pointer-events:none` behind content — **fixed, not attached to the scroll container, because a scrolling/attached background breaks scroll on iOS Safari and Android Chrome.** Imports `@/styles/luxury.css`.

**Values:**
- `tokens = {gold:'#D4AF37', goldBright:'#E8C766', ivory:'#FFF8DC', crimson:'#8B0000', burgundy:'#4A0E2A', night:'#0E0A06', border:'rgba(212,175,55,0.28)'}`
- `mediaUrl(u)` — third copy of the resolver (see §2). Handles `data:`; `startsWith('http')` case-sensitive; no leading-slash normalise.
- `fluid(minRem, vw, vh, maxRem)` → `clamp(${min}rem, min(${vw}vw, ${vh}vh), ${max}rem)`. **Rationale: a width-only breakpoint hands a landscape phone desktop-sized text in a 390px-tall window; clamping on `min(vw,vh)` lets whichever axis is scarce win.**

**Invariants**
- **A hand-rolled RSVP box posts nowhere and the couple finds out after the wedding.** Design freely *above* these components; use these *for* anything touching the backend.
- Every `<img src>` in a generated invitation must go through `mediaUrl`.
- Authoring contract documented in repo-root `INVITATION_AUTHORING.md`.

**Gotchas**
- Every export resolves through the `@/` alias (F8) — the kit is the largest single consumer of it.
- Re-exporting 7 named components out of a **1,900+ line** page module means importing the kit pulls the entire public-invitation page into the generated chunk.
- `mediaUrl` duplicated rather than importing `@/utils/mediaUrl` — the comment even restates the same ingress rationale.
- `invitations/riya-aarav/reception/data.js` hardcodes 3 raw `/uploads/…` paths, defeating the resolver it imports.

**Port: VERBATIM_PORT the API surface** (names and props are a published contract for generated pages), **ADAPT the internals** — move the 7 components out of the page module into their own files, and make `mediaUrl` re-export the single shared resolver.

---

## 16. Auth contexts — token/refresh/timeout handling

### `context/AuthContext.js` (408 lines) — photographer / admin
**Exports:** `AuthProvider` · `useAuth()` (throws outside provider).
**Value:** `{admin, loading, token, login, loginWithSupabasePassword, signupWithSupabase, completeSupabaseSignup, setSessionFromSignup, logout, refresh, supabaseConfigured}`.

**Token model:** short-lived access token in `localStorage.admin_token` + `axios.defaults.headers.common.Authorization`; **HttpOnly refresh cookie `maja_rt`** set at login by `issue_session`.

**Endpoints:** `POST /api/auth/login` · `POST /api/auth/refresh` (`auth_sessions.py`, no guard, :990) · `GET /api/auth/me` · `GET /api/auth/me-supabase` (:989, `get_current_admin`) · `POST /api/auth/sync-supabase-user` (:996).

**Invariants / hard-won behaviour**
1. **Single-flight refresh** — `refreshingRef` ensures concurrent 401s trigger **one** `/api/auth/refresh`, not a stampede.
2. **Response interceptor installed FIRST**, before the boot effect, so even boot's `/api/auth/me` can self-heal on expiry.
3. Interceptor skips: no config/response, non-401, `config._majaRetried`, URLs containing `/api/auth/refresh` or `/api/auth/login`. Requires `hadBearer` (checks per-request header **and** the axios default) — cookie-only (couple) requests never enter the refresh path.
4. Retries the original request **exactly once** with `config._majaRetried = true`.
5. Refresh genuinely fails → clear token + admin, reject, let guards bounce to login ("the honest outcome").
6. **`token` lazy init is try/catch-wrapped — `localStorage` THROWS in Safari private mode and previously took the whole provider down during render.**
7. **`adminRef` mirror** — the Supabase listener has `[]` deps and would otherwise read a forever-`null` `admin`; SIGNED_OUT never cleared the legacy token before this.
8. **15s watchdog** forces `loading=false` no matter what hangs — "a stuck `loading` is what makes a reload look like a dead page."
9. **`supabase.auth.getSession()` is raced against an 8s timeout** — it waits on supabase-js's `navigator.locks` auth lock; if another tab holds it against a slow backend the promise **never settles**, and a pending promise is not catchable.
10. `hydrateFromSupabase` in the `onAuthStateChange` handler is **deliberately NOT awaited** — supabase-js runs the callback while holding the auth lock; awaiting a network call there blocks every other supabase call including boot's `getSession`.
11. **`timeout: 10000` on `/api/auth/me` and `/api/auth/me-supabase` is REQUIRED** — axios has no default timeout, so a backend that accepts but never answers leaves `loading` true forever and every guarded route renders permanently blank.
12. **Legacy-token boot retries 3× with 400ms×attempt backoff. ONLY 401/403 clears the token.** Root cause of "click an option → back to the login screen": a transient `/auth/me` hiccup left `admin=null` and every guard bounced despite a valid token.
13. SIGNED_OUT clears only when `adminRef.current?.supabase_user_id` exists — a Supabase sign-out must not kill a legacy session.
14. `hydrateFromSupabase` 404 + `detail.error === 'no_admin_record'` → returns `{needsSignup:true, supabaseUser:{id,email}}`, not an error.
15. `fetchAdminInfo` (`refresh`) **never auto-logs-out** — returns `null` and lets the caller decide.

**Gotchas:** dual auth systems (legacy FastAPI + Supabase bridge) with the legacy token as the universal currency · mutates the **global** `axios.defaults` (which is why `ClientAuthContext` needs its own instance) · `completeSupabaseSignup` and `setSessionFromSignup` write `localStorage` **unguarded** (inconsistent with the guarded init — will throw in Safari private mode).

### `context/UserAuthContext.js` (100 lines) — couple / buyer
**Exports:** `UserAuthProvider` · `useUserAuth()` · `markUserSessionActive()` · `clearUserSessionActive()`.
**Value:** `{user, loading, register, login, loginWithGoogle, logout, refresh}`.

**Token model: HttpOnly session cookie only — no JS-visible token.** All calls `withCredentials: true`.
**Endpoints:** `GET /api/users/me` (:895) · `POST /api/users/register` · `POST /api/users/login` · `POST /api/users/logout` · `GET /api/users/auth/google/login?redirect=`.

**Invariants**
- `localStorage.maja_user_session_active = '1'` is a **perf flag only** (the cookie is HttpOnly). **Boot skips `/api/users/me` entirely when absent** — saves a round-trip for anonymous visitors.
- **Boot skips the probe on `window.location.pathname === '/auth/callback'`** — `AuthCallback` refreshes once the backend has set the cookie. Marked CRITICAL in-file.
- `loginWithGoogle(returnPath)`: **only accepts paths starting with `/`**, else `'/'` — open-redirect guard. Backend builds the Google consent URL with a CSRF `state` carrying the return path.
- No refresh flow, no interceptor, no timeout. `register`/`login` **throw** on failure (unlike `AuthContext.login`, which returns `{success:false}`).

**Gotchas:** clearing localStorage logs the user out **visually** while the cookie is still valid until the next `refresh()` · `checkAuth` failure is indistinguishable from "expired" vs "network down" — both null the user · no unmount guard on `setUser`.

### `context/ClientAuthContext.js` (100 lines) — photographer's client (couple with a per-invitation login)
**Exports:** `ClientAuthProvider` · `useClientAuth()`.
**Value:** `{clientToken, isClient, event, loading, clientApi, clientLogin, clientLogout, refreshOverview}`.

**Token model:** `localStorage.client_token`, **deliberately isolated** from `admin_token`.
**Endpoints:** `POST /api/client/login` (:965) · `GET /api/client/overview` (:966) — both `photographer_clients.py`, no listed guard.

**Invariants**
- **Private `axios.create({baseURL})` instance with its own request interceptor** that reads `localStorage.client_token` fresh on every request and deletes `Authorization` when absent. **Never touches `axios.defaults`** — so a photographer and their client can be signed in in the same browser without clobbering each other. This isolation is the whole point of the file.
- Boot: token present → `GET /api/client/overview` with `timeout: 10000`; **only 401/403 clears the token** (same lesson as AuthContext #12).
- `clientLogin` returns `{success, event}` / `{success:false, error}` — never throws.
- `clientLogout` is local-only (no server call) — the token stays valid server-side until expiry.
- `event` shape: `{profile_id, slug, couple, ...}`.

**Gotchas:** `useState(() => localStorage.getItem('client_token'))` is **NOT try/catch-wrapped** — will throw in Safari private mode, exactly the bug `AuthContext` fixed (:15) · no refresh flow — client sessions die hard on expiry · `clientApi` is exposed in context so consumers bypass a service layer · `refreshOverview` swallows all errors to `null`.

**Port (all three): ADAPT** — the timeout/watchdog/single-flight/ref-mirror/401-only-clears patterns are each a shipped-bug fix and must survive verbatim; the dual legacy+Supabase auth path and three storage strategies should collapse to one session model.

---

## 17. Also present, mentioned in spec §4.10

| File | Status |
|---|---|
| `utils/deviceFingerprint.js` (104 lines) | **fan-in 0 — DEAD.** Exports `generateDeviceFingerprint()`, `getDeviceId()`, `clearDeviceId()` + a default object. Hash of UA/language/platform/hardwareConcurrency/screen/colorDepth/timezone/cookieEnabled → `device_<base36>`, persisted at `localStorage.wedding_device_id`, falls back to a non-persistent id when storage is blocked. 32-bit `simpleHash` — **collision-prone; usable as an abuse signal, never as an identity.** Port: MOVE_TO_BACKEND (server-side signal) or delete. |
| `constants/testIds/` | 3 files, 52 lines (`auth.js` 33, `home.js` 4, `index.js` 15). Not the claimed 1,659-testid QA contract (F3). Port: ADAPT — extract the real contract from the 2,477 inline `data-testid` attributes if the QA suite depends on them. |
| `utils/mealTime.js`, `utils/chromeRoutes.js` | Present, not in spec §4 — not reviewed here. |