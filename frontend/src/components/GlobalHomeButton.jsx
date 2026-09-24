import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';
import { pageHasOwnChrome } from '@/utils/chromeRoutes';

/**
 * GlobalHomeButton — a single floating "Home" pill rendered once at the app
 * level, for "bare" pages that ship no navigation of their own. Sits top-left,
 * immediately right of the Back pill. Kept below modal/popup z-indexes so
 * overlays still cover it.
 *
 * Hidden wherever the page already renders its own brand/nav (a MAJA logo that
 * links home) — the authed panels and the public marketing pages — because there
 * the fixed pill overlapped the page's own logo and duplicated the Home link.
 * See pageHasOwnChrome().
 */
export default function GlobalHomeButton() {
  const { pathname } = useLocation();
  if (pageHasOwnChrome(pathname)) return null;

  return (
    <Link
      to="/"
      aria-label="Back to home"
      title="Back to home"
      data-testid="global-home-btn"
      className="fixed z-[95] inline-flex items-center gap-2 no-underline rounded-full transition-transform active:scale-95"
      style={{
        // TOP-left, immediately to the right of the Back pill.
        top: 'max(0.7rem, env(safe-area-inset-top))',
        left: 'calc(max(0.7rem, env(safe-area-inset-left)) + 6.7rem)',
        padding: '0.6rem 0.95rem',
        // WCAG 2.5.5 (AAA): the padding alone left this pill ~35px tall.
        minHeight: 44,
        background: 'var(--lux-chrome)',
        color: 'var(--lux-text)',
        border: '1px solid rgba(212,175,55,0.5)',
        boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        fontSize: '0.72rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      <Home style={{ width: 16, height: 16 }} />
      Home
    </Link>
  );
}
