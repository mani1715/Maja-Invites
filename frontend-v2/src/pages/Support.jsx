import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import FeatureWishForm from '@/components/FeatureWishForm';
import * as catalog from '@/api/publicCatalog';
import './Support.css';

// Real support ticketing. The Contact page composes a mailto:, which meant
// tickets never entered the system the admin console reads — this page posts
// to /api/support/tickets so a request actually lands in the queue and can be
// tracked. Contact stays as the informal "just email us" route.

const CATEGORIES = [
  ['order', 'An order or payment'],
  ['invitation', 'A live invitation link'],
  ['gallery', 'Photos, gallery or face match'],
  ['account', 'My account or sign-in'],
  ['other', 'Something else'],
];

export default function Support() {
  useSeo({
    title: 'Support',
    description: 'Raise a support request with the MAJA Invites team and track it to resolution.',
  });

  const [f, setF] = useState({ category: 'order', subject: '', message: '', email: '', order_id: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState(null);

  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(null); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!f.subject.trim()) errs.subject = 'A one-line summary helps us route it.';
    if (f.message.trim().length < 20) errs.message = 'Tell us a bit more — at least a sentence or two.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errs.email = 'We need an email to reply to.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSending(true);
    setErr(null);
    try {
      const { data } = await catalog.createTicket({
        category: f.category,
        subject: f.subject.trim(),
        message: f.message.trim(),
        email: f.email.trim(),
        order_id: f.order_id.trim() || null,
      });
      setSent(data?.ticket_id || data?.id || true);
    } catch (e2) {
      setErr(e2?.response?.data?.detail
        || `Could not raise the ticket. Email ${SUPPORT_EMAIL} and we will pick it up there.`);
    } finally { setSending(false); }
  };

  return (
    <div className="sup-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora sup-hero">
        <div className="sup-hero-inner">
          <p className="sup-eyebrow">Support</p>
          <h1 className="sup-h1">Tell us what went wrong</h1>
          <p className="sup-sub">
            Every request here goes into the same queue our team works from, so
            nothing gets lost in an inbox. We answer in order, urgent things first.
          </p>
        </div>
      </header>

      <main id="main-content" className="sup-body">
        {sent ? (
          <div className="sup-card sup-card--done" role="status">
            <h2 className="sup-done-title">We have it.</h2>
            <p className="sup-done-body">
              {typeof sent === 'string' && (
                <>Your reference is <code>{sent}</code>. </>
              )}
              We have emailed a copy to <strong>{f.email}</strong>. If this is
              about a wedding that is happening in the next 48 hours, reply to
              that email and say so — it moves you up the queue.
            </p>
            <div className="sup-done-actions">
              <Link className="sup-btn sup-btn--primary" to="/">Back to home</Link>
              <button
                type="button"
                className="sup-btn sup-btn--ghost"
                onClick={() => { setSent(null); setF({ category: 'order', subject: '', message: '', email: f.email, order_id: '' }); }}
              >
                Raise another
              </button>
            </div>
          </div>
        ) : (
          <form className="sup-card" onSubmit={submit}>
            {err && <div className="sup-error" role="alert">{err}</div>}

            <div className="sup-field">
              <label className="sup-label" htmlFor="s-cat">What is it about?</label>
              <select id="s-cat" data-mj-field className="sup-input" value={f.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>

            <div className="sup-field">
              <label className="sup-label" htmlFor="s-sub">Summary</label>
              <input id="s-sub" data-mj-field className="sup-input" value={f.subject} onChange={(e) => set('subject', e.target.value)} placeholder="Guests can't open the live gallery" />
              {errors.subject && <p className="sup-err">{errors.subject}</p>}
            </div>

            <div className="sup-field">
              <label className="sup-label" htmlFor="s-msg">What happened?</label>
              <textarea id="s-msg" data-mj-field className="sup-input sup-textarea" rows={7} value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="What you did, what you expected, and what happened instead. Links and screenshots help." />
              {errors.message && <p className="sup-err">{errors.message}</p>}
            </div>

            <div className="sup-row">
              <div className="sup-field">
                <label className="sup-label" htmlFor="s-em">Your email</label>
                <input id="s-em" data-mj-field className="sup-input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
                {errors.email && <p className="sup-err">{errors.email}</p>}
              </div>
              <div className="sup-field">
                <label className="sup-label" htmlFor="s-oid">Order reference</label>
                <input id="s-oid" data-mj-field className="sup-input" value={f.order_id} onChange={(e) => set('order_id', e.target.value)} placeholder="Optional" />
                <p className="sup-hint">On your receipt, e.g. MAJA-FB9EFC.</p>
              </div>
            </div>

            <button type="submit" className="sup-btn sup-btn--primary sup-submit" disabled={sending}>
              {sending ? 'Sending…' : 'Raise a ticket'}
            </button>

            <p className="sup-foot">
              Prefer email? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              For anything about your data, see <Link to="/privacy" data-mj-link>Privacy</Link>.
            </p>
          </form>
        )}

        {/* The other half of /admin/feature-wishes: without a way in, that
            queue can never fill. Support is where people already come when
            the product does not do what they need. */}
        <section className="sup-wish" aria-label="Request a feature">
          <FeatureWishForm source="support" />
        </section>
      </main>
    </div>
  );
}
