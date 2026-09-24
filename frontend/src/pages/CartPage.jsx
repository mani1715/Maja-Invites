import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShoppingBag, Trash2, Sparkles, X, Check } from 'lucide-react';
import FeatureWishForm from '@/components/FeatureWishForm';
import { useCart } from '@/context/CartContext';
import { useUserAuth } from '@/context/UserAuthContext';
import { useAuth } from '@/context/AuthContext';
import { PxButton, PxCard } from '@/components/px';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Pill button for a single/multi language pick — selected uses the shared
// .px-chip look, unselected stays a plain outlined pill.
const LangPill = ({ on, onClick, testid, children }) => (
  <button onClick={onClick} data-testid={testid}
    className={on ? 'px-chip' : 'inline-flex items-center gap-1.5 px-4 py-2 rounded-[999px] text-xs'}
    style={on ? { cursor: 'pointer' } : { border: '1.5px solid var(--px-border)', background: '#fff', color: 'var(--px-muted)', cursor: 'pointer' }}>
    {children}
  </button>
);

const CartPage = () => {
  const navigate = useNavigate();
  const { items, remove, clear } = useCart();
  const { user } = useUserAuth();
  const { admin } = useAuth();
  const design = items[0]; // one invitation per order

  // À-la-carte catalogue: this design's own price, the basic features that come
  // free with it, every other feature at its own price, and the language list.
  // There are no ceremony packages — the owner does not sell them.
  const [cat, setCat] = useState({ included_features: [], paid_features: [], languages: [] });
  const [mainLanguage, setMainLanguage] = useState('');
  const [extraLanguages, setExtraLanguages] = useState([]);
  const [features, setFeatures] = useState([]);
  const [esign, setEsign] = useState(false);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!design) return;
    const params = new URLSearchParams({
      design_id: design.design_id, ...(design.theme_id ? { theme_id: design.theme_id } : {}),
    });
    axios.get(`${API_URL}/api/store/catalog?${params}`)
      .then((r) => {
        setCat(r.data);
        setMainLanguage((m) => m || r.data.default_main_language || 'english');
      })
      .catch(() => {});
  }, [design]);

  // The server always re-prices from the owner's own numbers; we send selections
  // only, never amounts.
  const refreshQuote = useCallback(async () => {
    if (!design || !mainLanguage) return;
    try {
      const { data } = await axios.post(`${API_URL}/api/store/quote`, {
        design_id: design.design_id, theme_id: design.theme_id,
        features, main_language: mainLanguage, extra_languages: extraLanguages,
        esign_agreed: true,
      });
      setQuote(data);
    } catch (_e) { setQuote(null); }
  }, [design, features, mainLanguage, extraLanguages]);
  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  const toggleFeature = (key) =>
    setFeatures((f) => f.includes(key) ? f.filter((x) => x !== key) : [...f, key]);

  // Picking a main language must drop it from the paid extras — otherwise the
  // buyer would be charged for the language already included.
  const pickMain = (key) => {
    setMainLanguage(key);
    setExtraLanguages((l) => l.filter((x) => x !== key));
  };
  const toggleExtraLanguage = (key) => {
    if (key === mainLanguage) return;
    setExtraLanguages((l) => l.includes(key) ? l.filter((x) => x !== key) : [...l, key]);
  };

  const checkout = async () => {
    setError('');
    // Buyer can be a normal user OR a logged-in photographer (admin). Only bounce
    // to sign-in when neither session exists.
    if (!user && !admin) { sessionStorage.setItem('post_login_redirect', '/cart'); navigate('/?signin=1'); return; }
    if (!design) return;
    if (!esign) { setError('Please accept the terms to continue.'); return; }
    setBusy(true);
    try {
      const { data: order } = await axios.post(`${API_URL}/api/store/order/create`, {
        design_id: design.design_id, theme_id: design.theme_id, event_type: design.event_type,
        features, main_language: mainLanguage, extra_languages: extraLanguages,
        esign_agreed: true,
      }, { withCredentials: true });
      // TEST accounts get a free order (no Razorpay) — go straight to details.
      if (order.free) {
        remove(design.design_id);
        navigate(`/order/${order.order_id}/details`);
        return;
      }
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load payment gateway.');
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id, amount: order.amount_paise, currency: order.currency,
        name: 'MAJA Invites', description: design.name || 'Wedding Invitation',
        order_id: order.razorpay_order_id,
        prefill: { name: order.user_name || '', email: order.user_email || '', contact: order.user_phone || '' },
        theme: { color: '#6D28D9' },
        handler: async (resp) => {
          try {
            await axios.post(`${API_URL}/api/store/order/verify`, {
              order_id: order.order_id, razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature,
            }, { withCredentials: true });
            remove(design.design_id);
            navigate(`/order/${order.order_id}/details`);
          } catch (e) { setError('Payment verification failed. Contact support if charged.'); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Checkout failed.');
      setBusy(false);
    }
  };

  const total = quote?.total_inr ?? 0;

  return (
    <div className="px-aurora min-h-screen px-6 py-12" data-testid="cart-page">
      <div className="max-w-3xl mx-auto" style={{ position: 'relative' }}>
        <div className="flex items-center gap-3 mb-8">
          <ShoppingBag className="w-6 h-6" style={{ color: 'var(--px-primary)' }} />
          <h1 className="px-section-title">Your cart</h1>
        </div>

        {!design ? (
          <PxCard className="p-10 text-center">
            <p className="text-sm mb-5" style={{ color: 'var(--px-muted)' }}>Your cart is empty.</p>
            <PxButton onClick={() => navigate('/themes')} data-testid="cart-browse">Browse designs</PxButton>
          </PxCard>
        ) : (
          <>
            {/* chosen design */}
            <PxCard className="p-4 flex items-center gap-4 mb-6" data-testid={`cart-item-${design.design_id}`}>
              {design.image && <img src={design.image} alt="" className="w-16 h-20 object-cover" style={{ borderRadius: 'var(--px-r-media)' }} />}
              <div className="flex-1">
                <div className="text-lg" style={{ color: 'var(--px-ink)', fontFamily: 'var(--px-font-display)' }}>{design.name || design.design_id}</div>
                <div className="text-xs" style={{ color: 'var(--px-muted)' }}>{design.theme_id} {design.event_type ? `· ${design.event_type}` : ''}</div>
              </div>
              <button onClick={() => remove(design.design_id)} className="w-9 h-9 grid place-items-center rounded-full" style={{ background: 'var(--px-section)', color: 'var(--px-muted)' }} data-testid="cart-remove"><Trash2 className="w-4 h-4" /></button>
            </PxCard>

            {/* design price + what it already includes */}
            <Section title="This design">
              <PxCard className="p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm" style={{ color: 'var(--px-ink)' }}>
                    {design.name || 'Design'} — invitation link, built for you
                  </span>
                  <span className="text-2xl" style={{ color: 'var(--px-primary)', fontFamily: 'var(--px-font-display)' }} data-testid="cart-design-price">
                    {inr(quote?.design_price_inr ?? cat.design_price_inr ?? 0)}
                  </span>
                </div>
                {(cat.included_features || []).length > 0 && (
                  <>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--px-muted)' }}>
                      Included with this design
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {cat.included_features.map((f) => (
                        <span key={f.key} className="flex items-start gap-2 text-xs"
                          style={{ color: 'var(--px-muted)' }} data-testid={`included-${f.key}`}>
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--px-success)' }} />
                          {f.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </PxCard>
            </Section>

            {/* every other feature, priced on its own */}
            <Section title="Add the features you want">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(cat.paid_features || []).map((f) => {
                  const on = features.includes(f.key);
                  return (
                    <button key={f.key} onClick={() => toggleFeature(f.key)} data-testid={`feature-${f.key}`}
                      className="text-left p-3 transition-all"
                      style={{ borderRadius: 'var(--px-r-btn)', border: `1.5px solid ${on ? 'var(--px-primary)' : 'var(--px-border)'}`, background: on ? 'var(--px-violet-100)' : '#fff' }}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="flex items-start gap-2 text-sm" style={{ color: 'var(--px-ink)' }}>
                          <span className="w-4 h-4 mt-0.5 shrink-0 rounded grid place-items-center" style={{ border: `1.5px solid ${on ? 'var(--px-primary)' : 'var(--px-border)'}`, background: on ? 'var(--px-primary)' : 'transparent' }}>{on && <Check className="w-3 h-3" style={{ color: '#fff' }} />}</span>
                          {f.label}
                        </span>
                        {on
                          ? <span className="px-chip">+{inr(f.price)}</span>
                          : <span className="text-sm whitespace-nowrap" style={{ color: 'var(--px-primary)' }}>+{inr(f.price)}</span>}
                      </span>
                      {f.note && (
                        <span className="block mt-1.5 ml-6 text-[11px] leading-snug" style={{ color: 'var(--px-faint)' }}>
                          {f.note}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Escape hatch: something we don't sell yet. Sits directly after the
                feature list, where a buyer discovers the gap. */}
            <FeatureWishForm source="cart" designId={design.design_id} />

            {/* main language — included in the design price */}
            <Section title="Main language">
              <p className="text-xs mb-2.5" style={{ color: 'var(--px-muted)' }}>
                The language your invitation is written in. Included — no extra charge.
              </p>
              <div className="flex flex-wrap gap-2">
                {(cat.languages || []).map((l) => (
                  <LangPill key={l.key} on={mainLanguage === l.key} onClick={() => pickMain(l.key)} testid={`main-lang-${l.key}`}>
                    {mainLanguage === l.key && <Check className="w-3 h-3" />} {l.label}
                  </LangPill>
                ))}
              </div>
            </Section>

            {/* additional languages — each priced */}
            <Section title="Other languages (optional)">
              <p className="text-xs mb-2.5" style={{ color: 'var(--px-muted)' }}>
                Want the same invitation in more languages? Each extra language is priced separately.
              </p>
              <div className="flex flex-wrap gap-2">
                {(cat.languages || []).filter((l) => l.key !== mainLanguage).map((l) => {
                  const on = extraLanguages.includes(l.key);
                  return (
                    <LangPill key={l.key} on={on} onClick={() => toggleExtraLanguage(l.key)} testid={`extra-lang-${l.key}`}>
                      {on && <Check className="w-3 h-3" />}
                      {l.label} <span>+{inr(l.price)}</span>
                    </LangPill>
                  );
                })}
              </div>
            </Section>

            {/* itemised total */}
            <PxCard className="p-6 mb-5" data-testid="cart-summary">
              <div className="space-y-1 mb-3 text-sm" style={{ color: 'var(--px-ink)' }}>
                <div className="flex justify-between">
                  <span>{design.name || 'Design'}{quote?.main_language_label ? ` · ${quote.main_language_label}` : ''}</span>
                  <span>{inr(quote?.design_price_inr ?? 0)}</span>
                </div>
                {(quote?.features || []).map((f) => (
                  <div key={f.key} className="flex justify-between">
                    <span>{f.label}</span><span>+{inr(f.price)}</span>
                  </div>
                ))}
                {(quote?.extra_languages || []).map((l) => (
                  <div key={l.key} className="flex justify-between">
                    <span>{l.label} version</span><span>+{inr(l.price)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--px-border)' }}>
                <span className="text-sm tracking-wide" style={{ color: 'var(--px-ink)' }}>Total</span>
                <span className="text-2xl" style={{ color: 'var(--px-primary)', fontFamily: 'var(--px-font-display)' }} data-testid="cart-total">{inr(total)}</span>
              </div>
            </PxCard>

            <label className="flex items-start gap-2.5 mb-5 cursor-pointer" data-testid="esign-checkbox">
              <input type="checkbox" checked={esign} onChange={(e) => setEsign(e.target.checked)} className="mt-1" style={{ accentColor: 'var(--px-primary)' }} />
              <span className="text-xs leading-relaxed" style={{ color: 'var(--px-ink)' }}>
                I agree to MAJA's <a href="/terms" style={{ color: 'var(--px-primary)' }}>Terms</a> &amp; <a href="/refund" style={{ color: 'var(--px-primary)' }}>Refund Policy</a>, and confirm the details I provide for my invitation are accurate.
              </span>
            </label>

            {error && <div className="px-4 py-3 rounded-[14px] text-sm mb-4 flex items-center gap-2" style={{ background: '#FEF2F2', color: 'var(--px-error)' }}><X className="w-4 h-4" /> {error}</div>}

            <div className="flex gap-3">
              <PxButton onClick={checkout} disabled={busy || !esign} className="flex-1 justify-center" data-testid="cart-checkout">
                {busy ? <><Sparkles className="w-4 h-4 animate-pulse" /> Processing…</> : <>Checkout · {inr(total)}</>}
              </PxButton>
              <PxButton variant="secondary" onClick={clear}>Clear</PxButton>
            </div>
            <p className="text-xs mt-4 text-center" style={{ color: 'var(--px-muted)' }}>
              After payment you'll share your wedding details and our studio builds your invitation for you.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="mb-6">
    <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--px-muted)' }}>{title}</div>
    {children}
  </div>
);

export default CartPage;
