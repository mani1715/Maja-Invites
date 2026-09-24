// Single source of truth for the public-site IA. Every marketing surface
// (Landing nav + drawer, MarketingNav on secondary pages, footer) renders
// NAV_LINKS verbatim so the tab set never changes between pages.
// LINK maps prototype-era targets to real routes; upgrade an entry here and
// every call site re-points at once.
export const NAV_LINKS = [
  // "Designs" is first because it is what a visitor came for. It was missing
  // entirely: /browse holds all 188 designs and no marketing surface linked to
  // it, so the catalogue was reachable only by typing the URL.
  { label: 'Designs', to: '/browse' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' },
  { label: 'Community', to: '/community' },
];

export const LINK = {
  browseThemes: '/browse',        // the design catalogue — /browse, BrowseDesigns.jsx
  ourStory: '/#story',            // landing-page section anchors (ScrollManager handles the hash)
  forPhotographers: '/#photographers',
  signIn: '/auth',
  signUp: '/auth/signup',      // photographers/studios only — no normal-user (couple/buyer) accounts post-pivot
  terms: '/terms',
  privacy: '/privacy',
  refund: '/refund',
};

export const SUPPORT_EMAIL = 'support@majacreations.com';
