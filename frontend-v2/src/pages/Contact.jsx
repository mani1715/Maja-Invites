import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { LINK, SUPPORT_EMAIL } from '@/lib/marketingLinks';
import './Contact.css';
import useSeo from '@/lib/useSeo';

// WhatsApp support line — deliberately NOT hard-coded. 919876543210 is the
// standard Indian placeholder number; shipping it as a "WhatsApp us" link
// would present an unmonitored line as a real support channel. Set
// VITE_SUPPORT_WHATSAPP (bare digits, e.g. 91XXXXXXXXXX) at build time to a
// REAL, staffed WhatsApp Business number to turn the CTA back on.
const SUPPORT_WHATSAPP_URL = (() => {
  const n = (import.meta.env.VITE_SUPPORT_WHATSAPP || '').trim();
  return n ? `https://wa.me/${n}` : '';
})();

// Ported from "MAJA Contact Support.dc.html". The DC mock posts to a ticket
// API and shows a signed-in user's open tickets. Neither is available here:
// POST /api/support/tickets requires an authenticated buyer session
// (support_tickets.py — get_current_buyer), so an anonymous marketing visitor
// can't create one, and there's no public GET for "my tickets" to show either.
// The form composes a mailto: instead (per lane brief), and the "open tickets"
// panel is dropped rather than shown with fabricated data — that belongs on
// an authenticated account page, not this one.
const CATEGORIES = ['Community', 'Invitation', 'Portfolio', 'Something broken'];

export default function Contact() {
  useSeo({ title: 'Contact', description: 'Get in touch with the MAJA Invites team about an order, a link, or a partnership.' });
  const [cat, setCat] = useState('Invitation');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [orderId, setOrderId] = useState('');
  const [sent, setSent] = useState(false);

  const ready = subject.trim() && message.trim() && email.trim();

  const submit = () => {
    if (!ready) return;
    const body = [
      `Category: ${cat}`,
      orderId.trim() ? `Order / invite ID: ${orderId.trim()}` : null,
      `From: ${email.trim()}`,
      '',
      message.trim(),
    ].filter(Boolean).join('\n');
    const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${cat}] ${subject.trim()}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setSent(true);
  };

  const reset = () => { setSent(false); setSubject(''); setMessage(''); };

  return (
    <div className="mjc-page">
      <MarketingNav />

      <header className="px-aurora mjc-hero">
        <span aria-hidden="true" className="px-ripple" />
        <span aria-hidden="true" className="px-petal" style={{ left: '11%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '32%', width: 10, height: 14, opacity: .45, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '57%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '80%', animationDuration: '16s', animationDelay: '-11s' }} />
        <div className="mjc-hero-inner">
          <p className="mjc-eyebrow">Support</p>
          <h1 className="mjc-h1">A real person<br /><span className="mjc-accent">reads every message.</span></h1>
          <p className="mjc-lead">
            {SUPPORT_WHATSAPP_URL
              ? 'Tell us what is happening and we will reply within one working day. If your event is inside 48 hours, message us on WhatsApp and we will move you to the front.'
              : 'Tell us what is happening and we will reply within one working day. If your event is inside 48 hours, email us and flag it urgent — we will move you to the front.'}
          </p>
        </div>
      </header>

      <div className="mjc-body">
        <div className="mjc-form-card">
          {sent ? (
            <div className="mjc-sent">
              <div className="mjc-sent-check">&#10003;</div>
              <h2>Your email app should be open.</h2>
              <p>We&rsquo;ve filled in your message to {SUPPORT_EMAIL} — just hit send from there. If nothing opened, write to us directly at that address.</p>
              <button onClick={reset} className="mjc-btn-outline">Raise another</button>
            </div>
          ) : (
            <>
              <h2>Raise a ticket</h2>
              <p className="mjc-form-sub">Pick what it is about, so it reaches the right desk.</p>

              <p className="mjc-label-lg">Category</p>
              <div className="mjc-cats">
                {CATEGORIES.map((label) => (
                  <button key={label} className={cat === label ? 'is-on' : ''} onClick={() => setCat(label)}>{label}</button>
                ))}
              </div>

              <label className="mjc-label" htmlFor="mjc-subject">Subject</label>
              <input id="mjc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="mjc-input" />

              <label className="mjc-label" htmlFor="mjc-message">Message</label>
              <textarea id="mjc-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={7} placeholder="Tell us what's happening…" className="mjc-textarea" />

              <div className="mjc-two-col">
                <div>
                  <label className="mjc-label" htmlFor="mjc-email">Your email</label>
                  <input id="mjc-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mjc-input" />
                </div>
                <div>
                  <label className="mjc-label" htmlFor="mjc-order-id">Order or invite ID</label>
                  <input id="mjc-order-id" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Optional" className="mjc-input" />
                </div>
              </div>

              <button onClick={submit} disabled={!ready} className="mjc-submit">Send to support</button>
              <p className="mjc-validation" style={{ color: ready ? 'var(--mj-muted)' : 'var(--mj-error-text)' }}>
                {ready ? 'This opens your email app with the message ready to send.' : 'Subject, message and email are needed.'}
              </p>
            </>
          )}
        </div>

        <div className="mjc-side">
          <div className="mjc-card">
            <h3>Reach us directly</h3>
            <div className="mjc-reach">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <span className="mjc-reach-label">Email</span>
                <span className="mjc-reach-value">{SUPPORT_EMAIL}</span>
              </a>
              {SUPPORT_WHATSAPP_URL && (
                <a href={SUPPORT_WHATSAPP_URL}>
                  <span className="mjc-reach-label">WhatsApp</span>
                  <span className="mjc-reach-value">Message us</span>
                </a>
              )}
              <div>
                <span className="mjc-reach-label">Hours</span>
                <span className="mjc-reach-hours">Mon&ndash;Sat, 10am&ndash;7pm IST</span>
              </div>
            </div>
          </div>

          <div className="mjc-card">
            <h3>Faster than a ticket</h3>
            <p className="mjc-card-sub">Most questions are already answered.</p>
            <div className="mjc-quick-links">
              <Link to="/faq" className="mjc-btn-outline">Frequently asked questions</Link>
              <Link to={LINK.refund} className="mjc-btn-outline">Refunds &amp; cancellations</Link>
              <Link to="/how-it-works" className="mjc-btn-outline">How MAJA works</Link>
            </div>
          </div>

          <div className="mjc-card mjc-card-dark">
            <p className="mjc-dark-eyebrow">Event in 48 hours?</p>
            {SUPPORT_WHATSAPP_URL ? (
              <>
                <p className="mjc-dark-body">Message us on WhatsApp. We keep a line open for events happening this week.</p>
                <a href={SUPPORT_WHATSAPP_URL} className="mjc-btn-light">WhatsApp us</a>
              </>
            ) : (
              <>
                <p className="mjc-dark-body">Email us and flag it urgent — we keep an eye out for events happening this week.</p>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mjc-btn-light">Email us</a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
