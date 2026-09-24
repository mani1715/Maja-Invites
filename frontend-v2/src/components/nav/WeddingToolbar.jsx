import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './nav.css';

// Per-wedding tab rail. Ported from "MAJA Wedding Toolbar.dc.html".
//
// The tab set is deliberately GROUPED rather than one tab per legacy screen:
// the legacy panel had 15 sibling routes under /studio/profile/:id/*, which as
// a flat rail is unusable on a phone. Related screens fold into one tab and
// switch with an in-page segmented control, so the rail stays at 11.
// Legacy URLs still resolve — App.jsx redirects them onto these.
//
// Order = the photographer's actual workflow (Phase 4): the high-frequency
// photo-delivery operations lead — Gallery (upload photos + AI face match),
// QR codes (the event QR), Live gallery, Album — then guest/host management,
// then setup and analytics. Overview stays first as the landing tab.
const TOOLS = [
  ['Overview', (id) => `/studio/wedding/${id}`],
  ['Gallery', (id) => `/studio/profile/${id}/gallery`],      // upload photos + AI face match
  ['QR codes', (id) => `/studio/profile/${id}/qr-codes`],    // the event QR
  ['Live gallery', (id) => `/studio/wedding/${id}/live-gallery`],
  ['Album', (id) => `/studio/wedding/${id}/album`],
  ['Guests', (id) => `/studio/wedding/${id}/guests`],
  ['Messages', (id) => `/studio/wedding/${id}/messages`],
  ['Gifts', (id) => `/studio/wedding/${id}/gifts`],
  ['Client', (id) => `/studio/wedding/${id}/client`],
  ['Setup', (id) => `/studio/wedding/${id}/setup`],
  ['Analytics', (id) => `/studio/wedding/${id}/analytics`],
];

export default function WeddingToolbar({
  weddingId,
  active = 'Overview',
  title,
  coupleLine,
  backHref = '/studio/dashboard',
  status = 'Draft',
  // The PUBLIC slug. Without it there is no valid invitation URL — the old
  // default built /invite/{weddingId} from the internal UUID, which always
  // 404'd. Absent slug now disables the button instead of offering a dead link.
  slug = null,
}) {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const h1Size = vw < 640 ? 'clamp(24px,6.4vw,28px)' : vw < 1024 ? 'clamp(26px,3.6vw,32px)' : 'clamp(30px,2.6vw,38px)';
  const heading = (title || active).trim();
  const cut = heading.lastIndexOf(' ');
  const titleHead = cut === -1 ? heading : heading.slice(0, cut);
  const titleTail = cut === -1 ? '' : heading.slice(cut + 1);
  const published = status === 'Published';

  const viewBtnStyle = {
    display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px',
    border: '1px solid #6d28d9', borderRadius: 14, background: '#ffffff', color: '#6d28d9',
    fontSize: 13.5, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
  };

  return (
    <div className="mjw-tb" style={{ fontFamily: "'Inter',system-ui,sans-serif", marginBottom: 30 }}>
      <Link to={backHref} data-mj-link style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#4b5563', fontSize: 12.5, marginBottom: 10, minHeight: 44 }}>&larr; All weddings</Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: h1Size, margin: '0 0 6px', lineHeight: 1.15 }}>
            {titleHead}{titleTail && <span style={{ color: '#6d28d9' }}> {titleTail}</span>}
          </h1>
          {coupleLine && <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>{coupleLine}</p>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 12px', borderRadius: 999,
              border: `1px solid ${published ? '#ddd6fe' : '#e5e7eb'}`, background: published ? '#ede9fe' : '#f3f4f6',
              color: published ? '#6d28d9' : '#6b7280', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600,
            }}
          >
            {status}
          </span>
          <Link
            to={`/studio/wedding/${weddingId}/edit`}
            style={{ ...viewBtnStyle, border: 'none', background: '#6d28d9', color: '#fff', boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}
          >
            Edit wedding
          </Link>
          {slug ? (
            <a href={`/invite/${slug}`} target="_blank" rel="noreferrer" style={viewBtnStyle}>
              View invitation
            </a>
          ) : (
            <span
              style={{ ...viewBtnStyle, borderColor: '#e5e7eb', color: '#9ca3af', cursor: 'default' }}
              title="This wedding has no public link yet."
            >
              View invitation
            </span>
          )}
        </div>
      </div>
      <nav className="mjw-rail" aria-label="Wedding sections" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: 6, border: '1px solid #ddd6fe', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)' }}>
        {TOOLS.map(([label, hrefFn]) => {
          const on = label === active;
          return (
            <Link
              key={label}
              to={hrefFn(weddingId)}
              aria-current={on ? 'page' : undefined}
              style={{ flex: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 14, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap', background: on ? '#a78bfa' : 'transparent', color: on ? '#2e1065' : '#4b5563', fontWeight: on ? 600 : 400, boxShadow: on ? '0 10px 26px rgba(109,40,217,.24)' : 'none' }}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
