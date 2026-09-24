import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getCartItem, clearCart } from '@/lib/cart';
import { quote as fetchQuote, createOrder, verifyOrder } from '@/api/store';
import { loadRazorpay } from '@/lib/razorpay';
import './buyer-shared.css';
import './Checkout.css';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Ported from "MAJA Checkout.dc.html". Re-quotes fresh (prices may have moved
// since the cart page) and is the only place that ever calls order/create —
// the money-path invariants (server-quoted total, free-order bypass, Razorpay
// verify) all live here. Ordering is photographer-only (product pivot): a
// signed-out visitor still sees the page, but pays via the studio Bearer
// identity, gated by an inline panel rather than a redirect.
export default function Checkout() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const [item] = useState(() => getCartItem());

  const [quoteData, setQuoteData] = useState(null);
  const [quoteState, setQuoteState] = useState('loading'); // loading | ready | error
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const signedIn = !!admin;

  const refreshQuote = useCallback(() => {
    if (!item || !item.main_language) return;
    setQuoteState('loading');
    fetchQuote({
      design_id: item.design_id, theme_id: item.theme_id,
      features: item.features, main_language: item.main_language, extra_languages: item.extra_languages,
      esign_agreed: true,
    }).then(({ data }) => { setQuoteData(data); setQuoteState('ready'); })
      .catch(() => { setQuoteData(null); setQuoteState('error'); });
  }, [item]);

  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  const pay = async () => {
    if (!item || !agreed || !signedIn) return;
    setError('');
    setIsPaying(true);
    try {
      const { data: order } = await createOrder({
        design_id: item.design_id, theme_id: item.theme_id, event_type: item.event_type,
        features: item.features, main_language: item.main_language, extra_languages: item.extra_languages,
        esign_agreed: agreed,
      });
      // Comped / test-account orders skip Razorpay entirely.
      if (order.free) {
        clearCart();
        navigate(`/order/${order.order_id}/details`);
        return;
      }
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway. Check your connection and try again.');
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id, amount: order.amount_paise, currency: order.currency,
        name: 'MAJA Invites', description: item.name || 'Wedding Invitation',
        order_id: order.razorpay_order_id,
        prefill: { name: order.user_name || '', email: order.user_email || '', contact: order.user_phone || '' },
        theme: { color: '#6D28D9' },
        handler: async (resp) => {
          try {
            await verifyOrder({
              order_id: order.order_id, razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature,
            });
            clearCart();
            navigate(`/order/${order.order_id}/details`);
          } catch (_e) {
            setError('Payment verification failed. Please contact support if you were charged.');
            setIsPaying(false);
          }
        },
        modal: { ondismiss: () => setIsPaying(false) },
      });
      rzp.open();
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Checkout failed.');
      setIsPaying(false);
    }
  };

  return (
    <div className="mjWashLite mj-buyer-page" data-testid="checkout-page">
      <div className="mjRipple" aria-hidden="true" style={{ zIndex: -1 }} />

      <nav className="mjGlass mj-buyer-nav">
        <Link to="/" className="mj-buyer-brand">
          <span className="mj-buyer-brand-mark">M</span>
          <span className="mj-buyer-brand-name">MAJA Invites</span>
        </Link>
        <Link to="/cart" data-mj-link className="mj-buyer-navlink">&larr; Back to cart</Link>
      </nav>

      {!item ? (
        <div className="checkout-empty">
          <p className="cart-empty-copy">Your cart is empty.</p>
          <Link to="/pricing" className="mj-buyer-btn-primary cart-empty-cta">Browse designs</Link>
        </div>
      ) : (
        <div className="checkout-body">
          <div>
            <h1 className="mj-buyer-h1">Checkout</h1>
            {!signedIn && (
              <div className="mj-buyer-card" data-testid="checkout-gate" style={{ fontSize: 13.5, color: 'var(--mj-muted)' }}>
                Ordering is for partner photographers — <Link to="/auth" data-mj-link>sign in as a studio</Link>, or connect with your photographer to get this design.
              </div>
            )}
            <div className="mj-buyer-card" data-testid="checkout-order-summary">
              <p className="mj-buyer-eyebrow">Your order</p>
              {quoteState === 'loading' && <p className="mj-buyer-loading">Calculating your total…</p>}
              {quoteState === 'error' && (
                <p className="mj-buyer-error">Couldn't load your order. <button type="button" className="cart-retry" onClick={refreshQuote}>Try again</button></p>
              )}
              {quoteState === 'ready' && quoteData && (
                <>
                  <div className="mj-buyer-row"><span>{item.name || 'Design'}{quoteData.main_language_label ? ` · ${quoteData.main_language_label}` : ''}</span><span>{inr(quoteData.design_price_inr)}</span></div>
                  {(quoteData.features || []).map((f) => (
                    <div key={f.key} className="mj-buyer-row"><span>{f.label}</span><span>{inr(f.price)}</span></div>
                  ))}
                  {(quoteData.extra_languages || []).map((l) => (
                    <div key={l.key} className="mj-buyer-row"><span>{l.label} version</span><span>{inr(l.price)}</span></div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div>
            <div className="mjGlass checkout-payment">
              <h3 className="cart-summary-title">Payment</h3>
              <div className="mj-buyer-row" style={{ borderTop: 'none' }}><span>Subtotal</span><span data-testid="checkout-subtotal">{inr(quoteData?.total_inr)}</span></div>
              <div className="mj-buyer-row cart-total-row"><span>Total</span><span data-testid="checkout-total">{inr(quoteData?.total_inr)}</span></div>

              {error && <div className="mj-buyer-error" data-testid="checkout-error">{error}</div>}

              <label className="checkout-esign">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="checkout-esign" />
                <span>I agree to MAJA's <a href="/terms" data-mj-link>Terms</a> &amp; <a href="/refund" data-mj-link>Refund Policy</a>, and confirm the details I provide are accurate.</span>
              </label>

              <button type="button" onClick={pay} disabled={isPaying || quoteState !== 'ready' || !agreed || !signedIn}
                className="mj-buyer-btn-primary checkout-pay-btn" data-testid="checkout-pay">
                {isPaying && <span className="mj-buyer-spinner" />}
                {isPaying ? 'Processing…' : 'Pay & confirm order'}
              </button>
              <p className="mj-buyer-hint" style={{ textAlign: 'center', marginTop: 14 }}>
                Secure checkout via Razorpay — cards, UPI, net-banking &amp; wallets.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
