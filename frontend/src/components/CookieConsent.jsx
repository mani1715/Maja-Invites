import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * CookieConsent — a lightweight, GDPR/DPDP-style consent banner.
 *
 * - Strictly-necessary cookies are always on (sessions, security) and need no
 *   consent. Analytics + marketing are OFF until the visitor opts in.
 * - The choice is the source of truth for gating and lives in localStorage
 *   (`maja_cookie_consent`); it is ALSO posted to /api/public/cookie-consent so
 *   we keep an auditable proof-of-consent record (DPDP).
 * - Other code can gate optional scripts with `hasConsent('analytics')` and can
 *   react to changes via the `maja-consent-change` window event.
 *
 * Hidden on the couple's guest invitation ("/invite/*"), which must stay free of
 * MAJA chrome and uses strictly-necessary cookies only.
 */

const STORAGE_KEY = 'maja_cookie_consent';
const POLICY_VERSION = '1.0';

export function getStoredConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function hasConsent(category) {
  const c = getStoredConsent();
  if (!c) return false;
  if (category === 'necessary') return true;
  return !!c[category];
}

function persist(choice) {
  const record = {
    analytics: !!choice.analytics,
    marketing: !!choice.marketing,
    version: POLICY_VERSION,
    ts: new Date().toISOString(),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* private mode */ }
  // Fire-and-forget audit record. Never block the UI on it.
  try {
    fetch('/api/public/cookie-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: choice.action || 'save',
        analytics: record.analytics,
        marketing: record.marketing,
        version: POLICY_VERSION,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch (_) { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('maja-consent-change', { detail: record })); } catch (_) { /* ignore */ }
  return record;
}

export default function CookieConsent() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  // Show once, only if no choice is stored yet. Delay a tick so it never blocks
  // first paint / LCP.
  useEffect(() => {
    if (getStoredConsent()) return undefined;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Never on the guest invitation.
  if (pathname.startsWith('/invite/')) return null;
  if (!open) return null;

  const choose = (choice) => { persist(choice); setOpen(false); };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[130] px-3 pb-3 pointer-events-none"
    >
      <div
        className="pointer-events-auto mx-auto max-w-3xl rounded-2xl p-4 md:p-5"
        style={{
          background: 'var(--lux-chrome, rgba(20,15,8,0.96))',
          border: '1px solid rgba(212,175,55,0.45)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: 'var(--lux-text, #F5ECD8)',
        }}
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--lux-text-muted, #C9Bd9a)' }}>
          We use strictly-necessary cookies to run MAJA Invites (sign-in, security). With your
          permission we also use optional <strong style={{ color: 'var(--lux-text)' }}>analytics</strong> and{' '}
          <strong style={{ color: 'var(--lux-text)' }}>marketing</strong> cookies to improve the product.
          You can change this anytime. See our{' '}
          <Link to="/cookies" style={{ color: '#E8C97A' }}>Cookie Policy</Link>.
        </p>

        {customize && (
          <div className="mt-3 grid gap-2" style={{ fontSize: 13 }}>
            <label className="flex items-center gap-2" style={{ color: 'var(--lux-text-muted)', opacity: 0.7 }}>
              <input type="checkbox" checked readOnly aria-label="Strictly necessary (always on)" />
              Strictly necessary — always on
            </label>
            <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--lux-text)' }}>
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              Analytics — help us improve
            </label>
            <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--lux-text)' }}>
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              Marketing — measure campaigns
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => choose({ analytics: true, marketing: true, action: 'accept_all' })}
            className="lux-btn !px-4 !py-2 !text-xs"
            data-testid="cookie-accept-all"
          >
            Accept all
          </button>
          <button
            onClick={() => choose({ analytics: false, marketing: false, action: 'reject_all' })}
            className="lux-btn lux-btn-ghost !px-4 !py-2 !text-xs"
            data-testid="cookie-reject"
          >
            Reject non-essential
          </button>
          {customize ? (
            <button
              onClick={() => choose({ analytics, marketing, action: 'save' })}
              className="lux-btn lux-btn-ghost !px-4 !py-2 !text-xs"
              data-testid="cookie-save"
            >
              Save choices
            </button>
          ) : (
            <button
              onClick={() => setCustomize(true)}
              className="!px-3 !py-2 !text-xs underline"
              style={{ color: 'var(--lux-text-muted)', background: 'transparent', border: 'none' }}
              data-testid="cookie-customize"
            >
              Customize
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
