/**
 * featureAccess.js — the single client-side gate for feature-pack entitlements.
 *
 * Mirror of backend `pricing_activation.has_feature`. The public invitation payload
 * carries `granted_features` (see InvitationPublicView):
 *   • null / undefined  → ungated. Legacy link, grandfathered buyer, or the
 *                          `new_pricing_enabled` flag is OFF. Show EVERYTHING.
 *   • an array          → the buyer's purchased pack. Only PACKABLE features that
 *                          appear in it are shown; base features are never gated.
 *
 * This never removes a feature that no pack sells — gating applies strictly to the
 * union of features across the Celebration / Signature / Royal packs (PACKABLE).
 * Keep PACKABLE in sync with backend `pricing_migration.DEFAULT_FEATURE_PACKS`.
 */

// The union of every pack's features (Royal is the superset). A feature is only
// ever hidden if it is in this set AND absent from the buyer's granted list.
export const PACKABLE_FEATURES = new Set([
  // Celebration (free) — present in every pack, so effectively always granted.
  'rsvp', 'timeline', 'family_details', 'countdown', 'maps', 'music',
  // Signature (+₹999)
  'qr_live_gallery', 'guest_uploads', 'enhanced_gallery',
  // Royal (+₹1999)
  'ai_face_match', 'selfie_search', 'premium_support', 'premium_delivery',
]);

/**
 * Is `key` available given a profile's granted_features list?
 * @param {string[]|null|undefined} grantedFeatures
 * @param {string} key
 * @returns {boolean}
 */
export function hasFeature(grantedFeatures, key) {
  if (grantedFeatures == null) return true;          // ungated / flag OFF / legacy
  if (!Array.isArray(grantedFeatures)) return true;  // defensive: treat as ungated
  if (!PACKABLE_FEATURES.has(key)) return true;      // base feature — never gated
  return grantedFeatures.includes(key);
}

/**
 * Bind the accessor to a public invitation payload once, for concise call sites:
 *   const can = featureGate(data);  if (can('ai_face_match')) { ... }
 * @param {object|null|undefined} payload  the InvitationPublicView JSON
 * @returns {(key: string) => boolean}
 */
export function featureGate(payload) {
  const granted = payload && payload.granted_features != null ? payload.granted_features : null;
  return (key) => hasFeature(granted, key);
}

export default featureGate;
