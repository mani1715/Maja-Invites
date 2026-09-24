// portfolioLayouts — designs that own their whole page, not just their tokens.
//
// The nine original portfolio designs are token sets (bg / ink / accent /
// heading / …) painted by one shared renderer in PublicPhotographerProfile.
// That works while designs differ by palette and typography. It stops working
// when the LAYOUT is the design — an editorial 12-column asymmetric grid, a
// stories rail, a films section, vertical reels, an availability calendar.
//
// A layout design registers here and takes over the page body. Token designs
// are untouched, so this adds a capability rather than changing one.
//
// LAZY BY DEFAULT — and it has to be. These are whole pages; importing them
// statically would put every layout in the main bundle for every visitor,
// which is the same mistake the theme chunks made (nine theme chunks were
// loading on the homepage until that was fixed). React.lazy keeps each one to
// a chunk fetched only when a studio actually uses it.
import { lazy } from 'react';

const LAYOUTS = {
  premiumEditorial: lazy(() => import('./premiumEditorial')),
};

/** True when this design id renders its own layout instead of using tokens. */
export function hasLayout(layoutId) {
  return !!(layoutId && LAYOUTS[layoutId]);
}

/** The lazy component for a layout id, or null. Render inside <Suspense>. */
export function getLayout(layoutId) {
  return (layoutId && LAYOUTS[layoutId]) || null;
}

export default LAYOUTS;
