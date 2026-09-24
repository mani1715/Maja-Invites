/**
 * pageHasOwnChrome — does the current route already render its OWN brand/nav?
 *
 * The floating Back + Home pills (GlobalBackButton / GlobalHomeButton) exist for
 * "bare" pages that ship no navigation of their own. On pages that DO render a
 * MAJA logo + menu, the fixed pills sat on top of that logo (they overlapped the
 * "MAJA Invites" wordmark on the studio dashboard) and duplicated navigation the
 * page already provides. So the pills are hidden wherever chrome exists and shown
 * only where they are actually needed.
 *
 * Two kinds of chrome:
 *   1. Authed panels (/studio*, /super-admin*) — PanelTabs + panel headers, each
 *      panel page also ships its own in-page Back / Home / Logout.
 *   2. Public marketing pages wrapped in PublicChrome — the top <Nav> (logo = Home,
 *      full menu). Keep this list in sync with the pages that import PublicChrome.
 *
 * Home ("/") and the couple's guest invitation ("/invite/*") never carry the pills
 * either (home has nothing to go back to; the invite must show no MAJA chrome).
 */

// Public routes whose page renders its own top Nav (PublicChrome / LandingPage).
const CHROME_PREFIXES = [
  '/features',
  '/how-it-works',
  '/faq',
  '/story',
  '/photographers',
  '/vendors',
  '/browse',
  '/portfolio-samples',
  '/community/about',
  '/plans',
];

export function pageHasOwnChrome(pathname) {
  const p = pathname || '';
  if (p === '/' || p.startsWith('/invite/')) return true;
  if (p.startsWith('/studio') || p.startsWith('/super-admin')) return true;
  return CHROME_PREFIXES.some((c) => p === c || p.startsWith(`${c}/`));
}

export default pageHasOwnChrome;
