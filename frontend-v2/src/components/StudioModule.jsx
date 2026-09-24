import { useEffect, useState } from 'react';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
// Shared panel/stat/table primitives — see AdminModule for the same note.
import './weddingModule.css';

export { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';
export { useAsync, Loading, ErrorPanel, numberFmt, rupees, shortDate, relTime } from '@/components/AdminModule';

/** Shell for studio-level (not per-wedding) pages: Earnings, Insights, Staff,
 *  Security, Audit, White-label, Calendar, Storage. */
export default function StudioModule({ active, title, sub, actions, children }) {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { document.title = `${title} — MAJA Studio`; }, [title]);

  const isMobile = vw < 900;
  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const pad = vw < 400 ? '24px 16px 44px' : (isMobile ? '28px 22px 48px' : (vw < 1200 ? '32px 30px 52px' : '40px 48px 56px'));

  return (
    <div className="wmod-root">
      <MobileNav panel="studio" active={active} />
      <div className="wmod-shell" style={{ gridTemplateColumns: shellCols }}>
        {!isMobile && <StudioNav active={active} />}
        <main id="main-content" className="wmod-main" style={{ padding: pad }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 400, fontSize: 'clamp(26px,4vw,38px)', lineHeight: 1.15, margin: '0 0 6px' }}>
                {title}
              </h1>
              {sub && <p style={{ fontSize: 14, color: 'var(--mj-muted)', margin: 0, maxWidth: '68ch', lineHeight: 1.6 }}>{sub}</p>}
            </div>
            {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
