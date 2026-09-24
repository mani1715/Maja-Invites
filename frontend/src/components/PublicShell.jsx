/**
 * Public site chrome: the top Nav and the Footer.
 *
 * These used to live in pages/LandingPage.jsx and be imported from there by
 * PublicChrome. That made every chrome-using page (photographers, vendors,
 * community, category browser, ...) pull the whole 2,100-line landing page --
 * and with it masterThemes, UniversalDesignRenderer and all 10 theme chunks --
 * just to render a header and a footer. They live here so the chrome is cheap.
 *
 * LandingPage re-exports both for backwards compatibility.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, Menu, Wallet, X as XIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { EASE, DUR, VIEWPORT } from '@/motion/presets';
import '@/styles/luxury.css';

export const Nav = ({ onLogin, user, onOpenAuth, onLogout, onUserDashboard }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const reduce = useReducedMotion();

  // The drawer used to open at a hardcoded top-[54px] while the bar actually
  // measures 68px, so it opened UNDERNEATH the nav and clipped its first row.
  // Measure the bar instead — it changes height between breakpoints (py-3 -> py-5)
  // and when the wordmark wraps, so any constant is wrong somewhere.
  const navRef = useRef(null);
  const [navH, setNavH] = useState(64);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return undefined;
    const measure = () => setNavH(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
  <>
  <motion.nav
    ref={navRef}
    initial={reduce ? false : { opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22,1,0.36,1] }}
    className="fixed top-0 inset-x-0 z-50 px-4 md:px-12 py-3 md:py-4 flex flex-col gap-2 md:gap-2.5"
    style={{ background: 'linear-gradient(180deg, var(--lux-chrome), transparent)', backdropFilter: 'blur(8px)' }}
    data-testid="lux-nav"
  >
    {/* TWO-ROW HEADER — the permanent fix for the wordmark/options overlap.
        Row 1 = brand (logo + "MAJA Invites") on the left + the action buttons on the
        right. Row 2 = the nav options, on their OWN line (desktop only). Because the
        options live on a separate row, they can never sit on top of the wordmark no
        matter how many are added or how narrow the screen. On phones only Row 1 shows
        (logo + hamburger); every link lives in the drawer. */}
    <div className="flex items-center justify-between gap-2 w-full">
    {/* shrink-0 keeps the brand at its natural size (it never collapses onto itself). */}
    <Link to="/" className="flex items-center gap-2 md:gap-3 shrink-0 no-underline" aria-label="Back to home" data-testid="nav-logo-home">
      <img src="/brand/maja-icon-64.png" alt="MAJA Invites"
        width="64" height="64" fetchPriority="high"
        className="w-8 h-8 md:w-9 md:h-9 rounded-full object-cover shrink-0"
        style={{ boxShadow: '0 0 0 1px var(--lux-border-strong), inset 0 0 0 1px rgba(232,199,102,0.18)' }} />
      {/* No `truncate`: with the bar decluttered there is room for the whole
          wordmark, and a brand name rendered as "MA..." is worse than none. */}
      <span className="logo-shimmer font-display text-base md:text-[1.35rem] tracking-wide whitespace-nowrap" style={{ color: 'var(--lux-text)' }}>
        MAJA<span className="text-gold"> </span>Invites
      </span>
    </Link>
    {/* MOBILE ORDER: [Sign in] [hamburger] — hamburger sits hard against the
        right edge, sign-in immediately left of it. The theme toggle and the
        Studio CTA move into the drawer below the xl breakpoint; five controls in
        a 375px bar is what squeezed the wordmark to "MA...". Both stay one tap
        away, and desktop keeps everything inline. */}
    <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
      <span className="hidden lg:inline-flex"><ThemeToggle /></span>
      {user ? (
        <>
          <button
            onClick={onUserDashboard}
            className="lux-btn lux-btn-ghost !px-3 !py-2 md:!px-5 md:!py-2.5 !text-[10px] md:!text-xs whitespace-nowrap !hidden sm:!inline-flex"
            data-testid="nav-user-dashboard"
          >
            My Studio
          </button>
          <a
            href="/cart"
            className="lux-btn !px-3 !py-2 md:!px-5 md:!py-2.5 !text-[10px] md:!text-xs whitespace-nowrap no-underline"
            data-testid="nav-cart"
          >
            <Wallet className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden xs:inline">My&nbsp;</span>Cart
          </a>
          <button onClick={onLogout}
            aria-label="Sign out"
            className="relative lux-tap44 w-9 h-9 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-full grid place-items-center md:inline md:rounded-full text-[10px] tracking-[0.25em] uppercase hover:opacity-80 transition-opacity"
            style={{ color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}
            data-testid="nav-user-logout"
          >
            <span className="hidden md:inline">Sign out</span>
            <span className="md:hidden text-base">↗</span>
          </button>
        </>
      ) : (
        <button onClick={onOpenAuth}
          className="lux-btn lux-btn-ghost !px-3 !py-2 md:!px-5 md:!py-2.5 !text-[10px] md:!text-xs whitespace-nowrap"
          data-testid="nav-user-signin"
        >
          Sign in
        </button>
      )}
      {/* "Pricing" is merged into the Row-2 / drawer "Plans & Pricing" link, so the
          standalone top-right Pricing button was removed. */}
      {/* Photographer Studio entry — only when no user is signed in,
          so the normal user header stays clean (Credits + Sign out + My Profile). */}
      {/* Studio CTA: desktop only. On mobile it lives in the drawer. */}
      {!user && (
        <button onClick={onLogin}
          className="lux-btn !hidden lg:!inline-flex !px-3 !py-2 md:!px-5 md:!py-2.5 !text-[10px] md:!text-xs whitespace-nowrap"
          data-testid="nav-photographer-login"
        >
          <Camera className="w-3.5 h-3.5 md:w-4 md:h-4 md:hidden" />
          <span className="hidden md:inline">Photographer</span>
          <span className="md:hidden">Studio</span>
        </button>
      )}

      {/* Last child = hard against the right border, as asked. */}
      <button onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen}
        data-testid="nav-hamburger"
        className="relative lux-tap44 lg:hidden w-9 h-9 grid place-items-center rounded-lg" style={{ color: 'var(--lux-text)' }}>
        {menuOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
    </div>{/* end Row 1 (brand + actions) */}

    {/* Row 2 — the nav options on their own line (desktop, lg+), LEFT-aligned so they
        begin directly under the logo. Below lg the hamburger drawer carries them.
        flex-wrap is a safety net so a very narrow desktop wraps instead of colliding. */}
    <div className="hidden lg:flex flex-wrap items-center justify-start gap-x-5 xl:gap-x-7 gap-y-1 whitespace-nowrap text-[0.82rem] tracking-[0.18em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
      <Link to="/" className="nav-link hover:text-[var(--lux-gold)] transition-colors" data-testid="nav-home">Home</Link>
      <Link to="/browse" className="nav-link hover:text-[var(--lux-gold)] transition-colors">Themes</Link>
      <Link to="/features" className="nav-link hover:text-[var(--lux-gold)] transition-colors">Features</Link>
      <Link to="/how-it-works" className="nav-link hover:text-[var(--lux-gold)] transition-colors" data-testid="nav-how-it-works">How It Works</Link>
      <Link to="/portfolio-plans" className="nav-link hover:text-[var(--lux-gold)] transition-colors" data-testid="nav-plans-pricing">Plans &amp; Pricing</Link>
      <Link to="/faq" className="nav-link hover:text-[var(--lux-gold)] transition-colors">FAQ</Link>
      <Link to="/story" className="nav-link hover:text-[var(--lux-gold)] transition-colors">Story</Link>
      <Link to="/community" className="nav-link hover:text-[var(--lux-gold)] transition-colors" data-testid="nav-community">Pixora Community</Link>
      <Link to="/photographers" className="nav-link hover:text-[var(--lux-gold)] transition-colors" data-testid="nav-photographers">Find Photographers</Link>
      <Link to="/portfolio-samples" className="nav-link hover:text-[var(--lux-gold)] transition-colors" data-testid="nav-portfolio-samples">Portfolio Designs</Link>
    </div>
  </motion.nav>

  {/* Nav drawer — carries every link below lg, where Row 2 is hidden. */}
  {menuOpen && (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-0 z-40 lg:hidden px-6 py-4 overflow-y-auto"
      style={{ top: navH, maxHeight: `calc(100dvh - ${navH}px)`,
               background: 'var(--lux-chrome)', backdropFilter: 'blur(10px)',
               borderBottom: '1px solid var(--lux-border)' }}
      data-testid="nav-mobile-menu"
    >
      {/* Actions first — what someone opening the menu on a phone actually
          wants — then navigation. min-h-[44px] rows to match the tap-target
          standard used across the panels (these were 40px). */}
      <div className="flex items-center gap-2 mb-3">
        {!user && (
          <button onClick={() => { closeMenu(); onLogin?.(); }}
            className="lux-btn flex-1 justify-center !text-[11px] min-h-[44px]"
            data-testid="nav-photographer-login-mobile">
            <Camera className="w-4 h-4" /> Photographer Studio
          </button>
        )}
        <ThemeToggle />
      </div>

      <div className="flex flex-col text-sm tracking-[0.18em] uppercase" style={{ color: 'var(--lux-text)' }}>
        <Link to="/" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]" data-testid="nav-home-mobile">Home</Link>
        <Link to="/browse" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]">Themes</Link>
        <Link to="/features" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]">Features</Link>
        <Link to="/how-it-works" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]" data-testid="nav-how-it-works-mobile">How It Works</Link>
        <Link to="/portfolio-plans" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]" data-testid="nav-plans-pricing-mobile">Plans &amp; Pricing</Link>
        <Link to="/faq" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]">FAQ</Link>
        <Link to="/story" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]">Story</Link>
        <Link to="/community" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]" data-testid="nav-community-mobile">Pixora Community</Link>
        <Link to="/photographers" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]" data-testid="nav-photographers-mobile">Find Photographers</Link>
        <Link to="/portfolio-samples" onClick={closeMenu} className="min-h-[44px] flex items-center hover:text-[var(--lux-gold)]" data-testid="nav-portfolio-samples-mobile">Portfolio Designs</Link>
      </div>
    </motion.div>
  )}
  </>
  );
};

