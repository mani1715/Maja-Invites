import { useState } from 'react';
import * as api from '@/api/events';
import { loadRazorpay } from '@/lib/razorpay';
import './eventDonate.css';

// Guest-facing donation form on a published event page.
//
// The backend has carried this whole flow since the finance module landed and
// nothing called it: a visitor could read the total collected and stare at a UPI
// QR code, but had no way to tell the organisers they had paid. Everything below
// binds to endpoints that already existed (see api/events.js for the contract).
//
// Two paths, deliberately both offered:
//
//   "Record my contribution" -> POST /donate. The guest pays however they like
//   (the QR above, cash at the venue) and this puts a PENDING row in the ledger
//   with their name on it. A treasurer verifies it. This is how most village
//   collections actually run, and it works with no payment gateway at all.
//
//   "Pay now"                -> POST /donate/order, Razorpay checkout, then
//   POST /donate/verify. The signature is checked SERVER-SIDE; a receipt number
//   only exists once the server has said so.
//
// Amounts: the order endpoint returns `amount` already in paise. Razorpay's
// checkout also wants paise. Passing it straight through is correct — the
// shagun flow elsewhere multiplies by 100 because its endpoint returns rupees.

const PRESETS = [101, 501, 1001, 2100, 5100];

export default function EventDonate({ slug, causes = [], onDone }) {
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [cause, setCause] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [hideAmount, setHideAmount] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const value = Number(String(amount).replace(/[^\d.]/g, '')) || 0;

  // Mirrors the server's own validation (submit_public_donation) so the guest is
  // told before a round trip, not after. The server still checks — this is not
  // the gate, only the courtesy.
  const problem = () => {
    if (value <= 0) return 'Enter how much you would like to contribute.';
    if (!anonymous && !name.trim()) return 'Your name, please — or tick "Give anonymously".';
    return '';
  };

  const payload = () => ({
    amount: value,
    donor_name: name.trim(),
    phone: phone.trim(),
    message: message.trim(),
    category: cause || undefined,
    is_anonymous: anonymous,
    hide_amount: hideAmount,
  });

  const fail = (e, fallback) => {
    setError(e?.response?.data?.detail || e?.message || fallback);
    setBusy('');
  };

  const pledge = async () => {
    const p = problem();
    if (p) { setError(p); return; }
    setError(''); setBusy('pledge');
    try {
      const { data } = await api.publicDonate(slug, { ...payload(), payment_method: 'upi' });
      setDone({ kind: 'pledged', ...data });
      setBusy('');
      onDone?.();
    } catch (e) { fail(e, 'Could not record your contribution. Please try again.'); }
  };

  const payNow = async () => {
    const p = problem();
    if (p) { setError(p); return; }
    setError(''); setBusy('pay');
    let order;
    try {
      ({ data: order } = await api.publicDonateOrder(slug, payload()));
    } catch (e) { return fail(e, 'Could not start the payment.'); }

    // The pledge is already saved at this point. If the gateway is not set up,
    // say exactly that instead of pretending the payment failed.
    if (!order.configured) {
      setDone({ kind: 'pledged', ...order });
      setBusy('');
      onDone?.();
      return;
    }

    const loaded = await loadRazorpay();
    if (!loaded) {
      return fail(null, 'Could not load the secure checkout. Your contribution is '
        + 'recorded as pending — the organisers will follow up.');
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,          // already paise
      currency: order.currency || 'INR',
      order_id: order.order_id,
      name: 'Contribution',
      description: cause || 'General Donation',
      prefill: { name: anonymous ? '' : name.trim(), contact: phone.trim() },
      theme: { color: '#7c3aed' },
      handler: async (resp) => {
        try {
          const { data } = await api.publicDonateVerify({
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          setDone({ kind: 'paid', ...data });
          onDone?.();
        } catch (e) {
          // The money may well have left the guest's account. Never tell them it
          // failed — say what is true: it is with the organisers to confirm.
          fail(e, 'The payment went through but we could not confirm it here. '
            + 'The organisers can see it and will issue your receipt.');
        } finally { setBusy(''); }
      },
      modal: { ondismiss: () => setBusy('') },
    });
    rzp.open();
  };

  if (done) {
    return (
      <div className="evd evd--done" role="status">
        <p className="evd-done-h">
          {done.kind === 'paid' ? 'Received — thank you.' : 'Thank you.'}
        </p>
        <p className="evd-done-p">
          {done.kind === 'paid'
            ? <>Your contribution of {rupee(done.amount)} is confirmed.
                {done.receipt_number && <> Receipt <strong>{done.receipt_number}</strong>.</>}</>
            : (done.message
               || 'Your contribution is recorded and the organisers will confirm it.')}
        </p>
      </div>
    );
  }

  return (
    <div className="evd">
      <div className="evd-presets">
        {PRESETS.map((n) => (
          <button
            type="button"
            key={n}
            className={`evd-preset${value === n ? ' is-on' : ''}`}
            onClick={() => setAmount(String(n))}
          >
            ₹{n.toLocaleString('en-IN')}
          </button>
        ))}
      </div>

      <div className="evd-grid">
        <label className="evd-field">
          <span>Amount</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₹"
          />
        </label>
        <label className="evd-field">
          <span>{anonymous ? 'Name (kept private)' : 'Your name'}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="So the organisers know who to thank"
          />
        </label>
        <label className="evd-field">
          <span>Phone (optional)</span>
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {causes.length > 0 && (
          <label className="evd-field">
            <span>Towards</span>
            <select value={cause} onChange={(e) => setCause(e.target.value)}>
              <option value="">General Donation</option>
              {causes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      <label className="evd-field evd-field--wide">
        <span>A note (optional)</span>
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
      </label>

      <div className="evd-checks">
        <label className="evd-check">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span>Give anonymously</span>
        </label>
        <label className="evd-check">
          <input type="checkbox" checked={hideAmount} onChange={(e) => setHideAmount(e.target.checked)} />
          <span>Hide the amount on the public list</span>
        </label>
      </div>

      {error && <p className="evd-error" role="alert">{error}</p>}

      <div className="evd-actions">
        <button type="button" className="evd-btn evd-btn--primary" onClick={payNow} disabled={!!busy}>
          {busy === 'pay' ? 'Opening checkout…' : 'Pay now'}
        </button>
        <button type="button" className="evd-btn" onClick={pledge} disabled={!!busy}>
          {busy === 'pledge' ? 'Recording…' : 'I paid another way'}
        </button>
      </div>
      <p className="evd-fine">
        “I paid another way” records your contribution as pending against your name —
        use it if you sent money by UPI or handed it over in person.
      </p>
    </div>
  );
}

function rupee(n) {
  const v = Number(n);
  return Number.isFinite(v)
    ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : '';
}
