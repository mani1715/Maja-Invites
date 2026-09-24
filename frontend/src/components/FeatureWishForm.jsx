/**
 * FeatureWishForm — "I want something that isn't on the list."
 *
 * The buyer describes what they need and leaves a phone number; the owner sees a
 * highlighted lead in the admin panel and calls them to agree the feature and the
 * price. Nothing is charged here and the buyer's existing selection is untouched.
 *
 * Collapsed by default so it never competes with the paid features above it —
 * this is an escape hatch, not a call to action.
 *
 * The consent wording is FETCHED, not hardcoded: the server stores that exact
 * string with the request, so what the buyer reads and what we record must be one
 * string. Hardcoding it here would let the two drift and make the record useless.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageCircle, Check, X, Phone } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function FeatureWishForm({ source = 'cart', designId = '', orderId = '' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentText, setConsentText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || consentText) return;
    axios.get(`${API_URL}/api/feature-wishes/consent`)
      .then((r) => setConsentText(r.data?.consent_text || ''))
      .catch(() => {});
  }, [open, consentText]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (text.trim().length < 5) { setError('Please tell us a little more about what you need.'); return; }
    if (!phone.trim()) { setError('Please add a phone number so we can call you.'); return; }
    if (!consent) { setError('Please tick the box so we know it’s okay to call you.'); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/feature-wishes`, {
        text: text.trim(), phone: phone.trim(), name: name.trim(),
        source, design_id: designId, order_id: orderId, consent_call: true,
      });
      setDone(data?.message || 'Thank you — we’ll call you to talk it through.');
      setText(''); setPhone(''); setName(''); setConsent(false);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send your request. Please try again.');
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="lux-glass p-5 mb-6" data-testid="wish-sent">
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#D4AF37' }} />
          <div>
            <p className="text-sm" style={{ color: 'var(--lux-text)' }}>{done}</p>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              Your selection above is unchanged and nothing has been charged for this request.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="lux-glass w-full p-4 mb-6 text-left flex items-center gap-3 transition-colors"
        data-testid="wish-open">
        <MessageCircle className="w-4 h-4 shrink-0" style={{ color: '#D4AF37' }} />
        <span>
          <span className="block text-sm" style={{ color: 'var(--lux-text)' }}>
            Need something that isn’t listed here?
          </span>
          <span className="block text-xs mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>
            Tell us what you want and leave your number — we’ll call you and work it out.
          </span>
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="lux-glass p-5 mb-6" data-testid="wish-form">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="lux-eyebrow">◆ Ask for a custom feature</span>
        <button type="button" onClick={() => setOpen(false)} data-testid="wish-close"
          className="w-7 h-7 grid place-items-center rounded-full shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--lux-text-muted)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1200}
        placeholder="For example: a live drone feed during the muhurtham, or a seating chart for 400 guests…"
        data-testid="wish-text"
        className="w-full px-3.5 py-3 rounded-lg bg-transparent outline-none text-sm resize-y"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)"
          data-testid="wish-name"
          className="px-3.5 py-3 rounded-lg bg-transparent outline-none text-sm"
          style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
        />
        <div className="flex items-center gap-2 px-3.5 rounded-lg"
          style={{ border: '1px solid var(--lux-border)' }}>
          <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--lux-text-muted)' }} />
          <input
            value={phone} onChange={(e) => setPhone(e.target.value)} required
            inputMode="tel" autoComplete="tel" placeholder="Phone number we can call"
            data-testid="wish-phone"
            className="w-full py-3 bg-transparent outline-none text-sm"
            style={{ color: 'var(--lux-text)' }}
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 mt-3 cursor-pointer" data-testid="wish-consent-label">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 shrink-0" data-testid="wish-consent" />
        <span className="text-[11px] leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>
          {consentText || 'I’m asking MAJA Invites to contact me on this number about the feature I’ve described.'}
        </span>
      </label>

      {error && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs" data-testid="wish-error"
          style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={busy} className="lux-btn mt-4 text-xs" data-testid="wish-submit">
        {busy ? 'Sending…' : 'Send my request'}
      </button>
    </form>
  );
}
