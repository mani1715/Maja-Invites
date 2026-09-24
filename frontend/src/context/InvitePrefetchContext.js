import React, { createContext, useContext } from 'react';

/**
 * InvitePrefetchContext — holds pre-fetched side-data from /api/invite/:slug/full
 * so that sub-components (WishesWallSection, GiftRegistrySection,
 * DigitalShagunSection, LivePhotoWallTeaser, MajaReferralCTA …) can skip
 * their own GET requests on first render.
 *
 * Each side-component still falls back to its own fetch if no prefetch is
 * available (e.g. when this context is missing or the slug differs).
 *
 * Shape:
 *   {
 *     slug,
 *     wishes: [...],
 *     gifts:  {...},
 *     blessings: { total_count, recent },
 *     gallery_info: {...},
 *     shagun_enabled: bool,
 *     referral_code: string|null,
 *   }
 */
export const InvitePrefetchContext = createContext(null);

export const useInvitePrefetch = (expectedSlug) => {
  const ctx = useContext(InvitePrefetchContext);
  if (!ctx) return null;
  if (expectedSlug && ctx.slug !== expectedSlug) return null;
  return ctx;
};

export default InvitePrefetchContext;
