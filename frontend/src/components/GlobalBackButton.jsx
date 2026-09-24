import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { pageHasOwnChrome } from '@/utils/chromeRoutes';

/**
 * GlobalBackButton — a single floating "Back" pill rendered once at the app
 * level, for "bare" pages that ship no navigation of their own (previews,
 * checkout, cart, deep browse, couple access, ...). Sits top-left, first in the
 * Back | Home pair. Uses history back; if there's no history (direct load / new
 * tab) it falls back to the home page so it's never a dead end.
 *
 * Hidden wherever the page already renders its own brand/nav — the authed panels
 * (their PanelTabs + headers) and the public marketing pages (their top Nav) —
 * because there the fixed pill overlapped the page's own MAJA logo and duplicated
 * navigation. See pageHasOwnChrome().
 */
export default function GlobalBackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (pageHasOwnChrome(pathname)) return null;

  const goBack = () => {
    // window.history.length is 1 on a fresh tab with no prior entries.
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  return (
    <button
      onClick={goBack}
      aria-label="Go back"
      title="Go back"
      data-testid="global-back-btn"
      className="fixed z-[95] inline-flex items-center gap-2 rounded-full transition-transform active:scale-95"
      style={{
        // TOP-left, first in the horizontal Back | Home pair.
        top: 'max(0.7rem, env(safe-area-inset-top))',
        left: 'max(0.7rem, env(safe-area-inset-left))',
        padding: '0.6rem 0.95rem',
        // WCAG 2.5.5 (AAA): the padding alone left this pill ~35px tall. The
        // 3.1rem bottom offset above still clears the 44px Home pill below.
        minHeight: 44,
        background: 'rgba(20,15,8,0.82)',
        color: '#FFF8DC',
        border: '1px solid rgba(212,175,55,0.5)',
        boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        fontSize: '0.72rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      <ArrowLeft style={{ width: 16, height: 16 }} />
      Back
    </button>
  );
}
