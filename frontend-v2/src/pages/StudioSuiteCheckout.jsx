import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StudioModule, { Panel, Empty, InlineError, Loading, ErrorPanel } from '@/components/StudioModule';
import * as pp from '@/api/publicPricing';
import * as storeApi from '@/api/store';
import { loadRazorpay } from '@/lib/razorpay';
import {
  readPricingSelection, clearPricingSelection, COMPONENT_LABELS,
} from '@/lib/pricingSelection';

// /studio/order/invitation-suite — the consumer the Pricing.jsx tier picker
// never had (docs/PRICING_REDESIGN_2026.md §9.8). Reads the sessionStorage
// stash Pricing.jsx wrote, re-prices every component from the same public
// endpoint (never trusts the stash for money), lets the studio edit the
// component selection, then runs the store's order/create -> Razorpay ->
// verify flow exactly like Checkout.jsx/StudioPlans.jsx.
const DEFAULT_DESIGN_ID = 'royal_heritage'; // the platform default design — the
// buyer names the real one later via the order-info step; order/create just
// needs a non-empty design_id (see tests/test_store_pricing_2026.py).

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function StudioSuiteCheckout() {
  const [selection] = useState(() => readPricingSelection());
  const [pricing, setPricing] = useState({ status: 'loading', tiers: null });
  const [checked, setChecked] = useState(() => new Set(selection?.components || []));
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // the created order once paid/free

  const loadPricing = () => {
    setPricing({ status: 'loading', tiers: null });
    pp.invitationPlans()
      .then(({ data }) => setPricing({ status: 'ready', tiers: data.tiers || [] }))
      .catch(() => setPricing({ status: 'error', tiers: null }));
  };
  useEffect(loadPricing, []);

  useEffect(() => { document.title = 'Invitation suite order — MAJA Studio'; }, []);

  const tier = pricing.tiers?.find((t) => t.key === selection?.invitation_tier) || null;
  const keys = tier ? Object.keys(COMPONENT_LABELS).filter((k) => tier.components?.[k] != null) : [];
  const toggle = (k) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const total = keys.reduce((sum, k) => sum + (checked.has(k) ? Number(tier.components[k] || 0) : 0), 0);

  const placeOrder = async () => {
    if (!selection || checked.size === 0 || !agreed || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data: created } = await storeApi.createOrder({
        design_id: DEFAULT_DESIGN_ID,
        esign_agreed: true,
        order_type: 'invitation_suite',
        invitation_tier: selection.invitation_tier,
        components: [...checked],
      });
      // The stash's job is done the moment a real order exists — clear it so
      // the dashboard banner (and a re-visit to this page) won't reoffer it.
      clearPricingSelection();

      if (created.free) {
        setResult(created);
        setBusy(false);
        return;
      }

      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway. Check your connection and try again.');
      const rzp = new window.Razorpay({
        key: created.razorpay_key_id, amount: created.amount_paise, currency: created.currency,
        name: 'MAJA Invites', description: `${tier?.name || selection.invitation_tier} Invitation Suite`,
        order_id: created.razorpay_order_id,
        prefill: { name: created.user_name || '', email: created.user_email || '', contact: created.user_phone || '' },
        theme: { color: '#6D28D9' },
        handler: async (resp) => {
          try {
            await storeApi.verifyOrder({
              order_id: created.order_id, razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature,
            });
            setResult(created);
          } catch (_e) {
            setError('Payment verification failed. Please contact support if you were charged.');
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e) {
      const status = e?.response?.status;
      setError(status === 503
        ? 'Payments are not configured on this server yet. Please contact support.'
        : (e.response?.data?.detail || e.message || 'Could not start checkout.'));
      setBusy(false);
    }
  };

  let body;
  if (!selection) {
    body = (
      <Panel>
        <Empty
          title="No invitation selected"
          body="Pick a tier and the pieces you want on the pricing page, then come back here to pay."
          action={<Link to="/pricing#invitations" className="wmod-btn wmod-btn--primary">Go to pricing</Link>}
        />
      </Panel>
    );
  } else if (result) {
    body = (
      <Panel title="Order placed">
        <p style={{ fontSize: 14, color: 'var(--mj-ink)', lineHeight: 1.65, margin: '0 0 18px' }}>
          Your <b>{tier?.name || selection.invitation_tier}</b> invitation suite order is confirmed.
          Add the couple&rsquo;s details from your orders list when you&rsquo;re ready to build it.
        </p>
        <div className="wmod-row" style={{ justifyContent: 'flex-start' }}>
          <Link to="/studio/orders" className="wmod-btn wmod-btn--primary">Go to your orders</Link>
          <Link to="/studio/dashboard" className="wmod-btn wmod-btn--ghost">Back to dashboard</Link>
        </div>
      </Panel>
    );
  } else if (pricing.status === 'loading') {
    body = <Loading rows={1} />;
  } else if (pricing.status === 'error') {
    body = <ErrorPanel message="Couldn't load current pricing. Please try again." onRetry={loadPricing} />;
  } else if (!tier) {
    body = (
      <Panel>
        <Empty
          title="That tier isn't available anymore"
          body="Pricing may have changed. Head back to pick a tier again."
          action={<Link to="/pricing#invitations" className="wmod-btn wmod-btn--primary">Go to pricing</Link>}
        />
      </Panel>
    );
  } else {
    body = (
      <Panel title={`${tier.name} Invitation Suite`} sub="Uncheck anything you don't need — the total updates instantly and is exactly what you're charged.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {keys.map((k) => (
            <label key={k} className="wmod-check" style={{ justifyContent: 'space-between', border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-card-inner)', padding: '10px 14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={checked.has(k)} onChange={() => toggle(k)} />
                {COMPONENT_LABELS[k]}
              </span>
              <span style={{ color: 'var(--mj-muted)', fontWeight: 600 }}>{inr(tier.components[k])}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 'var(--mj-radius-card-inner)', background: 'var(--mj-section)', marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mj-ink-deep)' }}>Your total</span>
          <span style={{ fontFamily: 'var(--mj-font-display)', fontSize: 22, color: 'var(--mj-ink-deep)' }}>{inr(total)}</span>
        </div>

        <InlineError message={error} />

        <label className="wmod-check" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I agree to MAJA&rsquo;s <Link to="/terms" data-mj-link>Terms</Link> &amp; <Link to="/refund" data-mj-link>Refund Policy</Link>, and confirm the details I provide are accurate.</span>
        </label>

        <button
          type="button"
          className="wmod-btn wmod-btn--primary"
          disabled={busy || checked.size === 0 || !agreed}
          onClick={placeOrder}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {busy ? 'Processing…' : `Pay ${inr(total)} & confirm order`}
        </button>
        <p style={{ fontSize: 12, color: 'var(--mj-faint)', textAlign: 'center', margin: '12px 0 0' }}>
          Secure checkout via Razorpay — cards, UPI, net-banking &amp; wallets.
        </p>
      </Panel>
    );
  }

  return (
    <StudioModule active="Orders" title="Invitation suite order" sub="Confirm the tier and pieces, then pay to place the order.">
      {body}
    </StudioModule>
  );
}
