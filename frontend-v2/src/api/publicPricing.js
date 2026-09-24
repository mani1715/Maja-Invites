import client from './client';

// backend/pricing_public.py — public, read-only pricing built FOR the marketing
// pages, and until now called by none of them. /pricing was reading
// /api/store/packages (the à-la-carte order catalogue) and the credit-based
// subscription list, so four billing cycles, the founding-member mode and every
// honest strike-through were computed on each request and thrown away.
//
// The module's own guarantee is worth preserving in the UI: a card's
// strike-through is the REAL regular price, never a fabricated anchor, and a
// discount only renders when the buyer genuinely pays less. When founding is
// disabled or the 100 seats are gone, these endpoints serve regular pricing by
// themselves — the page does not need to decide.

/** { mode, enabled, limit, count, slots_left, auto_switch, sold_out } */
export const foundingStatus = () => client.get('/api/public/pricing/founding-status');

/** { mode, founding, cycle_labels, free, plans[] } — each plan carries
 *  `portfolio_tier`, which is the same key community_gating.py reads, so the
 *  community unlocks can be joined onto a plan card without guessing. */
export const portfolioPlans = () => client.get('/api/public/pricing/portfolio');

/** { mode, founding, tiers[] } — 50GB..1TB storage add-ons, priced per cycle. */
export const storagePlans = () => client.get('/api/public/pricing/storage');

/** { tiers: [{key: 'basic'|'premium'|'custom', name, components: {digital, video,
 *  physical}}] } — three invitation tiers x three independent add-on components,
 *  each priced in INR. The tier total is a pure sum of selected components —
 *  the ONE place the frontend is allowed to add server-sent numbers together. */
export const invitationPlans = () => client.get('/api/public/pricing/invitations');

/** { tiers: [{key, photos, price_inr}], custom_whatsapp: true } — Wave Face
 *  Match + QR one-time photo-count SKUs. Custom is a WhatsApp quote, not a
 *  priced tier — see src/lib/whatsapp.js. */
export const faceMatchPricing = () => client.get('/api/public/pricing/face-match');

/** { total, limit, offset, designs[] } — per-design prices from the NEW
 *  pricing engine (`pricing_design_prices`, audience normal_user).
 *
 *  Empty until an admin populates that table, which is why callers must not
 *  treat an empty list as "this design is free" or hide the price entirely.
 *  Pair it with `storeCatalog` below, which reads the populated source. */
export const designPrices = (params = {}) =>
  client.get('/api/public/pricing/designs', { params });

/** The live, populated per-design price + what the price includes.
 *  Public (no auth) despite the /store prefix, and the same call
 *  /studio/designs uses for its price chips — so the public design page and
 *  the studio catalogue can never quote different numbers for one design. */
export const storeCatalog = (designId, themeId = '') =>
  client.get('/api/store/catalog', { params: { design_id: designId, theme_id: themeId } });

/** Tier -> community capability matrix (backend/community_gating.py), with the
 *  admin's Pricing Hub overrides already applied.
 *
 *  Cached per page load: StudioPlanPicker and PlanUnlocks both render on
 *  /pricing and both need this matrix (one to join unlocks onto a plan card,
 *  one to render its own "what a plan unlocks" section) — without this they
 *  fired the same GET twice on one page view. Cleared on failure so a retry
 *  actually retries instead of replaying a rejected promise forever. */
let _communityCapPromise = null;
export const communityCapabilities = () => {
  if (!_communityCapPromise) {
    _communityCapPromise = client.get('/api/public/community/capabilities')
      .catch((e) => { _communityCapPromise = null; throw e; });
  }
  return _communityCapPromise;
};

/** { bundles: { theme_id: {theme_id, inr_price, label} } } — one price for a
 *  whole collection, set in the Pricing Hub's Theme Bundles tab.
 *
 *  Returns ONLY the collections an admin has priced, so a missing key means
 *  "no bundle offer for this collection", not "free" and not "zero". Callers
 *  must render nothing for a missing key rather than a ₹0 badge. `credits` is
 *  deliberately not in the payload — the stored column still exists but is a
 *  currency nobody can pay in. */
export const themeBundles = () => client.get('/api/public/theme-bundle-pricing');
