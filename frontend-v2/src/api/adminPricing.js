import client from './client';

// Super-admin Pricing Hub — ONLY the canonical INR surfaces the live checkout
// actually reads. The backend carries four overlapping pricing systems; the
// credits-denominated /api/super-admin/pricing/* module is deliberately never
// called here (see AdminPricing.jsx design-prices tab notes).

// ---- Subscription plans (subscription_service.py) -------------------------
export const listSubscriptionPlans = () => client.get('/api/admin/subscription-plans');
export const upsertSubscriptionPlan = (payload) => client.post('/api/admin/subscription-plans', payload);

export const getBillingCycles = () => client.get('/api/admin/billing-cycles');
export const putBillingCycles = (cycles) => client.put('/api/admin/billing-cycles', { cycles });

// ---- Store a-la-carte: features + languages (store_features.py) -----------
export const getStoreAlacarte = () => client.get('/api/admin/store-alacarte');
export const upsertStoreFeature = (payload) => client.post('/api/admin/store-features', payload);
export const upsertStoreLanguage = (payload) => client.post('/api/admin/store-languages', payload);

// ---- Design prices: READ-ONLY public resolver ------------------------------
// store_features.py has no admin WRITE endpoint for per-design INR prices —
// the only writer is super_admin_pricing.py's POST /api/super-admin/pricing/designs,
// whose `base_price` is CREDITS (see DesignPrice model comment there), while
// this same pricing_design_prices collection is read back as literal INR by
// store_features.design_price_inr(). Writing through that endpoint would
// silently mis-price the storefront, so it is never called from here.
// /api/store/catalog resolves the same price as /api/store/design/{id}/price
// but also names the resolution tier (design | theme | default) — worth the
// slightly larger payload for an admin transparency tool.
export const lookupDesignPrice = (designId, themeId = '') =>
  client.get('/api/store/catalog', { params: { design_id: designId, theme_id: themeId } });

// ---- Theme bundle prices (pricing_features.py) ----------------------------
// One INR price for a whole collection. Unlike the design-prices module above,
// this one is safe to write from here: `credits` is no longer part of the
// upsert, and the public reader (/api/public/theme-bundle-pricing) returns
// inr_price only, so what is saved is exactly what a buyer sees.
export const listThemeBundles = () => client.get('/api/super-admin/theme-bundle-pricing');
export const upsertThemeBundle = (payload) =>
  client.post('/api/super-admin/theme-bundle-pricing', payload);
export const deleteThemeBundle = (themeId) =>
  client.delete(`/api/super-admin/theme-bundle-pricing/${themeId}`);

// ---- Discount codes (pricing_features.py) ---------------------------------
// The buyer-side validator has been live on the checkout for a while with no
// way to CREATE a code, so every entry a customer typed came back "Invalid or
// inactive code". These are the writers.
//
// The server computes the discount; nothing here re-derives it. update takes
// the row `id` (not the code), and create rejects a duplicate code with 409.
export const listDiscountCodes = () => client.get('/api/super-admin/discount-codes');
export const createDiscountCode = (payload) =>
  client.post('/api/super-admin/discount-codes', payload);
export const updateDiscountCode = (codeId, patch) =>
  client.put(`/api/super-admin/discount-codes/${codeId}`, patch);
export const deleteDiscountCode = (codeId) =>
  client.delete(`/api/super-admin/discount-codes/${codeId}`);

// ---- Pricing Hub live engine (pricing_hub_service.py) ----------------------
// The six endpoint groups the AdminPricing.jsx tabs above never called. This
// is the module the LIVE checkout resolver (pricing_engine.compute_wedding_total
// / compute_plan_total / quote_wedding / quote_plan) actually reads — a
// different collection-writer than the "Subscription Plans" tab above, which
// posts to subscription_service.py's /api/admin/subscription-plans and writes
// `base_monthly`, a field quote_plan() never looks at. See AdminPricingHub.jsx.
export const hubCategories = () => client.get('/api/admin/pricing/categories');
export const hubCreateCategory = (payload) => client.post('/api/admin/pricing/categories', payload);
export const hubUpdateCategory = (id, patch) => client.put(`/api/admin/pricing/categories/${id}`, patch);
export const hubDeleteCategory = (id) => client.delete(`/api/admin/pricing/categories/${id}`);

export const hubFeaturePacks = () => client.get('/api/admin/pricing/feature-packs');
export const hubCreateFeaturePack = (payload) => client.post('/api/admin/pricing/feature-packs', payload);
export const hubUpdateFeaturePack = (id, patch) => client.put(`/api/admin/pricing/feature-packs/${id}`, patch);

export const hubLinkDurations = () => client.get('/api/admin/pricing/link-durations');
export const hubCreateLinkDuration = (payload) => client.post('/api/admin/pricing/link-durations', payload);
export const hubUpdateLinkDuration = (id, patch) => client.put(`/api/admin/pricing/link-durations/${id}`, patch);
export const hubDeleteLinkDuration = (id) => client.delete(`/api/admin/pricing/link-durations/${id}`);

export const hubCampaigns = () => client.get('/api/admin/pricing/campaigns');
export const hubCreateCampaign = (payload) => client.post('/api/admin/pricing/campaigns', payload);
export const hubUpdateCampaign = (id, patch) => client.put(`/api/admin/pricing/campaigns/${id}`, patch);
export const hubToggleCampaign = (id) => client.post(`/api/admin/pricing/campaigns/${id}/toggle`);
export const hubDeleteCampaign = (id) => client.delete(`/api/admin/pricing/campaigns/${id}`);

/** product filters the live wedding/portfolio/storage/backup cycle-priced plans. */
export const hubPlans = (product = '') =>
  client.get('/api/admin/pricing/plans', { params: product ? { product } : {} });
export const hubUpdatePlan = (id, patch) => client.put(`/api/admin/pricing/plans/${id}`, patch);

export const hubCommunity = () => client.get('/api/admin/pricing/community');
export const hubPutCommunity = (payload) => client.put('/api/admin/pricing/community', payload);

/** Dry run — calls the exact same resolver checkout uses; writes nothing. */
export const hubSimulate = (payload) => client.post('/api/admin/pricing/simulate', payload);

// ---- Founding-100 pricing (founding_admin.py) ------------------------------
// Toggling founding mode / editing a tier's price changes what the PUBLIC
// pricing page shows immediately (pricing_engine.price_display, read live by
// the public pricing pages) — every mutating call here needs an explicit
// confirm in the UI, not just server-side validation.
export const foundingStatus = () => client.get('/api/super-admin/founding/status');
export const foundingSettings = (patch) => client.patch('/api/super-admin/founding/settings', patch);
export const foundingApplyCatalogue = () => client.post('/api/super-admin/founding/apply-catalogue');
// `planKey` must be the plan ID. Tier NAMES are not unique across portfolio
// plans — two rows can both be "Premium" — and this endpoint used to resolve
// by tier, so a save could land on the wrong plan. The server now refuses an
// ambiguous tier with a 409 rather than guessing.
export const foundingPlanPrices = (planKey, payload) =>
  client.patch(`/api/super-admin/founding/portfolio/${encodeURIComponent(planKey)}`, payload);
