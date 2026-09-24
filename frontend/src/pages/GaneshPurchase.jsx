/**
 * GaneshPurchase.jsx — self-serve buy → auto-create (Ganesh v2 §5).
 * Route: /create/ganesh?design=<template_id>
 *
 * Pick a plan → pay (Razorpay, or free/graceful) → the backend auto-creates a draft
 * with the chosen design + the plan's features, and we redirect into the builder.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EventService } from '../services/eventApi';
import { useUserAuth } from '../context/UserAuthContext';

const EVENT_TYPE = 'ganesh_chaturthi';

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(true); s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function GaneshPurchase() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const design = params.get('design') || '';
  const { user, login, register, loginWithGoogle } = useUserAuth();
  // Either persona may buy: a signed-in family/host (cookie) or a photographer (Bearer).
  const signedIn = !!user || (typeof localStorage !== 'undefined' && !!localStorage.getItem('admin_token'));
  const [sheet, setSheet] = useState(null);         // { plans, feature_addons, design_price_inr }
  const [addons, setAddons] = useState([]);         // extra features the buyer ticked
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  // auth gate (shown when a guest tries to buy without being signed in)
  const [authFor, setAuthFor] = useState('');       // the plan key waiting for sign-in
  const [mode, setMode] = useState('login');        // 'login' | 'register'
  const [af, setAf] = useState({ email: '', name: '', password: '', phone: '' });
  const [aErr, setAErr] = useState('');
  const [aBusy, setABusy] = useState(false);

  const load = useCallback(() => {
    EventService.eventPlans(EVENT_TYPE, design)
      .then(setSheet)
      .catch(() => setSheet({ plans: [], feature_addons: [], design_price_inr: 0 }));
  }, [design]);
  useEffect(() => { load(); }, [load]);

  const plans = sheet ? (sheet.plans || []) : null;
  const designPrice = (sheet && sheet.design_price_inr) || 0;
  const addonPrice = (key) => {
    const f = ((sheet && sheet.feature_addons) || []).find((x) => x.feature_key === key);
    return f ? f.price : 0;
  };
  // an add-on already inside the plan is never charged twice (mirrors the backend quote)
  const extrasFor = (plan) => addons.filter((a) => !(plan.features || []).includes(a));
  const totalFor = (plan) =>
    designPrice + plan.price + extrasFor(plan).reduce((s, a) => s + addonPrice(a), 0);
  const toggleAddon = (key) =>
    setAddons((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const planName = (key) => ((plans || []).find((p) => p.key === key) || {}).name || '';

  const goBuild = (eventId) => navigate(`/events/${eventId}/builder`, { replace: true });

  /** Open Razorpay for a started purchase and finish it server-side. */
  const payFor = async (r) => {
    const ok = await loadRazorpay();
    if (!ok) { setErr('Could not load the payment window. Check your connection and retry.'); return; }
    const rzp = new window.Razorpay({
      key: r.key_id, order_id: r.order_id, amount: r.amount, currency: r.currency || 'INR',
      name: 'MAJA Invites', description: 'Ganesh Chaturthi invitation',
      theme: { color: '#C6A15B' },
      handler: async (resp) => {
        try {
          await EventService.eventPurchaseVerify({
            event_id: r.event_id,
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          goBuild(r.event_id);
        } catch (ex) {
          // 409 = we could not verify right now (retryable); the webhook will still
          // complete it. 400 = the signature really was wrong.
          const code = ex?.response?.status;
          setErr(code === 409
            ? 'Payment received — we are confirming it. Refresh in a moment; your invitation will be ready.'
            : 'Payment could not be verified. Please contact support with your payment id.');
        }
      },
      modal: { ondismiss: () => setBusy('') },
    });
    rzp.open();
  };

  const choose = async (planKey) => {
    // Sign-in is required BEFORE we take money. Checking here (instead of reacting to
    // a 401 mid-checkout) means a logged-out visitor never reaches Razorpay and never
    // sees a confusing failure — they see the sign-in panel straight away.
    if (!signedIn) { setErr(''); setAuthFor(planKey); return; }
    setErr(''); setBusy(planKey);
    try {
      const r = await EventService.eventPurchase({
        event_type: EVENT_TYPE, template_id: design, plan_key: planKey, addons });
      if (!r.needs_payment) { goBuild(r.event_id); return; }
      await payFor(r);
    } catch (ex) {
      const code = ex?.response?.status;
      if (code === 401 || code === 403) {
        setAuthFor(planKey);          // session expired mid-flow → re-open the gate
      } else {
        const d = ex?.response?.data?.detail;
        setErr(typeof d === 'string' ? d : 'Could not start. Please try again.');
      }
    } finally { setBusy(''); }
  };

  // family sign-in / sign-up, then continue the purchase automatically
  const familyAuth = async () => {
    setAErr(''); setABusy(true);
    const plan = authFor;
    try {
      if (mode === 'register') await register({ email: af.email, name: af.name, password: af.password, phone: af.phone });
      else await login({ email: af.email, password: af.password });
    } catch (_) {
      setABusy(false);
      setAErr(mode === 'register' ? 'Could not create the account. Try signing in instead.' : 'Wrong email or password.');
      return;
    }
    setABusy(false); setAuthFor('');
    // the cookie is set by now, so go straight through with the plan they picked
    setErr(''); setBusy(plan);
    try {
      const r = await EventService.eventPurchase({
        event_type: EVENT_TYPE, template_id: design, plan_key: plan, addons });
      if (!r.needs_payment) { goBuild(r.event_id); return; }
      await payFor(r);
    } catch (ex) {
      const d = ex?.response?.data?.detail;
      setErr(typeof d === 'string' ? d : 'Signed in, but the purchase could not start. Please try again.');
    } finally { setBusy(''); }
  };
  const here = () => window.location.pathname + window.location.search;

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-2xl font-semibold">Choose your plan</h1>
        <p className="mt-1 text-center text-sm text-white/50">
          Ganesh Chaturthi invitation{design ? ` · ${design.replace(/_/g, ' ')}` : ''}
          {designPrice > 0 ? ` · design ${inr(designPrice)}` : ''}
        </p>
        {err && <p className="mx-auto mt-4 max-w-md rounded bg-red-500/10 p-2 text-center text-sm text-red-300">{err}</p>}

        {/* Honest state when the gateway has no keys yet: the invitation is still
            created, but nobody is charged — the owner sees this and can fix billing. */}
        {sheet && sheet.payments_live === false && (plans || []).some((p) => p.price > 0) && (
          <p className="mx-auto mt-4 max-w-md rounded bg-amber-400/10 p-2 text-center text-xs text-amber-200/90"
            data-testid="ganesh-payments-off">
            Online payments aren’t switched on yet — your invitation will be created right
            away and billing is settled separately.
          </p>
        )}

        {!signedIn && (
          <p className="mx-auto mt-4 max-w-md rounded bg-white/[.06] p-2 text-center text-xs text-white/60">
            You’ll be asked to sign in when you pick a plan — it takes a few seconds and
            keeps your invitation on your account.
          </p>
        )}

        {plans === null ? (
          <p className="mt-10 text-center text-white/40">Loading plans…</p>
        ) : plans.length === 0 ? (
          <p className="mt-10 text-center text-white/40">Pricing is being updated — please try again shortly.</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {plans.map((p) => {
              // Show EVERY sellable feature on every card: ✓ = included in this plan,
              // + = available as a paid add-on. The buyer sees the full menu and what
              // stepping up to the next plan actually buys them.
              const included = new Set(p.features || []);
              const all = (sheet.feature_addons || []);
              return (
              <div key={p.key}
                className={`flex flex-col rounded-2xl border p-5 ${p.featured ? 'border-amber-400/60 bg-amber-400/[.06]' : 'border-white/10 bg-white/[.03]'}`}
                data-testid={`ganesh-plan-${p.key}`}>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  {p.name}
                  {p.featured && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] text-black">POPULAR</span>}
                </div>
                <div className="mt-1 text-3xl font-bold text-amber-200">
                  {totalFor(p) > 0 ? inr(totalFor(p)) : 'Free'}
                </div>
                {(designPrice > 0 || extrasFor(p).length > 0) && (
                  <div className="mt-0.5 text-[11px] text-white/45">
                    {inr(p.price)} plan{designPrice > 0 ? ` + ${inr(designPrice)} design` : ''}
                    {extrasFor(p).length > 0 ? ` + ${extrasFor(p).length} extra` : ''}
                  </div>
                )}
                {p.tagline && <p className="mt-2 text-xs text-white/50">{p.tagline}</p>}

                <div className="mt-4 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Included</div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {(p.feature_labels || p.features || []).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-white/80">
                        <span className="mt-0.5 text-amber-300">✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  {all.filter((f) => !included.has(f.feature_key)).length > 0 && (
                    <>
                      <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/30">Add on if you need it</div>
                      <ul className="mt-2 space-y-1 text-[13px] text-white/40">
                        {all.filter((f) => !included.has(f.feature_key)).map((f) => (
                          <li key={f.feature_key} className="flex items-start gap-2">
                            <span className="mt-0.5">＋</span>{f.label}
                            <span className="ml-auto shrink-0">{inr(f.price)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <p className="mt-4 text-[11px] text-white/40">
                  {p.active_days > 0 ? `Link stays live ${p.active_days} days · ` : ''}
                  15 free edits after publishing
                </p>
                <button onClick={() => choose(p.key)} disabled={!!busy}
                  className="mt-3 rounded-lg bg-amber-500 py-2.5 font-medium text-black disabled:opacity-50">
                  {busy === p.key
                    ? 'Starting…'
                    : !signedIn ? 'Sign in & continue'
                      : (totalFor(p) > 0 ? 'Pay & create' : 'Create free')}
                </button>
              </div>
              );
            })}
          </div>
        )}

        {/* a-la-carte features — owner-priced, added on top of any plan */}
        {sheet && (sheet.feature_addons || []).length > 0 && plans && plans.length > 0 && (
          <div className="mt-8 rounded-2xl border border-white/10 p-5">
            <div className="text-sm font-medium">Add extra features (optional)</div>
            <p className="mt-1 text-xs text-white/45">
              These apply to whichever plan you pick — the prices above update as you tick
              them. Anything already included in that plan is never charged twice.
              {addons.length > 0 && (
                <button onClick={() => setAddons([])} className="ml-2 underline">Clear all</button>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sheet.feature_addons.map((f) => {
                const on = addons.includes(f.feature_key);
                return (
                  <button key={f.feature_key} onClick={() => toggleAddon(f.feature_key)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${on ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/15 text-white/65'}`}
                    data-testid={`ganesh-addon-${f.feature_key}`}>
                    {on ? '✓ ' : '+ '}{f.label} · {inr(f.price)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-white/40">
          After payment your invitation is created automatically — you then fill in your
          details, upload photos day by day, and publish.
        </p>
        <p className="mt-1.5 text-center text-xs text-white/40">
          Need something that isn’t listed? Once your invitation is created you can
          request an extra feature from the builder and we’ll set it up for you.
        </p>
      </div>

      {authFor && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setAuthFor('')}>
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-neutral-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Sign in to continue</h2>
            <p className="mt-1 text-sm text-white/50">
              We keep your invitation on your account so you can edit it later.
              {planName(authFor) ? ` You picked the ${planName(authFor)} plan.` : ''}
            </p>
            {aErr && <p className="mt-3 rounded bg-red-500/10 p-2 text-sm text-red-300">{aErr}</p>}
            <div className="mt-4 space-y-2">
              {mode === 'register' && (
                <input className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" placeholder="Your name"
                  value={af.name} onChange={(e) => setAf({ ...af, name: e.target.value })} />
              )}
              <input className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" placeholder="Email" type="email"
                value={af.email} onChange={(e) => setAf({ ...af, email: e.target.value })} />
              {mode === 'register' && (
                <input className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" placeholder="Phone (optional)"
                  value={af.phone} onChange={(e) => setAf({ ...af, phone: e.target.value })} />
              )}
              <input className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" placeholder="Password" type="password"
                value={af.password} onChange={(e) => setAf({ ...af, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && familyAuth()} />
              <button onClick={familyAuth} disabled={aBusy}
                className="w-full rounded-lg bg-amber-500 py-2 font-medium text-black disabled:opacity-50">
                {aBusy ? 'Please wait…' : (mode === 'register' ? 'Create account & continue' : 'Sign in & continue')}
              </button>
              <button onClick={() => loginWithGoogle(here())} className="w-full rounded-lg border border-white/15 py-2 text-sm">
                Continue with Google
              </button>
              <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')} className="w-full text-xs text-white/50 underline">
                {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </button>
            </div>
            <div className="mt-4 border-t border-white/10 pt-3 text-center">
              <button onClick={() => navigate(`/studio/login?next=${encodeURIComponent(here())}`)}
                className="text-xs text-white/50 underline">
                I'm a photographer — use Studio login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
