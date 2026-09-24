/**
 * pricingSelection.js — the `maja_pricing_selection` sessionStorage stash.
 *
 * Pricing.jsx's invitation tier CONTINUE button writes it; StudioSuiteCheckout
 * and the studio dashboard "finish your order" banner read it. One key, one
 * shape, validated on every read — a tampered or stale value is ignored
 * silently rather than trusted (docs/PRICING_REDESIGN_2026.md §9.8).
 */
const KEY = 'maja_pricing_selection';

export const COMPONENT_LABELS = {
  digital: 'Digital Invitation',
  video: 'Video Invitation',
  physical: 'Physical Design',
};

const VALID_TIERS = ['basic', 'premium', 'custom'];
const VALID_COMPONENTS = Object.keys(COMPONENT_LABELS);

function isValid(sel) {
  return !!sel && sel.type === 'invitation_suite'
    && VALID_TIERS.includes(sel.invitation_tier)
    && Array.isArray(sel.components) && sel.components.length > 0
    && sel.components.every((c) => VALID_COMPONENTS.includes(c));
}

export function writePricingSelection(sel) {
  try { sessionStorage.setItem(KEY, JSON.stringify(sel)); } catch (_e) { /* private mode — caller still navigates */ }
}

/** The validated stash, or null. Guards JSON.parse and shape — never lets a
 *  bad value reach a caller. */
export function readPricingSelection() {
  try {
    const sel = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return isValid(sel) ? sel : null;
  } catch (_e) { return null; }
}

export function clearPricingSelection() {
  try { sessionStorage.removeItem(KEY); } catch (_e) { /* ignore */ }
}

/** Sum of the selection's components against the server-priced tier row from
 *  GET /api/public/pricing/invitations — the one place a total is computed
 *  from prices the server sent, never a client-invented number. Returns null
 *  when the tier isn't in the given list (pricing not loaded yet, or the
 *  tier no longer exists). */
export function selectionTotal(selection, invitationTiers) {
  const tier = (invitationTiers || []).find((t) => t.key === selection.invitation_tier);
  if (!tier) return null;
  return selection.components.reduce((sum, k) => sum + Number(tier.components?.[k] || 0), 0);
}
