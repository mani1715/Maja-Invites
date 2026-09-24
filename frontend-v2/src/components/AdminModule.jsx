import { useEffect, useState } from 'react';
import AdminNav from '@/components/nav/AdminNav';
import MobileNav from '@/components/nav/MobileNav';
// The panel/stat/table primitives are generic, not wedding-specific — the
// admin console reuses them verbatim rather than shipping a second copy of the
// same CSS. (Class prefix is historical: they were written for the wedding
// modules first.)
import './weddingModule.css';

export { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';

export function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

/** Shell for every super-admin console page: dark rail + light content,
 *  matching the existing AdminDashboard. */
export default function AdminModule({ active, title, sub, actions, children }) {
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const shellCols = isMobile ? 'minmax(0,1fr)' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const pad = vw < 400 ? '24px 16px 44px' : (isMobile ? '28px 22px 48px' : (vw < 1200 ? '32px 30px 52px' : '40px 48px 56px'));

  useEffect(() => { document.title = `${title} — MAJA Admin`; }, [title]);

  return (
    <div className="wmod-root">
      <MobileNav panel="admin" active={active} />
      <div className="wmod-shell" style={{ gridTemplateColumns: shellCols }}>
        {!isMobile && <AdminNav active={active} />}
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

/** Standard async page state: [state, setState, load] with loading/error. */
export function useAsync(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    Promise.resolve(fetcher())
      .then((d) => { if (!dead) setData(d); })
      .catch((e) => {
        if (dead) return;
        const s = e?.response?.status;
        setError(
          s === 403 ? 'This console needs a super-admin account.'
            : e?.response?.data?.detail || 'Could not load this data.',
        );
      })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1), setData };
}

export function Loading({ rows = 3 }) {
  return (
    <>
      <div className="wmod-stats">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="wmod-skel" style={{ height: 88 }} />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="wmod-skel" style={{ height: 120, marginTop: 16 }} />
      ))}
    </>
  );
}

export function ErrorPanel({ message, onRetry }) {
  return (
    <section className="wmod-panel wmod-panel--error">
      <div className="wmod-panel-body">
        <h2 className="wmod-empty-title">Couldn&rsquo;t load this</h2>
        <p className="wmod-error-body">{message}</p>
        {onRetry && (
          <button type="button" className="wmod-btn wmod-btn--primary" onClick={onRetry}>Try again</button>
        )}
      </div>
    </section>
  );
}

export const numberFmt = new Intl.NumberFormat('en-IN');
export const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

export function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
