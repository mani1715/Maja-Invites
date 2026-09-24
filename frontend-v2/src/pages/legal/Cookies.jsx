// TEMPLATE - not legal advice. Structurally complete and DPDP/GDPR-aware, but
// every [BRACKETED] placeholder must be filled and the whole page reviewed by
// a qualified Indian lawyer before it is relied on.
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import { getStoredConsent } from '@/components/CookieConsent';
import useSeo from '@/lib/useSeo';
import './legal.css';

// The cookie policy the consent banner links to. It has to actually match what
// the banner does, so the table below is written from the real categories in
// components/CookieConsent.jsx and backend/consent_routes.py — not boilerplate.

const ROWS = [
  {
    name: 'admin_token',
    cat: 'Strictly necessary',
    what: 'Keeps a signed-in photographer or admin signed in.',
    life: 'Until sign-out or expiry (hours).',
  },
  {
    name: 'maja_rt',
    cat: 'Strictly necessary',
    what: 'Refresh token, so a session can be renewed without re-typing a password.',
    life: 'Until sign-out.',
  },
  {
    name: 'user_session_token',
    cat: 'Strictly necessary',
    what: 'Scoped session for a couple using their access portal.',
    life: 'Session.',
  },
  {
    name: 'maja_cookie_consent',
    cat: 'Strictly necessary',
    what: 'Remembers the choice you made in the cookie banner, so we stop asking.',
    life: '12 months.',
  },
  {
    name: 'maja_device_id',
    cat: 'Strictly necessary',
    what: 'Identifies a device on a live photo wall so an upload can be attributed and rate-limited.',
    life: '12 months.',
  },
  {
    name: 'Analytics',
    cat: 'Analytics (opt-in)',
    what: 'Anonymous page and feature usage. Off unless you switch it on.',
    life: 'Up to 24 months.',
  },
  {
    name: 'Marketing',
    cat: 'Marketing (opt-in)',
    what: 'Measures whether a campaign led to a purchase. Off unless you switch it on.',
    life: 'Up to 24 months.',
  },
];

export default function Cookies() {
  // Without this the tab keeps whatever title the previous route set, and
  // a crawler landing here gets the app shell's default.
  useSeo({ title: 'Cookie Policy', description: 'Which cookies MAJA Invites sets, what each one is for, and how to change your choice.' });
  const consent = getStoredConsent();

  return (
    <div className="mjl-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora mjl-hero">
        <div className="mjl-hero-inner">
          <p className="mjl-eyebrow">Legal</p>
          <h1 className="mjl-h1">Cookie Policy</h1>
          <p className="mjl-updated">Last updated: 13 August 2026</p>
        </div>
      </header>

      <main id="main-content" className="mjl-body">
        <p className="mjl-intro">
          This page explains every cookie and browser-stored value MAJA Invites
          sets, why it is there, and how long it lasts. It is written to match
          what the site actually does — if you find something set that is not
          listed here, tell us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will fix
          the page or remove the cookie.
        </p>

        <section className="mjl-section">
          <h2>1. Your current choice</h2>
          <p>
            {consent ? (
              <>
                You chose: analytics <strong>{consent.analytics ? 'on' : 'off'}</strong>,
                marketing <strong>{consent.marketing ? 'on' : 'off'}</strong>
                {consent.decided_at ? ` on ${new Date(consent.decided_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
                To change it, clear this site&rsquo;s data in your browser and the
                banner will ask again.
              </>
            ) : (
              <>You have not made a choice yet, so only strictly-necessary cookies are set.</>
            )}
          </p>
        </section>

        <section className="mjl-section">
          <h2>2. What we set</h2>
          <div className="mjl-table-wrap">
            <table className="mjl-table">
              <thead>
                <tr><th>Name</th><th>Category</th><th>What it does</th><th>Lifetime</th></tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.name}>
                    <td><code>{r.name}</code></td>
                    <td>{r.cat}</td>
                    <td>{r.what}</td>
                    <td>{r.life}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mjl-section">
          <h2>3. Strictly necessary means strictly necessary</h2>
          <p>
            The cookies in the first category are what make signing in and
            staying signed in work, and what stop the same person uploading a
            thousand photos to a live wall in a minute. There is no version of
            the service that works without them, so they are not presented as a
            choice. They are never used to profile you or sold to anyone.
          </p>
        </section>

        <section className="mjl-section">
          <h2>4. Analytics and marketing are off by default</h2>
          <p>
            Nothing in those two categories loads until you opt in. Rejecting
            them costs you no functionality — the site behaves identically.
            &ldquo;Reject all&rdquo; is deliberately the same size and in the
            same place as &ldquo;Accept all&rdquo;.
          </p>
        </section>

        <section className="mjl-section">
          <h2>5. Guest invitations</h2>
          <p>
            When a guest opens an invitation link, the banner does not appear
            and no optional cookies are set. Those pages use strictly-necessary
            storage only. Your guests never had a relationship with us and we do
            not start one without their knowledge.
          </p>
        </section>

        <section className="mjl-section">
          <h2>6. Proof of consent</h2>
          <p>
            When you make a choice we store a record of it — the choice, the
            policy version, a salted and truncated hash of your IP address, and
            your browser&rsquo;s user-agent string. The hash cannot be reversed
            to identify you; it exists so we can demonstrate under the Digital
            Personal Data Protection Act that consent was given. See our{' '}
            <Link to="/privacy" data-mj-link>Privacy Policy</Link> and{' '}
            <Link to="/data-retention" data-mj-link>Data Retention</Link> pages.
          </p>
        </section>

        <section className="mjl-section">
          <h2>7. Changing your mind</h2>
          <p>
            Clear cookies and site data for this domain in your browser
            settings; the banner will ask again on your next visit. To have the
            stored consent records themselves deleted, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </section>

        <p className="mjl-foot-note">
          Questions about this policy: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          See also <Link to="/terms" data-mj-link>Terms</Link>,{' '}
          <Link to="/privacy" data-mj-link>Privacy</Link> and{' '}
          <Link to="/refund" data-mj-link>Refunds</Link>.
        </p>
      </main>
    </div>
  );
}
