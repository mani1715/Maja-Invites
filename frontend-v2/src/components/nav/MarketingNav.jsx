import { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import './marketing-nav.css';

const DEFAULT_CTA = { label: 'Join Pixora', to: '/signup' };

export default function MarketingNav({ links = NAV_LINKS, cta = DEFAULT_CTA }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);

  // Navigation closes the drawer; so does Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Primary curated desktop links for clean alignment and no edge cramping
  const desktopLinks = [
    { label: 'Designs', to: '/browse' },
    { label: 'Portfolios', to: '/portfolio-samples' },
    { label: 'Community', to: '/community' },
    { label: 'Features', to: '/features' },
    { label: 'Pricing', to: '/pricing' },
    { label: 'How it works', to: '/how-it-works' },
  ];

  return (
    <header className="mjmnav" aria-label="Main navigation">
      <div className="mjmnav-container">
        {/* Brand matching Landing's elegant typography */}
        <Link to="/" className="mjmnav-brand" aria-label="Pixora home">
          <span className="mjmnav-monogram">p<span>✦</span></span>
          <span className="mjmnav-title">
            pixora
            <small>by MAJA Invites</small>
          </span>
        </Link>

        {/* Center Desktop Navigation */}
        <nav className="mjmnav-desktop-links" aria-label="Desktop navigation">
          {desktopLinks.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className={`mjmnav-link ${pathname === l.to ? 'is-active' : ''}`}
              aria-current={pathname === l.to ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right side actions */}
        <div className="mjmnav-actions">
          <Link to="/signin" className="mjmnav-signin">Sign in</Link>
          {cta && (
            <Link to={cta.to} className="mjmnav-cta">
              <span>{cta.label}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mjmnav-arrow">
                <path d="M4 12h16m-6-6 6 6-6 6" />
              </svg>
            </Link>
          )}

          {/* Hamburger for mobile */}
          <button
            type="button"
            className="mjmnav-burger"
            ref={trigger}
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
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div id="mjmnav-drawer" className="mjmnav-drawer">
          <div className="mjmnav-drawer-links">
            <Link to="/" className={`mjmnav-drawer-link ${pathname === '/' ? 'is-active' : ''}`}>Home</Link>
            <Link to="/browse" className={`mjmnav-drawer-link ${pathname === '/browse' ? 'is-active' : ''}`}>Designs</Link>
            <Link to="/portfolio-samples" className={`mjmnav-drawer-link ${pathname === '/portfolio-samples' ? 'is-active' : ''}`}>Portfolios</Link>
            <Link to="/community" className={`mjmnav-drawer-link ${pathname === '/community' ? 'is-active' : ''}`}>Community</Link>
            <Link to="/features" className={`mjmnav-drawer-link ${pathname === '/features' ? 'is-active' : ''}`}>Features</Link>
            <Link to="/pricing" className={`mjmnav-drawer-link ${pathname === '/pricing' ? 'is-active' : ''}`}>Pricing</Link>
            <Link to="/how-it-works" className={`mjmnav-drawer-link ${pathname === '/how-it-works' ? 'is-active' : ''}`}>How it works</Link>
            <Link to="/faq" className={`mjmnav-drawer-link ${pathname === '/faq' ? 'is-active' : ''}`}>FAQ</Link>
            <Link to="/contact" className={`mjmnav-drawer-link ${pathname === '/contact' ? 'is-active' : ''}`}>Contact</Link>
            <div className="mjmnav-drawer-divider" />
            <Link to="/signin" className="mjmnav-drawer-link">Sign in</Link>
            <Link to={cta?.to || '/signup'} className="mjmnav-drawer-cta">{cta?.label || 'Join Pixora'}</Link>
          </div>
        </div>
      )}
    </header>
  );
}
