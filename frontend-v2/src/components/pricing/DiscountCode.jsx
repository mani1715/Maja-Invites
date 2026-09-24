import { useState } from 'react';
import client from '@/api/client';
import './discountCode.css';

// Discount codes at checkout.
//
// backend/pricing_features.py has a complete validator — expiry, usage limits,
// applies-to scoping, percent and flat-amount kinds — and no way to enter a
// code, so every code an owner created was unusable.
//
// TWO THINGS IT MUST NOT DO:
//
//   * It must not compute the discount itself. The server returns
//     original/discount/final and owns every rule; a client that re-derives the
//     maths will eventually disagree with what is actually charged.
//
//   * It must not treat "applied" as "paid". This is a quote. /checkout
//     re-quotes immediately before payment (see Cart's own note), so the code
//     is passed along and re-validated there rather than trusted from here.
//
// The server's refusals are specific — expired, usage limit reached, wrong item
// — and each carries its own status. Collapsing them into "invalid code" would
// send someone to support for a code that has simply run out, so the wording is
// kept per case.

const MESSAGES = {
  404: 'That code is not recognised.',
  410: 'That code has expired.',
  429: 'That code has reached its usage limit.',
  400: null,   // the server explains the scope mismatch itself
};

export default function DiscountCode({ amountInr, appliesTo, targetId, onApplied }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(null);

  const apply = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c || !amountInr) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await client.post('/api/public/discount/validate', {
        code: c,
        amount_inr: Math.round(amountInr),
        ...(appliesTo ? { applies_to: appliesTo } : {}),
        ...(targetId ? { target_id: targetId } : {}),
      });
      setApplied(data);
      onApplied?.(data);
    } catch (err) {
      const st = err?.response?.status;
      const detail = err?.response?.data?.detail;
      setError(MESSAGES[st] ?? (typeof detail === 'string' ? detail : 'That code could not be applied.'));
      setApplied(null);
      onApplied?.(null);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setApplied(null);
    setCode('');
    setError('');
    onApplied?.(null);
  };

  if (applied) {
    return (
      <div className="dcode dcode--on" data-testid="discount-applied">
        <div>
          <p className="dcode-code">{applied.code}</p>
          <p className="dcode-saving">
            −₹{Number(applied.discount_inr).toLocaleString('en-IN')} applied
            {applied.kind === 'percent' ? ` (${applied.value}% off)` : ''}
          </p>
        </div>
        <button type="button" className="dcode-remove" onClick={clear}>Remove</button>
      </div>
    );
  }

  return (
    <form className="dcode" onSubmit={apply}>
      <label className="dcode-label" htmlFor="dcode-input">Have a discount code?</label>
      <div className="dcode-row">
        <input
          id="dcode-input"
          className="dcode-input"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
          placeholder="Enter code"
          autoComplete="off"
          data-testid="discount-input"
        />
        <button type="submit" className="dcode-btn" disabled={busy || !code.trim()} data-testid="discount-apply">
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error && <p className="dcode-error" role="alert">{error}</p>}
    </form>
  );
}
