// StudioPlansPage — photographer "Plans & Premium" panel page.
// Lists the data-driven subscription catalog (/api/subscriptions/plans: four
// products × four billing cycles, storage tiers carry GB). Super-admin edits
// prices/GB via /api/admin/subscription-plans, so this page is fully
// admin-configurable. Subscribe uses the subscription engine's gateway: with live
// Razorpay keys the checkout modal opens for a real one-time order and we verify
// the signature; only a keyless dev backend returns the mock gateway, which
// auto-verifies so the flow is still walkable locally.
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import PanelTabs from '@/components/PanelTabs';
import FeatureWishForm from '@/components/FeatureWishForm';
import { Sparkles, Check, Loader2, HardDrive, Crown, ShieldCheck, X, CheckCircle2, ArrowRight } from 'lucide-react';
import '@/styles/luxury.css';

// After a successful purchase, where should we send the buyer? The whole point
// of a portfolio plan is the upgraded portfolio, so land them there; backup goes
// to the backup console.
const POST_PURCHASE_ROUTE = {
  portfolio: '/studio/portfolio',
  backup: '/studio/cloud-backup',
};

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const PRODUCTS = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'backup', label: 'Cloud Backup' },
];

// Razorpay's checkout.js, loaded on demand (never bundled). Resolves false when
// the script cannot be fetched — offline, blocked by an extension, CSP — so we
// can say that plainly instead of throwing an opaque error.
const RZP_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const loadRazorpay = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = RZP_SCRIPT;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

