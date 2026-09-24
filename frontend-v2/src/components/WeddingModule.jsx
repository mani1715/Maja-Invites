import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import WeddingToolbar from '@/components/nav/WeddingToolbar';
import * as studioApi from '@/api/studio';
import './weddingModule.css';

// Shared chrome for every per-wedding management page (Guests, Messages,
// Gifts, Analytics). Owns the three things each of them would otherwise
// duplicate: the studio shell, the profile fetch that feeds WeddingToolbar
// (slug + published status), and the loading/error states.
//
// Children render the module body and receive the loaded profile.

export function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

export default function WeddingModule({ weddingId, active, title, children }) {
  const vw = useViewportWidth();
  const isMobile = vw < 900;

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    studioApi.getProfile(weddingId)
      .then(({ data }) => setProfile(data))
      .catch((e) => {
        const s = e?.response?.status;
        setError(
          s === 404 ? 'That wedding no longer exists, or it belongs to another studio.'
            : s === 403 ? 'You do not have access to this wedding.'
              : e?.response?.data?.detail || 'Could not load this wedding.',
        );
      })
      .finally(() => setLoading(false));
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  const shellCols = isMobile ? '1fr' : (vw < 1200 ? '76px minmax(0,1fr)' : '250px minmax(0,1fr)');
  const pagePad = vw < 400 ? '22px 14px 44px' : (isMobile ? '24px 18px 48px' : (vw < 1200 ? '32px 28px 52px' : '40px 40px 56px'));

  const names = profile ? [profile.bride_name, profile.groom_name].filter(Boolean).join(' & ') : '';
  const coupleLine = profile?.event_date
    ? `${new Date(profile.event_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}${profile.city ? ` · ${profile.city}` : ''}`
    : '';

  return (
    <div className="wmod-root">
      <MobileNav panel="studio" active="Weddings" />
      <div className="wmod-shell" style={{ gridTemplateColumns: shellCols }}>
        {!isMobile && <StudioNav active="Weddings" />}
        <main id="main-content" className="wmod-main" style={{ padding: pagePad }}>
          <WeddingToolbar
            weddingId={weddingId}
            active={active}
            title={title}
            coupleLine={names ? `${names}${coupleLine ? ` · ${coupleLine}` : ''}` : coupleLine}
            slug={profile?.slug}
            status={profile?.status === 'PUBLISHED' || profile?.is_published ? 'Published' : 'Draft'}
          />

          {loading && <ModuleSkeleton />}

          {!loading && error && (
            <Panel tone="error">
              <h2 className="wmod-empty-title">Couldn&rsquo;t load this wedding</h2>
              <p className="wmod-error-body">{error}</p>
              <div className="wmod-row">
                <button type="button" className="wmod-btn wmod-btn--primary" onClick={load}>Try again</button>
                <Link className="wmod-btn wmod-btn--ghost" to="/studio/dashboard">Back to dashboard</Link>
              </div>
            </Panel>
          )}

          {!loading && !error && profile && children(profile)}
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- primitives

export function Panel({ title, sub, actions, tone, children, pad = true }) {
  return (
    <section className={`wmod-panel${tone === 'error' ? ' wmod-panel--error' : ''}`}>
      {(title || actions) && (
        <header className="wmod-panel-head">
          <div className="wmod-panel-headtext">
            {title && <h2 className="wmod-panel-title">{title}</h2>}
            {sub && <p className="wmod-panel-sub">{sub}</p>}
          </div>
          {actions && <div className="wmod-panel-actions">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'wmod-panel-body' : undefined}>{children}</div>
    </section>
  );
}

export function StatRow({ items }) {
  return (
    <div className="wmod-stats">
      {items.map((s) => (
        <div className="wmod-stat" key={s.label}>
          <p className="wmod-stat-label">{s.label}</p>
          <p className="wmod-stat-value">{s.value}</p>
          {s.hint && <p className="wmod-stat-hint">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="wmod-seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`wmod-seg-btn${on ? ' wmod-seg-btn--on' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
            {typeof o.count === 'number' && <span className="wmod-seg-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ title, body, action }) {
  return (
    <div className="wmod-empty">
      <p className="wmod-empty-title">{title}</p>
      {body && <p className="wmod-empty-body">{body}</p>}
      {action}
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="wmod-toastwrap" role="status" aria-live="polite">
      <div className="wmod-toast">{message}</div>
    </div>
  );
}

export function InlineError({ message }) {
  if (!message) return null;
  return <div className="wmod-inline-error" role="alert">{message}</div>;
}

function ModuleSkeleton() {
  return (
    <>
      <div className="wmod-stats">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="wmod-skel" style={{ height: 88 }} />)}
      </div>
      <div className="wmod-skel" style={{ height: 360, marginTop: 20 }} />
    </>
  );
}

/** Shared toast timer. Returns [message, flash]. */
export function useFlash(ms = 2600) {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  return [msg, setMsg];
}
