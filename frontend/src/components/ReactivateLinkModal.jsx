import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, X, RefreshCw, Check } from 'lucide-react';

/**
 * ReactivateLinkModal — pay-per-day to bring an EXPIRED invitation link back.
 * Reads /api/admin/profiles/:id/reactivate/{quote,checkout,verify}. Billed at the
 * server's per-day rate (₹50/day default). Mirrors the Razorpay flow used on the
 * plans page; falls back to the mock verify path when no live keys are configured.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` });

const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

export default function ReactivateLinkModal({ profileId, coupleName, onClose, onDone }) {
  const [days, setDays] = useState(30);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const fetchQuote = useCallback(async (d) => {
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/reactivate/quote`,
        { params: { days: d }, headers: authHeaders() });
      setQuote(data);
    } catch (_) { setQuote(null); }
  }, [profileId]);
  useEffect(() => { fetchQuote(days); }, [days, fetchQuote]);

  const pay = async () => {
    setBusy(true); setErr('');
    try {
      const { data: co } = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/reactivate/checkout`,
        { days }, { headers: authHeaders() });

      const verify = (body) => axios.post(`${API_URL}/api/admin/profiles/${profileId}/reactivate/verify`,
        { reactivation_id: co.reactivation_id, ...body }, { headers: authHeaders() });

      // Mock gateway (no live keys) — verify directly with the mock token.
      if (co.provider !== 'razorpay_order' || !co.razorpay_key_id) {
        const { data: v } = await verify({ mock_token: co.mock_token });
        if (v?.status !== 'paid') throw new Error('Could not confirm reactivation.');
        setDone(true); setBusy(false); onDone && onDone(v); return;
      }
      // Live Razorpay checkout.
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not open the payment window — check your connection/ad blocker. You have not been charged.');
      const rzp = new window.Razorpay({
        key: co.razorpay_key_id, order_id: co.razorpay_order_id, amount: co.amount_paise,
        currency: co.currency || 'INR', name: 'MAJA Invites',
        description: `Reactivate link — ${days} day${days === 1 ? '' : 's'}`,
        theme: { color: '#D4AF37' },
        handler: async (resp) => {
          try {
            const { data: v } = await verify({
              razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature,
            });
            if (v?.status !== 'paid') throw new Error('Payment could not be confirmed.');
            setDone(true); onDone && onDone(v);
          } catch (verr) {
            setErr(verr?.response?.data?.detail || 'Payment confirmation failed.');
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || 'Reactivation failed.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(6,4,2,0.9)' }}
      onClick={() => !busy && onClose()} data-testid="reactivate-modal">
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--lux-panel, #16110C)', border: '1px solid var(--lux-gold, #D4AF37)' }}
        onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <Check className="w-9 h-9 mx-auto mb-2" style={{ color: '#7fe0a3' }} />
            <h3 className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>Link reactivated!</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>Your invitation is live again for {days} more day{days === 1 ? '' : 's'}.</p>
            <button onClick={onClose} className="lux-btn !px-5 !py-2 text-sm">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xl flex items-center gap-2" style={{ color: 'var(--lux-text)' }}>
                <RefreshCw className="w-5 h-5" style={{ color: '#E8C97A' }} /> Reactivate link
              </h3>
              <button onClick={() => !busy && onClose()}><X className="w-5 h-5" style={{ color: 'var(--lux-text-muted)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>
              {coupleName ? <b style={{ color: '#E8C97A' }}>{coupleName}</b> : 'This link'} has expired. Choose how many more days to keep it live — billed at ₹{quote?.per_day_inr ?? 50}/day.
            </p>
            <label className="block mb-4">
              <span className="text-[11px] uppercase tracking-wide block mb-1" style={{ color: 'var(--lux-text-muted)' }}>Days</span>
              <div className="flex gap-2 flex-wrap mb-2">
                {[7, 30, 90, 180, 365].map((d) => (
                  <button key={d} onClick={() => setDays(d)}
                    className={`text-xs px-3 py-1.5 rounded-full ${days === d ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}>{d}d</button>
                ))}
              </div>
              <input type="number" min={1} max={365} value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="lux-input w-full" data-testid="reactivate-days" />
            </label>
            <div className="lux-glass p-3 mb-4 flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{days} days × ₹{quote?.per_day_inr ?? 50}</span>
              <span className="font-display text-2xl" style={{ color: '#E8C97A' }}>₹{quote ? Number(quote.total_inr).toLocaleString('en-IN') : days * 50}</span>
            </div>
            {err && <div className="text-xs mb-3" style={{ color: '#ff9a9a' }} data-testid="reactivate-error">{err}</div>}
            <div className="flex gap-2">
              <button onClick={() => !busy && onClose()} className="lux-btn lux-btn-ghost flex-1 justify-center">Cancel</button>
              <button onClick={pay} disabled={busy} className="lux-btn flex-1 justify-center" data-testid="reactivate-pay">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Pay &amp; reactivate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
