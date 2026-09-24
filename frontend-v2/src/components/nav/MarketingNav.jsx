import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS } from '@/lib/marketingLinks';
import './marketing-nav.css';

// Shared sticky glass nav for the 5 secondary marketing pages (Pricing,
// Features, How It Works, FAQ, Contact) — each .dc.html hand-coded a near
// identical nav, differing only in which links it lists and the CTA label.
// Landing keeps its own bespoke nav (scroll-fade + hamburger drawer), which
// this shape doesn't need.
// Photographer-only pivot: signup is for studios, so the CTA says so.
//
// Below 860px the desktop row is replaced by a hamburger + block drawer: the
// old scrollable-row treatment left Sign in + the CTA outside the scroll
// container, so they rendered past the viewport edge (hidden by the global
// overflow-x clip) and were untappable on every marketing page.
const DEFAULT_CTA = { label: 'Set up your studio', to: '/auth/signup' };

export default function MarketingNav({ links = NAV_LINKS, cta = DEFAULT_CTA }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Navigation closes the drawer; so does Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const navLinks = (
    <>
      {links.map((l) => (
        <Link
          key={l.label}
          to={l.to}
          data-mj-link
          className="mjmnav-link"
          aria-current={pathname === l.to ? 'page' : undefined}
        >
          {l.label}
        </Link>
      ))}
      <Link to="/auth" data-mj-link className="mjmnav-link">Sign in</Link>
      {cta && <Link to={cta.to} className="mjmnav-cta">{cta.label}</Link>}
    </>
  );

  return (
    <nav className="mjmnav px-glass">
      <div className="mjmnav-row">
        <Link to="/" className="mjmnav-brand">
          <span className="mjmnav-logo">M</span>
          <span className="mjmnav-name">MAJA Invites</span>
        </Link>
        <div className="mjmnav-right">{navLinks}</div>
        <button
          type="button"
          className="mjmnav-burger"
          aria-expanded={open}
          aria-controls="mjmnav-drawer"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mjmnav-burger-bar" aria-hidden="true" />
          <span className="mjmnav-burger-bar" aria-hidden="true" />
          <span className="mjmnav-burger-bar" aria-hidden="true" />
        </button>
      </div>
      <div id="mjmnav-drawer" className="mjmnav-drawer" hidden={!open}>
        {navLinks}
      </div>
    </nav>
  );
}
