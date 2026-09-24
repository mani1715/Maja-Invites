import { useEffect, useState } from 'react';
import * as api from '@/api/publicCatalog';
import './featureWish.css';

// "Ask for a feature" — a buyer describes something they want and would pay
// for, and the team calls them back. The admin queue for these exists at
// /admin/feature-wishes; without this form nothing can ever reach it.
//
// The consent wording is FETCHED, not written here. The backend stores the
// exact string it serves alongside each request, so if this component wrote
// its own copy the stored consent record would be a claim about what the
// buyer read rather than the thing itself.
//
// Server rules worth matching in the UI so people are not rejected after
// typing everything out: text >= 5 chars (max 1200), a real phone number, and
// consent_call must be ticked. It also rate-limits per phone per day.

const MAX_FALLBACK = 1200;

export default function FeatureWishForm({ source = 'cart', designId = '', orderId = '' }) {
  const [meta, setMeta] = useState(null);
  const [f, setF] = useState({ text: '', phone: '', name: '', email: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let dead = false;
    api.wishConsent()
      .then((r) => { if (!dead) setMeta(r.data); })
      .catch(() => { if (!dead) setMeta({}); });
    return () => { dead = true; };
  }, []);

  const maxText = meta?.max_text || MAX_FALLBACK;
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(''); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.submitWish({
        ...f,
        text: f.text.trim(),
        phone: f.phone.trim(),
        source,
        design_id: designId,
        order_id: orderId,
        consent_call: consent,
      });
      setDone(true);
    } catch (e2) {
      // The server writes these messages for humans — show them as-is rather
      // than replacing them with something vaguer.
      setErr(e2?.response?.data?.detail || 'That did not go through. Please try again.');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="mj-wish mj-wish--done" role="status">
        <h3>We have your request</h3>
        <p>
          Someone from the team will call you on the number you gave. Nothing has been
          charged, and your existing invitation is untouched.
        </p>
      </div>
    );
  }

  const tooShort = f.text.trim().length > 0 && f.text.trim().length < 5;
  const canSend = f.text.trim().length >= 5 && f.phone.trim().length >= 6 && consent;

  return (
    <form className="mj-wish" onSubmit={submit}>
      <h3>Need something that isn't here?</h3>
      <p className="mj-wish-lede">
        Describe it and we will call you back. This is a request, not an order — the
        feature and its price are agreed on the call.
      </p>

      {err && <p className="mj-wish-err" role="alert">{err}</p>}

      <label className="mj-wish-label" htmlFor="wish-text">What do you need?</label>
      <textarea
        id="wish-text"
        className="mj-wish-input"
        rows={4}
        maxLength={maxText}
        value={f.text}
        onChange={set('text')}
        placeholder="For example: a countdown in Telugu, or a separate page for the sangeet."
        required
      />
      <p className="mj-wish-hint">
        {tooShort ? 'A few more words, so we know what to quote.' : `${f.text.length} / ${maxText}`}
      </p>

      <div className="mj-wish-row">
        <div>
          <label className="mj-wish-label" htmlFor="wish-phone">Phone</label>
          <input
            id="wish-phone"
            className="mj-wish-input"
            value={f.phone}
            onChange={set('phone')}
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            required
          />
        </div>
        <div>
          <label className="mj-wish-label" htmlFor="wish-name">Name <span>(optional)</span></label>
          <input id="wish-name" className="mj-wish-input" value={f.name} onChange={set('name')} autoComplete="name" />
        </div>
      </div>

      <label className="mj-wish-label" htmlFor="wish-email">Email <span>(optional)</span></label>
      <input id="wish-email" className="mj-wish-input" type="email" value={f.email} onChange={set('email')} autoComplete="email" />

      <label className="mj-wish-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{meta?.consent_text || 'I agree to be contacted on this number about my request.'}</span>
      </label>

      <button type="submit" className="mj-wish-btn" disabled={busy || !canSend}>
        {busy ? 'Sending…' : 'Send my request'}
      </button>
    </form>
  );
}
