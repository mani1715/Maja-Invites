/**
 * Step definitions for the floating "How to create your wedding link" tour.
 *
 * Two presets:
 *   - HOMEPAGE_USER_STEPS — for couples landing on the public site (`/`)
 *   - PHOTOGRAPHER_STEPS  — for photographers inside the admin dashboard
 *
 * `target` is a CSS selector resolved at runtime. When a step has no
 * target (or the element isn't found) the card centers on screen and the
 * spotlight is suppressed.
 */

export const HOMEPAGE_USER_STEPS = [
  {
    title: 'Pick a category',
    body: 'Start by choosing the occasion you\'re celebrating — Wedding, Half Saree function, Puberty (Manjal Neerattu), Dhoti (Vetti Kattum Vizha) or Baby Birthday.',
    target: '[data-testid="themes-grid"]',
    badge: '1 · Category',
  },
  {
    title: 'Pick a style',
    body: 'Inside the category, choose the style that fits your family — e.g. Telugu, Tamil, Kannada or Mughal wedding. Each has its own palette, motifs and feel.',
    badge: '2 · Style',
  },
  {
    title: 'Choose your design',
    body: 'Browse the templates in that style and open the one you love for a full live preview — photos, story, RSVP and more. Pick the exact design you want.',
    badge: '3 · Design',
  },
  {
    title: 'Add it to your cart',
    body: 'Tap "Add to cart" on the design you chose. Each design has a simple one-time price in ₹ — no credits, no subscriptions.',
    target: '[data-testid^="theme-buy-btn-"]',
    badge: '4 · Cart',
  },
  {
    title: 'Pay securely',
    body: 'Checkout and pay through the Razorpay gateway. Every payment is verified server-side — your details and money stay safe.',
    badge: '5 · Pay',
  },
  {
    title: 'Fill the details form',
    body: 'After your payment is verified you\'re taken straight to a short form for that design — share your names, date, venue and photos. That\'s all we need.',
    badge: '6 · Details',
  },
  {
    title: 'Delivered within a day',
    body: 'Our studio personalises your chosen design and sends you the finished invitation link within one day. Then just share it on WhatsApp, Instagram and SMS.',
    badge: '7 · Done',
  },
];

export const PHOTOGRAPHER_STEPS = [
  {
    title: 'Step 1 — Create a new wedding',
    body: 'Click "Create Wedding" to open the luxury wizard. Build as many free drafts as you like — you only pay when you publish a live link.',
    target: '[data-testid="dashboard-create-wedding"]',
    badge: '1 · Create',
  },
  {
    title: 'Step 2 — Pick the ceremony',
    body: 'Inside the wizard the first card is "Event" — pick Marriage, Reception, Sangeet, Haldi, Mehendi or Engagement. Each event tunes the photo slots and design defaults.',
    badge: '2 · Event',
  },
  {
    title: 'Step 3 — Fill couple details + photos',
    body: 'Add the bride/groom names, wedding date, venue and upload couple/bride/groom photos. The green ✓ next to each photo slot means it will appear on the public invitation.',
    badge: '3 · Couple',
  },
  {
    title: 'Step 4 — Choose theme & design',
    body: 'Open the "Theme" step. You\'ll first see all cultural themes — pick one, then 3 designs unlock for that theme. Click "Preview" to open the full invitation in a NEW TAB (your draft stays safe).',
    badge: '4 · Theme',
  },
  {
    title: 'Step 5 — Tune the features',
    body: 'Toggle premium add-ons (RSVP, gallery, AI story, multi-language). Every toggle updates the live price total on the Publish step in real-time.',
    badge: '5 · Features',
  },
  {
    title: 'Step 6 — Publish & share',
    body: 'On the Publish step you\'ll see the auto-calculated total. Tap it to publish — a public share link is generated. Copy and send it to your couple.',
    target: '[data-testid="publish-btn"]',
    badge: '6 · Publish',
  },
];