export const Footer = ({ onSuperAdmin }) => {
  const reduce = useReducedMotion();
  return (
  <motion.footer
    initial={reduce ? false : { y: 60, opacity: 0 }}
    whileInView={{ y: 0, opacity: 1 }}
    viewport={VIEWPORT.once}
    transition={{ duration: DUR.slow, ease: EASE.cinema }}
    className="relative z-10 px-6 md:px-16 py-12 border-t" style={{ borderColor: 'var(--lux-border)' }}>
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm">
      <div className="flex items-center gap-3">
        <img src="/brand/maja-icon-64.png" alt="MAJA Invites"
          width="64" height="64" loading="lazy" decoding="async"
          className="w-7 h-7 rounded-full object-cover"
          style={{ boxShadow: '0 0 0 1px var(--lux-border-strong)' }} />
        <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>MAJA<span className="text-gold"> </span>Invites</span>
      </div>
      <div className="flex flex-wrap items-center gap-6" style={{ color: 'var(--lux-text-muted)' }}>
        <span>© {new Date().getFullYear()} MAJA Invites · Made in India</span>
        {/* Real routes (these used to be on-page #anchors that did nothing on any
            page other than the landing page). Link = SPA nav, no full reload. */}
        <Link to="/features" className="hover:text-[var(--lux-gold)] transition-colors">Features</Link>
        <Link to="/how-it-works" className="hover:text-[var(--lux-gold)] transition-colors">How It Works</Link>
        <Link to="/portfolio-plans" className="hover:text-[var(--lux-gold)] transition-colors">Plans</Link>
        <Link to="/faq" className="hover:text-[var(--lux-gold)] transition-colors">FAQ</Link>
        <Link to="/terms" className="hover:text-[var(--lux-gold)] transition-colors">Terms</Link>
        <Link to="/privacy" className="hover:text-[var(--lux-gold)] transition-colors">Privacy</Link>
        <Link to="/cookies" className="hover:text-[var(--lux-gold)] transition-colors">Cookies</Link>
        <Link to="/refund" className="hover:text-[var(--lux-gold)] transition-colors">Refund</Link>
        <Link to="/data-retention" className="hover:text-[var(--lux-gold)] transition-colors">Data Retention</Link>
        <Link to="/contact" className="hover:text-[var(--lux-gold)] transition-colors">Contact</Link>
        <Link to="/support" className="hover:text-[var(--lux-gold)] transition-colors">Support</Link>
        <button onClick={onSuperAdmin} className="hover:text-[var(--lux-gold)] transition-colors text-left" data-testid="footer-super-admin-link">
          Super Admin
        </button>
      </div>
    </div>
  </motion.footer>
  );
};