export default function StudioPlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [cycle, setCycle] = useState('monthly');
  const [product, setProduct] = useState('portfolio');
  const [mine, setMine] = useState({});          // active_by_product
  const [busy, setBusy] = useState('');          // plan id being purchased
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailsFor, setDetailsFor] = useState(null);   // plan awaiting the details form
  const [success, setSuccess] = useState(null);         // { tier, product, tierLabel } after payment
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', studio_name: '', city: '', requirements: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pl, mn] = await Promise.all([
        axios.get(`${API_URL}/api/subscriptions/plans`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/subscriptions/mine`, { headers: authHeaders() }).catch(() => ({ data: {} })),
      ]);
      setPlans(pl.data?.plans || []);
      setCycles(pl.data?.cycles || []);
      setMine(mn.data?.active_by_product || {});
    } catch (e) { setMsg(e?.response?.data?.detail || 'Could not load plans'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Clicking "Get this plan" first collects the buyer's full details, then buys.
  const openDetails = (plan) => {
    setMsg('');
    setForm((f) => ({ ...f, studio_name: f.studio_name || '' }));
    setDetailsFor(plan);
  };

  // Shared tail of every successful purchase, whichever gateway path got here:
  // record the buyer's details for the fulfillment team, refresh so the "Active"
  // banner + gating everywhere reflect the new plan, then show the success screen
  // (it offers a one-tap jump to what they bought — portfolio → the upgraded
  // portfolio, where the premium designs live).
  const completePurchase = useCallback(async (plan, created, details) => {
    try {
      await axios.post(`${API_URL}/api/plan-purchase-details`, {
        product: plan.product, tier: plan.tier, cycle,
        subscription_id: created.subscription_id, details,
      }, { headers: authHeaders() });
    } catch (_) { /* non-blocking — the plan is already active */ }
    await load();
    setDetailsFor(null);
    setMsg('');
    setSuccess({ tier: plan.tier, product: plan.product });
  }, [cycle, load]);

  const confirmPurchase = async () => {
    const plan = detailsFor;
    if (!plan) return;
    if (!form.full_name.trim() || !form.phone.trim()) {
      setMsg('Please enter at least your name and phone number.');
      return;
    }
    // Snapshot the form: the details modal closes before Razorpay's callbacks run.
    const details = { ...form };
    setBusy(plan.id); setMsg('');
    try {
      const { data: created } = await axios.post(`${API_URL}/api/subscriptions/create`,
        { product: plan.product, tier: plan.tier, cycle }, { headers: authHeaders() });

      // 1) TEST/comped accounts (test.studio@maja.test) are activated free by the
      //    backend — there is nothing to pay, so skip the gateway entirely.
      if (created?.free || created?.status === 'active') {
        await completePurchase(plan, created, details);
        setBusy('');
        return;
      }

      // 2) Live Razorpay keys → a real order exists, so OPEN THE CHECKOUT. This
      //    branch is what was missing: the page used to jump straight to /verify
      //    with the mock token, so no payment window ever appeared and the plan
      //    activated without a charge.
      if (created?.razorpay_order_id) {
        if (!created.razorpay_key_id) {
          throw new Error('Payments are not fully configured yet. You have not been charged.');
        }
        const ok = await loadRazorpay();
        if (!ok) {
          throw new Error('Could not open the payment window. Check your connection or any ad blocker and try again — you have not been charged.');
        }
        const label = plan.product === 'portfolio' ? 'Portfolio' : 'Cloud Backup';
        const rzp = new window.Razorpay({
          key: created.razorpay_key_id,
          order_id: created.razorpay_order_id,
          amount: created.amount_paise,
          currency: created.currency || 'INR',
          name: 'MAJA Invites',
          description: `${label} — ${plan.tier} (${cycle.replace('_', ' ')})`,
          prefill: {
            name: details.full_name,
            contact: details.phone,
            ...(details.email ? { email: details.email } : {}),
          },
          theme: { color: '#D4AF37' },
          handler: async (resp) => {
            try {
              const { data: verified } = await axios.post(`${API_URL}/api/subscriptions/verify`, {
                subscription_id: created.subscription_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }, { headers: authHeaders() });
              if (verified?.status !== 'active') throw new Error('Payment could not be confirmed.');
              await completePurchase(plan, created, details);
            } catch (verr) {
              // The money HAS left their account by now, so never claim
              // "you have not been charged" on this path.
              setMsg(verr?.response?.data?.detail
                || `Payment succeeded but activation failed. Save this payment id — ${resp?.razorpay_payment_id || 'see your Razorpay receipt'} — and contact us; we will activate it manually.`);
            } finally {
              setBusy('');
            }
          },
          modal: {
            ondismiss: () => {
              setBusy('');
              setMsg('Payment cancelled — you have not been charged.');
            },
          },
        });
        try {
          rzp.on('payment.failed', (r) => {
            setBusy('');
            setMsg(r?.error?.description || 'The payment failed. You have not been charged — please try again.');
          });
        } catch (_) { /* older checkout builds have no .on() */ }
        rzp.open();
        return;   // the modal's callbacks own the rest of the flow
      }

      // 3) No live keys (local dev): the mock gateway auto-verifies so the flow
      //    stays walkable end to end.
      const { data: verified } = await axios.post(`${API_URL}/api/subscriptions/verify`,
        { subscription_id: created.subscription_id, mock_token: created.mock_token },
        { headers: authHeaders() });
      if (verified?.status !== 'active') {
        throw new Error('Payment could not be confirmed. You have not been charged — please try again.');
      }
      await completePurchase(plan, created, details);
      setBusy('');
    } catch (e) {
      setMsg(e?.response?.data?.detail || e?.message || 'Could not complete the payment. You have not been charged.');
      setBusy('');
    }
  };

  const goToPurchased = () => {
    const route = POST_PURCHASE_ROUTE[success?.product] || '/studio/portfolio';
    setSuccess(null);
    navigate(route);
  };

  const shown = plans.filter((p) => p.product === product);
  const active = mine[product];

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8 md:py-12 max-w-[1200px] mx-auto relative z-10">
        <PanelTabs active="/studio/plans" />

        <div className="mb-6">
          <span className="lux-eyebrow block mb-3">◆ Plans &amp; Premium</span>
          <h1 className="font-display text-[2rem] md:text-[3rem]" style={{ color: 'var(--lux-text)' }}>
            Get <span className="text-gold italic font-script">premium.</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>
            Unlock more storage, a richer portfolio and studio tools. Longer cycles save more.
          </p>
          <button onClick={() => navigate('/studio/white-label')} className="inline-block mt-3 text-xs lux-eyebrow" style={{ color: '#E8C97A' }} data-testid="plans-wl-link">◆ Enterprise white-label branding →</button>
        </div>

        {msg && <div className="lux-glass p-3 mb-5 text-sm" style={{ color: '#E8C97A' }} data-testid="plans-msg">{msg}</div>}

        {/* product switch */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRODUCTS.map((p) => (
            <button key={p.key} onClick={() => setProduct(p.key)} data-testid={`plans-product-${p.key}`}
              className={`px-4 py-2 rounded-xl text-xs uppercase tracking-wide ${product === p.key ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* cycle switch */}
        <div className="flex flex-wrap gap-2 mb-6">
          {cycles.map((c) => (
            <button key={c.key} onClick={() => setCycle(c.key)} data-testid={`plans-cycle-${c.key}`}
              className="px-3 py-1.5 rounded-full text-xs transition-all"
              style={{ border: `1px solid ${cycle === c.key ? 'var(--lux-gold)' : 'var(--lux-border)'}`, background: cycle === c.key ? 'rgba(212,175,55,0.12)' : 'transparent', color: 'var(--lux-text)' }}>
              {c.label}{c.discount > 0 && <span className="text-gold ml-1">−{Math.round(c.discount * 100)}%</span>}
            </button>
          ))}
        </div>

        {active && (
          <div className="lux-glass p-4 mb-6 flex items-center gap-3" data-testid="plans-current">
            <ShieldCheck className="w-5 h-5" style={{ color: '#E8C97A' }} />
            <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
              Active: <b>{active.tier}</b> · {active.cycle} · renews {active.current_period_end ? new Date(active.current_period_end).toLocaleDateString() : '—'}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2" style={{ color: 'var(--lux-text)' }}><Loader2 className="w-5 h-5 animate-spin" /> Loading plans…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {shown.map((p) => {
              const cp = p.cycle_prices?.[cycle] || {};
              const isActive = active?.tier === p.tier;
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="lux-glass p-5 flex flex-col relative"
                  style={{ border: `1px solid ${p.popular ? 'var(--lux-gold)' : 'var(--lux-border)'}` }}
                  data-testid={`plan-card-${p.id}`}>
                  {p.popular && <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] uppercase tracking-wide text-gold"><Crown className="w-3 h-3" /> Popular</span>}
                  <div className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>{p.tier}</div>
                  {p.storage_gb && <div className="flex items-center gap-1 text-xs mb-2" style={{ color: '#E8C97A' }}><HardDrive className="w-3.5 h-3.5" /> {p.storage_gb >= 1024 ? `${(p.storage_gb / 1024).toFixed(0)} TB` : `${p.storage_gb} GB`}</div>}
                  <div className="font-display text-3xl text-gold mb-1">{inr(cp.inr)}</div>
                  <div className="text-[11px] mb-4" style={{ color: 'var(--lux-text-muted)' }}>per {cp.count || ''} {cp.count === 1 ? (cp.unit || 'month').replace(/s$/, '') : (cp.unit || 'months')}</div>
                  {(p.features || []).slice(0, 6).map((f) => (
                    <div key={f} className="flex items-start gap-1.5 text-[11px] mb-1" style={{ color: 'var(--lux-text-muted)' }}>
                      <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} /> {f.replace(/_/g, ' ')}
                    </div>
                  ))}
                  <button onClick={() => openDetails(p)} disabled={busy === p.id || isActive}
                    className="lux-btn mt-auto justify-center" data-testid={`plan-buy-${p.id}`} style={{ opacity: isActive ? 0.6 : 1 }}>
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isActive ? 'Current plan' : 'Get this plan'}
                  </button>
                </motion.div>
              );
            })}
            {shown.length === 0 && <div className="lux-glass p-8 text-center col-span-full" style={{ color: 'var(--lux-text-muted)' }}>No plans for this product yet.</div>}
          </div>
        )}

        {/* A studio whose need isn't covered by any plan can ask directly instead
            of quietly going elsewhere. */}
        <div className="mt-8">
          <FeatureWishForm source="studio_plans" />
        </div>
      </div>

      {/* Full-details form — shown before activating any plan */}
      {detailsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,4,2,0.9)' }}
          onClick={() => !busy && setDetailsFor(null)} data-testid="purchase-details-modal">
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--lux-panel, #16110C)', border: '1px solid var(--lux-gold, #D4AF37)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>Your details</h3>
              <button onClick={() => !busy && setDetailsFor(null)}><X className="w-5 h-5" style={{ color: 'var(--lux-text-muted)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>
              For <b style={{ color: '#E8C97A' }}>{detailsFor.tier} {detailsFor.product}</b> · {cycle}. We use these to set up and deliver your plan.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ['full_name', 'Full name *', 'text'],
                ['phone', 'Phone / WhatsApp *', 'tel'],
                ['email', 'Email', 'email'],
                ['studio_name', 'Studio name', 'text'],
                ['city', 'City', 'text'],
              ].map(([k, label, type]) => (
                <label key={k} className="block">
                  <span className="text-[11px] uppercase tracking-wide block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
                  <input type={type} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    className="lux-input w-full" data-testid={`pd-${k}`} />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <span className="text-[11px] uppercase tracking-wide block mb-1" style={{ color: 'var(--lux-text-muted)' }}>Requirements / notes</span>
                <textarea rows={3} value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                  className="lux-input w-full" data-testid="pd-requirements" />
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => !busy && setDetailsFor(null)} className="lux-btn lux-btn-ghost flex-1 justify-center">Cancel</button>
              <button onClick={confirmPurchase} disabled={!!busy} className="lux-btn flex-1 justify-center" data-testid="pd-confirm">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm &amp; activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Payment complete → jump to what they bought ---- */}
      {success && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ background: 'rgba(6,4,2,0.82)', backdropFilter: 'blur(6px)' }}
          data-testid="purchase-success">
          <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className="lux-glass w-full max-w-[440px] p-8 text-center relative"
            style={{ border: '1px solid rgba(212,175,55,0.4)' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 w-16 h-16 rounded-full grid place-items-center"
              style={{ background: 'rgba(127,224,163,0.14)', border: '1px solid rgba(127,224,163,0.5)' }}>
              <CheckCircle2 className="w-9 h-9" style={{ color: '#7fe0a3' }} />
            </motion.div>
            <h2 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>Payment completed</h2>
            <p className="text-sm mb-1" style={{ color: 'var(--lux-text-muted)' }}>
              Your <b style={{ color: '#E8C97A' }}>{success.tier} {success.product}</b> plan is now active.
            </p>
            {success.product === 'portfolio' && (
              <p className="text-[12px] mb-5" style={{ color: 'var(--lux-text-faint)' }}>
                Head to your portfolio to pick your upgraded design and publish.
              </p>
            )}
            <button onClick={goToPurchased} className="lux-btn w-full justify-center mb-2" data-testid="success-go">
              {success.product === 'portfolio' ? 'Go to my portfolio' : 'Go to my plan'} <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => setSuccess(null)} className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
              Stay on plans
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
