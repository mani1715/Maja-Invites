import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MobileNav from '@/components/nav/MobileNav';
import StudioNav from '@/components/nav/StudioNav';
import { useAuth } from '@/context/AuthContext';
import * as subsApi from '@/api/subscriptions';
import { loadRazorpay } from '@/lib/razorpay';
import './StudioPlans.css';

// Ported from "MAJA Studio Plans.dc.html". Buy-flow logic ported from legacy
// frontend/src/pages/StudioPlansPage.jsx (buyer-details modal -> create ->
// free/mock/live-Razorpay branches -> verify -> plan-purchase-details ->
// refresh /mine), extended from 2 products to all 4 the backend serves.
// Pricing redesign 2026 (docs/PRICING_REDESIGN_2026.md §4): studio_storage.py
// is now the one canonical storage flow — StudioStorage.jsx buys it directly
// against /admin/studio-storage/subscribe. This tab used to sell the same
// product a second, disagreeing way via subscription_plans[product=storage],
// which the migration deactivates. Storage buying moved off this page.
const PRODUCTS = [
  { key: 'invitation', label: 'Invitation' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'backup', label: 'Cloud Backup' },
];

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function useViewportWidth() {
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw;
}

export default function StudioPlans() {
  const { admin } = useAuth();
  const vw = useViewportWidth();
  const isPhone = vw < 640;
  const isMobile = vw < 900;
  const isTablet = vw >= 900 && vw < 1280;

  const [product, setProduct] = useState('invitation');
  const [cycle, setCycle] = useState('monthly');
  const [plansData, setPlansData] = useState(null); // { plans, cycles, storage_addons }
  const [mineData, setMineData] = useState(null); // { subscriptions, active, active_by_product }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [msg, setMsg] = useState('');

  const [detailsFor, setDetailsFor] = useState(null); // plan awaiting the buyer-details form
  const [quoteData, setQuoteData] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', studio_name: '', city: '', requirements: '' });
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null); // { product, tier }
  const [cancellingId, setCancellingId] = useState(null);

  // Prefill from the signed-in studio once — never clobber what the studio typed.
  useEffect(() => {
    if (!admin) return;
    setForm((f) => ({
      ...f,
      full_name: f.full_name || admin.name || '',
      email: f.email || admin.email || '',
      phone: f.phone || admin.phone || '',
    }));
  }, [admin]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([subsApi.plans(), subsApi.mine()])
      .then(([p, m]) => { setPlansData(p.data); setMineData(m.data); })
      .catch((e) => setLoadError(e?.response?.data?.detail || 'Could not load plans.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cycles = plansData?.cycles || [];
  const allPlans = plansData?.plans || [];
  // ponytail: a handful of `storage` rows predate per-cycle pricing and price
  // at zero on every cycle (orphaned seed data, not a real free tier -- the
  // catalog has none). Never let a studio "buy" one of those for free; the
  // backend row itself is a cleanup item, flagged separately.
  const shown = allPlans
    .filter((p) => p.product === product)
    .filter((p) => (p.cycle_prices?.[cycle]?.paise || 0) > 0)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const productHasAnyPlans = allPlans.some((p) => p.product === product);

  const active = mineData?.active_by_product?.[product];
  const history = (mineData?.subscriptions || []).slice(0, 8);

  const cycleDiscountLabel = cycles.find((c) => c.key === cycle)?.discount
    ? `Saving ${Math.round(cycles.find((c) => c.key === cycle).discount * 100)}% against monthly`
    : 'No discount on monthly';

  const openDetails = (plan) => {
    setMsg('');
    setDetailsFor(plan);
    setQuoteData(null);
    setQuoteLoading(true);
    subsApi.quote({ product: plan.product, tier: plan.tier, cycle })
      .then(({ data }) => setQuoteData(data))
      .catch(() => setMsg('Could not price this plan right now. Please try again.'))
      .finally(() => setQuoteLoading(false));
  };

  // Shared tail of every successful purchase: record buyer details for
  // fulfillment (non-blocking -- the plan is already active), refresh /mine
  // so gating everywhere reflects it, then show the success panel.
  const completePurchase = useCallback(async (plan, created, details) => {
    try {
      await subsApi.savePurchaseDetails({
        product: plan.product, tier: plan.tier, cycle,
        subscription_id: created.subscription_id, details,
      });
    } catch (_) { /* non-blocking -- the plan is already active */ }
    await load();
    setDetailsFor(null);
    setMsg('');
    setSuccess({ product: plan.product, tier: plan.tier });
  }, [cycle, load]);

  const confirmPurchase = async () => {
    const plan = detailsFor;
    if (!plan) return;
    if (!form.full_name.trim() || !form.phone.trim()) {
      setMsg('Please enter at least your name and phone number.');
      return;
    }
    const details = { ...form };
    setBusy(true);
    setMsg('');
    try {
      const { data: created } = await subsApi.create({ product: plan.product, tier: plan.tier, cycle });

      // 1) Test/comped accounts activate free -- no gateway involved.
      if (created?.free || created?.status === 'active') {
        await completePurchase(plan, created, details);
        setBusy(false);
        return;
      }

      // 2) Live Razorpay keys -> a real one-time order exists -> open checkout.
      if (created?.razorpay_order_id) {
        if (!created.razorpay_key_id) {
          throw new Error('Payments are not fully configured yet. You have not been charged.');
        }
        const ok = await loadRazorpay();
        if (!ok) {
          throw new Error('Could not open the payment window. Check your connection and try again — you have not been charged.');
        }
        const rzp = new window.Razorpay({
          key: created.razorpay_key_id,
          order_id: created.razorpay_order_id,
          amount: created.amount_paise,
          currency: created.currency || 'INR',
          name: 'MAJA Invites',
          description: `${plan.tier} · ${plan.product} (${cycle.replace('_', ' ')})`,
          prefill: {
            name: details.full_name,
            contact: details.phone,
            ...(details.email ? { email: details.email } : {}),
          },
          theme: { color: '#6d28d9' },
          handler: async (resp) => {
            try {
              const { data: verified } = await subsApi.verify({
                subscription_id: created.subscription_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              });
              if (verified?.status !== 'active') throw new Error('Payment could not be confirmed.');
              await completePurchase(plan, created, details);
            } catch (verr) {
              setMsg(verr?.response?.data?.detail
                || `Payment succeeded but activation failed. Save this payment id — ${resp?.razorpay_payment_id || 'see your Razorpay receipt'} — and contact us; we will activate it manually.`);
            } finally {
              setBusy(false);
            }
          },
          modal: {
            ondismiss: () => {
              setBusy(false);
              setMsg('Payment cancelled — you have not been charged.');
            },
          },
        });
        try {
          rzp.on('payment.failed', (r) => {
            setBusy(false);
            setMsg(r?.error?.description || 'The payment failed. You have not been charged — please try again.');
          });
        } catch (_) { /* older checkout builds have no .on() */ }
        rzp.open();
        return; // the modal's callbacks own the rest of the flow
      }

      // 3) No live keys (local dev) -- the mock gateway auto-verifies.
      const { data: verified } = await subsApi.verify({
        subscription_id: created.subscription_id, mock_token: created.mock_token,
      });
      if (verified?.status !== 'active') {
        throw new Error('Payment could not be confirmed. You have not been charged — please try again.');
      }
      await completePurchase(plan, created, details);
      setBusy(false);
    } catch (e) {
      setMsg(e?.response?.data?.detail || e?.message || 'Could not complete the payment. You have not been charged.');
      setBusy(false);
    }
  };

  const handleCancel = async (subscriptionId) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Cancel auto-renewal? You keep access until the current period ends.')) return;
    setCancellingId(subscriptionId);
    try {
      await subsApi.cancel(subscriptionId);
      setMsg('Auto-renewal cancelled. You keep access until the current period ends.');
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Could not cancel this plan.');
    } finally {
      setCancellingId(null);
    }
  };

  const shellCols = isMobile ? '1fr' : (vw < 1200 ? '76px minmax(0,1fr)' : '240px minmax(0,1fr)');
  const pagePad = isPhone ? '18px 14px 70px' : (isMobile ? '26px 22px 70px' : '34px 34px 70px');
  const heroPad = isPhone ? '22px 18px' : (isMobile ? '26px 24px' : '30px 30px');
  const statusPad = isPhone ? '18px' : '22px 24px';
  const formPad = isPhone ? '20px 18px' : (isMobile ? '24px 22px' : '26px 28px');
  const planCols = 'repeat(auto-fit,minmax(260px,1fr))';
  const payCols = isMobile || isTablet ? '1fr' : '1.35fr .9fr';
  const fieldCols = vw < 700 ? '1fr' : '1fr 1fr';

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      <MobileNav panel="studio" active="Plans & billing" />
      <div style={{ background: '#ffffff', color: '#111827', minHeight: '100dvh', display: 'grid', gridTemplateColumns: shellCols }}>
        {!isMobile && <StudioNav active="Plans & billing" />}

        <main id="main-content" className="stplan-main" style={{ padding: pagePad, minWidth: 0 }}>
          <header style={{
            marginBottom: 24, borderRadius: 20, padding: heroPad, border: '1px solid #ddd6fe',
            background: 'radial-gradient(70% 90% at 18% 8%,rgba(167,139,250,.22),transparent 60%),radial-gradient(55% 75% at 82% 22%,rgba(109,40,217,.13),transparent 62%),linear-gradient(165deg,#f5f3ff,#ede9fe 55%,#f5f3ff)',
          }}>
            <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 10px' }}>Account</p>
            <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 'clamp(26px,4vw,38px)', lineHeight: 1.12, margin: 0 }}>
              Plans &amp; <span style={{ color: '#6d28d9', fontStyle: 'italic' }}>billing</span>
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '10px 0 0', maxWidth: '56ch', lineHeight: 1.65 }}>
              Subscribe or renew here. Longer cycles cost less per month, and you can switch products without losing time already paid for.
            </p>
          </header>

          {msg && (
            <div className="stplan-card" style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '14px 18px', marginBottom: 20, fontSize: 13.5, color: '#9a3412' }} data-testid="plans-msg">
              {msg}
            </div>
          )}

          <div className="stplan-card" style={{
            background: '#f5f3ff', border: '1px solid #ddd6fe', padding: statusPad, marginBottom: 24,
            display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between',
          }} data-testid="plans-current">
            <div>
              <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 8px' }}>Current plan &middot; {PRODUCTS.find((p) => p.key === product)?.label}</p>
              {active ? (
                <>
                  <p style={{ fontFamily: "'Spectral',serif", fontSize: 21, margin: '0 0 5px' }}>{active.tier}</p>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                    {(cycles.find((c) => c.key === active.cycle)?.label) || active.cycle} &middot; renews {active.current_period_end ? new Date(active.current_period_end).toLocaleDateString('en-IN') : '—'}
                  </p>
                </>
              ) : (
                <p style={{ fontFamily: "'Spectral',serif", fontSize: 21, margin: 0, color: '#6b7280' }}>No active plan</p>
              )}
            </div>
            {active && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="stplan-btn2" onClick={() => handleCancel(active.id)} disabled={cancellingId === active.id}
                  style={{ minHeight: 44, padding: '0 20px', border: '1px solid #6d28d9', borderRadius: 14, background: '#ffffff', color: '#6d28d9', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                  data-testid="plans-cancel">
                  {cancellingId === active.id ? 'Cancelling…' : 'Cancel renewal'}
                </button>
              </div>
            )}
          </div>

          <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 10px' }}>Product</p>
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 999, background: '#ede9fe', border: '1px solid #ddd6fe', marginBottom: 24, flexWrap: 'wrap', maxWidth: '100%' }}>
            {PRODUCTS.map((p) => {
              const on = product === p.key;
              return (
                <button key={p.key} type="button" className="stplan-pill" onClick={() => setProduct(p.key)} data-testid={`plans-product-${p.key}`}
                  style={{ minHeight: 44, padding: '0 18px', borderRadius: 999, border: 'none', background: on ? '#ffffff' : 'transparent', color: on ? '#111827' : '#6b7280', fontSize: 13.5, fontWeight: on ? 600 : 400, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {p.label}
                </button>
              );
            })}
            <Link to="/studio/studio-storage" data-mj-link
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', fontSize: 13.5, color: '#6d28d9', textDecoration: 'none' }}>
              Buy storage &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 22 }}>
            {cycles.map((c) => {
              const on = cycle === c.key;
              return (
                <button key={c.key} type="button" className="stplan-pill" onClick={() => setCycle(c.key)} data-testid={`plans-cycle-${c.key}`}
                  style={{
                    minHeight: 44, padding: '0 18px', borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${on ? '#6d28d9' : '#ddd6fe'}`, background: on ? '#6d28d9' : 'transparent', color: on ? '#f2eefb' : '#6b7280',
                    fontSize: 13, fontWeight: on ? 600 : 400,
                  }}>
                  {c.label}{c.discount > 0 && ` −${Math.round(c.discount * 100)}%`}
                </button>
              );
            })}
            {cycles.length > 0 && <span style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>{cycleDiscountLabel}</span>}
          </div>

          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: planCols, gap: 16, marginBottom: 34 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="stplan-skel" style={{ borderRadius: 20, height: 320 }} />
              ))}
            </div>
          )}

          {!loading && loadError && (
            <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 20, boxShadow: '0 8px 24px rgba(124,58,237,.10)', textAlign: 'center', padding: '56px 24px', marginBottom: 34 }}>
              <p style={{ fontFamily: "'Spectral',serif", fontSize: 18, margin: '0 0 8px' }}>Couldn&rsquo;t load plans.</p>
              <p style={{ fontSize: 13.5, color: '#dc2626', margin: '0 0 18px' }}>{loadError}</p>
              <button type="button" onClick={load} style={{ background: '#6d28d9', color: '#fff', border: 'none', padding: '0 22px', minHeight: 44, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
            </div>
          )}

          {!loading && !loadError && (
            <div style={{ display: 'grid', gridTemplateColumns: planCols, gap: 16, marginBottom: 34 }}>
              {shown.map((p) => {
                const cp = p.cycle_prices?.[cycle] || {};
                const months = cp.months || 1;
                const monthly = months ? cp.inr / months : cp.inr;
                const isActive = active?.tier === p.tier;
                const sel = detailsFor?.id === p.id;
                return (
                  <div key={p.id} className="stplan-card" style={{
                    background: sel ? 'linear-gradient(150deg,#6d28d9,#5b21b6)' : '#ffffff',
                    color: sel ? '#f5f3ff' : '#111827', border: `1px solid ${sel ? '#6d28d9' : '#ddd6fe'}`,
                    borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column',
                  }} data-testid={`plan-card-${p.id}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 20, margin: 0 }}>{p.tier}</h2>
                      {p.popular && (
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: sel ? '#e9d5ff' : '#ede9fe', color: sel ? '#2e1065' : '#6d28d9' }}>Popular</span>
                      )}
                      {isActive && (
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: sel ? '#e9d5ff' : '#ddd6fe', color: sel ? '#2e1065' : '#4c1d95' }}>Current</span>
                      )}
                    </div>
                    {p.storage_gb ? (
                      <p style={{ fontSize: 12.5, color: sel ? '#e9d5ff' : '#6b7280', margin: '0 0 18px' }}>{p.storage_gb >= 1024 ? `${(p.storage_gb / 1024).toFixed(0)} TB storage` : `${p.storage_gb} GB storage`}</p>
                    ) : <div style={{ marginBottom: 18 }} />}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Spectral',serif", fontSize: 'clamp(26px,3.4vw,32px)' }}>{inr(monthly)}</span>
                      <span style={{ fontSize: 12.5, color: sel ? '#e9d5ff' : '#6b7280' }}>/month</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: sel ? '#e9d5ff' : '#6b7280', margin: '0 0 20px' }}>Billed {inr(cp.inr)} for {(cp.label || cycle).toLowerCase()}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22, flex: 1 }}>
                      {(p.features || []).slice(0, 6).map((f) => (
                        <div key={f} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                          <span style={{ color: sel ? '#e9d5ff' : '#10b981', fontSize: 13, lineHeight: 1.5 }}>&#10003;</span>
                          <span style={{ fontSize: 13, lineHeight: 1.55 }}>{f.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="stplan-btn" onClick={() => openDetails(p)} disabled={isActive}
                      data-testid={`plan-buy-${p.id}`}
                      style={{
                        minHeight: 44, padding: '0 20px', border: `1px solid ${sel ? '#ffffff' : '#6d28d9'}`, borderRadius: 14,
                        background: sel ? '#ffffff' : '#6d28d9', color: sel ? '#6d28d9' : '#ffffff', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: isActive ? 'not-allowed' : 'pointer',
                      }}>
                      {isActive ? 'Current plan' : `Get ${p.tier}`}
                    </button>
                  </div>
                );
              })}
              {shown.length === 0 && (
                <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, textAlign: 'center', padding: '48px 24px', gridColumn: '1 / -1', color: '#6b7280' }}>
                  {productHasAnyPlans ? 'No priced plans for this cycle yet.' : 'No plans for this product yet.'}
                </div>
              )}
            </div>
          )}

          {history.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, letterSpacing: '.3em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 10px' }}>Billing history</p>
              <div className="stplan-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 20, overflow: 'hidden' }}>
                {history.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderTop: i === 0 ? 'none' : '1px solid #f3f4f6', fontSize: 13,
                  }} data-testid={`plans-history-${s.id}`}>
                    <span style={{ color: '#111827', fontWeight: 600, minWidth: 0 }}>
                      {PRODUCTS.find((p) => p.key === s.product)?.label || s.product} &middot; {s.tier}
                    </span>
                    <span style={{ color: '#6b7280' }}>{(cycles.find((c) => c.key === s.cycle)?.label) || s.cycle}</span>
                    <span style={{ color: '#6b7280' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN') : '—'}</span>
                    <span style={{ color: '#111827' }}>{s.quote?.total_inr != null ? inr(s.quote.total_inr) : '—'}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999,
                      background: s.status === 'active' ? '#dcfce7' : s.status === 'cancelled' ? '#fee2e2' : '#f3f4f6',
                      color: s.status === 'active' ? '#166534' : s.status === 'cancelled' ? '#991b1b' : '#4b5563',
                    }}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Buyer details + order summary -- shown before creating any subscription */}
      {detailsFor && (
        <div className="stplan-modal-in" style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(46,16,101,.45)' }}
          onClick={() => !busy && setDetailsFor(null)} data-testid="purchase-details-modal">
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: payCols, gap: 16, width: '100%', maxWidth: 860, alignItems: 'start', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="stplan-card" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 20, padding: formPad }}>
              <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 19, margin: '0 0 6px' }}>Your <span style={{ color: '#6d28d9', fontStyle: 'italic' }}>details</span></h2>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 22px' }}>
                For <b style={{ color: '#6d28d9' }}>{detailsFor.tier} {detailsFor.product}</b> &middot; {(cycles.find((c) => c.key === cycle)?.label) || cycle}. Used to set up and deliver your plan.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: fieldCols, gap: 14, marginBottom: 14 }}>
                {[
                  ['full_name', 'Full name *', 'text'],
                  ['phone', 'Phone / WhatsApp *', 'tel'],
                  ['email', 'Email', 'email'],
                  ['studio_name', 'Studio name', 'text'],
                ].map(([k, label, type]) => (
                  <label key={k} style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 7px' }}>{label}</span>
                    <input type={type} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                      className="stplan-field" style={{ width: '100%' }} data-testid={`pd-${k}`} />
                  </label>
                ))}
              </div>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 7px' }}>City</span>
                <input type="text" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="stplan-field" style={{ width: '100%' }} data-testid="pd-city" />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 7px' }}>Requirements / notes</span>
                <textarea rows={3} value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} className="stplan-field" style={{ width: '100%', minHeight: 'auto', padding: '10px 14px', resize: 'vertical' }} data-testid="pd-requirements" />
              </label>
            </div>

            <div style={{ background: 'linear-gradient(150deg,#6d28d9,#5b21b6)', color: '#f5f3ff', borderRadius: 20, boxShadow: '0 24px 56px rgba(124,58,237,.22)', padding: formPad, position: 'relative' }}>
              <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 19, margin: '0 0 20px' }}>Order summary</h2>
              {quoteLoading || !quoteData ? (
                <p style={{ fontSize: 13.5, color: '#e9d5ff' }}>{quoteLoading ? 'Pricing your plan…' : 'Could not load pricing.'}</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}>
                      <span style={{ color: '#e9d5ff' }}>Product</span>
                      <span style={{ color: '#ffffff', fontWeight: 600, textAlign: 'right' }}>{detailsFor.product} &middot; {detailsFor.tier}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}>
                      <span style={{ color: '#e9d5ff' }}>Cycle</span>
                      <span style={{ color: '#ffffff', textAlign: 'right' }}>{quoteData.cycle_label}</span>
                    </div>
                    {/* List price only shows when it genuinely differs from what
                        is charged — quoteData.list_paise is the server's own
                        honest anchor, never a frontend-derived figure. */}
                    {quoteData.list_paise > (quoteData.subtotal_paise ?? 0) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}>
                        <span style={{ color: '#e9d5ff' }}>List price</span>
                        <span style={{ color: '#e9d5ff', textAlign: 'right', textDecoration: 'line-through' }}>{inr(quoteData.list_paise / 100)}</span>
                      </div>
                    )}
                    {quoteData.save_paise > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}>
                        <span style={{ color: '#e9d5ff' }}>
                          {quoteData.extra_saving ? `${quoteData.pct_off}% off + special pricing` : `Save ${quoteData.pct_off}%`}
                        </span>
                        <span style={{ color: '#86efac', fontWeight: 600, textAlign: 'right' }}>&minus;{inr(quoteData.save_paise / 100)}</span>
                      </div>
                    )}
                    {quoteData.setup_fee_paise > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13.5 }}>
                        <span style={{ color: '#e9d5ff' }}>One-time setup fee</span>
                        <span style={{ color: '#ffffff', textAlign: 'right' }}>{inr(quoteData.setup_fee_paise / 100)}</span>
                      </div>
                    )}
                  </div>
                  <div className="stplan-glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, borderRadius: 14, padding: '14px 16px', marginBottom: quoteData.gst_paise > 0 ? 8 : 22 }}>
                    <span style={{ fontSize: 14, color: '#e9d5ff' }}>Total due today</span>
                    <span style={{ fontFamily: "'Spectral',serif", fontSize: 24 }} data-testid="pd-total">{inr(quoteData.total_inr)}</span>
                  </div>
                  {/* GST is now the INCLUDED portion of the total above, not
                      added on top — a caption, not a line item in the sum. */}
                  {quoteData.gst_paise > 0 && (
                    <p style={{ fontSize: 12, color: '#e9d5ff', margin: '0 0 22px', textAlign: 'right' }}>
                      incl. GST {inr(quoteData.gst_paise / 100)} ({Math.round(quoteData.gst_rate * 100)}%)
                    </p>
                  )}
                </>
              )}
              {msg && <p style={{ fontSize: 12.5, color: '#fde68a', margin: '0 0 14px' }}>{msg}</p>}
              <button type="button" className="stplan-btn" onClick={confirmPurchase} disabled={busy || quoteLoading || !quoteData}
                data-testid="pd-confirm"
                style={{ width: '100%', background: '#ffffff', color: '#6d28d9', fontSize: 14, minHeight: 44, border: 'none', borderRadius: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 10px 26px rgba(109,40,217,.24)' }}>
                {busy ? 'Processing…' : 'Pay with Razorpay'}
              </button>
              <button type="button" onClick={() => !busy && setDetailsFor(null)} disabled={busy}
                style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', color: '#e9d5ff', fontSize: 12.5, cursor: busy ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
              <p style={{ fontSize: 12.5, color: '#e9d5ff', margin: '14px 0 0', textAlign: 'center', lineHeight: 1.6 }}>Secure checkout via Razorpay &mdash; cards, UPI, net-banking &amp; wallets.</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment complete */}
      {success && (
        <div className="stplan-modal-in" style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(46,16,101,.55)' }} data-testid="purchase-success">
          <div style={{ background: 'linear-gradient(150deg,#6d28d9,#5b21b6)', color: '#f5f3ff', borderRadius: 20, boxShadow: '0 24px 56px rgba(124,58,237,.22)', padding: '32px 28px', width: '100%', maxWidth: 440, textAlign: 'center' }}>
            <div className="stplan-pop-in" style={{ width: 54, height: 54, borderRadius: '50%', background: '#e9d5ff', color: '#2e1065', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, margin: '0 auto 18px' }}>&#10003;</div>
            <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 20, margin: '0 0 10px' }}>Payment completed</h2>
            <p style={{ fontSize: 14, color: '#e9d5ff', lineHeight: 1.7, margin: '0 0 8px' }}>
              Your <b style={{ color: '#ffffff' }}>{success.tier} {success.product}</b> plan is now active.
            </p>
            <p style={{ fontSize: 13, color: '#e9d5ff', margin: '0 0 22px' }}>A receipt has been recorded on your account.</p>
            <Link to="/studio/portfolio" data-mj-link onClick={() => setSuccess(null)} className="stplan-btn2"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44, padding: '0 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,.6)', background: 'transparent', color: '#ffffff', fontSize: 13.5, fontWeight: 600, textDecoration: 'none', marginBottom: 8 }}
              data-testid="success-go">
              Go to my portfolio
            </Link>
            <button type="button" onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', color: '#e9d5ff', fontSize: 12, cursor: 'pointer' }}>Stay on plans</button>
          </div>
        </div>
      )}
    </div>
  );
}
