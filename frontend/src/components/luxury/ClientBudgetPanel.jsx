import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { IndianRupee, Plus, Trash2, Loader2, Check, Calendar } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * ClientBudgetPanel — the studio's private money ledger for one invitation:
 * the agreed total, every payment received, what is still due, and the date the
 * client promised the rest by.
 *
 * The remaining amount is NEVER computed here — the server returns it, so the
 * number on screen and the number in the database can't disagree. This panel is
 * photographer-only; nothing here is ever shown to guests or to the client login.
 */
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function ClientBudgetPanel({ profileId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const [total, setTotal] = useState('');
  const [due, setDue] = useState('');
  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data: d } = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/budget`);
      setData(d);
      setTotal(d.total_inr ? String(d.total_inr) : '');
      setDue(d.due_date || '');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not load the budget.');
    } finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setSaved(m); setTimeout(() => setSaved(''), 2200); };

  const saveTotal = async () => {
    setBusy(true); setErr('');
    try {
      const { data: d } = await axios.put(`${API_URL}/api/admin/profiles/${profileId}/budget`,
        { total_inr: total || 0, due_date: due || '' });
      setData(d); flash('Saved');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not save.');
    } finally { setBusy(false); }
  };

  const addPayment = async () => {
    setBusy(true); setErr('');
    try {
      const { data: d } = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/budget/payments`,
        { amount_inr: amount, date: payDate || '', note });
      setData(d); setAmount(''); setPayDate(''); setNote(''); flash('Payment recorded');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not record the payment.');
    } finally { setBusy(false); }
  };

  const removePayment = async (id) => {
    setBusy(true); setErr('');
    try {
      const { data: d } = await axios.delete(
        `${API_URL}/api/admin/profiles/${profileId}/budget/payments/${id}`);
      setData(d); flash('Removed');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not remove that payment.');
    } finally { setBusy(false); }
  };

  const fs = {
    width: '100%', padding: '0.7rem 0.9rem', background: 'transparent', borderRadius: '0.5rem',
    border: '1px solid var(--lux-border)', color: 'var(--lux-text)', outline: 'none',
  };

  return (
    <div className="lux-glass p-7" data-testid="client-budget-panel">
      <span className="lux-eyebrow block mb-2">◆ Budget</span>
      <h2 className="font-display text-2xl md:text-3xl mb-1" style={{ color: 'var(--lux-text)' }}>
        What they owe, <span className="text-gold italic font-script">what's paid</span>
      </h2>
      <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
        Only you see this. Record the agreed amount and each payment as it comes in —
        the balance is worked out for you.
      </p>

      {err && (
        <div className="px-4 py-3 rounded-lg text-sm mb-4"
          style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(255,120,90,0.4)', color: '#FFD7C9' }}
          data-testid="budget-error">{err}</div>
      )}
      {saved && (
        <div className="px-4 py-2 rounded-lg text-xs mb-4 inline-flex items-center gap-1.5"
          style={{ background: 'rgba(16,185,129,0.14)', color: '#A7F3D0' }} data-testid="budget-saved">
          <Check className="w-3.5 h-3.5" /> {saved}
        </div>
      )}

      {loading ? (
        <div className="py-10 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>
      ) : (
        <>
          {/* The three numbers, computed server-side */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              ['Agreed', data?.total_inr, 'var(--lux-text)'],
              ['Received', data?.paid_inr, '#A7F3D0'],
              ['Still due', data?.remaining_inr, data?.remaining_inr > 0 ? '#FFD79A' : '#A7F3D0'],
            ].map(([label, value, colour]) => (
              <div key={label} className="rounded-lg p-4 text-center" style={{ border: '1px solid var(--lux-border)' }}
                data-testid={`budget-stat-${label.toLowerCase().replace(' ', '-')}`}>
                <div className="font-display text-xl md:text-2xl" style={{ color: colour }}>{inr(value)}</div>
                <div className="text-[10px] tracking-[0.22em] uppercase mt-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Progress + status line */}
          {data?.total_inr > 0 && (
            <div className="mb-5">
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,248,220,0.08)' }}>
                <div style={{
                  width: `${Math.min(100, data.percent_paid)}%`, height: '100%',
                  background: 'linear-gradient(90deg,#D4AF37,#E8C97A)',
                }} />
              </div>
              <div className="flex flex-wrap justify-between gap-2 mt-2 text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
                <span data-testid="budget-percent">{data.percent_paid}% received</span>
                {data.settled
                  ? <span style={{ color: '#A7F3D0' }} data-testid="budget-settled">Fully paid</span>
                  : data.due_date && <span>Balance promised by {new Date(data.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                {data.overpaid_inr > 0 && (
                  <span style={{ color: '#FFD79A' }} data-testid="budget-overpaid">Overpaid by {inr(data.overpaid_inr)}</span>
                )}
              </div>
            </div>
          )}

          {/* Agreed amount + promised date */}
          <div className="rounded-lg p-4 mb-4" style={{ border: '1px solid var(--lux-border)' }}>
            <div className="text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>
              The deal
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Agreed amount (₹)</span>
                <input style={fs} value={total} onChange={(e) => setTotal(e.target.value)}
                  inputMode="numeric" placeholder="150000" data-testid="budget-total" />
              </label>
              <label>
                <span className="block text-[10px] tracking-[0.2em] uppercase mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Balance promised by</span>
                <input style={fs} type="date" value={due} onChange={(e) => setDue(e.target.value)}
                  data-testid="budget-due" />
              </label>
            </div>
            <button onClick={saveTotal} disabled={busy} className="lux-btn text-xs mt-3" data-testid="budget-save">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IndianRupee className="w-3.5 h-3.5" />} Save
            </button>
          </div>

          {/* Record a payment */}
          <div className="rounded-lg p-4 mb-4" style={{ border: '1px solid var(--lux-border)' }}>
            <div className="text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>
              Record money received
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input style={fs} value={amount} onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric" placeholder="Amount ₹" data-testid="budget-pay-amount" />
              <input style={fs} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                data-testid="budget-pay-date" />
              <input style={fs} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Note — advance, UPI…" data-testid="budget-pay-note" />
            </div>
            <button onClick={addPayment} disabled={busy || !amount} className="lux-btn text-xs mt-3"
              style={!amount ? { opacity: 0.45, cursor: 'not-allowed' } : {}} data-testid="budget-pay-add">
              <Plus className="w-3.5 h-3.5" /> Add payment
            </button>
            <p className="text-[11px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>
              No date? Today is used.
            </p>
          </div>

          {/* The ledger */}
          {(data?.payments || []).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }} data-testid="budget-empty">
              No payments recorded yet.
            </p>
          ) : (
            <div className="space-y-2" data-testid="budget-payments">
              {data.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ border: '1px solid var(--lux-border)' }} data-testid={`budget-payment-${p.id}`}>
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--lux-text-muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                    {p.date ? new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                  <span className="font-display text-base flex-1" style={{ color: 'var(--lux-text)' }}>{inr(p.amount_inr)}</span>
                  {p.note && <span className="text-xs truncate max-w-[40%]" style={{ color: 'var(--lux-text-muted)' }}>{p.note}</span>}
                  <button onClick={() => removePayment(p.id)} disabled={busy}
                    className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
                    style={{ border: '1px solid var(--lux-border)', color: '#FFB4A2' }}
                    aria-label="Remove this payment" data-testid={`budget-payment-del-${p.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
