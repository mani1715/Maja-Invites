import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './nav.css';

// Ported from "MAJA Mobile Nav.dc.html". Shown below `breakpoint` px (default 900).
// The ID-scoped studio surfaces (gallery, QR codes, wedding detail) stay reached
// from dashboard rows, not from static nav links — a wedding has to be chosen
// first, so they cannot be top-level.
// The `admin` panel mirrors AdminNav group-for-group; without it the whole
// super-admin console had no navigation at all on a phone.
const PANELS = {
  studio: {
    brand: 'MAJA Studio', home: '/studio/storage',
    groups: [
      ['Main Navigation', [
        ['Storage', '/studio/storage'],
        ['Wedding Invitations', '/studio/invitations'],
        ['Portfolio', '/studio/portfolio'],
        ['Clients', '/studio/clients'],
        ['Notifications', '/studio/notifications'],
      ]],
    ],
  },
  admin: {
    brand: 'Super Admin', home: '/admin/dashboard',
    groups: [
      ['Operations', [
        ['Console', '/admin/dashboard'],
        ['Events', '/admin/events'],
        ['Face ops', '/admin/face-ops'],
        ['Fulfillment', '/admin/fulfillment'],
        ['Build queue', '/admin/build-queue'],
        ['Delivery', '/admin/delivery'],
        ['QR analytics', '/admin/qr-analytics'],
      ]],
      ['Customer', [
        ['Support', '/admin/support'],
        ['Disputes', '/admin/disputes'],
        ['Approvals', '/admin/approvals'],
        ['Moderation', '/admin/moderation'],
      ]],
      ['Money', [
        ['Pricing hub', '/admin/pricing'],
        ['Profitability', '/admin/profitability'],
        ['Business intelligence', '/admin/bi'],
        ['Marketplace', '/admin/marketplace'],
        ['Feature wishes', '/admin/feature-wishes'],
      ]],
      ['Platform', [
        ['System health', '/admin/system-health'],
        ['Feature flags', '/admin/feature-flags'],
        ['Storage', '/admin/storage'],
        ['Storage pool', '/admin/storage-pool'],
        ['Access control', '/admin/access-control'],
        ['Investigation', '/admin/investigation'],
        ['Food donation', '/admin/food-donation'],
      ]],
    ],
  },
};

const THEME = {
  bg: 'rgba(255,255,255,.60)', solid: '#f5f3ff', border: '#e5e7eb', fg: '#111827', dim: '#4b5563', label: '#4b5563',
  activeBg: '#a78bfa', activeFg: '#2e1065', tagBg: '#ddd6fe', tagFg: '#6d28d9', hoverBg: '#ede9fe',
  glassImg: 'linear-gradient(180deg,rgba(255,255,255,.42),rgba(237,233,254,.34)),radial-gradient(120% 140% at 0% 0%,rgba(167,139,250,.22),transparent 66%)',
  glassBorder: 'rgba(221,214,254,.9)', barShadow: '0 8px 24px rgba(124,58,237,.10)', drawerShadow: '0 20px 50px rgba(124,58,237,.14)',
};

export default function MobileNav({ panel = 'studio', active = '', breakpoint = 900 }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();
  // Clear the session before landing on /auth — SignIn bounces any
  // still-authenticated admin straight back to the dashboard.
  const onLogout = async (e) => {
    e.preventDefault();
    setOpen(false);
    await logout();
    navigate('/auth', { replace: true });
  };
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const lockedRef = useRef(false);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  const shown = vw < breakpoint;
  useEffect(() => {
    const lock = open && shown;
    if (lock !== lockedRef.current) {
      lockedRef.current = lock;
      document.body.style.overflow = lock ? 'hidden' : '';
    }
  }, [open, shown]);

  if (!shown) return null;

  const P = PANELS[panel] || PANELS.studio;
  const theme = THEME;
  const drawerW = vw >= 640 ? '380px' : '84%';
  const drawerMax = vw >= 640 ? '380px' : '320px';

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div
        className="mjn-glass"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, minHeight: 58, padding: '0 16px',
          '--mjn-solid': theme.solid, backgroundColor: theme.bg, backgroundImage: theme.glassImg,
          borderBottom: `1px solid ${theme.glassBorder}`, boxShadow: theme.barShadow,
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Open menu"
          aria-expanded={open}
          style={{ width: 44, height: 44, marginLeft: -10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span style={{ width: 20, height: 1.5, background: theme.fg, display: 'block' }} />
          <span style={{ width: 20, height: 1.5, background: theme.fg, display: 'block' }} />
          <span style={{ width: 14, height: 1.5, background: theme.fg, display: 'block' }} />
        </button>
        <Link to={P.home} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: theme.fg, minWidth: 0 }}>
          <span style={{ width: 26, height: 26, border: `1.5px solid ${theme.fg}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Spectral',serif", fontSize: 13, flex: 'none' }}>M</span>
          <span style={{ fontFamily: "'Spectral',serif", fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{P.brand}</span>
        </Link>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: theme.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '42%' }}>{active}</span>
      </div>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(46,16,101,.45)', animation: 'mjFade .24s cubic-bezier(.22,.61,.36,1) both' }} />
          <nav
            className="mjn-glass mjn-drawer"
            style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: drawerW, maxWidth: drawerMax,
              '--mjn-solid': theme.solid, backgroundColor: theme.bg, backgroundImage: theme.glassImg,
              borderRight: `1px solid ${theme.glassBorder}`, borderRadius: '0 20px 20px 0', boxShadow: theme.drawerShadow,
              overflowY: 'auto', padding: '22px 16px calc(32px + env(safe-area-inset-bottom))',
              animation: 'mjSlideL .34s cubic-bezier(.16,1,.3,1) both', boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontFamily: "'Spectral',serif", fontSize: 16, fontWeight: 500, color: theme.fg }}>{P.brand}</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" style={{ width: 44, height: 44, marginRight: -10, background: 'none', border: 'none', fontSize: 22, lineHeight: 1, color: theme.dim, cursor: 'pointer' }}>&times;</button>
            </div>
            {P.groups.map(([title, items]) => (
              <div key={title} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, letterSpacing: '.09em', textTransform: 'uppercase', color: theme.label, margin: '0 0 8px', padding: '0 14px' }}>{title}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {items.map(([label, href, tag]) => {
                    const on = label === active;
                    return (
                      <Link
                        key={href}
                        to={href}
                        onClick={() => setOpen(false)}
                        style={{ minHeight: 46, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderRadius: 14, textDecoration: 'none', fontSize: 14.5, background: on ? theme.activeBg : 'transparent', color: on ? theme.activeFg : theme.dim, fontWeight: on ? 600 : 400 }}
                      >
                        {label}
                        {tag && (
                          <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: theme.tagBg, color: theme.tagFg }}>
                            {tag}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
              <Link to="/auth" onClick={onLogout} style={{ minHeight: 46, display: 'flex', alignItems: 'center', padding: '0 14px', borderRadius: 14, textDecoration: 'none', fontSize: 14, color: theme.dim }}>Log out</Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
