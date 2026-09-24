import { useEffect, useState } from 'react';
import * as api from '@/api/pixora';
import './pixora.css';

// Shared shell + primitives for the Pixora community hub.
//
// The IA (8 groups, each with sub-items) is taken verbatim from the legacy
// PixoraCommunity — that structure was itself a deliberate replacement for an
// unusable 22-tab strip, so re-deriving it would have thrown away a decision
// somebody already made correctly. Only the rendering is new.

export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [gated, setGated] = useState('');
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    setGated('');
    Promise.resolve(fn())
      .then((d) => { if (!dead) setData(d); })
      .catch((e) => {
        if (dead) return;
        const s = e?.response?.status;
        const detail = e?.response?.data?.detail;
        // 403 means the studio's plan does not include this feature; the
        // backend sends the upgrade sentence itself, so pass it through.
        if (s === 403) { setGated(detail || 'Your plan does not include this yet.'); setData(null); return; }
        // 404 on a Pixora sub-feature means that module is not enabled for
        // this deployment — a normal state, not a failure.
        setError(s === 404 ? null : (detail || 'Could not load this.'));
        setData(s === 404 ? [] : null);
      })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, gated, loading, reload: () => setNonce((n) => n + 1) };
}

export function Section({ title, sub, actions, children, flush }) {
  return (
    <section className="pxc-section">
      {(title || actions) && (
        <header className="pxc-section-head">
          <div>
            {title && <h2 className="pxc-section-title">{title}</h2>}
            {sub && <p className="pxc-section-sub">{sub}</p>}
          </div>
          {actions && <div className="pxc-section-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : 'pxc-section-body'}>{children}</div>
    </section>
  );
}

export function Stats({ items }) {
  return (
    <div className="pxc-stats">
      {items.map((s) => (
        <div className="pxc-stat" key={s.label}>
          <span className="pxc-stat-label">{s.label}</span>
          <span className="pxc-stat-value">{s.value}</span>
          {s.hint && <span className="pxc-stat-hint">{s.hint}</span>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, body, action }) {
  return (
    <div className="pxc-empty">
      <p className="pxc-empty-title">{title}</p>
      {body && <p className="pxc-empty-body">{body}</p>}
      {action}
    </div>
  );
}

export function Loading({ rows = 3 }) {
  return (
    <div className="pxc-loading">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="pxc-skel" />)}
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="pxc-error" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="pxc-toastwrap" role="status" aria-live="polite"><div className="pxc-toast">{message}</div></div>;
}

export function useFlash(ms = 2600) {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  return [msg, setMsg];
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pxc-pill pxc-pill--${tone}`}>{children}</span>;
}

export function Field({ label, htmlFor, hint, error, children, wide }) {
  return (
    <div className={`pxc-field${wide ? ' pxc-field--wide' : ''}`}>
      {label && <label className="pxc-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <p className="pxc-hint">{hint}</p>}
      {error && <p className="pxc-err">{error}</p>}
    </div>
  );
}

/** Simple list card used by a dozen panels — avoids twelve near-identical tables. */
export function Rows({ rows, render, empty }) {
  if (!rows || rows.length === 0) return <Empty title={empty || 'Nothing here yet'} />;
  return <ul className="pxc-rows">{rows.map((r, i) => <li key={r.id || r._id || i} className="pxc-row">{render(r, i)}</li>)}</ul>;
}

/** Rupees, the way the rest of the product writes them. */
export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Dependency-free sparkline, carried over from the legacy TrendChart so the
 *  growth screens keep their trend lines without pulling in a chart library. */
export function Trend({ points, height = 90, label }) {
  const vals = (points || []).map((p) => Number(p?.v ?? p ?? 0)).filter(Number.isFinite);
  if (vals.length < 2) {
    return <p className="pxc-hint">{label || 'Not enough history yet — the trend line appears once there are at least two days of data.'}</p>;
  }
  const W = 320;
  const H = height;
  const pad = 6;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = (W - pad * 2) / (vals.length - 1);
  const d = vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(pad + i * step).toFixed(1)} ${(H - pad - ((v - min) / span) * (H - pad * 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend from ${min} to ${max}`}
    >
      <path d={d} fill="none" stroke="var(--mj-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Segmented control used inside a panel that legitimately holds several
 *  distinct workbenches (the legacy Analytics tab held eight). */
export function Segments({ value, onChange, options }) {
  return (
    <div className="pxc-segs" role="tablist">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={`pxc-seg${value === key ? ' pxc-seg--on' : ''}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Shared "this needs a higher plan" state — several panels are plan-gated
 *  server-side and 403 rather than 404. The backend writes the upgrade
 *  sentence itself (which plan, which feature), so it is shown verbatim
 *  rather than paraphrased into something that could contradict it. */
export function PlanGate({ what, message }) {
  return (
    <Empty
      title={what ? `${what} is on a higher plan` : 'This is on a higher plan'}
      body={message || 'Your studio plan does not include this yet. Upgrading unlocks it immediately — nothing here is lost in the meantime.'}
      action={<a className="pxc-btn pxc-btn--primary" href="/studio/plans">See plans</a>}
    />
  );
}

/** Records the once-a-day community-score visit, exactly as legacy did.
 *  Fire-and-forget; a failure must never block the hub. */
export function useCheckin() {
  useEffect(() => { api.checkin().catch(() => {}); }, []);
}
