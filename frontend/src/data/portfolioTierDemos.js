// portfolioTierDemos — the four portfolio tiers, as shown to a photographer.
//
// These replaced the ten token-design samples on /portfolio-samples. They come
// from the Claude Design project "MAJA Wedding Design Tiers" and ship as
// self-contained pages under public/portfolio-demos/ — each one carries its own
// runtime (support.js) and content model (maja-demo.js), so it renders without
// the SPA, the API or the database.
//
// WHY STATIC HTML RATHER THAN PORTED COMPONENTS
// They are demonstrations, not the product. A photographer opens one to decide
// what to buy; nothing on the page needs to read a real portfolio. Porting
// ~2,000 lines of dc-runtime template across four tiers would buy nothing a
// static file does not already do, and would go stale the moment the design
// moves. `premium_editorial` in portfolioDesigns.js is the separate, real
// implementation — that is the one a studio can actually apply.
//
// FILENAMES ARE DELIBERATELY SPACE-FREE. The originals are "MAJA Pro Plus.dc.html";
// a space in a URL is what silently 404'd the seeded sample images once already,
// so they are renamed on copy and compare.html's internal links are rewritten to
// match.
//
// Order is the sales order: cheapest first, so the page reads as an upgrade path.
export const TIER_DEMOS = [
  {
    id: 'basic',
    index: '01',
    name: 'Basic',
    oneWord: 'Professional',
    href: '/portfolio-demos/basic.html',
    line: 'A clean, fast, trustworthy first professional presence.',
    philosophy: 'Professional simplicity',
    bestFor: 'New & solo photographers',
    // Tokens drive the miniature so the card previews the real design.
    bg: '#FBFAF8', ink: '#1A1815', accent: '#8A6F4E',
    heading: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    highlights: ['Selected work grid', 'Services', 'Availability list', 'Enquiry form'],
  },
  {
    id: 'premium',
    index: '02',
    name: 'Premium',
    oneWord: 'Polished',
    href: '/portfolio-demos/premium.html',
    line: 'Editorial layouts, wedding stories and film — a real brand.',
    philosophy: 'Editorial sophistication',
    bestFor: 'Established studios building a brand',
    bg: '#F4F1EA', ink: '#171410', accent: '#9A6A45',
    heading: "'Cormorant Garamond',Georgia,serif",
    highlights: ['Asymmetric gallery', 'Featured stories', 'Films & reels', 'Two-year availability'],
  },
  {
    id: 'advanced',
    index: '03',
    name: 'Advanced',
    oneWord: 'Exceptional',
    href: '/portfolio-demos/advanced.html',
    line: 'Chapters, sticky storytelling and a horizontal wedding rail.',
    philosophy: 'Immersive editorial storytelling',
    bestFor: 'High-end & destination photographers',
    bg: '#100E0C', ink: '#EDE7DD', accent: '#C9A227',
    heading: "'Bodoni Moda',Didot,serif",
    highlights: ['Parallax film hero', 'Sticky story chapter', 'Wedding rail', 'Reading progress'],
  },
  {
    id: 'pro-plus',
    index: '04',
    name: 'Pro Plus',
    oneWord: 'Flagship',
    href: '/portfolio-demos/pro-plus.html',
    line: 'Cinematic opening, commission navigator, staged enquiry.',
    philosophy: 'Flagship cinematic experience',
    bestFor: 'Luxury & internationally recognised studios',
    bg: '#0B0A09', ink: '#EFEBE3', accent: '#C8A98A',
    heading: "'Italiana',Georgia,serif",
    highlights: ['Title-card opening', 'Commission navigator', 'Raw / delivered compare', 'Three-step enquiry'],
  },
];

/** The side-by-side comparison of all four. */
export const TIER_COMPARISON = {
  href: '/portfolio-demos/compare.html',
  title: 'Compare all four tiers',
  line: 'The same wedding, told four ways — identical content, four levels of art direction.',
};
