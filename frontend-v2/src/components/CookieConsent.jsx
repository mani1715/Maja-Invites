import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import client from '@/api/client';
import './cookieConsent.css';

// GDPR / India DPDP consent banner.
//
// The legacy app shipped one; frontend-v2 did not, which is a compliance
// regression rather than a missing nicety — the platform serves Indian users
// under the DPDP Act and takes payments in the EU-reachable web.
//
// Contract (backend/consent_routes.py):
//   - Strictly-necessary cookies are always on and cannot be refused.
//   - analytics + marketing default OFF and stay off until opted in.
//   - The browser copy is the source of truth for gating; the POST to
//     /api/public/cookie-consent is the auditable proof-of-consent record and
//     is deliberately best-effort (rate-limited server-side, always 200).
//
// Hidden on /invite/* — the guest invitation must stay free of MAJA chrome and
// uses strictly-necessary cookies only.

const STORAGE_KEY = 'maja_cookie_consent';
const POLICY_VERSION = '1.0';

export function getStoredConsent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Gate optional scripts with this. Necessary is always true. */
export function hasConsent(category) {
  if (category === 'necessary') return true;
  const c = getStoredConsent();
  return !!(c && c[category]);
}

function persist(choice, action) {
  const record = {
    analytics: !!choice.analytics,
    marketing: !!choice.marketing,
    version: POLICY_VERSION,
    decided_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch { /* private mode — the banner will simply ask again next visit */ }

  try {
    window.dispatchEvent(new CustomEvent('maja-consent-change', { detail: record }));
  } catch { /* ignore */ }

  // Audit trail. Never awaited and never surfaced: a failure here must not
  // stop the banner dismissing, or the visitor is stuck behind it.
  client.post('/api/public/cookie-consent', {
    action,
    analytics: record.analytics,
    marketing: record.marketing,
    version: POLICY_VERSION,
  }).catch(() => {});

  return record;
}

export default function CookieConsent() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Only ask once a decision has genuinely not been made.
    if (!getStoredConsent()) setOpen(true);
  }, []);

  const hiddenHere = pathname.startsWith('/invite/')
    || pathname.startsWith('/save-the-date/')
    || pathname.startsWith('/e/');

  if (!open || hiddenHere) return null;

  const decide = (choice, action) => {
    persist(choice, action);
    setOpen(false);
  };

  return (
    <div className="mjcc" role="dialog" aria-modal="false" aria-labelledby="mjcc-title">
      <div className="mjcc-card">
        <div className="mjcc-text">
          <h2 className="mjcc-title" id="mjcc-title">Cookies, briefly</h2>
          <p className="mjcc-body">
            We use cookies that are strictly necessary to sign you in and keep
            the site secure — those cannot be switched off. Anything used to
            measure how the site is doing stays off unless you turn it on.{' '}
            <Link to="/cookies" data-mj-link>How we use cookies</Link>
            {' · '}
            <Link to="/privacy" data-mj-link>Privacy</Link>
          </p>

          {detail && (
            <div className="mjcc-options">
              <label className="mjcc-opt mjcc-opt--locked">
                <input type="checkbox" checked disabled />
                <span>
                  <strong>Strictly necessary</strong>
                  <em>Sign-in, security, and remembering this choice. Always on.</em>
                </span>
              </label>
              <label className="mjcc-opt">
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
                <span>
                  <strong>Analytics</strong>
                  <em>Anonymous page and feature usage, so we know what to fix.</em>
                </span>
              </label>
              <label className="mjcc-opt">
                <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                <span>
                  <strong>Marketing</strong>
                  <em>Measuring whether an ad or a campaign actually worked.</em>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="mjcc-actions">
          {!detail && (
            <button type="button" className="mjcc-btn mjcc-btn--ghost" onClick={() => setDetail(true)}>
              Choose
            </button>
          )}
          <button
            type="button"
            className="mjcc-btn mjcc-btn--ghost"
            onClick={() => decide({ analytics: false, marketing: false }, 'reject_all')}
          >
            Reject all
          </button>
          {detail ? (
            <button
              type="button"
              className="mjcc-btn mjcc-btn--primary"
              onClick={() => decide({ analytics, marketing }, 'save')}
            >
              Save choices
            </button>
          ) : (
            <button
              type="button"
              className="mjcc-btn mjcc-btn--primary"
              onClick={() => decide({ analytics: true, marketing: true }, 'accept_all')}
            >
              Accept all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
